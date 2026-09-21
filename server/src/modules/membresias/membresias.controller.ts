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

/** Departamentos activos de UNA empresa específica (no la del que llama), para
 * elegir el departamento propio de una membresía (H1: antes solo se podía
 * elegir rol, y el departamento quedaba fijo al de la empresa hogar). */
export const listarDepartamentosDeTenant = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.params;
    const departamentos = await prisma.departamento.findMany({
      where: { ...whereAlcance(tenantId), activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    return res.json(departamentos);
  } catch (error) {
    console.error("Error al listar departamentos del tenant:", error);
    return res.status(500).json({ message: "Error al obtener los departamentos de esa empresa." });
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
        departamentoId: true,
        departamento: { select: { id: true, nombre: true } },
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
    const { tenantId, rolId, departamentoId, isSuperadmin } = req.body;

    // Nadie puede otorgarse una membresía a sí mismo, ni siquiera un
    // superadmin: el chequeo de abajo ("el objetivo debe ser nativo de tu
    // empresa actual") se cumple trivialmente cuando el objetivo eres tú
    // mismo, lo que permitía auto-concederse isSuperadmin en CUALQUIER otro
    // tenant del sistema sin que nadie más interviniera.
    if (userId === req.user!.id) {
      return res.status(409).json({ message: "No puedes otorgarte una membresía a ti mismo." });
    }

    const usuario = await prisma.user.findUnique({ where: { id: userId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    // Un superadmin solo puede otorgar acceso adicional a gente que es
    // nativamente de SU empresa actual. Sin este chequeo, cualquier
    // superadmin de cualquier tenant podría crear/editar membresías de un
    // usuario ajeno a su empresa hacia CUALQUIER otro tenant del sistema,
    // incluyendo isSuperadmin=true — una escalación de privilegios
    // cross-tenant completa.
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

    // H1: el departamento de la membresía es el de la persona EN ESA
    // empresa miembro, independiente de su departamento en la empresa hogar
    // — por eso se valida contra whereAlcance(tenantId) (la empresa a la que
    // se está dando acceso), no contra el tenant del que llama.
    let departamentoIdFinal: string | null = null;
    if (departamentoId) {
      const departamento = await prisma.departamento.findFirst({
        where: { id: departamentoId, ...whereAlcance(tenantId), activo: true },
      });
      if (!departamento) {
        return res.status(404).json({
          message: "El departamento seleccionado no existe o no pertenece a esa empresa.",
        });
      }
      departamentoIdFinal = departamento.id;
    }

    const membresia = await prisma.membresia.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      create: {
        userId,
        tenantId,
        rolId: rolIdFinal,
        departamentoId: departamentoIdFinal,
        isSuperadmin: !!isSuperadmin,
        activo: true,
      },
      update: {
        rolId: rolIdFinal,
        departamentoId: departamentoIdFinal,
        isSuperadmin: !!isSuperadmin,
        activo: true,
      },
      select: {
        id: true,
        activo: true,
        isSuperadmin: true,
        tenant: { select: { id: true, nombre: true } },
        rolRel: { select: { id: true, nombre: true } },
        departamentoId: true,
        departamento: { select: { id: true, nombre: true } },
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
    const { rolId, departamentoId, isSuperadmin, activo } = req.body;

    const membresia = await prisma.membresia.findUnique({
      where: { id },
      include: { user: { select: { email: true, tenantId: true } }, tenant: true },
    });
    if (!membresia) {
      return res.status(404).json({ message: "Membresía no encontrada." });
    }
    // Mismo motivo que en crearMembresia: nadie administra su propia
    // membresía, así ya la tuviera de antes (evita usar este endpoint para
    // auto-otorgarse isSuperadmin en una empresa a la que ya tenía acceso
    // regular).
    if (membresia.userId === req.user!.id) {
      return res.status(409).json({ message: "No puedes administrar tu propia membresía." });
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

    if (departamentoId !== undefined && departamentoId !== null) {
      const departamento = await prisma.departamento.findFirst({
        where: { id: departamentoId, ...whereAlcance(membresia.tenantId), activo: true },
      });
      if (!departamento) {
        return res.status(404).json({
          message: "El departamento seleccionado no existe o no pertenece a esa empresa.",
        });
      }
    }

    const actualizada = await prisma.membresia.update({
      where: { id },
      data: {
        ...(rolId !== undefined ? { rolId } : {}),
        ...(departamentoId !== undefined ? { departamentoId } : {}),
        ...(isSuperadmin !== undefined ? { isSuperadmin } : {}),
        ...(activo !== undefined ? { activo } : {}),
      },
      select: {
        id: true,
        activo: true,
        isSuperadmin: true,
        tenant: { select: { id: true, nombre: true } },
        rolRel: { select: { id: true, nombre: true } },
        departamentoId: true,
        departamento: { select: { id: true, nombre: true } },
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
