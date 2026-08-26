import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const ESTADOS_VALIDOS = ["Al día", "Por vencer", "Vencido", "Paz y Salvo"];
const DIAS_ALERTA_POR_VENCER = 7;

function serializar(c: any) {
  return { ...c, cupo: Number(c.cupo), saldo: Number(c.saldo) };
}

/**
 * Deriva el estado del crédito a partir del saldo y la fecha de vencimiento.
 * No se usa cuando el estado es "Paz y Salvo": ese es un cierre formal y
 * explícito (vía marcarPazYSalvoCredito), no algo que un pago recalcule solo.
 */
function calcularEstado(saldo: number, vence: Date): string {
  if (saldo <= 0) return "Al día";
  const ahora = new Date();
  const diasParaVencer = (vence.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000);
  if (diasParaVencer < 0) return "Vencido";
  if (diasParaVencer <= DIAS_ALERTA_POR_VENCER) return "Por vencer";
  return "Al día";
}

export const listarCreditos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const creditos = await prisma.creditoCliente.findMany({
      where: { tenantId, eliminado: false },
      orderBy: { vence: "asc" },
      take: 1000, // límite de seguridad temporal; falta paginación real (ver auditoría)
    });
    return res.json(creditos.map(serializar));
  } catch (error) {
    console.error("Error al listar créditos:", error);
    return res.status(500).json({ message: "Error al obtener los créditos." });
  }
};

export const crearCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { cliente, cupo, saldo, vence, estado } = req.body;

    if (!cliente || !vence) {
      return res.status(400).json({ message: "Cliente y fecha de vencimiento son obligatorios." });
    }
    const cupoNum = Number(cupo);
    const saldoNum = Number(saldo);
    if (!Number.isFinite(cupoNum) || cupoNum < 0 || !Number.isFinite(saldoNum) || saldoNum < 0) {
      return res.status(400).json({ message: "Cupo y saldo deben ser números no negativos." });
    }
    if (saldoNum > cupoNum) {
      return res.status(400).json({ message: "El saldo no puede ser mayor al cupo otorgado." });
    }

    const credito = await prisma.creditoCliente.create({
      data: {
        tenantId,
        cliente,
        cupo: cupoNum,
        saldo: saldoNum,
        vence: new Date(vence),
        estado: ESTADOS_VALIDOS.includes(estado) ? estado : calcularEstado(saldoNum, new Date(vence)),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_CREADO",
        detalle: `${req.user!.nombre} registró un crédito para "${cliente}"`,
      },
    });

    return res.status(201).json(serializar(credito));
  } catch (error) {
    console.error("Error al crear crédito:", error);
    return res.status(500).json({ message: "Error al registrar el crédito." });
  }
};

export const actualizarCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { saldo, estado } = req.body;

    const existente = await prisma.creditoCliente.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!existente) return res.status(404).json({ message: "Crédito no encontrado." });

    if (estado && !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }
    if (saldo !== undefined && (!Number.isFinite(Number(saldo)) || Number(saldo) < 0)) {
      return res.status(400).json({ message: "El saldo debe ser un número no negativo." });
    }

    const credito = await prisma.creditoCliente.update({
      where: { id },
      data: {
        ...(saldo !== undefined ? { saldo: Number(saldo) } : {}),
        ...(estado ? { estado } : {}),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_EDITADO",
        detalle: `${req.user!.nombre} actualizó el crédito de "${credito.cliente}"`,
      },
    });

    return res.json(serializar(credito));
  } catch (error) {
    console.error("Error al actualizar crédito:", error);
    return res.status(500).json({ message: "Error al actualizar el crédito." });
  }
};

/**
 * Registra un abono al saldo pendiente del cliente (uso típico: Comercial
 * cobrando cartera). El saldo nunca queda negativo y el estado se recalcula
 * automáticamente según el saldo restante y la fecha de vencimiento.
 */
export const registrarPagoCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { monto } = req.body;

    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return res.status(400).json({ message: "El monto del pago debe ser un número mayor a cero." });
    }

    const credito = await prisma.creditoCliente.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!credito) return res.status(404).json({ message: "Crédito no encontrado." });

    const saldoActual = Number(credito.saldo);
    if (montoNum > saldoActual) {
      return res.status(400).json({ message: "El monto del pago no puede ser mayor al saldo pendiente." });
    }

    const nuevoSaldo = saldoActual - montoNum;
    const nuevoEstado = calcularEstado(nuevoSaldo, credito.vence);

    const actualizado = await prisma.creditoCliente.update({
      where: { id },
      data: { saldo: nuevoSaldo, estado: nuevoEstado },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_PAGO_REGISTRADO",
        detalle: `${req.user!.nombre} registró un pago de ${montoNum.toLocaleString("es-CO")} para "${credito.cliente}" (saldo restante: ${nuevoSaldo.toLocaleString("es-CO")})`,
      },
    });

    return res.json(serializar(actualizado));
  } catch (error) {
    console.error("Error al registrar pago de crédito:", error);
    return res.status(500).json({ message: "Error al registrar el pago." });
  }
};

/**
 * Cierra formalmente el crédito como pagado en su totalidad ("paz y salvo"):
 * saldo en cero y un estado final distinto de los de flujo normal, para que
 * quede visible que el cliente recibió esa constancia.
 */
export const marcarPazYSalvoCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const credito = await prisma.creditoCliente.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!credito) return res.status(404).json({ message: "Crédito no encontrado." });

    const actualizado = await prisma.creditoCliente.update({
      where: { id },
      data: { saldo: 0, estado: "Paz y Salvo" },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_PAZ_Y_SALVO",
        detalle: `${req.user!.nombre} marcó paz y salvo para "${credito.cliente}"`,
      },
    });

    return res.json(serializar(actualizado));
  } catch (error) {
    console.error("Error al marcar paz y salvo:", error);
    return res.status(500).json({ message: "Error al marcar paz y salvo." });
  }
};

/**
 * Elimina (soft-delete) un crédito de cliente. No se borra de la base de
 * datos: se marca `eliminado` para conservar la trazabilidad y deja de
 * aparecer en el listado.
 */
export const eliminarCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const credito = await prisma.creditoCliente.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!credito) return res.status(404).json({ message: "Crédito no encontrado." });

    await prisma.creditoCliente.update({ where: { id }, data: { eliminado: true } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el crédito de "${credito.cliente}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar crédito:", error);
    return res.status(500).json({ message: "Error al eliminar el crédito." });
  }
};
