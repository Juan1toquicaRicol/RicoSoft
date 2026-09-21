import { Response } from "express";
import { OportunidadSeguimiento } from "@prisma/client";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  clienteParamsSchema,
  crearSeguimientoSchema,
  RESULTADOS_TERMINALES,
} from "./oportunidades.schemas";

function serializar(s: OportunidadSeguimiento) {
  return {
    id: s.id,
    clienteRowId: s.clienteRowId,
    clienteNombre: s.clienteNombre,
    itemRowId: s.itemRowId,
    itemDescripcion: s.itemDescripcion,
    accion: s.accion,
    resultado: s.resultado,
    comentario: s.comentario,
    proximaAccion: s.proximaAccion,
    proximoSeguimientoFecha: s.proximoSeguimientoFecha,
    // Compromiso = proximaAccion + proximoSeguimientoFecha de ESTE evento.
    // compromisoCompletadoEn es SIEMPRE distinto de createdAt (ver schema.prisma).
    compromisoCompletado: s.compromisoCompletado,
    compromisoCompletadoEn: s.compromisoCompletadoEn,
    compromisoCompletadoPor: s.compromisoCompletadoPor,
    usuario: s.usuario,
    createdAt: s.createdAt,
  };
}

/**
 * Timeline de seguimiento comercial de UN cliente (todas sus oportunidades,
 * no solo una) — fecha -> usuario -> acción -> resultado -> comentario. El
 * "estado actual" de la oportunidad es el resultado de la fila más
 * reciente (seguimientos[0], ya viene ordenado desc) — no se guarda
 * duplicado en ningún otro lado.
 */
export const listarSeguimientosCliente = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parseo = clienteParamsSchema.safeParse(req.params);
    if (!parseo.success) {
      return res
        .status(400)
        .json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
    }

    const seguimientos = await req.tenantPrisma!.oportunidadSeguimiento.findMany({
      where: { clienteRowId: parseo.data.clienteRowId },
      orderBy: { createdAt: "desc" },
    });

    // El próximo seguimiento vigente es el de la fila MÁS RECIENTE (no
    // cualquier fila con fecha) — un evento nuevo redefine el siguiente
    // paso, las fechas de eventos anteriores quedan solo como historial.
    const masReciente = seguimientos[0];
    const proximoVigente =
      masReciente &&
      masReciente.proximoSeguimientoFecha &&
      !RESULTADOS_TERMINALES.has(masReciente.resultado) &&
      !masReciente.compromisoCompletado
        ? { fecha: masReciente.proximoSeguimientoFecha, accion: masReciente.proximaAccion }
        : null;

    return res.json({
      seguimientos: seguimientos.map(serializar),
      estadoActual: masReciente ? masReciente.resultado : null,
      proximoSeguimiento: proximoVigente,
    });
  } catch (error) {
    console.error("Error al listar seguimientos de la oportunidad:", error);
    return res.status(500).json({ message: "Error al obtener el seguimiento comercial." });
  }
};

/**
 * Registra un evento de seguimiento comercial (llamada, WhatsApp, cotización
 * enviada, etc.) sobre un cliente/oportunidad — capa ligera de gestión de
 * contacto, NO un CRM: un solo modelo, sin pipeline, sin asignación
 * compleja. Si el resultado no es terminal, el schema ya exige próxima
 * acción + fecha (una oportunidad activa sin siguiente paso no es
 * accionable, ver comentario del modelo en schema.prisma).
 */
