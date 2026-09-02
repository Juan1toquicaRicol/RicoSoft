import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { parseRolPermisos } from "../../lib/permissions";
import { listarCatalogoPermisos } from "./permisos.service";

function serializar(p: any) {
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    descripcion: p.descripcion,
    modulo: p.modulo,
    esSistema: p.esSistema,
    activo: p.activo,
  };
}

export const listarPermisos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const permisos = await listarCatalogoPermisos(req.user!.tenantId);
    return res.json(permisos.map(serializar));
  } catch (error) {
    console.error("Error al listar permisos:", error);
    return res.status(500).json({ message: "Error al obtener el catálogo de permisos." });
  }
};

export const crearPermiso = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    // Forma del body ya validada por validarBody(crearPermisoSchema).
    const { codigo, nombre, descripcion, modulo } = req.body;

    const codigoNormalizado = String(codigo).trim().toLowerCase();
    const existente = await prisma.permiso.findFirst({
      where: { tenantId, codigo: codigoNormalizado },
    });
    if (existente) {
      return res
        .status(409)
        .json({ message: `Ya existe un permiso con el código "${codigoNormalizado}".` });
    }

    const permiso = await prisma.permiso.create({
      data: {
        tenantId,
        codigo: codigoNormalizado,
        nombre: nombre.trim(),
        descripcion:
          typeof descripcion === "string" && descripcion.trim() ? descripcion.trim() : null,
        modulo: modulo.trim(),
        esSistema: false,
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PERMISO_CREADO",
        detalle: `${req.user!.nombre} creó el permiso "${permiso.codigo}"`,
        entidadTipo: "Permiso",
        entidadId: permiso.id,
        datosNuevos: JSON.stringify({
          codigo: permiso.codigo,
          nombre: permiso.nombre,
          modulo: permiso.modulo,
        }),
      },
    });

    return res.status(201).json(serializar(permiso));
  } catch (error) {
    console.error("Error al crear permiso:", error);
    return res.status(500).json({ message: "Error al crear el permiso." });
  }
};

export const actualizarPermiso = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { nombre, descripcion, modulo, activo } = req.body;

    const existente = await prisma.permiso.findFirst({ where: { id, tenantId } });
    if (!existente) {
      return res.status(404).json({ message: "Permiso no encontrado." });
    }

    const permiso = await prisma.permiso.update({
      where: { id },
      data: {
        ...(typeof nombre === "string" && nombre.trim() ? { nombre: nombre.trim() } : {}),
        ...(descripcion !== undefined
          ? {
              descripcion:
                typeof descripcion === "string" && descripcion.trim() ? descripcion.trim() : null,
            }
          : {}),
        ...(typeof modulo === "string" && modulo.trim() ? { modulo: modulo.trim() } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PERMISO_EDITADO",
        detalle: `${req.user!.nombre} editó el permiso "${permiso.codigo}"`,
        entidadTipo: "Permiso",
        entidadId: id,
        datosAnteriores: JSON.stringify({
          nombre: existente.nombre,
          modulo: existente.modulo,
          activo: existente.activo,
        }),
        datosNuevos: JSON.stringify({
          nombre: permiso.nombre,
          modulo: permiso.modulo,
          activo: permiso.activo,
        }),
      },
    });

    return res.json(serializar(permiso));
  } catch (error) {
    console.error("Error al actualizar permiso:", error);
    return res.status(500).json({ message: "Error al actualizar el permiso." });
  }
};

/**
 * Solo se pueden eliminar permisos creados por el propio tenant
 * (esSistema=false); los del sistema se desactivan en su lugar. Tampoco se
 * elimina uno que ya esté asignado a algún Rol, para no dejar códigos
 * huérfanos referenciados en Rol.permisos.
 */
export const eliminarPermiso = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const permiso = await prisma.permiso.findFirst({ where: { id, tenantId } });
    if (!permiso) {
      return res.status(404).json({ message: "Permiso no encontrado." });
    }
    if (permiso.esSistema) {
      return res.status(409).json({
        message: "Los permisos del sistema no se pueden eliminar; puedes desactivarlos.",
      });
    }

    const roles = await prisma.rol.findMany({
      where: { tenantId },
      select: { nombre: true, permisos: true },
    });
    const rolesConEsePermiso = roles.filter((r) =>
      parseRolPermisos(r.permisos).includes(permiso.codigo),
    );
    if (rolesConEsePermiso.length > 0) {
      return res.status(409).json({
        message: `No se puede eliminar: está asignado a ${rolesConEsePermiso.length} rol(es) (${rolesConEsePermiso.map((r) => r.nombre).join(", ")}). Quítalo de esos roles primero.`,
      });
    }

    await prisma.permiso.delete({ where: { id } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PERMISO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el permiso "${permiso.codigo}"`,
        entidadTipo: "Permiso",
        entidadId: id,
        datosAnteriores: JSON.stringify({ codigo: permiso.codigo, nombre: permiso.nombre }),
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar permiso:", error);
    return res.status(500).json({ message: "Error al eliminar el permiso." });
  }
};
