import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  TIPOS_DESTINATARIO_VALIDOS,
  validarFormaDestinatario,
  tieneDestinatariosDuplicados,
  type DestinatarioLogico,
} from "../../lib/motor-destinatarios";

/**
 * Administración de ReglaDestinatarios/ReglaDestinatario (Fase 5.3) — motor
 * genérico de "quién debe enterarse de un evento". Este módulo SOLO
 * administra la configuración; la resolución en sí vive en
 * lib/motor-destinatarios.ts y todavía no la dispara ningún evento real
 * (eso es Fase 5.4+).
 */

const INCLUDE_REGLA = { destinatarios: true };

async function nombresDestinatario(d: {
  tipo: string;
  usuarioId: string | null;
  perfilId: string | null;
  departamentoId: string | null;
  permisoClave: string | null;
}) {
  const [usuario, perfil, departamento] = await Promise.all([
    d.usuarioId
      ? prisma.user.findUnique({ where: { id: d.usuarioId }, select: { nombre: true } })
      : null,
    d.perfilId
      ? prisma.perfilFuncional.findUnique({ where: { id: d.perfilId }, select: { nombre: true } })
      : null,
    d.departamentoId
      ? prisma.departamento.findUnique({
          where: { id: d.departamentoId },
          select: { nombre: true },
        })
      : null,
  ]);
  return {
    usuarioNombre: usuario?.nombre ?? null,
    perfilNombre: perfil?.nombre ?? null,
    departamentoNombre: departamento?.nombre ?? null,
  };
}

async function serializarRegla(r: {
  id: string;
  evento: string;
  activa: boolean;
  createdAt: Date;
  destinatarios: {
    id: string;
    tipo: string;
    usuarioId: string | null;
    perfilId: string | null;
    departamentoId: string | null;
    permisoClave: string | null;
  }[];
}) {
  const destinatarios = await Promise.all(
    r.destinatarios.map(async (d) => ({ ...d, ...(await nombresDestinatario(d)) })),
  );
  return {
    id: r.id,
    evento: r.evento,
    activa: r.activa,
    createdAt: r.createdAt,
    destinatarios,
  };
}

/**
 * Valida que cada destinatario, además de tener la FORMA correcta
 * (validarFormaDestinatario), referencie un usuario/perfil/departamento que
 * de verdad exista y pertenezca a este tenant — nunca confía en el id que
 * mande el cliente (IDOR). Devuelve un mensaje de error o null.
 */
async function validarPertenenciaDestinatarios(
  tenantId: string,
  destinatarios: DestinatarioLogico[],
): Promise<string | null> {
  for (const d of destinatarios) {
    const error = validarFormaDestinatario(d);
    if (error) return error;

    if (d.tipo === "USUARIO") {
      const existe = await prisma.user.findFirst({ where: { id: d.usuarioId!, tenantId } });
      if (!existe) return "El usuario seleccionado no existe en esta empresa.";
    }
    if (d.tipo === "PERFIL") {
      const existe = await prisma.perfilFuncional.findFirst({
        where: { id: d.perfilId!, tenantId },
      });
      if (!existe) return "El perfil funcional seleccionado no existe en esta empresa.";
    }
    if (d.tipo === "AREA" || (d.tipo === "JEFE_AREA" && d.departamentoId)) {
      const existe = await prisma.departamento.findFirst({
        where: { id: d.departamentoId!, OR: [{ tenantId: null }, { tenantId }] },
      });
      if (!existe) return "El área seleccionada no existe.";
    }
  }
  if (tieneDestinatariosDuplicados(destinatarios)) {
    return "Hay destinatarios repetidos en la misma regla (mismo tipo y mismo valor).";
  }
  return null;
}

