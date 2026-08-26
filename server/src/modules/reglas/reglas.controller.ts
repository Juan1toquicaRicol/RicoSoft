import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

function parseLista(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function sanearLista(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

function serializar(r: any) {
  return {
    id: r.id,
    nombre: r.nombre,
    prioridad: r.prioridad,
    activa: r.activa,
    ejecuciones: r.ejecuciones,
    condiciones: parseLista(r.condiciones),
    acciones: parseLista(r.acciones),
  };
}

export const listarReglas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const reglas = await prisma.reglaEnrutamiento.findMany({
      where: { tenantId },
      orderBy: { prioridad: "asc" },
      take: 1000, // límite de seguridad temporal; falta paginación real (ver auditoría)
    });
    return res.json(reglas.map(serializar));
  } catch (error) {
    console.error("Error al listar reglas:", error);
    return res.status(500).json({ message: "Error al obtener las reglas." });
  }
};

export const crearRegla = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { nombre, prioridad, condiciones, acciones } = req.body;

    if (!nombre || typeof nombre !== "string") {
      return res.status(400).json({ message: "El nombre de la regla es obligatorio." });
    }

    const regla = await prisma.reglaEnrutamiento.create({
      data: {
        tenantId,
        nombre,
        prioridad: Number.isFinite(Number(prioridad)) ? Number(prioridad) : 1,
        condiciones: JSON.stringify(sanearLista(condiciones)),
        acciones: JSON.stringify(sanearLista(acciones)),
        activa: true,
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REGLA_CREADA",
        detalle: `${req.user!.nombre} creó la regla "${regla.nombre}"`,
      },
    });

    return res.status(201).json(serializar(regla));
  } catch (error) {
    console.error("Error al crear regla:", error);
    return res.status(500).json({ message: "Error al crear la regla." });
  }
};

export const actualizarRegla = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { nombre, prioridad, activa, condiciones, acciones } = req.body;

    const existente = await prisma.reglaEnrutamiento.findFirst({ where: { id, tenantId } });
    if (!existente) return res.status(404).json({ message: "Regla no encontrada." });

    const regla = await prisma.reglaEnrutamiento.update({
      where: { id },
      data: {
        ...(typeof nombre === "string" ? { nombre } : {}),
        ...(Number.isFinite(Number(prioridad)) ? { prioridad: Number(prioridad) } : {}),
        ...(typeof activa === "boolean" ? { activa } : {}),
        ...(Array.isArray(condiciones) ? { condiciones: JSON.stringify(sanearLista(condiciones)) } : {}),
        ...(Array.isArray(acciones) ? { acciones: JSON.stringify(sanearLista(acciones)) } : {}),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REGLA_EDITADA",
        detalle: `${req.user!.nombre} editó la regla "${regla.nombre}"`,
      },
    });

    return res.json(serializar(regla));
  } catch (error) {
    console.error("Error al actualizar regla:", error);
    return res.status(500).json({ message: "Error al actualizar la regla." });
  }
};

export const eliminarRegla = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const regla = await prisma.reglaEnrutamiento.findFirst({ where: { id, tenantId } });
    if (!regla) return res.status(404).json({ message: "Regla no encontrada." });

    await prisma.reglaEnrutamiento.delete({ where: { id } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REGLA_ELIMINADA",
        detalle: `${req.user!.nombre} eliminó la regla "${regla.nombre}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar regla:", error);
    return res.status(500).json({ message: "Error al eliminar la regla." });
  }
};
