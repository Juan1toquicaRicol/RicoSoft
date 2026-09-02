import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import { ejecutarSincronizacion } from "./siesa-sync.service";

function serializarLog(log: any) {
  return {
    id: log.id,
    ciaId: log.ciaId,
    estado: log.estado,
    iniciadoPor: log.iniciadoPor
      ? { id: log.iniciadoPor.id, nombre: log.iniciadoPor.nombre }
      : null,
    iniciadoEn: log.iniciadoEn,
    finalizadoEn: log.finalizadoEn,
    leidos: log.leidos,
    creados: log.creados,
    actualizados: log.actualizados,
    desactivados: log.desactivados,
    sinCambios: log.sinCambios,
    erroresCount: log.erroresCount,
    errores: log.errores ? JSON.parse(log.errores) : [],
    mensajeError: log.mensajeError,
  };
}

/**
 * Dispara una sincronización en background: crea el log (EN_COLA) y responde
 * 202 de inmediato — el bucle real corre sin bloquear este request (ver
 * ejecutarSincronizacion). tenantId/ciaId SIEMPRE se resuelven server-side,
 * nunca del body.
 */
export async function sincronizarProveedores(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });
  if (!tenant?.siesaCiaId) {
    return res.status(409).json({
      message:
        "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada, no se puede sincronizar.",
    });
  }

  // Control de concurrencia (Fase 7): un solo sync EN_COLA/EN_CURSO por
  // tenant a la vez, basado en la BD (no en memoria) — sigue siendo correcto
  // aunque el backend corra en varias réplicas en el futuro.
  const enCurso = await prisma.sincronizacionSiesaLog.findFirst({
    where: { tenantId, estado: { in: ["EN_COLA", "EN_CURSO"] } },
  });
  if (enCurso) {
    return res.status(409).json({
      message: "Ya hay una sincronización en curso para esta empresa. Espera a que termine.",
      sincronizacionId: enCurso.id,
    });
  }

  const log = await prisma.sincronizacionSiesaLog.create({
    data: { tenantId, ciaId: tenant.siesaCiaId, iniciadoPorId: req.user!.id },
  });

  await prisma.auditoria.create({
    data: {
      tenantId,
      usuarioId: req.user!.id,
      accion: "SINCRONIZACION_SIESA_INICIADA",
      detalle: `${req.user!.nombre} inició una sincronización de proveedores desde Siesa (compañía ${tenant.siesaCiaId}).`,
      entidadTipo: "SincronizacionSiesaLog",
      entidadId: log.id,
    },
  });

  // Fire-and-forget controlado: no se espera (el request ya respondió 202),
  // pero el propio ejecutarSincronizacion maneja sus errores y los persiste
  // en el log — nunca deja una excepción sin capturar en el event loop.
  ejecutarSincronizacion(log.id, tenantId, tenant.siesaCiaId).catch((err) => {
    console.error("Error inesperado en sincronización de Siesa (fuera del manejo interno):", err);
  });

  return res.status(202).json({ id: log.id, estado: log.estado });
}

/** Historial paginado de corridas del tenant actual. Nunca de otro tenant. */
export async function listarSincronizaciones(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  const [items, total] = await Promise.all([
    prisma.sincronizacionSiesaLog.findMany({
      where: { tenantId },
      include: { iniciadoPor: { select: { id: true, nombre: true } } },
      orderBy: { iniciadoEn: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.sincronizacionSiesaLog.count({ where: { tenantId } }),
  ]);

  return res.json({
    items: items.map(serializarLog),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

/** Estado/progreso de una corrida puntual — solo si pertenece al tenant actual. */
export async function obtenerSincronizacion(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const log = await prisma.sincronizacionSiesaLog.findFirst({
    where: { id, tenantId },
    include: { iniciadoPor: { select: { id: true, nombre: true } } },
  });
  if (!log) {
    return res.status(404).json({ message: "Sincronización no encontrada." });
  }
  return res.json(serializarLog(log));
}

/** Solicita cancelación cooperativa — nunca mata el proceso. */
export async function cancelarSincronizacion(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const log = await prisma.sincronizacionSiesaLog.findFirst({ where: { id, tenantId } });
  if (!log) {
    return res.status(404).json({ message: "Sincronización no encontrada." });
  }
  if (!["EN_COLA", "EN_CURSO"].includes(log.estado)) {
    return res
      .status(409)
      .json({ message: `No se puede cancelar una sincronización en estado "${log.estado}".` });
  }

  await prisma.sincronizacionSiesaLog.update({
    where: { id },
    data: { cancelacionSolicitada: true },
  });
  return res.json({
    message: "Cancelación solicitada. La sincronización se detendrá en los próximos segundos.",
  });
}
