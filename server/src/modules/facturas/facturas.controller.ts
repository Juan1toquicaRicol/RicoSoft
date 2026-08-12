import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";

const ESTADOS_VALIDOS = ["Pendiente", "Aprobada", "Pagada", "Rechazada"];
const PRIORIDADES_VALIDAS = ["Baja", "Media", "Alta", "Crítica"];
const MONEDAS_VALIDAS = ["COP", "USD"];

// Transiciones de estado permitidas y el permiso requerido para ejecutarlas.
const TRANSICIONES: Record<string, { desde: string[]; permiso: string }> = {
  Aprobada: { desde: ["Pendiente"], permiso: PERMISOS_SISTEMA.FACTURAS_APROBAR },
  Rechazada: { desde: ["Pendiente"], permiso: PERMISOS_SISTEMA.FACTURAS_RECHAZAR },
  Pagada: { desde: ["Aprobada"], permiso: PERMISOS_SISTEMA.FACTURAS_PAGAR },
};

function serializar(f: any) {
  return {
    id: f.id,
    empresaId: f.empresaId,
    numero: f.numero,
    proveedor: f.proveedor,
    nit: f.nit,
    contrato: f.contrato,
    centroCostos: f.centroCostos,
    area: f.area,
    responsable: f.responsable,
    fecha: f.fecha,
    vence: f.vence,
    subtotal: Number(f.subtotal),
    iva: Number(f.iva),
    total: Number(f.total),
    moneda: f.moneda,
    estado: f.estado,
    prioridad: f.prioridad,
    origen: f.origen,
    historial: (f.historial ?? []).map((h: any) => ({
      fecha: h.createdAt,
      actor: h.actor,
      accion: h.accion,
      detalle: h.detalle,
    })),
  };
}

export const listarFacturas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId, estado, search } = req.query;

    const where: any = { tenantId };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;
    if (typeof estado === "string" && ESTADOS_VALIDOS.includes(estado)) where.estado = estado;
    if (typeof search === "string" && search.trim()) {
      const term = search.trim();
      where.OR = [
        { numero: { contains: term } },
        { proveedor: { contains: term } },
        { nit: { contains: term } },
        { responsable: { contains: term } },
      ];
    }

    const facturas = await prisma.factura.findMany({
      where,
      include: { historial: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });

    return res.json(facturas.map(serializar));
  } catch (error) {
    console.error("Error al listar facturas:", error);
    return res.status(500).json({ message: "Error al obtener facturas." });
  }
};

export const obtenerFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const factura = await prisma.factura.findFirst({
      where: { id, tenantId },
      include: { historial: { orderBy: { createdAt: "asc" } } },
    });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });
    return res.json(serializar(factura));
  } catch (error) {
    console.error("Error al obtener factura:", error);
    return res.status(500).json({ message: "Error al obtener la factura." });
  }
};

export const crearFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      empresaId,
      numero,
      proveedor,
      nit,
      contrato,
      centroCostos,
      area,
      responsable,
      vence,
      subtotal,
      iva,
      moneda,
      prioridad,
      origen,
    } = req.body;

    if (!empresaId || !numero || !proveedor || !nit || !area || !responsable || !vence) {
      return res.status(400).json({ message: "Faltan campos obligatorios de la factura." });
    }
    const sub = Number(subtotal);
    const ivaNum = Number(iva);
    if (!Number.isFinite(sub) || sub < 0 || !Number.isFinite(ivaNum) || ivaNum < 0) {
      return res.status(400).json({ message: "Subtotal e IVA deben ser números no negativos." });
    }
    const monedaFinal = MONEDAS_VALIDAS.includes(moneda) ? moneda : "COP";
    const prioridadFinal = PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : "Media";

    const existente = await prisma.factura.findFirst({ where: { tenantId, empresaId, numero } });
    if (existente) {
      return res.status(409).json({
        message: `Ya existe una factura con el número "${numero}" para esta empresa.`,
      });
    }

    const factura = await prisma.factura.create({
      data: {
        tenantId,
        empresaId,
        numero,
        proveedor,
        nit,
        contrato: contrato || null,
        centroCostos: centroCostos || null,
        area,
        responsable,
        vence: new Date(vence),
        subtotal: sub,
        iva: ivaNum,
        total: sub + ivaNum,
        moneda: monedaFinal,
        prioridad: prioridadFinal,
        origen: typeof origen === "string" ? origen : "Carga manual",
        historial: {
          create: {
            actor: req.user!.nombre,
            accion: "Factura recibida",
            detalle: "Ingreso al sistema",
          },
        },
      },
      include: { historial: true },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "FACTURA_CREADA",
        detalle: `${req.user!.nombre} registró la factura "${factura.numero}" (${proveedor})`,
      },
    });

    return res.status(201).json(serializar(factura));
  } catch (error) {
    console.error("Error al crear factura:", error);
    return res.status(500).json({ message: "Error al registrar la factura." });
  }
};

export const cambiarEstadoFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { estado: nuevoEstado, detalle } = req.body;

    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }

    const transicion = TRANSICIONES[nuevoEstado];
    if (!transicion) {
      return res.status(400).json({ message: `No se puede establecer el estado "${nuevoEstado}" directamente.` });
    }

    const factura = await prisma.factura.findFirst({ where: { id, tenantId } });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });

    if (!transicion.desde.includes(factura.estado)) {
      return res.status(409).json({
        message: `No se puede pasar de "${factura.estado}" a "${nuevoEstado}".`,
      });
    }

    const tienePermiso = req.user!.isSuperadmin || req.user!.permisos.includes(transicion.permiso);
    if (!tienePermiso) {
      return res.status(403).json({ message: "No tienes permiso para realizar esta acción." });
    }

    const accionLabel =
      nuevoEstado === "Aprobada" ? "Factura aprobada" : nuevoEstado === "Rechazada" ? "Factura rechazada" : "Pago registrado";

    const actualizada = await prisma.factura.update({
      where: { id },
      data: {
        estado: nuevoEstado,
        historial: {
          create: {
            actor: req.user!.nombre,
            accion: accionLabel,
            detalle: typeof detalle === "string" ? detalle : undefined,
          },
        },
      },
      include: { historial: { orderBy: { createdAt: "asc" } } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: `FACTURA_${nuevoEstado.toUpperCase()}`,
        detalle: `${req.user!.nombre} cambió la factura "${factura.numero}" a "${nuevoEstado}"`,
      },
    });

    return res.json(serializar(actualizada));
  } catch (error) {
    console.error("Error al cambiar estado de factura:", error);
    return res.status(500).json({ message: "Error al actualizar la factura." });
  }
};