export const crearSeguimiento = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const parseoParams = clienteParamsSchema.safeParse(req.params);
    if (!parseoParams.success) {
      return res
        .status(400)
        .json({ message: parseoParams.error.errors[0]?.message ?? "Datos inválidos." });
    }
    const parseoBody = crearSeguimientoSchema.safeParse(req.body);
    if (!parseoBody.success) {
      return res
        .status(400)
        .json({ message: parseoBody.error.errors[0]?.message ?? "Datos inválidos." });
    }
    const data = parseoBody.data;

    const creado = await req.tenantPrisma!.oportunidadSeguimiento.create({
      data: {
        tenantId,
        clienteRowId: parseoParams.data.clienteRowId,
        clienteNombre: data.clienteNombre,
        itemRowId: data.itemRowId ?? null,
        itemDescripcion: data.itemDescripcion ?? null,
        accion: data.accion,
        resultado: data.resultado,
        comentario: data.comentario || null,
        proximaAccion: RESULTADOS_TERMINALES.has(data.resultado)
          ? null
          : data.proximaAccion || null,
        proximoSeguimientoFecha: RESULTADOS_TERMINALES.has(data.resultado)
          ? null
          : (data.proximoSeguimientoFecha ?? null),
        usuarioId: req.user!.id,
        usuario: req.user!.nombre,
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "OPORTUNIDAD_SEGUIMIENTO_REGISTRADO",
        detalle: `${req.user!.nombre} registró "${data.accion}" (${data.resultado}) para el cliente "${data.clienteNombre}".`,
      },
    });

    return res.status(201).json(serializar(creado));
  } catch (error) {
    console.error("Error al registrar el seguimiento comercial:", error);
    return res.status(500).json({ message: "Error al registrar el seguimiento comercial." });
  }
};

/**
 * "¿Qué debo hacer hoy?" — próximos seguimientos pendientes de TODO el
 * tenant, no solo de un cliente, ordenados por fecha. Solo se muestra la
 * fila más reciente por cliente (la que define el próximo paso vigente),
 * no el timeline completo — para eso está listarSeguimientosCliente.
 */
export const listarProximosSeguimientos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Última fila por cliente, vía distinct en createdAt desc — Prisma no
    // tiene "distinct on" con orderBy directo entre relaciones, así que se
    // trae ordenado y se reduce a la primera aparición por cliente en Node
    // (el volumen esperado es bajo: 1 fila por interacción registrada a
    // mano, no un flujo transaccional masivo).
    const todos = await req.tenantPrisma!.oportunidadSeguimiento.findMany({
      orderBy: { createdAt: "desc" },
    });

    const vistos = new Set<number>();
    const ultimosPorCliente = todos.filter((s) => {
      if (vistos.has(s.clienteRowId)) return false;
      vistos.add(s.clienteRowId);
      return true;
    });

    const pendientes = ultimosPorCliente
      .filter(
        (s) =>
          s.proximoSeguimientoFecha &&
          !RESULTADOS_TERMINALES.has(s.resultado) &&
          !s.compromisoCompletado,
      )
      .sort(
        (a, b) =>
          new Date(a.proximoSeguimientoFecha!).getTime() -
          new Date(b.proximoSeguimientoFecha!).getTime(),
      )
      .map(serializar);

    return res.json({ pendientes });
  } catch (error) {
    console.error("Error al listar los próximos seguimientos:", error);
    return res.status(500).json({ message: "Error al obtener los próximos seguimientos." });
  }
};

/**
 * Marca como completado el compromiso (próxima acción + fecha) de UN
 * seguimiento — compromisoCompletadoEn es la fecha real de ejecución,
 * SIEMPRE distinta de createdAt (cuándo se registró el evento originalmente).
 * Scoped por tenant vía tenantPrisma: un id de otro tenant simplemente no
 * hace match y devuelve 404, nunca revela si existe en otro tenant.
 */
export const completarCompromiso = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const seguimiento = await req.tenantPrisma!.oportunidadSeguimiento.findFirst({
      where: { id },
    });
    if (!seguimiento) {
      return res.status(404).json({ message: "Seguimiento no encontrado." });
    }
    if (seguimiento.compromisoCompletado) {
      return res.status(409).json({ message: "Ese compromiso ya estaba marcado como completado." });
    }
    if (!seguimiento.proximaAccion || !seguimiento.proximoSeguimientoFecha) {
      return res.status(409).json({ message: "Este seguimiento no tiene un compromiso pendiente." });
    }

    const actualizado = await req.tenantPrisma!.oportunidadSeguimiento.update({
      where: { id },
      data: {
        compromisoCompletado: true,
        compromisoCompletadoEn: new Date(),
        compromisoCompletadoPorId: req.user!.id,
        compromisoCompletadoPor: req.user!.nombre,
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "COMPROMISO_COMPLETADO",
        detalle: `${req.user!.nombre} marcó como completado el compromiso "${seguimiento.proximaAccion}" del cliente "${seguimiento.clienteNombre}".`,
      },
    });

    return res.json(serializar(actualizado));
  } catch (error) {
    console.error("Error al completar el compromiso:", error);
    return res.status(500).json({ message: "Error al completar el compromiso." });
  }
};
