import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { parseRolPermisos, PERMISOS_SISTEMA, PERMISOS_LEGACY } from "../../lib/permissions";
import { obtenerCodigosPermisosAsignables } from "../permisos/permisos.service";
import { whereAlcance } from "../../lib/alcance";

function serializar(r: {
  id: string;
  tenantId: string | null;
  nombre: string;
  descripcion: string | null;
  esSistema: boolean;
  activo: boolean;
  permisos: string;
  _count?: { users: number };
}) {
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    esSistema: r.esSistema,
    activo: r.activo,
    alcance: r.tenantId === null ? "GENERAL" : "TENANT",
    // Los códigos LEGACY se muestran ya traducidos a su equivalente vigente:
    // el código viejo no está en el catálogo, así que la pantalla de Roles no
    // tendría casilla que marcar y al guardar el rol perdería la capacidad.
    // Traduciendo en lectura, el administrador ve marcada la casilla correcta
    // y el primer guardado migra el dato solo. El registro en base no se toca
    // hasta ese guardado, así que revertir este cambio no pierde nada.
    permisos: [...new Set(parseRolPermisos(r.permisos).map((p) => PERMISOS_LEGACY[p] ?? p))],
    usuariosAsignados: r._count?.users ?? 0,
  };
}

// Un código de permiso solo se puede asignar a un rol si está en el
// catálogo del sistema (PERMISOS_SISTEMA) o si es un permiso personalizado
// ACTIVO creado por este tenant en Administración Global > Permisos — ver
// permisos.service.ts. Esto es lo que hace que un permiso creado ahí sea
// realmente asignable a roles, no solo un registro decorativo.
/**
 * Además de filtrar códigos inválidos, traduce los códigos LEGACY al código
 * vigente al que equivalen (ver PERMISOS_LEGACY). Así un rol viejo se migra
 * solo la primera vez que alguien lo guarda, en vez de perder el permiso:
 * el código legacy ya no está en el catálogo asignable, así que la pantalla
 * de Roles no lo envía de vuelta y sin esta traducción el rol quedaría sin
 * la capacidad equivalente. Es la migración progresiva de roles existentes,
 * sin tocar datos por lote ni dejar a nadie sin acceso.
 */
function sanearPermisos(input: unknown, validos: Set<string>): string[] {
  if (!Array.isArray(input)) return [];
  const traducidos = input
    .filter((p): p is string => typeof p === "string")
    .map((p) => PERMISOS_LEGACY[p] ?? p);
  return [...new Set(traducidos.filter((p) => validos.has(p)))];
}

export const listarRoles = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const roles = await prisma.rol.findMany({
      where: whereAlcance(tenantId),
      include: { _count: { select: { users: true } } },
      orderBy: { nombre: "asc" },
    });

    return res.json(roles.map(serializar));
  } catch (error) {
    console.error("Error al listar roles:", error);
    return res.status(500).json({ message: "Error al obtener roles." });
  }
};

export const crearRol = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    // Forma del body ya validada por validarBody(crearRolSchema).
    const { nombre, descripcion, permisos, alcance } = req.body;
    if (alcance !== undefined && alcance !== "GENERAL" && alcance !== "TENANT") {
      return res.status(400).json({ message: 'El alcance debe ser "GENERAL" o "TENANT".' });
    }
    // Un rol GENERAL (tenantId: null) es visible y editable por TODOS los
    // tenants vía whereAlcance — solo un superadmin puede crearlos, o
    // cualquier tenant podría empujar roles/permisos a las demás empresas.
    if (alcance === "GENERAL" && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede crear roles de alcance general.",
      });
    }

    const permisosValidos = await obtenerCodigosPermisosAsignables(tenantId);
    const permisosSaneados = sanearPermisos(permisos, permisosValidos);
    // Mismo criterio que actualizarRol: definir los permisos de un rol exige
    // "asignar_permisos", no basta "roles.crear" (que solo permite crear el rol).
    if (
      permisosSaneados.length > 0 &&
      !req.user!.isSuperadmin &&
      !req.user!.permisos.includes(PERMISOS_SISTEMA.ROLES_ASIGNAR_PERMISOS)
    ) {
      return res.status(403).json({
        message: "No tienes permiso para definir los permisos de un rol.",
      });
    }
    const rol = await prisma.rol.create({
      data: {
        tenantId: alcance === "GENERAL" ? null : tenantId,
        nombre,
        descripcion: typeof descripcion === "string" ? descripcion : null,
        permisos: JSON.stringify(permisosSaneados),
        esSistema: false,
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "ROL_CREADO",
        detalle: `${req.user!.nombre} creó el rol "${rol.nombre}" (${rol.tenantId === null ? "GENERAL" : "exclusivo de esta empresa"})`,
        entidadTipo: "Rol",
        entidadId: rol.id,
        datosNuevos: JSON.stringify({
          nombre: rol.nombre,
          descripcion: rol.descripcion,
          permisos: parseRolPermisos(rol.permisos),
        }),
      },
    });

    return res.status(201).json(serializar({ ...rol, _count: { users: 0 } }));
  } catch (error) {
    console.error("Error al crear rol:", error);
    return res.status(500).json({ message: "Error al crear el rol." });
  }
};

