import { prisma } from "../../config/prisma";
import { getSiesaPool } from "../../config/siesa";
import { resolverCiaSiesa } from "../../lib/siesa-tenant";
import {
  determinarEstadoPedidoVentaSiesa,
  type EstadoPedidoVentaSiesa,
} from "../../lib/pedidos-venta-siesa";

/**
 * Trazabilidad de "Compromiso de Inventario" de un PedidoComercial contra
 * Siesa. Reglas anti-riesgo (no negociables):
 *  - La ÚNICA clave de unión es PedidoComercial.erpRowId = t430.f430_rowid.
 *    Nunca el número visible (PC-xxxxx / consecutivo PDV) ni el cliente.
 *  - Solo se cuentan documentos PDV de Siesa ya vinculados. Las Proformas
 *    jamás cuentan como comprometidas (no se consultan aquí).
 *  - Siesa se consulta EN LOTE: una consulta por cada 500 pedidos vinculados
 *    (límite de parámetros de SQL Server), nunca una por pedido (sin N+1).
 *  - siesaCiaId se deriva SOLO del Tenant del usuario autenticado.
 *  - Todo acotado por tenantId; un pedido de otro tenant no existe para el
 *    llamador (no aparece en el resultado).
 *  - Solo lectura: RicoSoft nunca escribe hacia Siesa.
 */

export type EstadoCompromiso =
  /** El pedido no tiene erpRowId: no hay nada que consultar en Siesa. */
  | "SIN_VINCULO_ERP"
  /** Tiene erpRowId pero Siesa no devuelve ese documento PDV en esta compañía. */
  | "SIESA_NO_ENCONTRADO"
  /** Existe en Siesa y la suma de cantidades comprometidas es 0. */
  | "NO_COMPROMETIDO"
  /** Existe en Siesa con cantidades comprometidas > 0. */
  | "COMPROMETIDO";

export interface ResumenSiesaPedido {
  pdvRowId: number;
  /** Número visible del PDV en Siesa — solo para mostrar, jamás para unir. */
  pdvNumero: number;
  /** Estado operativo derivado de los flags reales de Siesa. */
  estadoOperativo: EstadoPedidoVentaSiesa;
  /** Etiqueta para mostrar (bandeja y cabecera UnoEE): Comprometido, Facturado,
   * Retenido, etc. Ver etiquetaEstadoUnoee. */
  estadoUnoee: string;
  cantidadPedida: number;
  cantidadComprometida: number;
  cantidadRemisionada: number;
  cantidadFacturada: number;
  lineas: number;
  lineasComprometidas: number;
}

/** DTO: mantiene SEPARADOS el estado comercial de RicoSoft, el estado de
 * sincronización (integración) y el estado operativo de Siesa. */
export interface CompromisoInventarioPedidoDto {
  pedidoId: string;
  numero: number;
  erpRowId: number | null;
  /** Estado COMERCIAL de RicoSoft (PedidoComercial.estado). */
  estadoComercial: string;
  /** Estado de INTEGRACIÓN (NO_VINCULADO si no hay erpRowId). */
  estadoSincronizacion: string;
  compromiso: EstadoCompromiso;
  /** Datos operativos de Siesa (null si no hay vínculo o Siesa no lo devuelve). */
  siesa: ResumenSiesaPedido | null;
}

/** Siesa no respondió / falló la consulta: el controller responde 502. */
export class SiesaConsultaError extends Error {
  constructor(readonly causa: unknown) {
    super("No fue posible consultar Siesa.");
  }
}

/** El tenant no tiene siesaCiaId: no se puede consultar Siesa (400). */
export class SiesaNoConfiguradoError extends Error {
  constructor() {
    super("Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.");
  }
}

/**
 * Etiqueta operativa visible del pedido (estilo CRM de Siesa). Los estados que
 * dicen algo distinto de "hay inventario reservado" (pendiente de aprobación,
 * backorder, retenido, remisionado/facturado) se conservan; para un pedido
 * simplemente aprobado/en proceso, la etiqueta depende de la cantidad
 * comprometida: "Comprometido" (> 0) o "No comprometido" (0).
 */
export function etiquetaEstadoUnoee(
  estadoOperativo: EstadoPedidoVentaSiesa,
  cantidadComprometida: number,
): string {
  if (estadoOperativo === "Aprobado" || estadoOperativo === "En proceso") {
    return cantidadComprometida > 0 ? "Comprometido" : "No comprometido";
  }
  return estadoOperativo;
}

