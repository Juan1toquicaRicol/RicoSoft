import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { whereAlcance } from "../../lib/alcance";

function serializar(p: {
  id: string;
  tenantId: string | null;
  tipoEvento: string;
  titulo: string;
  mensaje: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    tipoEvento: p.tipoEvento,
    titulo: p.titulo,
    mensaje: p.mensaje,
    activo: p.activo,
    alcance: p.tenantId === null ? "GENERAL" : "TENANT",
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** GET /api/plantillas-notificacion?tipoEvento=X — GENERALES + del tenant. */
export const listarPlantillasNotificacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const tipoEvento = typeof req.query.tipoEvento === "string" ? req.query.tipoEvento : undefined;

    const plantillas = await prisma.plantillaNotificacion.findMany({
      where: {
        ...(tipoEvento ? { tipoEvento } : {}),
        ...whereAlcance(tenantId),
      },
      orderBy: [{ tipoEvento: "asc" }, { tenantId: "asc" }],
    });

    return res.json(plantillas.map(serializar));
  } catch (error) {
    console.error("Error al listar plantillas de notificación:", error);
    return res.status(500).json({ message: "Error al obtener las plantillas de notificación." });
  }
};

export const crearPlantillaNotificacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { tipoEvento, titulo, mensaje, alcance } = req.body;

    if (!tipoEvento || typeof tipoEvento !== "string" || !tipoEvento.trim()) {
      return res.status(400).json({ message: "tipoEvento es obligatorio." });
    }
    if (!titulo || typeof titulo !== "string" || !titulo.trim()) {
      return res.status(400).json({ message: "titulo es obligatorio." });
    }
    if (!mensaje || typeof mensaje !== "string" || !mensaje.trim()) {
      return res.status(400).json({ message: "mensaje es obligatorio." });
    }
    if (alcance !== undefined && alcance !== "GENERAL" && alcance !== "TENANT") {
      return res.status(400).json({ message: 'alcance debe ser "GENERAL" o "TENANT".' });
    }
    // Igual que CatalogoValor/Departamento/Rol/Modulo: una plantilla GENERAL
    // es visible/editable por todos los tenants, solo un superadmin puede
    // crearla.
    if (alcance === "GENERAL" && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message:
          "Solo un superadministrador puede crear plantillas de notificación de alcance general.",
      });
    }

    const plantilla = await prisma.plantillaNotificacion.create({
      data: {
        tipoEvento: tipoEvento.trim(),
        titulo: titulo.trim(),
        mensaje,
        tenantId: alcance === "GENERAL" ? null : tenantId,
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PLANTILLA_NOTIFICACION_CREADA",
        detalle: `${req.user!.nombre} creó la plantilla de notificación "${plantilla.tipoEvento}".`,
      },
    });

    return res.status(201).json(serializar(plantilla));
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return res.status(409).json({
        message: "Ya existe una plantilla para ese tipoEvento en ese alcance.",
      });
    }
    console.error("Error al crear plantilla de notificación:", error);
    return res.status(500).json({ message: "Error al crear la plantilla de notificación." });
  }
};

export const actualizarPlantillaNotificacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { titulo, mensaje, activo } = req.body;

    const existente = await prisma.plantillaNotificacion.findFirst({
      where: { id, ...whereAlcance(tenantId) },
    });
    if (!existente) {
      return res.status(404).json({ message: "Plantilla de notificación no encontrada." });
    }
    if (existente.tenantId === null && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede editar plantillas de notificación generales.",
      });
    }

    const plantilla = await prisma.plantillaNotificacion.update({
      where: { id },
      data: {
        ...(typeof titulo === "string" && titulo.trim() ? { titulo: titulo.trim() } : {}),
        ...(typeof mensaje === "string" && mensaje.trim() ? { mensaje } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PLANTILLA_NOTIFICACION_EDITADA",
        detalle: `${req.user!.nombre} editó la plantilla de notificación "${plantilla.tipoEvento}".`,
      },
    });

    return res.json(serializar(plantilla));
  } catch (error) {
    console.error("Error al actualizar plantilla de notificación:", error);
    return res.status(500).json({ message: "Error al actualizar la plantilla de notificación." });
  }
};

export const eliminarPlantillaNotificacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const existente = await prisma.plantillaNotificacion.findFirst({
      where: { id, ...whereAlcance(tenantId) },
    });
    if (!existente) {
      return res.status(404).json({ message: "Plantilla de notificación no encontrada." });
    }
    if (existente.tenantId === null && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede eliminar plantillas de notificación generales.",
      });
    }

    await prisma.plantillaNotificacion.delete({ where: { id } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PLANTILLA_NOTIFICACION_ELIMINADA",
        detalle: `${req.user!.nombre} eliminó la plantilla de notificación "${existente.tipoEvento}".`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar plantilla de notificación:", error);
    return res.status(500).json({ message: "Error al eliminar la plantilla de notificación." });
  }
};
