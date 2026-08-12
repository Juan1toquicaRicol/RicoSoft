import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";

const ESTADOS_VALIDOS = ["Pendiente", "En Cotización", "Aprobada", "Rechazada", "Comprado"];
const PRIORIDADES_VALIDAS = ["Baja", "Media", "Alta", "Crítica"];

// Estados que aún requieren gestión: se muestran en "Solicitudes de compra".
const ESTADOS_ACTIVOS = ["Pendiente", "En Cotización"];
// Estados ya resueltos: se muestran en "Historia de compras" y ya no aparecen
// en el listado de solicitudes activas. Ninguna solicitud se elimina de la
// base de datos; solo cambia su campo `estado`.
const ESTADOS_HISTORICOS = ["Aprobada", "Rechazada", "Comprado"];

const TRANSICIONES: Record<string, { desde: string[]; permiso: string }> = {
  Aprobada: { desde: ["Pendiente", "En Cotización"], permiso: PERMISOS_SISTEMA.SOLICITUDES_APROBAR },
  Rechazada: { desde: ["Pendiente", "En Cotización"], permiso: PERMISOS_SISTEMA.SOLICITUDES_RECHAZAR },
  Comprado: { desde: ["Aprobada"], permiso: PERMISOS_SISTEMA.SOLICITUDES_COMPRAR },
};

// Transiciones que registran quién resolvió la solicitud y cuándo.
const TRANSICIONES_DE_RESOLUCION = new Set(["Aprobada", "Rechazada"]);

function serializar(s: any) {
  return { ...s, valorEstimado: Number(s.valorEstimado) };
}

/**
 * Solicitudes activas (Pendiente / En Cotización): son las únicas visibles
 * en "Solicitudes de compra". En cuanto se aprueban o rechazan dejan de
 * aparecer aquí y pasan a "Historia de compras".
 */
export const listarSolicitudes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: any = { tenantId, estado: { in: ESTADOS_ACTIVOS } };
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

/**
 * Historia de compras: consulta de solo lectura sobre las solicitudes ya
 * resueltas (aprobadas, rechazadas o compradas). Reutiliza la misma tabla
 * SolicitudCompra -- no existe una tabla de historial separada -- filtrando
 * por estado, para no perder ni duplicar información.
 */
export const listarHistorialCompras = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId, estado, area, solicitante, desde, hasta } = req.query;

    const where: any = { tenantId, estado: { in: ESTADOS_HISTORICOS } };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;
    if (typeof estado === "string" && ESTADOS_HISTORICOS.includes(estado)) where.estado = estado;
    if (typeof area === "string" && area) where.area = { contains: area };
    if (typeof solicitante === "string" && solicitante) where.solicitante = { contains: solicitante };
    if (typeof desde === "string" && desde) {
      where.fechaResolucion = { ...(where.fechaResolucion || {}), gte: new Date(desde) };
    }
    if (typeof hasta === "string" && hasta) {
      const hastaFin = new Date(hasta);
      hastaFin.setHours(23, 59, 59, 999);
      where.fechaResolucion = { ...(where.fechaResolucion || {}), lte: hastaFin };
    }

    const historial = await prisma.solicitudCompra.findMany({
      where,
      orderBy: { fechaResolucion: "desc" },
    });
    return res.json(historial.map(serializar));
  } catch (error) {
    console.error("Error al listar historia de compras:", error);
    return res.status(500).json({ message: "Error al obtener la historia de compras." });
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
    const { estado: nuevoEstado, comentario } = req.body;

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

    const data: any = { estado: nuevoEstado };
    if (TRANSICIONES_DE_RESOLUCION.has(nuevoEstado)) {
      data.fechaResolucion = new Date();
      data.resueltoPorId = req.user!.id;
      data.resueltoPorNombre = req.user!.nombre;
      data.comentarioResolucion = typeof comentario === "string" && comentario.trim() ? comentario.trim() : null;
    }

    const actualizada = await prisma.solicitudCompra.update({
      where: { id },
      data,
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