export const listarReglasDestinatarios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { evento } = req.query;
    const reglas = await req.tenantPrisma!.reglaDestinatarios.findMany({
      where: { tenantId, ...(typeof evento === "string" && evento ? { evento } : {}) },
      include: INCLUDE_REGLA,
      orderBy: { createdAt: "desc" },
    });
    return res.json(await Promise.all(reglas.map(serializarRegla)));
  } catch (error) {
    console.error("Error al listar reglas de destinatarios:", error);
    return res.status(500).json({ message: "Error al obtener las reglas de destinatarios." });
  }
};

export const obtenerReglaDestinatarios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const regla = await req.tenantPrisma!.reglaDestinatarios.findFirst({
      where: { id, tenantId },
      include: INCLUDE_REGLA,
    });
    if (!regla) return res.status(404).json({ message: "Regla no encontrada." });
    return res.json(await serializarRegla(regla));
  } catch (error) {
    console.error("Error al obtener regla de destinatarios:", error);
    return res.status(500).json({ message: "Error al obtener la regla." });
  }
};

export const crearReglaDestinatarios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { evento, activa, destinatarios } = req.body;

    if (!evento || typeof evento !== "string" || !evento.trim()) {
      return res.status(400).json({ message: "El evento es obligatorio." });
    }
    if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
      return res.status(400).json({ message: "La regla debe tener al menos un destinatario." });
    }

    const errorForma = await validarPertenenciaDestinatarios(tenantId, destinatarios);
    if (errorForma) return res.status(400).json({ message: errorForma });

    const regla = await req.tenantPrisma!.$transaction(async (tx) => {
      const creada = await tx.reglaDestinatarios.create({
        data: {
          tenantId,
          evento: evento.trim(),
          activa: activa === undefined ? true : Boolean(activa),
          destinatarios: {
            create: destinatarios.map((d: DestinatarioLogico) => ({
              tipo: d.tipo,
              usuarioId: d.usuarioId || null,
              perfilId: d.perfilId || null,
              departamentoId: d.departamentoId || null,
              permisoClave: d.permisoClave || null,
            })),
          },
        },
        include: INCLUDE_REGLA,
      });
      return creada;
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REGLA_DESTINATARIOS_CREADA",
        entidadTipo: "ReglaDestinatarios",
        entidadId: regla.id,
        detalle: `${req.user!.nombre} creó una regla de destinatarios para el evento "${regla.evento}" (${regla.destinatarios.length} destinatario(s))`,
      },
    });

    return res.status(201).json(await serializarRegla(regla));
  } catch (error) {
    console.error("Error al crear regla de destinatarios:", error);
    return res.status(500).json({ message: "Error al crear la regla de destinatarios." });
  }
};

export const actualizarReglaDestinatarios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { evento, activa } = req.body;

    const existente = await req.tenantPrisma!.reglaDestinatarios.findFirst({
      where: { id, tenantId },
    });
    if (!existente) return res.status(404).json({ message: "Regla no encontrada." });

    const regla = await req.tenantPrisma!.reglaDestinatarios.update({
      where: { id },
      data: {
        ...(typeof evento === "string" && evento.trim() ? { evento: evento.trim() } : {}),
        ...(typeof activa === "boolean" ? { activa } : {}),
      },
      include: INCLUDE_REGLA,
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REGLA_DESTINATARIOS_EDITADA",
        entidadTipo: "ReglaDestinatarios",
        entidadId: regla.id,
        detalle: `${req.user!.nombre} editó la regla de destinatarios del evento "${regla.evento}"`,
      },
    });

    return res.json(await serializarRegla(regla));
  } catch (error) {
    console.error("Error al actualizar regla de destinatarios:", error);
    return res.status(500).json({ message: "Error al actualizar la regla." });
  }
};

