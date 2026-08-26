import fs from "fs";
import path from "path";
import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { UPLOADS_DIR_COMPROBANTES } from "../../middleware/upload.middleware";

const METODOS_PAGO_VALIDOS = ["Transferencia", "Efectivo", "Cheque", "Tarjeta", "Otro"];

function serializarPago(p: any) {
  return {
    id: p.id,
    facturaId: p.facturaId,
    fecha: p.fecha,
    valor: Number(p.valor),
    metodoPago: p.metodoPago,
    referencia: p.referencia,
    comprobante: p.comprobanteNombre
      ? {
          nombre: p.comprobanteNombre,
          mime: p.comprobanteMime,
          tamano: p.comprobanteTamano,
        }
      : null,
    registradoPorNombre: p.registradoPorNombre,
    observaciones: p.observaciones,
    estado: p.estado,
    createdAt: p.createdAt,
  };
}

/**
 * Recalcula el estado de la factura a partir de la suma de sus pagos
 * confirmados: si el saldo llega a 0 y estaba "Aprobada", pasa a "Pagada";
 * si un pago se anula y el saldo vuelve a quedar pendiente, regresa a
 * "Aprobada". Es la ÚNICA forma de llegar a "Pagada" en el sistema (ya no
 * existe un cambio de estado manual a "Pagada" sin un pago real detrás).
 */
async function recalcularEstadoPorPagos(tenantId: string, facturaId: string, actor: string) {
  const factura = await prisma.factura.findFirst({ where: { id: facturaId, tenantId, eliminado: false } });
  if (!factura) return null;

  const agregado = await prisma.pago.aggregate({
    where: { facturaId, tenantId, estado: "Confirmado" },
    _sum: { valor: true },
  });
  const totalPagado = Number(agregado._sum.valor ?? 0);
  const saldoPendiente = Number(factura.total) - totalPagado;

  if (saldoPendiente <= 0 && factura.estado === "Aprobada") {
    return prisma.factura.update({
      where: { id: facturaId },
      data: {
        estado: "Pagada",
        historial: {
          create: { actor, accion: "Factura pagada", detalle: "El saldo pendiente llegó a $0." },
        },
      },
      include: { historial: { orderBy: { createdAt: "asc" } } },
    });
  }
  if (saldoPendiente > 0 && factura.estado === "Pagada") {
    return prisma.factura.update({
      where: { id: facturaId },
      data: {
        estado: "Aprobada",
        historial: {
          create: { actor, accion: "Factura vuelve a Aprobada", detalle: "Un pago fue anulado; queda saldo pendiente." },
        },
      },
      include: { historial: { orderBy: { createdAt: "asc" } } },
    });
  }
  return factura;
}

/**
 * Lista los pagos (confirmados y anulados, para trazabilidad) de una
 * factura del tenant. Aislamiento multi-tenant: la factura se busca primero
 * por tenantId, así que no es posible listar pagos de una factura de otro
 * tenant manipulando el id de la URL (IDOR).
 */
export const listarPagosFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { facturaId } = req.params;

    const factura = await prisma.factura.findFirst({ where: { id: facturaId, tenantId, eliminado: false } });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });

    const pagos = await prisma.pago.findMany({
      where: { facturaId, tenantId },
      orderBy: { fecha: "desc" },
    });

    const totalPagado = pagos
      .filter((p) => p.estado === "Confirmado")
      .reduce((acc, p) => acc + Number(p.valor), 0);

    return res.json({
      data: pagos.map(serializarPago),
      totalPagado,
      saldoPendiente: Number(factura.total) - totalPagado,
    });
  } catch (error) {
    console.error("Error al listar pagos de la factura:", error);
    return res.status(500).json({ message: "Error al obtener los pagos." });
  }
};

/**
 * Registra un pago real sobre una factura Aprobada. Soporta pagos
 * parciales: si la suma de pagos confirmados cubre el total, la factura
 * pasa automáticamente a "Pagada"; si no, sigue "Aprobada" con saldo
 * pendiente (visible en la respuesta y en el detalle de la factura).
 */
export const registrarPago = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { facturaId } = req.params;
    // Forma del body ya validada por validarBody(registrarPagoSchema).
    const { fecha, valor, metodoPago, referencia, observaciones } = req.body;

    if (!METODOS_PAGO_VALIDOS.includes(metodoPago)) {
      return res.status(400).json({ message: "El método de pago no es válido." });
    }
    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      return res.status(400).json({ message: "El valor del pago debe ser un número mayor a cero." });
    }

    // Aislamiento multi-tenant: la factura se busca por tenantId antes de
    // aceptar un pago sobre ella (IDOR).
    const factura = await prisma.factura.findFirst({ where: { id: facturaId, tenantId, eliminado: false } });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });

    if (factura.estado !== "Aprobada") {
      return res.status(409).json({
        message: `No se puede registrar un pago sobre una factura en estado "${factura.estado}". Debe estar Aprobada.`,
      });
    }

    const pago = await prisma.pago.create({
      data: {
        tenantId,
        facturaId,
        fecha: fecha ? new Date(fecha) : new Date(),
        valor: valorNum,
        metodoPago,
        referencia: typeof referencia === "string" && referencia.trim() ? referencia.trim() : null,
        observaciones: typeof observaciones === "string" && observaciones.trim() ? observaciones.trim() : null,
        registradoPorId: req.user!.id,
        registradoPorNombre: req.user!.nombre,
      },
    });

    await prisma.factura.update({
      where: { id: facturaId },
      data: {
        historial: {
          create: {
            actor: req.user!.nombre,
            accion: "Pago registrado",
            detalle: `${metodoPago}: $${valorNum.toLocaleString("es-CO")}${referencia ? ` · Ref: ${referencia}` : ""}`,
          },
        },
      },
    });

    const facturaActualizada = await recalcularEstadoPorPagos(tenantId, facturaId, req.user!.nombre);

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PAGO_REGISTRADO",
        detalle: `${req.user!.nombre} registró un pago de $${valorNum.toLocaleString("es-CO")} para la factura "${factura.numero}"`,
        entidadTipo: "Pago",
        entidadId: pago.id,
        datosNuevos: JSON.stringify({ facturaId, valor: valorNum, metodoPago, estadoFactura: facturaActualizada?.estado }),
      },
    });

    return res.status(201).json({
      pago: serializarPago(pago),
      factura: facturaActualizada ? { id: facturaActualizada.id, estado: facturaActualizada.estado } : null,
    });
  } catch (error) {
    console.error("Error al registrar pago:", error);
    return res.status(500).json({ message: "Error al registrar el pago." });
  }
};