export const actualizarRol = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { nombre, descripcion, permisos, activo, alcance } = req.body;

    const rolExistente = await prisma.rol.findFirst({ where: { id, ...whereAlcance(tenantId) } });
    if (!rolExistente) {
      return res.status(404).json({ message: "Rol no encontrado." });
    }
    if (alcance !== undefined && alcance !== "GENERAL" && alcance !== "TENANT") {
      return res.status(400).json({ message: 'El alcance debe ser "GENERAL" o "TENANT".' });
    }
    // Un rol ya GENERAL es visible/editable por cualquier tenant vía
    // whereAlcance; sin este check, cualquier empresa podría renombrarlo,
    // cambiarle permisos o desactivarlo para todas las demás. Convertir un
    // rol TENANT a GENERAL tiene el mismo alcance de impacto, así que exige
    // lo mismo.
    const tocaAlcanceGeneral = rolExistente.tenantId === null || alcance === "GENERAL";
    if (tocaAlcanceGeneral && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede modificar roles de alcance general.",
      });
    }
    let nuevoTenantId: string | null | undefined;
    if (alcance !== undefined) {
      const eraGeneral = rolExistente.tenantId === null;
      const seraGeneral = alcance === "GENERAL";
      if (eraGeneral && !seraGeneral) {
        const usuariosDeOtroTenant = await prisma.user.count({
          where: { rolId: id, tenantId: { not: tenantId } },
        });
        const membresiasDeOtroTenant = await prisma.membresia.count({
          where: { rolId: id, tenantId: { not: tenantId } },
        });
        if (usuariosDeOtroTenant > 0 || membresiasDeOtroTenant > 0) {
          return res.status(409).json({
            message:
              "No se puede convertir a exclusivo de esta empresa: hay usuarios o membresías de otras empresas con este rol.",
          });
        }
        nuevoTenantId = tenantId;
      } else if (!eraGeneral && seraGeneral) {
        nuevoTenantId = null;
      }
    }
    if (rolExistente.esSistema && Array.isArray(permisos)) {
      return res.status(409).json({
        message: "Los permisos de un rol de sistema no pueden modificarse.",
      });
    }
    if (rolExistente.esSistema && typeof activo === "boolean" && !activo) {
      return res.status(409).json({ message: "Los roles de sistema no pueden desactivarse." });
    }

    // Cambiar el arreglo de permisos de un rol es más sensible que renombrarlo
    // o cambiar su descripción: exige el permiso específico "asignar_permisos"
    // además de "editar", para que "roles.editar" por sí solo no sea suficiente
    // para inflar un rol con permisos arbitrarios (p. ej. usuarios.eliminar).
    if (
      Array.isArray(permisos) &&
      !req.user!.isSuperadmin &&
      !req.user!.permisos.includes(PERMISOS_SISTEMA.ROLES_ASIGNAR_PERMISOS)
    ) {
      return res.status(403).json({
        message: "No tienes permiso para modificar los permisos de un rol.",
      });
    }

    const permisosSaneados = Array.isArray(permisos)
      ? sanearPermisos(permisos, await obtenerCodigosPermisosAsignables(tenantId))
      : null;
    const permisosAnteriores = Array.isArray(permisos)
      ? parseRolPermisos(rolExistente.permisos)
      : null;

    const rol = await prisma.rol.update({
      where: { id },
      data: {
        ...(typeof nombre === "string" && !rolExistente.esSistema ? { nombre } : {}),
        ...(typeof descripcion === "string" ? { descripcion } : {}),
        ...(permisosSaneados !== null ? { permisos: JSON.stringify(permisosSaneados) } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
        ...(nuevoTenantId !== undefined ? { tenantId: nuevoTenantId } : {}),
      },
      include: { _count: { select: { users: true } } },
    });

    let detallePermisos = "";
    if (permisosSaneados !== null && permisosAnteriores !== null) {
      const agregados = permisosSaneados.filter((p) => !permisosAnteriores.includes(p));
      const quitados = permisosAnteriores.filter((p) => !permisosSaneados.includes(p));
      if (agregados.length || quitados.length) {
        detallePermisos = ` Permisos agregados: [${agregados.join(", ") || "ninguno"}]. Permisos quitados: [${quitados.join(", ") || "ninguno"}].`;
      }
    }
    const detalleActivo =
      typeof activo === "boolean" && activo !== rolExistente.activo
        ? ` Rol ${activo ? "activado" : "desactivado"}.`
        : "";

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "ROL_EDITADO",
        detalle: `${req.user!.nombre} editó el rol "${rol.nombre}".${detallePermisos}${detalleActivo}`,
        entidadTipo: "Rol",
        entidadId: id,
        datosAnteriores: JSON.stringify({
          nombre: rolExistente.nombre,
          descripcion: rolExistente.descripcion,
          activo: rolExistente.activo,
          ...(permisosAnteriores !== null ? { permisos: permisosAnteriores } : {}),
        }),
        datosNuevos: JSON.stringify({
          nombre: rol.nombre,
          descripcion: rol.descripcion,
          activo: rol.activo,
          ...(permisosSaneados !== null ? { permisos: permisosSaneados } : {}),
        }),
      },
    });

    return res.json(serializar(rol));
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
      where: { id, ...whereAlcance(tenantId) },
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
    if (rol.tenantId === null && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede eliminar roles de alcance general.",
      });
    }
    if (rol.tenantId === null) {
      const usadoEnOtroLado = await prisma.user.count({ where: { rolId: id } });
      const usadoEnMembresias = await prisma.membresia.count({ where: { rolId: id } });
      if (usadoEnOtroLado > 0 || usadoEnMembresias > 0) {
        return res.status(409).json({
          message: "No se puede eliminar: es un rol general y está en uso en otra empresa.",
        });
      }
    }

    await prisma.rol.delete({ where: { id } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "ROL_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el rol "${rol.nombre}"`,
        entidadTipo: "Rol",
        entidadId: id,
        datosAnteriores: JSON.stringify({
          nombre: rol.nombre,
          permisos: parseRolPermisos(rol.permisos),
        }),
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar rol:", error);
    return res.status(500).json({ message: "Error al eliminar el rol." });
  }
};