export const eliminarReglaDestinatarios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const regla = await req.tenantPrisma!.reglaDestinatarios.findFirst({ where: { id, tenantId } });
    if (!regla) return res.status(404).json({ message: "Regla no encontrada." });

    // Hard delete: nada referencia una ReglaDestinatarios por FK (a
    // diferencia de Departamento/PerfilFuncional, que sí tienen usuarios
    // colgando) — sus ReglaDestinatario hijos se borran en cascada.
    await req.tenantPrisma!.reglaDestinatarios.delete({ where: { id } });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REGLA_DESTINATARIOS_ELIMINADA",
        entidadTipo: "ReglaDestinatarios",
        entidadId: id,
        detalle: `${req.user!.nombre} eliminó la regla de destinatarios del evento "${regla.evento}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar regla de destinatarios:", error);
    return res.status(500).json({ message: "Error al eliminar la regla." });
  }
};

export const agregarDestinatario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const nuevo: DestinatarioLogico = {
      tipo: req.body.tipo,
      usuarioId: req.body.usuarioId || null,
      perfilId: req.body.perfilId || null,
      departamentoId: req.body.departamentoId || null,
      permisoClave: req.body.permisoClave || null,
    };

    const regla = await req.tenantPrisma!.reglaDestinatarios.findFirst({
      where: { id, tenantId },
      include: INCLUDE_REGLA,
    });
    if (!regla) return res.status(404).json({ message: "Regla no encontrada." });

    const errorPertenencia = await validarPertenenciaDestinatarios(tenantId, [
      ...(regla.destinatarios as DestinatarioLogico[]),
      nuevo,
    ]);
    if (errorPertenencia) return res.status(400).json({ message: errorPertenencia });

    await req.tenantPrisma!.reglaDestinatario.create({
      data: {
        reglaId: id,
        tipo: nuevo.tipo,
        usuarioId: nuevo.usuarioId,
        perfilId: nuevo.perfilId,
        departamentoId: nuevo.departamentoId,
        permisoClave: nuevo.permisoClave,
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REGLA_DESTINATARIOS_DESTINATARIO_AGREGADO",
        entidadTipo: "ReglaDestinatarios",
        entidadId: id,
        detalle: `${req.user!.nombre} agregó un destinatario (${nuevo.tipo}) a la regla del evento "${regla.evento}"`,
      },
    });

    const actualizada = await req.tenantPrisma!.reglaDestinatarios.findFirst({
      where: { id },
      include: INCLUDE_REGLA,
    });
    return res.status(201).json(await serializarRegla(actualizada!));
  } catch (error) {
    console.error("Error al agregar destinatario:", error);
    return res.status(500).json({ message: "Error al agregar el destinatario." });
  }
};

export const quitarDestinatario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, destinatarioId } = req.params;

    const regla = await req.tenantPrisma!.reglaDestinatarios.findFirst({
      where: { id, tenantId },
    });
    if (!regla) return res.status(404).json({ message: "Regla no encontrada." });

    const destinatario = await req.tenantPrisma!.reglaDestinatario.findFirst({
      where: { id: destinatarioId, reglaId: id },
    });
    if (!destinatario) return res.status(404).json({ message: "Destinatario no encontrado." });

    const totalDestinatarios = await req.tenantPrisma!.reglaDestinatario.count({
      where: { reglaId: id },
    });
    if (totalDestinatarios <= 1) {
      return res.status(409).json({
        message: "No se puede quitar: una regla debe conservar al menos un destinatario.",
      });
    }

    await req.tenantPrisma!.reglaDestinatario.delete({ where: { id: destinatarioId } });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REGLA_DESTINATARIOS_DESTINATARIO_QUITADO",
        entidadTipo: "ReglaDestinatarios",
        entidadId: id,
        detalle: `${req.user!.nombre} quitó un destinatario (${destinatario.tipo}) de la regla "${regla.evento}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al quitar destinatario:", error);
    return res.status(500).json({ message: "Error al quitar el destinatario." });
  }
};

export const listarTiposDestinatario = async (_req: AuthenticatedRequest, res: Response) => {
  return res.json(TIPOS_DESTINATARIO_VALIDOS);
};