/**
 * Anula un pago (no se borra: se conserva para trazabilidad contable). Si
 * ese pago era lo que mantenía la factura como "Pagada", la factura vuelve
 * automáticamente a "Aprobada" con saldo pendiente.
 */
export const anularPago = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { facturaId, id: pagoId } = req.params;

    const factura = await prisma.factura.findFirst({ where: { id: facturaId, tenantId, eliminado: false } });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });

    const pago = await prisma.pago.findFirst({ where: { id: pagoId, facturaId, tenantId } });
    if (!pago) return res.status(404).json({ message: "Pago no encontrado." });
    if (pago.estado === "Anulado") {
      return res.status(409).json({ message: "Este pago ya está anulado." });
    }

    await prisma.pago.update({ where: { id: pagoId }, data: { estado: "Anulado" } });

    await prisma.factura.update({
      where: { id: facturaId },
      data: {
        historial: {
          create: {
            actor: req.user!.nombre,
            accion: "Pago anulado",
            detalle: `Se anuló el pago de $${Number(pago.valor).toLocaleString("es-CO")} (${pago.metodoPago}).`,
          },
        },
      },
    });

    const facturaActualizada = await recalcularEstadoPorPagos(tenantId, facturaId, req.user!.nombre);

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PAGO_ANULADO",
        detalle: `${req.user!.nombre} anuló un pago de $${Number(pago.valor).toLocaleString("es-CO")} de la factura "${factura.numero}"`,
        entidadTipo: "Pago",
        entidadId: pagoId,
        datosAnteriores: JSON.stringify({ estado: "Confirmado" }),
        datosNuevos: JSON.stringify({ estado: "Anulado", estadoFactura: facturaActualizada?.estado }),
      },
    });

    return res.json({
      pago: serializarPago({ ...pago, estado: "Anulado" }),
      factura: facturaActualizada ? { id: facturaActualizada.id, estado: facturaActualizada.estado } : null,
    });
  } catch (error) {
    console.error("Error al anular pago:", error);
    return res.status(500).json({ message: "Error al anular el pago." });
  }
};

/**
 * Adjunta el comprobante (PDF/imagen) de un pago ya registrado. Multer ya
 * guardó el archivo en disco; este handler valida tenant/factura/pago y
 * actualiza los metadatos.
 */
export const subirComprobantePago = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { facturaId, id: pagoId } = req.params;
    const archivo = (req as any).file as Express.Multer.File | undefined;

    if (!archivo) {
      return res.status(400).json({ message: "No se recibió ningún archivo." });
    }

    const factura = await prisma.factura.findFirst({ where: { id: facturaId, tenantId, eliminado: false } });
    if (!factura) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Factura no encontrada." });
    }
    const pago = await prisma.pago.findFirst({ where: { id: pagoId, facturaId, tenantId } });
    if (!pago) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Pago no encontrado." });
    }

    if (pago.comprobanteRuta) {
      fs.unlink(path.join(UPLOADS_DIR_COMPROBANTES, pago.comprobanteRuta), () => {});
    }

    const actualizado = await prisma.pago.update({
      where: { id: pagoId },
      data: {
        comprobanteNombre: archivo.originalname,
        comprobanteRuta: path.join(pagoId, archivo.filename),
        comprobanteMime: archivo.mimetype,
        comprobanteTamano: archivo.size,
      },
    });

    return res.status(201).json(serializarPago(actualizado));
  } catch (error) {
    console.error("Error al subir comprobante de pago:", error);
    return res.status(500).json({ message: "Error al subir el comprobante." });
  }
};

export const obtenerComprobantePago = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { facturaId, id: pagoId } = req.params;

    const factura = await prisma.factura.findFirst({ where: { id: facturaId, tenantId, eliminado: false } });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });

    const pago = await prisma.pago.findFirst({ where: { id: pagoId, facturaId, tenantId } });
    if (!pago || !pago.comprobanteRuta) {
      return res.status(404).json({ message: "Este pago no tiene un comprobante adjunto." });
    }

    const rutaAbsoluta = path.join(UPLOADS_DIR_COMPROBANTES, pago.comprobanteRuta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    res.setHeader("Content-Type", pago.comprobanteMime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(pago.comprobanteNombre || "comprobante")}"`,
    );
    return res.sendFile(rutaAbsoluta);
  } catch (error) {
    console.error("Error al obtener comprobante de pago:", error);
    return res.status(500).json({ message: "Error al obtener el comprobante." });
  }
};