/** Máximo de rowids por consulta (límite de 2100 parámetros de SQL Server). */
export const TAMANO_LOTE_SIESA = 500;

const aBool = (v: unknown): boolean | null => (v === null || v === undefined ? null : v === true || v === 1);

interface FilaSiesa {
  pdvRowId: number;
  pdvNumero: number;
  indUltEstadoAprobado: unknown;
  indBackorderDocto: unknown;
  indBackorderLinea: unknown;
  indRetenidoMargen: unknown;
  indRetenidoCupo: unknown;
  indRetenidoMora: unknown;
  indRetenidoBloqueo: unknown;
  indRetenidoAnticipo: unknown;
  indRemisionado: unknown;
  indFacturado: unknown;
  cantidadPedida: number | null;
  cantidadComprometida: number | null;
  cantidadRemisionada: number | null;
  cantidadFacturada: number | null;
  lineas: number | null;
  lineasComprometidas: number | null;
}

/**
 * Lee de Siesa, EN LOTE, el resumen de compromiso de los PDV indicados
 * (por f430_rowid, filtrando f430_id_cia = ciaId y tipo 'PDV'). Devuelve un
 * Map pdvRowId -> resumen; los rowids que Siesa no devuelve no aparecen.
 * Una consulta por cada TAMANO_LOTE_SIESA rowids.
 */
export async function leerCompromisoSiesaPorPdv(
  ciaId: number,
  pdvRowIds: number[],
): Promise<Map<number, ResumenSiesaPedido>> {
  const resultado = new Map<number, ResumenSiesaPedido>();
  const unicos = [...new Set(pdvRowIds)];
  if (unicos.length === 0) return resultado;

  const pool = await getSiesaPool();
  for (let i = 0; i < unicos.length; i += TAMANO_LOTE_SIESA) {
    const lote = unicos.slice(i, i + TAMANO_LOTE_SIESA);
    const request = pool.request().input("ciaId", ciaId);
    lote.forEach((rowId, idx) => request.input(`r${idx}`, rowId));
    const parametros = lote.map((_, idx) => `@r${idx}`).join(", ");

    const { recordset } = await request.query<FilaSiesa>(`
      SELECT
        d.f430_rowid AS pdvRowId,
        d.f430_consec_docto AS pdvNumero,
        d.f430_ind_ult_estado_aprobado AS indUltEstadoAprobado,
        d.f430_ind_backorder AS indBackorderDocto,
        MAX(CAST(m.f431_ind_backorder AS INT)) AS indBackorderLinea,
        d.f430_ind_retenido_margen AS indRetenidoMargen,
        d.f430_ind_retenido_cupo AS indRetenidoCupo,
        d.f430_ind_retenido_mora AS indRetenidoMora,
        d.f430_ind_retenido_bloqueo AS indRetenidoBloqueo,
        d.f430_ind_retenido_anticipo AS indRetenidoAnticipo,
        d.f430_ind_remisionado AS indRemisionado,
        d.f430_ind_facturado AS indFacturado,
        ISNULL(SUM(m.f431_cant1_pedida), 0) AS cantidadPedida,
        ISNULL(SUM(m.f431_cant1_comprometida), 0) AS cantidadComprometida,
        ISNULL(SUM(m.f431_cant1_remisionada), 0) AS cantidadRemisionada,
        ISNULL(SUM(m.f431_cant1_facturada), 0) AS cantidadFacturada,
        COUNT(m.f431_rowid) AS lineas,
        ISNULL(SUM(CASE WHEN m.f431_cant1_comprometida > 0 THEN 1 ELSE 0 END), 0) AS lineasComprometidas
      FROM t430_cm_pv_docto d
      LEFT JOIN t431_cm_pv_movto m
        ON m.f431_rowid_pv_docto = d.f430_rowid AND m.f431_id_cia = @ciaId
      WHERE d.f430_id_cia = @ciaId
        AND d.f430_id_tipo_docto = 'PDV'
        AND d.f430_rowid IN (${parametros})
      GROUP BY
        d.f430_rowid, d.f430_consec_docto, d.f430_ind_ult_estado_aprobado,
        d.f430_ind_backorder, d.f430_ind_retenido_margen, d.f430_ind_retenido_cupo,
        d.f430_ind_retenido_mora, d.f430_ind_retenido_bloqueo,
        d.f430_ind_retenido_anticipo, d.f430_ind_remisionado, d.f430_ind_facturado
    `);

    for (const r of recordset) {
      const cantidadPedida = Number(r.cantidadPedida ?? 0);
      const cantidadRemisionada = Number(r.cantidadRemisionada ?? 0);
      const cantidadFacturada = Number(r.cantidadFacturada ?? 0);
      const estadoOperativo = determinarEstadoPedidoVentaSiesa({
          indUltEstadoAprobado: aBool(r.indUltEstadoAprobado),
          indBackorderDocto: aBool(r.indBackorderDocto),
          indBackorderLinea: aBool(r.indBackorderLinea),
          indRetenidoMargen: aBool(r.indRetenidoMargen),
          indRetenidoCupo: aBool(r.indRetenidoCupo),
          indRetenidoMora: aBool(r.indRetenidoMora),
          indRetenidoBloqueo: aBool(r.indRetenidoBloqueo),
          indRetenidoAnticipo: aBool(r.indRetenidoAnticipo),
          indRemisionado: aBool(r.indRemisionado),
          indFacturado: aBool(r.indFacturado),
          cantPedida: cantidadPedida,
          cantRemisionada: cantidadRemisionada,
          cantFacturada: cantidadFacturada,
        });
      const comprometida = Number(r.cantidadComprometida ?? 0);
      resultado.set(r.pdvRowId, {
        pdvRowId: r.pdvRowId,
        pdvNumero: r.pdvNumero,
        estadoOperativo,
        estadoUnoee: etiquetaEstadoUnoee(estadoOperativo, comprometida),
        cantidadPedida,
        cantidadComprometida: Number(r.cantidadComprometida ?? 0),
        cantidadRemisionada,
        cantidadFacturada,
        lineas: Number(r.lineas ?? 0),
        lineasComprometidas: Number(r.lineasComprometidas ?? 0),
      });
    }
  }
  return resultado;
}

