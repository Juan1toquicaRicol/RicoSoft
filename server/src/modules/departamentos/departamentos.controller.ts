import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

export const listarDepartamentos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const departamentos = await prisma.departamento.findMany({
      where: { tenantId },
      include: { _count: { select: { usuarios: true } } },
      orderBy: { nombre: "asc" },
    });

    return res.json(
      departamentos.map((d) => ({
        id: d.id,
        nombre: d.nombre,
        esSistemas: d.esSistemas,
        activo: d.activo,
        usuariosAsignados: d._count.usuarios,
      })),
    );
  } catch (error) {
    console.error("Error al listar departamentos:", error);
    return res.status(500).json({ message: "Error al obtener departamentos." });
  }
};

/**
 * Listado público sin autenticación: usado por el formulario de registro para
 * que un usuario nuevo pueda elegir su departamento antes de tener sesión.
 * Solo expone id/nombre de departamentos activos, nada sensible.
 */
export const listarDepartamentosPublico = async (_req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) return res.json([]);

    const departamentos = await prisma.departamento.findMany({
      where: { tenantId: tenant.id, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });

    return res.json(departamentos);
  } catch (error) {
    console.error("Error al listar departamentos públicos:", error);
    return res.status(500).json({ message: "Error al obtener departamentos." });
  }
};

export const crearDepartamento = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { nombre, esSistemas } = req.body;

    if (!nombre || typeof nombre !== "string") {
      return res.status(400).json({ message: "El nombre del departamento es obligatorio." });
    }

    const departamento = await prisma.departamento.create({
      data: { tenantId, nombre, esSistemas: Boolean(esSistemas) },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "DEPARTAMENTO_CREADO",
        detalle: `${req.user!.nombre} creó el departamento "${departamento.nombre}"`,
      },
    });

    return res.status(201).json({
      id: departamento.id,
      nombre: departamento.nombre,
      esSistemas: departamento.esSistemas,
      activo: departamento.activo,
      usuariosAsignados: 0,
    });
  } catch (error) {
    console.error("Error al crear departamento:", error);
    return res.status(500).json({ message: "Error al crear el departamento." });
  }
};

export const actualizarDepartamento = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { nombre, esSistemas, activo } = req.body;

    const existente = await prisma.departamento.findFirst({ where: { id, tenantId } });
    if (!existente) {
      return res.status(404).json({ message: "Departamento no encontrado." });
    }

    const departamento = await prisma.departamento.update({
      where: { id },
      data: {
        ...(typeof nombre === "string" ? { nombre } : {}),
        ...(typeof esSistemas === "boolean" ? { esSistemas } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
      },
      include: { _count: { select: { usuarios: true } } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "DEPARTAMENTO_EDITADO",
        detalle: `${req.user!.nombre} editó el departamento "${departamento.nombre}"`,
      },
    });

    return res.json({
      id: departamento.id,
      nombre: departamento.nombre,
      esSistemas: departamento.esSistemas,
      activo: departamento.activo,
      usuariosAsignados: departamento._count.usuarios,
    });
  } catch (error) {
    console.error("Error al actualizar departamento:", error);
    return res.status(500).json({ message: "Error al actualizar el departamento." });
  }
};

export const eliminarDepartamento = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const departamento = await prisma.departamento.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { usuarios: true } } },
    });
    if (!departamento) {
      return res.status(404).json({ message: "Departamento no encontrado." });
    }
    if (departamento._count.usuarios > 0) {
      return res.status(409).json({
        message: `No se puede eliminar: hay ${departamento._count.usuarios} usuario(s) asignados a este departamento.`,
      });
    }

    await prisma.departamento.delete({ where: { id } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "DEPARTAMENTO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el departamento "${departamento.nombre}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar departamento:", error);
    return res.status(500).json({ message: "Error al eliminar el departamento." });
  }
};
