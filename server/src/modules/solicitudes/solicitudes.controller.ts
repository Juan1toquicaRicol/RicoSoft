import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";

const ESTADOS_VALIDOS = ["Pendiente", "En Cotización", "Aprobada", "Rechazada", "Comprado"];
const PRIORIDADES_VALIDAS = ["Baja", "Media", "Alta", "Crítica"];

const TRANSICIONES: Record<string, { desde: string[]; permiso: string }> = {
  Aprobada: { desde: ["Pendiente", "En Cotización"], permiso: PERMISOS_SISTEMA.SOLICITUDES_APROBAR },
  Rechazada: { desde: ["Pendiente", "En Cotización"], permiso: PERMISOS_SISTEMA.SOLICITUDES_RECHAZAR },
  Comprado: { desde: ["Aprobada"], permiso: PERMISOS_SISTEMA.SOLICITUDES_COMPRAR },
};

function serializar(s: any) {
  return { ...s, valorEstimado: Number(s.valorEstimado) };
}

export const listarSolicitudes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: any = { tenantId };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;

    const solicitudes = await prisma.solicitudCompra.findMany({
      where,
      orderBy: { fechaSolicitud: "desc" },
    });
    return res.json(solicitudes.map(serializar));
  } catch (error) {
    console.error("Error al listar solicitudes de compra:", error);
    return res.status(500).json({ message: "Error al obtener solicitudes de compra." });
  }
};

export const crearSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId, area, solicitante, item, descripcion, cantidad, valorEstimado, prioridad } = req.body;

    if (!empresaId || !area || !solicitante || !item) {
      return res.status(400).json({ message: "Faltan campos obligatorios de la solicitud." });
    }
    const cant = Number(cantidad);
    const valor = Number(valorEstimado);
    if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(valor) || valor < 0) {
      return res.status(400).json({ message: "Cantidad y valor estimado deben ser números válidos." });
    }

    const solicitud = await prisma.solicitudCompra.create({
      data: {
        tenantId,
        empresaId,
        area,
        solicitante,
        item,
        descripcion: descripcion || null,
        cantidad: cant,
        valorEstimado: valor,
        prioridad: PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : "Media",
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_CREADA",
        detalle: `${req.user!.nombre} registró la solicitud de compra "${item}"`,
      },
    });

    return res.status(201).json(serializar(solicitud));
  } catch (error) {
    console.error("Error al crear solicitud de compra:", error);
    return res.status(500).json({ message: "Error al registrar la solicitud de compra." });
  }
};

export const cambiarEstadoSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { estado: nuevoEstado } = req.body;

    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }
    const transicion = TRANSICIONES[nuevoEstado];
    if (!transicion) {
      return res.status(400).json({ message: `No se puede establecer el estado "${nuevoEstado}" directamente.` });
    }

    const solicitud = await prisma.solicitudCompra.findFirst({ where: { id, tenantId } });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada." });

    if (!transicion.desde.includes(solicitud.estado)) {
      return res.status(409).json({ message: `No se puede pasar de "${solicitud.estado}" a "${nuevoEstado}".` });
    }

    const tienePermiso = req.user!.isSuperadmin || req.user!.permisos.includes(transicion.permiso);
    if (!tienePermiso) {
      return res.status(403).json({ message: "No tienes permiso para realizar esta acción." });
    }

    const actualizada = await prisma.solicitudCompra.update({
      where: { id },
      data: { estado: nuevoEstado },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: `SOLICITUD_COMPRA_${nuevoEstado.toUpperCase().replace(/ /g, "_")}`,
        detalle: `${req.user!.nombre} cambió la solicitud "${solicitud.item}" a "${nuevoEstado}"`,
      },
    });

    return res.json(serializar(actualizada));
  } catch (error) {
    console.error("Error al cambiar estado de solicitud:", error);
    return res.status(500).json({ message: "Error al actualizar la solicitud." });
  }
};
