import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { whereAlcance } from "../../lib/alcance";

/**
 * Todas las empresas del sistema, para el selector de "dar acceso a otra
 * empresa". Solo superadmin: expone nombres/subdominios de TODOS los
 * tenants, algo que un admin normal (limitado a su propio tenant) no ve.
 */
export const listarTenants = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, nombre: true, subdomain: true },
      orderBy: { nombre: "asc" },
    });
    return res.json(tenants);
  } catch (error) {
    console.error("Error al listar tenants:", error);
    return res.status(500).json({ message: "Error al obtener las empresas." });
  }
};

/** Roles activos de UNA empresa específica (no la del que llama), para elegir el rol de una membresía. */
export const listarRolesDeTenant = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.params;
    const roles = await prisma.rol.findMany({
      where: { ...whereAlcance(tenantId), activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    return res.json(roles);
  } catch (error) {
    console.error("Error al listar roles del tenant:", error);
    return res.status(500).json({ message: "Error al obtener los roles de esa empresa." });
  }
};

/** Membresías (acceso a empresas adicionales) de un usuario, más su tenant "hogar". */
export const listarMembresiasUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nombre: true,
        email: true,
        tenantId: true,
        tenant: { select: { id: true, nombre: true } },
      },
    });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    // Un superadmin solo puede ver el detalle de membresías de gente que es
    // nativamente de SU empresa actual — no de cualquier usuario del
    // sistema por id (evita que un superadmin de Ricol curiosee a quién
    // tiene acceso un empleado de Flexipack que no conoce).
    if (usuario.tenantId !== req.user!.tenantId) {
      return res
        .status(403)
        .json({ message: "Solo puedes ver las membresías de usuarios de tu propia empresa." });
    }

    const membresias = await prisma.membresia.findMany({
      where: { userId },
      select: {
        id: true,
        activo: true,
        isSuperadmin: true,
        tenant: { select: { id: true, nombre: true } },
        rolRel: { select: { id: true, nombre: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return res.json({ usuario, tenantHogar: usuario.tenant, membresias });
  } catch (error) {
    console.error("Error al listar membresías del usuario:", error);
    return res.status(500).json({ message: "Error al obtener las membresías." });
  }
};

/** Da (o actualiza) acceso de un usuario a una empresa adicional a la suya. */
export const crearMembresia = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    // Forma del body ya validada por validarBody(crearMembresiaSchema).
    const { tenantId, rolId, isSuperadmin } = req.body;

    const usuario = await prisma.user.findUnique({ where: { id: userId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    // Un superadmin solo puede otorgar acceso adicional a gente que es
    // nativamente de SU empresa actual. Sin este chequeo, cualquier
    // superadmin de cualquier tenant podría crear/editar membresías de un
    // usuario ajeno a su empresa (incluyéndose a sí mismo) hacia CUALQUIER
    // otro tenant del sistema, incluyendo isSuperadmin=true — una escalación
    // de privilegios cross-tenant completa.
    if (usuario.tenantId !== req.user!.tenantId) {
      return res
        .status(403)
        .json({ message: "Solo puedes otorgar acceso a usuarios de tu propia empresa." });
    }

    if (usuario.tenantId === tenantId) {
      return res.status(409).json({
        message: "Esa es la empresa hogar del usuario, no necesita una membresía adicional.",
      });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(404).json({ message: "La empresa seleccionada no existe." });
    }
    if (!tenant.activo) {
      return res.status(409).json({ message: "No se puede dar acceso a una empresa desactivada." });
    }

    let rolIdFinal: string | null = null;
    if (rolId) {
      const rol = await prisma.rol.findFirst({
        where: { id: rolId, ...whereAlcance(tenantId), activo: true },
      });
      if (!rol) {
        return res
          .status(404)
          .json({ message: "El rol seleccionado no existe o no pertenece a esa empresa." });
      }
      rolIdFinal = rol.id;
    }

    const membresia = await prisma.membresia.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      create: { userId, tenantId, rolId: rolIdFinal, isSuperadmin: !!isSuperadmin, activo: true },
      update: { rolId: rolIdFinal, isSuperadmin: !!isSuperadmin, activo: true },
      select: {
        id: true,
        activo: true,
        isSuperadmin: true,
        tenant: { select: { id: true, nombre: true } },
        rolRel: { select: { id: true, nombre: true } },
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: usuario.email,
        accion: "MEMBRESIA_OTORGADA",
        detalle: `${req.user!.nombre} le dio a ${usuario.email} acceso a ${tenant.nombre}${
          isSuperadmin
            ? " (superadmin)"
            : membresia.rolRel
              ? ` con el rol "${membresia.rolRel.nombre}"`
              : ""
        }.`,
        entidadTipo: "Membresia",
        entidadId: membresia.id,
      },
    });

    return res.status(201).json(membresia);
  } catch (error) {
    console.error("Error al crear la membresía:", error);
    return res.status(500).json({ message: "Error al otorgar el acceso a la empresa." });
  }
};

/** Activa/desactiva o cambia el rol de una membresía existente. */
export const actualizarMembresia = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Forma del body ya validada por validarBody(actualizarMembresiaSchema).
    const { rolId, isSuperadmin, activo } = req.body;

    const membresia = await prisma.membresia.findUnique({
      where: { id },
      include: { user: { select: { email: true, tenantId: true } }, tenant: true },
    });
    if (!membresia) {
      return res.status(404).json({ message: "Membresía no encontrada." });
    }
    // Mismo límite que en crearMembresia: solo se administran membresías de
    // usuarios nativos de la empresa actual del superadmin que llama.
    if (membresia.user.tenantId !== req.user!.tenantId) {
      return res
        .status(403)
        .json({ message: "Solo puedes administrar el acceso de usuarios de tu propia empresa." });
    }

    if (rolId !== undefined && rolId !== null) {
      const rol = await prisma.rol.findFirst({
        where: { id: rolId, ...whereAlcance(membresia.tenantId), activo: true },
      });
      if (!rol) {
        return res
          .status(404)
          .json({ message: "El rol seleccionado no existe o no pertenece a esa empresa." });
      }
    }

    const actualizada = await prisma.membresia.update({
      where: { id },
      data: {
        ...(rolId !== undefined ? { rolId } : {}),
        ...(isSuperadmin !== undefined ? { isSuperadmin } : {}),
        ...(activo !== undefined ? { activo } : {}),
      },
      select: {
        id: true,
        activo: true,
        isSuperadmin: true,
        tenant: { select: { id: true, nombre: true } },
        rolRel: { select: { id: true, nombre: true } },
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId: membresia.tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: membresia.user.email,
        accion: "MEMBRESIA_ACTUALIZADA",
        detalle: `${req.user!.nombre} actualizó el acceso de ${membresia.user.email} a ${membresia.tenant.nombre}.`,
        entidadTipo: "Membresia",
        entidadId: id,
      },
    });

    return res.json(actualizada);
  } catch (error) {
    console.error("Error al actualizar la membresía:", error);
    return res.status(500).json({ message: "Error al actualizar el acceso a la empresa." });
  }
};

/** Quita el acceso de un usuario a esa empresa adicional. */
export const eliminarMembresia = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const membresia = await prisma.membresia.findUnique({
      where: { id },
      include: { user: { select: { email: true, tenantId: true } }, tenant: true },
    });
    if (!membresia) {
      return res.status(404).json({ message: "Membresía no encontrada." });
    }
    if (membresia.user.tenantId !== req.user!.tenantId) {
      return res
        .status(403)
        .json({ message: "Solo puedes administrar el acceso de usuarios de tu propia empresa." });
    }

    await prisma.membresia.delete({ where: { id } });

    await prisma.auditoria.create({
      data: {
        tenantId: membresia.tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: membresia.user.email,
        accion: "MEMBRESIA_ELIMINADA",
        detalle: `${req.user!.nombre} le quitó a ${membresia.user.email} el acceso a ${membresia.tenant.nombre}.`,
        entidadTipo: "Membresia",
        entidadId: id,
      },
    });

    return res.json({ message: "Acceso eliminado correctamente." });
  } catch (error) {
    console.error("Error al eliminar la membresía:", error);
    return res.status(500).json({ message: "Error al eliminar el acceso a la empresa." });
  }
};
