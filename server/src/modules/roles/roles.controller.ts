import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { parseRolPermisos, PERMISOS_SISTEMA } from "../../lib/permissions";

const PERMISO_VALIDO = new Set<string>(Object.values(PERMISOS_SISTEMA));

function sanearPermisos(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((p): p is string => typeof p === "string" && PERMISO_VALIDO.has(p));
}

export const listarRoles = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const roles = await prisma.rol.findMany({
      where: { tenantId },
      include: { _count: { select: { users: true } } },
      orderBy: { nombre: "asc" },
    });

    return res.json(
      roles.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        descripcion: r.descripcion,
        esSistema: r.esSistema,
        permisos: parseRolPermisos(r.permisos),
        usuariosAsignados: r._count.users,
      })),
    );
  } catch (error) {
    console.error("Error al listar roles:", error);
    return res.status(500).json({ message: "Error al obtener roles." });
  }
};

export const crearRol = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { nombre, descripcion, permisos } = req.body;

    if (!nombre || typeof nombre !== "string") {
      return res.status(400).json({ message: "El nombre del rol es obligatorio." });
    }

    const rol = await prisma.rol.create({
      data: {
        tenantId,
        nombre,
        descripcion: typeof descripcion === "string" ? descripcion : null,
        permisos: JSON.stringify(sanearPermisos(permisos)),
        esSistema: false,
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "ROL_CREADO",
        detalle: `${req.user!.nombre} creó el rol "${rol.nombre}"`,
      },
    });

    return res.status(201).json({
      id: rol.id,
      nombre: rol.nombre,
      descripcion: rol.descripcion,
      esSistema: rol.esSistema,
      permisos: parseRolPermisos(rol.permisos),
      usuariosAsignados: 0,
    });
  } catch (error) {
    console.error("Error al crear rol:", error);
    return res.status(500).json({ message: "Error al crear el rol." });
  }
};

export const actualizarRol = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { nombre, descripcion, permisos } = req.body;

    const rolExistente = await prisma.rol.findFirst({ where: { id, tenantId } });
    if (!rolExistente) {
      return res.status(404).json({ message: "Rol no encontrado." });
    }
    if (rolExistente.esSistema && Array.isArray(permisos)) {
      return res.status(409).json({
        message: "Los permisos de un rol de sistema no pueden modificarse.",
      });
    }

    const rol = await prisma.rol.update({
      where: { id },
      data: {
        ...(typeof nombre === "string" && !rolExistente.esSistema ? { nombre } : {}),
        ...(typeof descripcion === "string" ? { descripcion } : {}),
        ...(Array.isArray(permisos) ? { permisos: JSON.stringify(sanearPermisos(permisos)) } : {}),
      },
      include: { _count: { select: { users: true } } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "ROL_EDITADO",
        detalle: `${req.user!.nombre} editó el rol "${rol.nombre}"`,
      },
    });

    return res.json({
      id: rol.id,
      nombre: rol.nombre,
      descripcion: rol.descripcion,
      esSistema: rol.esSistema,
      permisos: parseRolPermisos(rol.permisos),
      usuariosAsignados: rol._count.users,
    });
  } catch (error) {
    console.error("Error al actualizar rol:", error);
    return res.status(500).json({ message: "Error al actualizar el rol." });
  }
};

export const eliminarRol = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const rol = await prisma.rol.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { users: true } } },
    });
    if (!rol) {
      return res.status(404).json({ message: "Rol no encontrado." });
    }
    if (rol.esSistema) {
      return res.status(409).json({ message: "Los roles de sistema no pueden eliminarse." });
    }
    if (rol._count.users > 0) {
      return res.status(409).json({
        message: `No se puede eliminar: hay ${rol._count.users} usuario(s) con este rol asignado.`,
      });
    }

    await prisma.rol.delete({ where: { id } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "ROL_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el rol "${rol.nombre}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar rol:", error);
    return res.status(500).json({ message: "Error al eliminar el rol." });
  }
};