/** Clasificación pura: pedido + (posible) resumen de Siesa -> DTO. */
export function construirCompromiso(
  pedido: {
    id: string;
    numero: number;
    estado: string;
    erpRowId: number | null;
    erpEstadoSincronizacion: string | null;
  },
  siesa: ResumenSiesaPedido | undefined,
): CompromisoInventarioPedidoDto {
  const base = {
    pedidoId: pedido.id,
    numero: pedido.numero,
    erpRowId: pedido.erpRowId,
    estadoComercial: pedido.estado,
    estadoSincronizacion:
      pedido.erpRowId === null
        ? "NO_VINCULADO"
        : (pedido.erpEstadoSincronizacion ?? "VINCULADO"),
  };
  if (pedido.erpRowId === null) return { ...base, compromiso: "SIN_VINCULO_ERP", siesa: null };
  if (!siesa) return { ...base, compromiso: "SIESA_NO_ENCONTRADO", siesa: null };
  return {
    ...base,
    compromiso: siesa.cantidadComprometida > 0 ? "COMPROMETIDO" : "NO_COMPROMETIDO",
    siesa,
  };
}

/**
 * Compromiso de inventario de los pedidos indicados (por id de RicoSoft),
 * acotado a `tenantId`. Los ids que no pertenecen al tenant simplemente no
 * aparecen en el resultado. Solo los pedidos con erpRowId no nulo generan
 * consulta a Siesa, y todos juntos en UN lote.
 */
export async function obtenerCompromisoInventarioPedidos(
  tenantId: string,
  pedidoIds: string[],
): Promise<CompromisoInventarioPedidoDto[]> {
  if (pedidoIds.length === 0) return [];

  const pedidos = await prisma.pedidoComercial.findMany({
    where: { tenantId, id: { in: pedidoIds } },
    select: { id: true, numero: true, estado: true, erpRowId: true, erpEstadoSincronizacion: true },
    orderBy: { numero: "desc" },
  });

  const vinculados = pedidos
    .map((p) => p.erpRowId)
    .filter((rowId): rowId is number => rowId !== null);

  let porRowId = new Map<number, ResumenSiesaPedido>();
  if (vinculados.length > 0) {
    const ciaId = await resolverCiaSiesa(tenantId);
    if (!ciaId) throw new SiesaNoConfiguradoError();
    try {
      porRowId = await leerCompromisoSiesaPorPdv(ciaId, vinculados);
    } catch (error) {
      throw new SiesaConsultaError(error);
    }
  }

  return pedidos.map((p) =>
    construirCompromiso(p, p.erpRowId === null ? undefined : porRowId.get(p.erpRowId)),
  );
}
