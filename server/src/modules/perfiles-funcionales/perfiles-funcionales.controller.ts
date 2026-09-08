import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

/**
 * Perfiles funcionales (Fase 5.2): agrupan usuarios dentro de un
 * Departamento ("Tesorería", "Jefe de Contabilidad") para uso futuro del
 * motor de destinatarios (Fase 5.3) — NO son roles de seguridad, no
 * otorgan ningún permiso. Ver auditoría de Fase 5.1 para el razonamiento
 * completo de por qué se modelan separados de Rol/Departamento.
 *
 * Sin alcance GENERAL todavía (a diferencia de Departamento/Rol/Modulo):
 * un PerfilFuncional siempre pertenece al tenant actual, así que este
 * módulo vive en req.tenantPrisma (auto-scoped), no en el patrón
 * whereAlcance() manual.
 */

function serializarPerfil(p: {
  id: string;
  departamentoId: string;
  nombre: string;
  esJefeDeArea: boolean;
  activo: boolean;
  createdAt: Date;
  departamento?: { nombre: string } | null;
  usuarios?: { user: { id: string; nombre: string; email: string } }[];
  _count?: { usuarios: number };
}) {
  return {
    id: p.id,
    departamentoId: p.departamentoId,
    departamentoNombre: p.departamento?.nombre ?? null,
    nombre: p.nombre,
    esJefeDeArea: p.esJefeDeArea,
    activo: p.activo,
    createdAt: p.createdAt,
    usuarios: (p.usuarios ?? []).map((u) => u.user),
    usuariosCount: p._count?.usuarios ?? p.usuarios?.length ?? 0,
  };
}

const INCLUDE_PERFIL = {
  departamento: { select: { nombre: true } },
  usuarios: {
    select: { user: { select: { id: true, nombre: true, email: true } } },
    orderBy: { user: { nombre: "asc" as const } },
  },
};

export const listarPerfilesFuncionales = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { departamentoId } = req.query;
    const where: Prisma.PerfilFuncionalWhereInput = { tenantId };
    if (typeof departamentoId === "string" && departamentoId) where.departamentoId = departamentoId;

    const perfiles = await req.tenantPrisma!.perfilFuncional.findMany({
      where,
      include: INCLUDE_PERFIL,
      orderBy: [{ departamento: { nombre: "asc" } }, { nombre: "asc" }],
    });

    return res.json(perfiles.map(serializarPerfil));
  } catch (error) {
    console.error("Error al listar perfiles funcionales:", error);
    return res.status(500).json({ message: "Error al obtener los perfiles funcionales." });
  }
};

export const crearPerfilFuncional = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { departamentoId, nombre, esJefeDeArea } = req.body;

    if (!departamentoId || typeof departamentoId !== "string") {
      return res.status(400).json({ message: "El área (departamento) es obligatoria." });
    }
    if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
      return res.status(400).json({ message: "El nombre del perfil es obligatorio." });
    }

    // El departamento puede ser GENERAL (tenantId null) o propio de este
    // tenant — nunca uno exclusivo de otro tenant. Mismo criterio que ya
    // usan los selects de "Área" en Facturas/Servicios/SolicitudCompra.
    const departamento = await prisma.departamento.findFirst({
      where: { id: departamentoId, OR: [{ tenantId: null }, { tenantId }] },
    });
    if (!departamento) {
      return res.status(404).json({ message: "El área seleccionada no existe." });
    }

    const perfil = await req.tenantPrisma!.perfilFuncional.create({
      data: {
        tenantId,
        departamentoId,
        nombre: nombre.trim(),
        esJefeDeArea: Boolean(esJefeDeArea),
      },
      include: INCLUDE_PERFIL,
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PERFIL_FUNCIONAL_CREADO",
        entidadTipo: "PerfilFuncional",
        entidadId: perfil.id,
        detalle: `${req.user!.nombre} creó el perfil "${perfil.nombre}" en el área "${departamento.nombre}"`,
      },
    });

    return res.status(201).json(serializarPerfil(perfil));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res
        .status(409)
        .json({ message: "Ya existe un perfil con ese nombre en la misma área." });
    }
    console.error("Error al crear perfil funcional:", error);
    return res.status(500).json({ message: "Error al crear el perfil funcional." });
  }
};

