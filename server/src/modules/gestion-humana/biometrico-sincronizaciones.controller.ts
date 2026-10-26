import { Response } from "express";
import { Prisma, SincronizacionBiometricoLog } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  sincronizarFuenteBiometrica,
  SincronizacionEnCursoError,
  FuenteBiometricaNoEncontradaError,
} from "./biometrico-import.service";
import { leerConfigSchedulerCrossChex } from "../../jobs/crosschex-sync.job";

/**
 * Historial de sincronizaciones (solo lectura) + disparo manual. El disparo
 * manual reutiliza EXACTAMENTE `sincronizarFuenteBiometrica` (Fase 4/5) — no
 * existe una segunda implementación de la lógica de sync. El lock, el
 * cursor y el tamaño de lote configurado (mismo que usa el scheduler, vía
 * leerConfigSchedulerCrossChex) se respetan sin excepción.
 */

type LogConFuente = SincronizacionBiometricoLog & { fuente: { id: string; nombre: string } };

function serializarLog(log: LogConFuente) {
  const duracionMs = log.finalizadoEn
    ? log.finalizadoEn.getTime() - log.iniciadoEn.getTime()
    : null;
  return {
    id: log.id,
    fuente: { id: log.fuente.id, nombre: log.fuente.nombre },
    estado: log.estado,
    iniciadoEn: log.iniciadoEn,
    finalizadoEn: log.finalizadoEn,
    duracionMs,
    logIdDesde: log.logIdDesde,
    logIdHasta: log.logIdHasta,
    leidos: log.leidos,
    insertados: log.insertados,
    duplicados: log.duplicados,
    sinEmpleado: log.sinEmpleado,
    erroresCount: log.erroresCount,
    mensajeError: log.mensajeError,
  };
}

const INCLUDE_FUENTE = { fuente: { select: { id: true, nombre: true } } };

function leerPaginacion(query: AuthenticatedRequest["query"]) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit };
}

function parsearFecha(valor: unknown): Date | undefined {
  if (typeof valor !== "string" || !valor) return undefined;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

const ESTADOS_VALIDOS = ["EN_CURSO", "COMPLETADO", "FALLIDO"];

/** Historial paginado del tenant actual. Nunca se expone tenantId
 * explícitamente en la respuesta: ya es implícito (solo se listan las del
 * tenant autenticado), y jamás se permite modificar/eliminar desde aquí. */
export async function listarSincronizacionesBiometricas(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { fuenteId, estado, fechaDesde, fechaHasta } = req.query;
    const { page, limit } = leerPaginacion(req.query);

    const where: Prisma.SincronizacionBiometricoLogWhereInput = { tenantId };

    if (typeof fuenteId === "string" && fuenteId) where.fuenteId = fuenteId;

    if (estado !== undefined) {
      if (typeof estado !== "string" || !ESTADOS_VALIDOS.includes(estado)) {
        return res
          .status(400)
          .json({ message: `estado debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}.` });
      }
      where.estado = estado;
    }

    const desde = parsearFecha(fechaDesde);
    const hasta = parsearFecha(fechaHasta);
    if (fechaDesde !== undefined && !desde) {
      return res.status(400).json({ message: "fechaDesde no es una fecha válida." });
    }
    if (fechaHasta !== undefined && !hasta) {
      return res.status(400).json({ message: "fechaHasta no es una fecha válida." });
    }
    if (desde || hasta) {
      const filtroFecha: Prisma.DateTimeFilter = {};
      if (desde) filtroFecha.gte = desde;
      if (hasta) filtroFecha.lte = hasta;
      where.iniciadoEn = filtroFecha;
    }

    const [items, total] = await Promise.all([
      prisma.sincronizacionBiometricoLog.findMany({
        where,
        include: INCLUDE_FUENTE,
        orderBy: { iniciadoEn: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sincronizacionBiometricoLog.count({ where }),
    ]);

    return res.json({
      items: items.map(serializarLog),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error al listar sincronizaciones biométricas:", error);
    return res.status(500).json({ message: "Error al obtener el historial de sincronizaciones." });
  }
}

export async function obtenerSincronizacionBiometrica(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const log = await prisma.sincronizacionBiometricoLog.findFirst({
      where: { id, tenantId },
      include: INCLUDE_FUENTE,
    });
    if (!log) return res.status(404).json({ message: "Sincronización no encontrada." });

    return res.json(serializarLog(log));
  } catch (error) {
    console.error("Error al consultar sincronización biométrica:", error);
    return res.status(500).json({ message: "Error al obtener la sincronización." });
  }
}

/**
 * Dispara una sincronización manual para una fuente del tenant actual.
 * Sincrónico (espera el resultado): el volumen esperado de una corrida
 * manual es incremental (desde el último cursor), no el histórico completo
 * de 239k — si algún día hiciera falta disparar un histórico completo desde
 * la API, debería moverse a un patrón fire-and-forget como
 * siesa-sync.controller.ts, no antes.
 */
export async function sincronizarFuenteBiometricaManual(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const fuente = await prisma.fuenteBiometrica.findFirst({ where: { id, tenantId } });
    if (!fuente) return res.status(404).json({ message: "Fuente biométrica no encontrada." });
    if (!fuente.activa) {
      return res.status(409).json({ message: "La fuente biométrica está desactivada." });
    }

    const { tamanoLote } = leerConfigSchedulerCrossChex();
    const reporte = await sincronizarFuenteBiometrica(fuente.nombre, { tamanoLote });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "BIOMETRICO_SINCRONIZACION_MANUAL",
        detalle: `${req.user!.nombre} disparó una sincronización manual de "${fuente.nombre}" (estado: ${reporte.estado}, leídas: ${reporte.leidos}, insertadas: ${reporte.insertados}).`,
        entidadTipo: "FuenteBiometrica",
        entidadId: fuente.id,
      },
    });

    return res.json(reporte);
  } catch (error) {
    if (error instanceof SincronizacionEnCursoError) {
      return res.status(409).json({ message: error.message });
    }
    if (error instanceof FuenteBiometricaNoEncontradaError) {
      return res.status(404).json({ message: error.message });
    }
    console.error("Error al ejecutar sincronización manual biométrica:", error);
    return res.status(500).json({ message: "Error al ejecutar la sincronización." });
  }
}
