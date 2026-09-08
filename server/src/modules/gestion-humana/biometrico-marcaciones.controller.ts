import { Response } from "express";
import { Prisma, MarcacionBiometrica } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

/**
 * Consulta de solo lectura de MarcacionBiometrica (Fase 6). Nunca hay
 * escritura aquí — insertar marcaciones es exclusivo del servicio de
 * sincronización (Fase 4/5), no de la API administrativa.
 *
 * Serialización deliberadamente restrictiva: expone solo los campos
 * pedidos (fecha/hora, empleado si asociado, externalUserId, externalLogId,
 * checkType, sensor, fuente). Los campos internos de Checkinout que ya
 * guardamos (workType, attFlag, checked, exported, openDoorFlag,
 * temperature, whynoopen, mask) NO se devuelven: no son necesarios para un
 * consumidor administrativo y no hay razón para ampliar la superficie de la
 * API con datos de depuración de CrossChex. `Pwd` de Userinfo nunca se
 * guardó (ver Fase 3) — no puede aparecer aquí porque no existe en la BD.
 */

type MarcacionConRelaciones = MarcacionBiometrica & {
  empleado: { id: string; nombres: string; apellidos: string } | null;
  fuente: { id: string; nombre: string };
};

function serializarMarcacion(m: MarcacionConRelaciones) {
  return {
    id: m.id,
    fecha: m.fecha,
    horaMarcacion: m.horaMarcacion,
    externalUserId: m.externalUserId,
    externalLogId: m.externalLogId,
    checkType: m.checkType,
    tipoMarcacion: m.tipoMarcacion,
    dispositivoId: m.dispositivoId,
    fuente: { id: m.fuente.id, nombre: m.fuente.nombre },
    empleado: m.empleado ? { id: m.empleado.id, nombres: m.empleado.nombres, apellidos: m.empleado.apellidos } : null,
  };
}

const INCLUDE_RELACIONES = {
  empleado: { select: { id: true, nombres: true, apellidos: true } },
  fuente: { select: { id: true, nombre: true } },
};

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

export async function listarMarcacionesBiometricas(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { fuenteId, empleadoId, externalUserId, checkType, soloNoAsociados, fechaDesde, fechaHasta } = req.query;
    const { page, limit } = leerPaginacion(req.query);

    const where: Prisma.MarcacionBiometricaWhereInput = { tenantId };

    if (typeof fuenteId === "string" && fuenteId) where.fuenteId = fuenteId;
    if (typeof empleadoId === "string" && empleadoId) where.empleadoId = empleadoId;
    if (typeof externalUserId === "string" && externalUserId) where.externalUserId = externalUserId;
    if (soloNoAsociados === "true") where.empleadoId = null;

    if (checkType !== undefined) {
      const checkTypeNum = Number(checkType);
      if (!Number.isInteger(checkTypeNum)) {
        return res.status(400).json({ message: "checkType debe ser un número entero." });
      }
      where.checkType = checkTypeNum;
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
      where.fecha = filtroFecha;
    }

    const [items, total] = await Promise.all([
      prisma.marcacionBiometrica.findMany({
        where,
        include: INCLUDE_RELACIONES,
        orderBy: { horaMarcacion: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.marcacionBiometrica.count({ where }),
    ]);

    return res.json({
      items: items.map(serializarMarcacion),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error al listar marcaciones biométricas:", error);
    return res.status(500).json({ message: "Error al obtener las marcaciones biométricas." });
  }
}
