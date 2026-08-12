import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

export const listarUsuarios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.pageSize ?? "20"), 10) || 20),
    );

    const where = {
      tenantId,
      ...(search
        ? {
            OR: [{ nombre: { contains: search } }, { email: { contains: search } }],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          rolId: true,
          activo: true,
          isSuperadmin: true,
          createdAt: true,
          lastLoginAt: true,
          rolRel: { select: { id: true, nombre: true } },
          departamentoId: true,
          departamento: { select: { id: true, nombre: true } },
        },
        orderBy: { nombre: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return res.json({ data, total, page, pageSize });
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    return res.status(500).json({ message: "Error al obtener usuarios." });
  }
};

export const cambiarEstadoUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    const tenantId = req.user!.tenantId;

    if (typeof activo !== "boolean") {
      return res
        .status(400)
        .json({ message: "El campo 'activo' es requerido y debe ser booleano." });
    }

    // Aislamiento multi-tenant: no permitir operar sobre usuarios de otra empresa (IDOR)
    const usuario = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    if (!activo && usuario.isSuperadmin) {
      const superadminsActivos = await prisma.user.count({
        where: { tenantId, isSuperadmin: true, activo: true },
      });
      if (superadminsActivos <= 1) {
        return res.status(409).json({
          message: "No se puede desactivar al último superadministrador del sistema.",
        });
      }
    }

    const actualizado = await prisma.user.update({
      where: { id },
      data: { activo },
      select: { id: true, nombre: true, email: true, activo: true },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: actualizado.email,
        accion: activo ? "USUARIO_ACTIVADO" : "USUARIO_DESACTIVADO",
        detalle: `${req.user!.nombre} ${activo ? "activó" : "desactivó"} la cuenta de ${actualizado.email}`,
      },
    });

    return res.json(actualizado);
  } catch (error) {
    console.error("Error al cambiar estado del usuario:", error);
    return res.status(500).json({ error: "Error al actualizar estado" });
  }
};

export const asignarRolUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rolId } = req.body;
    const tenantId = req.user!.tenantId;

    if (rolId !== null && typeof rolId !== "string") {
      return res
        .status(400)
        .json({ message: "El campo 'rolId' es requerido y debe ser un id de rol o null." });
    }

    // Aislamiento multi-tenant: no permitir operar sobre usuarios de otra empresa (IDOR)
    const usuario = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    if (usuario.isSuperadmin) {
      return res
        .status(409)
        .json({ message: "No se puede reasignar el rol de un superadministrador." });
    }

    if (rolId !== null) {
      const rol = await prisma.rol.findFirst({ where: { id: rolId, tenantId } });
      if (!rol) {
        return res.status(404).json({ message: "El rol seleccionado no existe." });
      }
    }

    const actualizado = await prisma.user.update({
      where: { id },
      data: { rolId },
      select: {
        id: true,
        nombre: true,
        email: true,
        rolId: true,
        rolRel: { select: { id: true, nombre: true } },
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: actualizado.email,
        accion: "USUARIO_ROL_CAMBIADO",
        detalle: `${req.user!.nombre} asignó el rol "${actualizado.rolRel?.nombre ?? "Sin rol"}" a ${actualizado.email}`,
      },
    });

    return res.json(actualizado);
  } catch (error) {
    console.error("Error al asignar rol al usuario:", error);
    return res.status(500).json({ message: "Error al asignar el rol." });
  }
};

export const asignarDepartamentoUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { departamentoId } = req.body;
    const tenantId = req.user!.tenantId;

    if (departamentoId !== null && typeof departamentoId !== "string") {
      return res.status(400).json({
        message: "El campo 'departamentoId' es requerido y debe ser un id de departamento o null.",
      });
    }

    // Aislamiento multi-tenant: no permitir operar sobre usuarios de otra empresa (IDOR)
    const usuario = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    if (departamentoId !== null) {
      const departamento = await prisma.departamento.findFirst({
        where: { id: departamentoId, tenantId },
      });
      if (!departamento) {
        return res.status(404).json({ message: "El departamento seleccionado no existe." });
      }
    }

    const actualizado = await prisma.user.update({
      where: { id },
      data: { departamentoId },
      select: {
        id: true,
        nombre: true,
        email: true,
        departamentoId: true,
        departamento: { select: { id: true, nombre: true } },
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: actualizado.email,
        accion: "USUARIO_DEPARTAMENTO_CAMBIADO",
        detalle: `${req.user!.nombre} asignó el departamento "${actualizado.departamento?.nombre ?? "Sin departamento"}" a ${actualizado.email}`,
      },
    });

    return res.json(actualizado);
  } catch (error) {
    console.error("Error al asignar departamento al usuario:", error);
    return res.status(500).json({ message: "Error al asignar el departamento." });
  }
};
