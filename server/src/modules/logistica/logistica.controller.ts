import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import { calcularOtif } from "../../domain/logistica/otif";
import { calcularAgregacionNovedades } from "../../domain/logistica/novedades";

/**
 * Cumplimiento de entregas (OTIF) — Fase 2.1 del Motor de Decisiones (P0
 * Logística). Reutiliza tal cual el modelo Despacho existente (tenant-scoped
 * vía req.tenantPrisma, ver tenant-prisma.ts) — sin tocar Siesa, sin tabla
 * nueva. `desde`/`hasta` filtran por fechaEntregaReal (cuándo se entregó
 * de verdad, no cuándo se creó el despacho); sin filtros, cubre todo el
 * histórico del tenant.
 */
export const obtenerCumplimientoLogistico = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { desde: desdeQuery, hasta: hastaQuery } = req.query;
    const desde = typeof desdeQuery === "string" && desdeQuery ? new Date(desdeQuery) : null;
    const hasta = typeof hastaQuery === "string" && hastaQuery ? new Date(hastaQuery) : null;

    const where: any = {};
    if (desde || hasta) {
      where.fechaEntregaReal = {
        ...(desde ? { gte: desde } : {}),
        ...(hasta ? { lte: hasta } : {}),
      };
    }

    const despachos = await req.tenantPrisma!.despacho.findMany({
      where,
      select: { id: true, estado: true, fechaEntregaEstimada: true, fechaEntregaReal: true },
    });

    const resultado = calcularOtif(despachos);
    return res.json({
      ...resultado,
      periodo: { desde: desde?.toISOString() ?? null, hasta: hasta?.toISOString() ?? null },
    });
  } catch (error) {
    console.error("Error al calcular el cumplimiento logístico (OTIF):", error);
    return res.status(500).json({ message: "Error al calcular el cumplimiento logístico." });
  }
};

/**
 * Novedades abiertas de despacho, con antigüedad y recurrencia por tipo/
 * cliente — Fase 2.1 del Motor de Decisiones (P0 Logística). El cliente se
 * resuelve desde Despacho.clienteNombre (snapshot ya congelado al crear el
 * despacho, ver schema.prisma) — nunca una consulta nueva a Siesa.
 */
export const obtenerNovedadesAbiertas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // DespachoNovedad no tiene tenantId propio (se aísla vía su relación con
    // Despacho, que sí es tenant-scoped) — mismo patrón ya usado en
    // despachos.controller.ts: prisma global + filtro explícito por
    // despacho.tenantId, nunca req.tenantPrisma (que no cubre este modelo).
    const novedades = await prisma.despachoNovedad.findMany({
      where: { estado: "ABIERTA", despacho: { tenantId: req.user!.tenantId } },
      select: {
        id: true,
        despachoId: true,
        tipo: true,
        descripcion: true,
        createdAt: true,
        despacho: { select: { clienteNombre: true } },
      },
    });

    const paraAgregar = novedades.map((n) => ({
      id: n.id,
      despachoId: n.despachoId,
      tipo: n.tipo,
      descripcion: n.descripcion,
      createdAt: n.createdAt,
      clienteNombre: n.despacho.clienteNombre,
    }));

    const resumen = calcularAgregacionNovedades(paraAgregar, new Date());
    return res.json(resumen);
  } catch (error) {
    console.error("Error al obtener las novedades abiertas de despacho:", error);
    return res.status(500).json({ message: "Error al obtener las novedades abiertas." });
  }
};