export const actualizarPerfilFuncional = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { nombre, esJefeDeArea, activo } = req.body;

    const existente = await req.tenantPrisma!.perfilFuncional.findFirst({
      where: { id, tenantId },
    });
    if (!existente) return res.status(404).json({ message: "Perfil funcional no encontrado." });

    const perfil = await req.tenantPrisma!.perfilFuncional.update({
      where: { id },
      data: {
        ...(typeof nombre === "string" && nombre.trim() ? { nombre: nombre.trim() } : {}),
        ...(typeof esJefeDeArea === "boolean" ? { esJefeDeArea } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
      },
      include: INCLUDE_PERFIL,
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PERFIL_FUNCIONAL_EDITADO",
        entidadTipo: "PerfilFuncional",
        entidadId: perfil.id,
        detalle: `${req.user!.nombre} editó el perfil "${perfil.nombre}"`,
      },
    });

    return res.json(serializarPerfil(perfil));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res
        .status(409)
        .json({ message: "Ya existe un perfil con ese nombre en la misma área." });
    }
    console.error("Error al actualizar perfil funcional:", error);
    return res.status(500).json({ message: "Error al actualizar el perfil funcional." });
  }
};

export const eliminarPerfilFuncional = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const perfil = await req.tenantPrisma!.perfilFuncional.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { usuarios: true } } },
    });
    if (!perfil) return res.status(404).json({ message: "Perfil funcional no encontrado." });
    if (perfil._count.usuarios > 0) {
      return res.status(409).json({
        message: `No se puede eliminar: hay ${perfil._count.usuarios} usuario(s) asignados a este perfil.`,
      });
    }

    await req.tenantPrisma!.perfilFuncional.delete({ where: { id } });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PERFIL_FUNCIONAL_ELIMINADO",
        entidadTipo: "PerfilFuncional",
        entidadId: id,
        detalle: `${req.user!.nombre} eliminó el perfil "${perfil.nombre}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar perfil funcional:", error);
    return res.status(500).json({ message: "Error al eliminar el perfil funcional." });
  }
};

export const agregarUsuarioAPerfil = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ message: "Debes indicar el usuario a asignar." });
    }

    const perfil = await req.tenantPrisma!.perfilFuncional.findFirst({
      where: { id, tenantId },
    });
    if (!perfil) return res.status(404).json({ message: "Perfil funcional no encontrado." });

    // El usuario debe ser del mismo tenant — nunca se asigna un usuario de
    // otra empresa (IDOR), igual que el resto de selects de "responsable".
    const usuario = await prisma.user.findFirst({
      where: { id: userId, tenantId, activo: true },
    });
    if (!usuario) {
      return res
        .status(404)
        .json({ message: "El usuario seleccionado no existe o está inactivo." });
    }

    const existente = await req.tenantPrisma!.usuarioPerfilFuncional.findFirst({
      where: { userId, perfilId: id },
    });
    if (existente) {
      return res.status(409).json({ message: "El usuario ya está asignado a este perfil." });
    }

    await req.tenantPrisma!.usuarioPerfilFuncional.create({
      data: { tenantId, userId, perfilId: id },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: usuario.nombre,
        accion: "PERFIL_FUNCIONAL_USUARIO_AGREGADO",
        entidadTipo: "PerfilFuncional",
        entidadId: id,
        detalle: `${req.user!.nombre} agregó a ${usuario.nombre} al perfil "${perfil.nombre}"`,
      },
    });

    const actualizado = await req.tenantPrisma!.perfilFuncional.findFirst({
      where: { id },
      include: INCLUDE_PERFIL,
    });
    return res.status(201).json(serializarPerfil(actualizado!));
  } catch (error) {
    console.error("Error al asignar usuario al perfil funcional:", error);
    return res.status(500).json({ message: "Error al asignar el usuario al perfil." });
  }
};

export const quitarUsuarioDePerfil = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, userId } = req.params;

    const perfil = await req.tenantPrisma!.perfilFuncional.findFirst({
      where: { id, tenantId },
    });
    if (!perfil) return res.status(404).json({ message: "Perfil funcional no encontrado." });

    const asignacion = await req.tenantPrisma!.usuarioPerfilFuncional.findFirst({
      where: { userId, perfilId: id },
    });
    if (!asignacion) {
      return res.status(404).json({ message: "El usuario no está asignado a este perfil." });
    }

    await req.tenantPrisma!.usuarioPerfilFuncional.delete({ where: { id: asignacion.id } });

    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: { nombre: true },
    });
    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: usuario?.nombre ?? null,
        accion: "PERFIL_FUNCIONAL_USUARIO_QUITADO",
        entidadTipo: "PerfilFuncional",
        entidadId: id,
        detalle: `${req.user!.nombre} quitó a ${usuario?.nombre ?? userId} del perfil "${perfil.nombre}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al quitar usuario del perfil funcional:", error);
    return res.status(500).json({ message: "Error al quitar el usuario del perfil." });
  }
};
