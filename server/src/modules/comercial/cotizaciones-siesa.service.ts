import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { getSiesaPool } from "../../config/siesa";
import { resolverCiaSiesa } from "../../lib/siesa-tenant";
import { formatearNumeroCotizacion, siguienteNumeroCotizacion } from "./cotizaciones.controller";

/**
 * Ingesta de Cotizaciones desde Siesa (UnoEE).
 *
 * Fuente verificada (siesa-pedidos.service.ts): las cotizaciones de Siesa son
 * documentos t430_cm_pv_docto con f430_id_tipo_docto = 'CDV' (los pedidos son
 * 'PDV'); líneas en t431_cm_pv_movto por f431_rowid_pv_docto; ítem en
 * t120_mc_items. La identidad técnica es SIEMPRE f430_rowid (`erpRowId`),
 * nunca el consecutivo visible. Reglas:
 *  - la compañía Siesa sale SOLO del Tenant autenticado (siesaCiaId);
 *  - lectura en lote (1 consulta de encabezados + 1 de líneas por cada 500),
 *    sin N+1; RicoSoft nunca escribe hacia Siesa;
 *  - persistencia (guardar=true): cada cotización se crea/actualiza en su
 *    PROPIA transacción (cotización + ítems + auditoría), con estado BORRADOR.
 *
 * COLUMNAS REALES (Reportes/INSPECCION-ESQUEMA-SIESA-2026-09-24.md y consultas de
 * verificación del 2026-09-24):
 *  - t430_cm_pv_docto: f430_id_moneda_docto (char 3; NO existe f430_id_moneda),
 *    f430_fecha_vcto_cotizacion (datetime; NO existe f430_fecha_vto),
 *    f430_id_cond_pago (char 3), f430_tasa_dscto_global_cap (decimal 7,4).
 *  - t431_cm_pv_movto: f431_id_unidad_medida, f431_id_lista_precio,
 *    f431_rowid_bodega. (t431_cm_pv_docto_linea NO existe.)
 *  - t433_cm_pv_movto_imp: f433_tasa (porcentaje; en las CDV reales 16 o 19,
 *    base 100), unida por f433_rowid_pv_movto = f431_rowid y f433_id_cia. En
 *    las 54 líneas CDV existentes hay exactamente UN impuesto por línea; el
 *    join agrega (SUM) para no duplicar líneas si algún día hubiera varios.
 * Notas de semántica: la tasa de descuento global "cap" se expone en el DTO
 * pero NO se aplica como descuento final (el informe exige cotejar su
 * significado con UnoEE); el vencimiento cae a fecha + 15 días solo si
 * f430_fecha_vcto_cotizacion viene NULL (regla de negocio).
 */

export interface ItemCotizacionSiesa {
  lineaRowId: number;
  itemRowId: number | null;
  /** Código del ítem (t120.f120_referencia). */
  codigo: string | null;
  descripcion: string | null;
  /** f431_id_unidad_medida. */
  unidadMedida: string | null;
  /** f431_id_lista_precio (solo informativo: no hay campo local). */
  listaPrecio: string | null;
  /** f431_rowid_bodega. */
  bodegaRowId: number | null;
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  descuentoValor: number;
  impuestoPct: number | null;
  impuestoValor: number;
  valorNeto: number;
}

/** Cotización de Siesa en forma canónica de RicoSoft. */
export interface CotizacionSiesaCanonica {
  /** f430_rowid — identidad técnica (única clave de unión). */
  erpRowId: number;
  /** Consecutivo visible, ej. "COT-CDV-34147" (COT-CDV-<f430_consec_docto, 5 dígitos mínimo>). */
  consecutivo: string;
  cliente: { rowId: number; nombre: string | null; nit: string | null };
  vendedor: { rowId: number | null; nombre: string | null };
  fecha: Date;
  /** f430_fecha_vcto_cotizacion; si viene NULL, fecha + VIGENCIA_COTIZACION_DIAS. */
  fechaVencimiento: Date;
  /** true = el vencimiento es la estimación fecha + 15 días (Siesa lo trajo NULL). */
  vencimientoEstimado: boolean;
  /** f430_id_cond_pago (+ descripción de t208). */
  condicionPago: { id: string | null; descripcion: string | null };
  /** f430_tasa_dscto_global_cap: informativa, NO aplicada (ver nota de semántica). */
  descuentoGlobalTasa: number | null;
  /** f430_id_moneda_docto; 'COP' si viene vacío. */
  moneda: string;
  items: ItemCotizacionSiesa[];
}

export const LIMITE_MAXIMO_COTIZACIONES = 200;
/** Regla de negocio: vencimiento por defecto = fecha de la cotización + 15 días. */
export const VIGENCIA_COTIZACION_DIAS = 15;
export const MONEDA_POR_DEFECTO = "COP";

export function vencimientoPorDefecto(fecha: Date): Date {
  const vencimiento = new Date(fecha);
  vencimiento.setUTCDate(vencimiento.getUTCDate() + VIGENCIA_COTIZACION_DIAS);
  return vencimiento;
}
/** Máximo de rowids por consulta de líneas (límite de 2100 parámetros de SQL Server). */
export const TAMANO_LOTE_LINEAS = 500;

/** El tenant no tiene siesaCiaId configurado (el controller responde 400). */
export class SiesaCiaNoConfiguradaError extends Error {
  constructor() {
    super("Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.");
  }
}

interface FilaEncabezado {
  erpRowId: number;
  consec: number;
  clienteRowId: number;
  clienteNombre: string | null;
  clienteNit: string | null;
  fecha: Date;
  moneda: string | null;
  vencimiento: Date | null;
  condicionPagoId: string | null;
  condicionPagoDescripcion: string | null;
  tasaDsctoGlobalCap: number | null;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
}

interface FilaLinea {
  docRowId: number;
  lineaRowId: number;
  itemRowId: number | null;
  referencia: string | null;
  descripcion: string | null;
  unidadMedida: string | null;
  listaPrecio: string | null;
  bodegaRowId: number | null;
  tasaImpuesto: number | null;
  cantidad: number | null;
  precioUnitario: number | null;
  descuentoLinea: number | null;
  descuentoGlobal: number | null;
  impuesto: number | null;
  valorNeto: number | null;
}

export const formatearConsecutivoCotizacionSiesa = (consec: number) =>
  `COT-CDV-${String(consec).padStart(5, "0")}`;

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Mapea una línea cruda de Siesa al ítem canónico (porcentajes derivados, como leerCotizacionSiesa). */
export function mapearLineaSiesa(l: FilaLinea): ItemCotizacionSiesa {
  const cantidad = Number(l.cantidad ?? 0);
  const precioUnitario = Number(l.precioUnitario ?? 0);
  const descuentoValor = Number(l.descuentoLinea ?? 0) + Number(l.descuentoGlobal ?? 0);
  const impuestoValor = Number(l.impuesto ?? 0);
  const valorNeto = Number(l.valorNeto ?? 0);
  const bruto = cantidad * precioUnitario;
  return {
    lineaRowId: l.lineaRowId,
    itemRowId: l.itemRowId,
    codigo: l.referencia?.trim() || null,
    descripcion: l.descripcion?.trim() || null,
    unidadMedida: l.unidadMedida?.trim() || null,
    listaPrecio: l.listaPrecio?.trim() || null,
    bodegaRowId: l.bodegaRowId ?? null,
    cantidad,
    precioUnitario,
    descuentoValor,
    descuentoPct: bruto > 0 && descuentoValor > 0 ? redondear2((descuentoValor / bruto) * 100) : 0,
    impuestoValor,
    // Tasa REAL de t433 (f433_tasa); solo si Siesa no trae fila de impuesto se deriva del valor.
    impuestoPct:
      l.tasaImpuesto !== null && l.tasaImpuesto !== undefined
        ? Number(l.tasaImpuesto)
        : valorNeto > 0 && impuestoValor > 0
          ? redondear2((impuestoValor / valorNeto) * 100)
          : null,
    valorNeto,
  };
}

/**
 * Cotizaciones (CDV) de la compañía Siesa `ciaId`, más recientes primero,
 * con sus líneas, EN LOTE. `desde` filtra por f430_id_fecha; `limite` acota
 * los documentos (máx. LIMITE_MAXIMO_COTIZACIONES).
 */
export async function leerCotizacionesSiesa(
  ciaId: number,
  opciones: { desde?: Date; limite?: number } = {},
): Promise<CotizacionSiesaCanonica[]> {
  const limite = Math.min(Math.max(opciones.limite ?? 50, 1), LIMITE_MAXIMO_COTIZACIONES);
  const pool = await getSiesaPool();

  const encabezados = pool.request().input("ciaId", ciaId).input("limite", limite);
  if (opciones.desde) encabezados.input("desde", opciones.desde);
  const { recordset } = await encabezados.query<FilaEncabezado>(`
    SELECT TOP (@limite)
      d.f430_rowid AS erpRowId,
      d.f430_consec_docto AS consec,
      d.f430_rowid_tercero_fact AS clienteRowId,
      tc.f200_razon_social AS clienteNombre,
      tc.f200_nit AS clienteNit,
      d.f430_id_fecha AS fecha,
      RTRIM(d.f430_id_moneda_docto) AS moneda,
      d.f430_fecha_vcto_cotizacion AS vencimiento,
      RTRIM(d.f430_id_cond_pago) AS condicionPagoId,
      cp.f208_descripcion AS condicionPagoDescripcion,
      d.f430_tasa_dscto_global_cap AS tasaDsctoGlobalCap,
      d.f430_rowid_tercero_vendedor AS vendedorRowId,
      tv.f200_razon_social AS vendedorNombre
    FROM t430_cm_pv_docto d
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = d.f430_rowid_tercero_fact
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = d.f430_rowid_tercero_vendedor
    LEFT JOIN t208_mm_condiciones_pago cp ON cp.f208_id_cia = @ciaId AND cp.f208_id = d.f430_id_cond_pago
    WHERE d.f430_id_cia = @ciaId
      AND d.f430_id_tipo_docto = 'CDV'
      ${opciones.desde ? "AND d.f430_id_fecha >= @desde" : ""}
    ORDER BY d.f430_id_fecha DESC, d.f430_rowid DESC
  `);
  if (recordset.length === 0) return [];

  // Líneas de TODOS los documentos, en lotes (nunca una consulta por documento).
  const lineasPorDoc = new Map<number, ItemCotizacionSiesa[]>();
  const rowIds = recordset.map((r) => r.erpRowId);
  for (let i = 0; i < rowIds.length; i += TAMANO_LOTE_LINEAS) {
    const lote = rowIds.slice(i, i + TAMANO_LOTE_LINEAS);
    const request = pool.request().input("ciaId", ciaId);
    lote.forEach((rowId, idx) => request.input(`r${idx}`, rowId));
    const parametros = lote.map((_, idx) => `@r${idx}`).join(", ");
    const { recordset: lineas } = await request.query<FilaLinea>(`
      SELECT
        m.f431_rowid_pv_docto AS docRowId,
        m.f431_rowid AS lineaRowId,
        m.f431_rowid_item_ext AS itemRowId,
        it.f120_referencia AS referencia,
        it.f120_descripcion AS descripcion,
        RTRIM(m.f431_id_unidad_medida) AS unidadMedida,
        RTRIM(m.f431_id_lista_precio) AS listaPrecio,
        m.f431_rowid_bodega AS bodegaRowId,
        imp.tasa AS tasaImpuesto,
        m.f431_cant1_pedida AS cantidad,
        m.f431_precio_unitario_base AS precioUnitario,
        m.f431_vlr_dscto_linea AS descuentoLinea,
        m.f431_vlr_dscto_global AS descuentoGlobal,
        m.f431_vlr_imp AS impuesto,
        m.f431_vlr_neto AS valorNeto
      FROM t431_cm_pv_movto m
      LEFT JOIN t120_mc_items it ON it.f120_rowid = m.f431_rowid_item_ext
      OUTER APPLY (
        SELECT SUM(i.f433_tasa) AS tasa
        FROM t433_cm_pv_movto_imp i
        WHERE i.f433_rowid_pv_movto = m.f431_rowid AND i.f433_id_cia = @ciaId
      ) imp
      WHERE m.f431_id_cia = @ciaId AND m.f431_rowid_pv_docto IN (${parametros})
      ORDER BY m.f431_rowid_pv_docto, m.f431_rowid
    `);
    for (const l of lineas) {
      const actuales = lineasPorDoc.get(l.docRowId) ?? [];
      actuales.push(mapearLineaSiesa(l));
      lineasPorDoc.set(l.docRowId, actuales);
    }
  }

  return recordset.map((r) => ({
    erpRowId: r.erpRowId,
    consecutivo: formatearConsecutivoCotizacionSiesa(r.consec),
    cliente: {
      rowId: r.clienteRowId,
      nombre: r.clienteNombre?.trim() || null,
      nit: r.clienteNit?.trim() || null,
    },
    vendedor: { rowId: r.vendedorRowId, nombre: r.vendedorNombre?.trim() || null },
    fecha: r.fecha,
    fechaVencimiento: r.vencimiento ?? vencimientoPorDefecto(r.fecha),
    vencimientoEstimado: r.vencimiento === null || r.vencimiento === undefined,
    condicionPago: {
      id: r.condicionPagoId?.trim() || null,
      descripcion: r.condicionPagoDescripcion?.trim() || null,
    },
    descuentoGlobalTasa:
      r.tasaDsctoGlobalCap === null || r.tasaDsctoGlobalCap === undefined
        ? null
        : Number(r.tasaDsctoGlobalCap),
    moneda: r.moneda?.trim() || MONEDA_POR_DEFECTO,
    items: lineasPorDoc.get(r.erpRowId) ?? [],
  }));
}

export type EstadoSincronizacionCotizacion = "NUEVA" | "YA_VINCULADA";
export type ResultadoPersistencia =
  | "CREADA"
  | "ACTUALIZADA"
  /** Ya vinculada pero su estado local NO es BORRADOR: no se toca. */
  | "OMITIDA_NO_BORRADOR"
  /** Otra sincronización la vinculó a la vez (índice único por erpRowId). */
  | "OMITIDA_CONCURRENCIA"
  | "ERROR";

export interface CotizacionSincronizable extends CotizacionSiesaCanonica {
  /** NUEVA: ninguna Cotizacion del tenant tiene este erpRowId; YA_VINCULADA: ya existe. */
  estadoSincronizacion: EstadoSincronizacionCotizacion;
  /** Id de la Cotizacion de RicoSoft ya vinculada (o recién creada al guardar). */
  cotizacionId: string | null;
  /** Solo con guardar=true. */
  resultado: ResultadoPersistencia | null;
}

export interface ResultadoSincronizacionCotizaciones {
  /** SIMULACION: solo lee y clasifica; GUARDADO: persistió (guardar=true). */
  modo: "SIMULACION" | "GUARDADO";
  total: number;
  /** Candidatas nuevas (sin cotización local con ese erpRowId). */
  nuevas: number;
  yaVinculadas: number;
  /** Solo con guardar=true. */
  creadas: number;
  actualizadas: number;
  omitidas: number;
  errores: { erpRowId: number; consecutivo: string; motivo: string }[];
  cotizaciones: CotizacionSincronizable[];
  advertencias: string[];
}

export interface ActorSincronizacion {
  id: string;
  nombre: string;
}

const INDICE_UNICO_ERP_ROW_ID_COTIZACION = "Cotizacion_tenantId_erpRowId_filtered_uq";
const MAX_INTENTOS_NUMERO = 5;

const esP2002 = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
const esViolacionIndiceErpRowId = (error: unknown) =>
  esP2002(error) &&
  String((error as Prisma.PrismaClientKnownRequestError).meta?.target ?? "").includes(
    INDICE_UNICO_ERP_ROW_ID_COTIZACION,
  );
const esConflictoTransitorio = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

/** Campos de encabezado y líneas de la cotización local a partir de la de Siesa. */
export function datosCotizacionLocal(c: CotizacionSiesaCanonica) {
  return {
    clienteRowId: c.cliente.rowId,
    clienteNombre: c.cliente.nombre ?? "Cliente sin nombre",
    clienteNit: c.cliente.nit,
    vendedorNombre: c.vendedor.nombre,
    fecha: c.fecha,
    fechaVencimiento: c.fechaVencimiento,
    moneda: c.moneda,
    erpTipoDocumento: "CDV",
    erpNumero: c.consecutivo,
    erpEstadoSincronizacion: "VINCULADO",
  };
}

export function itemsCotizacionLocal(c: CotizacionSiesaCanonica) {
  return c.items.map((it, orden) => ({
    orden,
    itemRowId: it.itemRowId,
    referencia: it.codigo,
    descripcion: it.descripcion ?? "Sin descripción",
    bodegaRowId: it.bodegaRowId,
    unidadMedida: it.unidadMedida,
    cantidad: it.cantidad,
    precioUnitario: it.precioUnitario,
    descuentoPct: it.descuentoPct,
    ivaPct: it.impuestoPct ?? 0,
  }));
}

/** Crea la cotización local (BORRADOR) + ítems + auditoría en UNA transacción. Reintenta el consecutivo interno ante carrera. */
async function crearCotizacionLocal(
  c: CotizacionSiesaCanonica,
  tenantId: string,
  actor: ActorSincronizacion,
): Promise<string> {
  for (let intento = 1; ; intento++) {
    try {
      const creada = await prisma.$transaction(async (tx) => {
        const numero = await siguienteNumeroCotizacion(tx, tenantId);
        const nueva = await tx.cotizacion.create({
          data: {
            tenantId,
            numero,
            estado: "BORRADOR",
            ...datosCotizacionLocal(c),
            erpRowId: c.erpRowId,
            erpFechaSincronizacion: new Date(),
            creadoPorId: actor.id,
            creadoPorNombre: actor.nombre,
            items: { create: itemsCotizacionLocal(c) },
          },
          select: { id: true, numero: true },
        });
        await tx.auditoria.create({
          data: {
            tenantId,
            usuarioId: actor.id,
            accion: "COTIZACION_SIESA_CREADA",
            detalle: `${actor.nombre} ingresó la cotización ${formatearNumeroCotizacion(nueva.numero)} desde Siesa (${c.consecutivo}, rowid ${c.erpRowId}).`,
            entidadTipo: "Cotizacion",
            entidadId: nueva.id,
            datosNuevos: JSON.stringify({
              erpRowId: c.erpRowId,
              erpNumero: c.consecutivo,
              items: c.items.length,
            }),
          },
        });
        return nueva.id;
      });
      return creada;
    } catch (error) {
      if (esViolacionIndiceErpRowId(error)) throw error; // otra sincronización ya la vinculó
      const reintentable =
        intento < MAX_INTENTOS_NUMERO && (esP2002(error) || esConflictoTransitorio(error));
      if (!reintentable) throw error;
    }
  }
}

/** Actualiza una cotización vinculada SOLO si sigue en BORRADOR (update condicional + ítems + auditoría atómicos). */
async function actualizarCotizacionLocal(
  c: CotizacionSiesaCanonica,
  cotizacionId: string,
  tenantId: string,
  actor: ActorSincronizacion,
): Promise<"ACTUALIZADA" | "OMITIDA_NO_BORRADOR"> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.cotizacion.updateMany({
      where: { id: cotizacionId, tenantId, estado: "BORRADOR" },
      data: { ...datosCotizacionLocal(c), erpFechaSincronizacion: new Date() },
    });
    if (count === 0) return "OMITIDA_NO_BORRADOR" as const;

    await tx.cotizacionItem.deleteMany({ where: { cotizacionId } });
    await tx.cotizacionItem.createMany({
      data: itemsCotizacionLocal(c).map((it) => ({ ...it, cotizacionId })),
    });
    await tx.auditoria.create({
      data: {
        tenantId,
        usuarioId: actor.id,
        accion: "COTIZACION_SIESA_ACTUALIZADA",
        detalle: `${actor.nombre} actualizó desde Siesa la cotización borrador vinculada a ${c.consecutivo} (rowid ${c.erpRowId}).`,
        entidadTipo: "Cotizacion",
        entidadId: cotizacionId,
        datosNuevos: JSON.stringify({ erpRowId: c.erpRowId, items: c.items.length }),
      },
    });
    return "ACTUALIZADA" as const;
  });
}

/**
 * Sincronización de cotizaciones desde Siesa. Siempre lee y clasifica contra
 * las Cotizacion ya vinculadas (por erpRowId, acotado a tenantId). Con
 * `guardar: true` además persiste, cada documento en su propia transacción:
 *  - NUEVA          -> se crea (BORRADOR) con sus ítems;
 *  - YA_VINCULADA   -> se actualiza SOLO si su estado local es BORRADOR;
 *                      en cualquier otro estado se omite (no se pisa trabajo).
 * Un fallo de un documento no revierte los demás: queda en `errores`.
 */
export async function sincronizarCotizacionesSiesa(
  tenantId: string,
  opciones: { desde?: Date; limite?: number; guardar?: boolean } = {},
  actor?: ActorSincronizacion,
): Promise<ResultadoSincronizacionCotizaciones> {
  const guardar = opciones.guardar === true;
  if (guardar && !actor) throw new Error("guardar=true requiere el usuario que sincroniza.");

  const ciaId = await resolverCiaSiesa(tenantId);
  if (!ciaId) throw new SiesaCiaNoConfiguradaError();

  const desdeSiesa = await leerCotizacionesSiesa(ciaId, opciones);

  const vinculadas =
    desdeSiesa.length === 0
      ? []
      : await prisma.cotizacion.findMany({
          where: { tenantId, erpRowId: { in: desdeSiesa.map((c) => c.erpRowId) } },
          select: { id: true, erpRowId: true },
        });
  const porRowId = new Map(vinculadas.map((c) => [c.erpRowId, c.id]));

  const cotizaciones: CotizacionSincronizable[] = desdeSiesa.map((c) => {
    const cotizacionId = porRowId.get(c.erpRowId) ?? null;
    return {
      ...c,
      estadoSincronizacion: cotizacionId ? "YA_VINCULADA" : "NUEVA",
      cotizacionId,
      resultado: null,
    };
  });

  const errores: ResultadoSincronizacionCotizaciones["errores"] = [];
  if (guardar) {
    for (const c of cotizaciones) {
      try {
        if (c.cotizacionId) {
          c.resultado = await actualizarCotizacionLocal(c, c.cotizacionId, tenantId, actor!);
        } else {
          c.cotizacionId = await crearCotizacionLocal(c, tenantId, actor!);
          c.resultado = "CREADA";
        }
      } catch (error) {
        if (esViolacionIndiceErpRowId(error)) {
          c.resultado = "OMITIDA_CONCURRENCIA";
        } else {
          console.error("Error persistiendo la cotización de Siesa:", c.erpRowId, error);
          c.resultado = "ERROR";
          errores.push({
            erpRowId: c.erpRowId,
            consecutivo: c.consecutivo,
            motivo: "No fue posible guardar esta cotización.",
          });
        }
      }
    }
  }

  const contar = (r: ResultadoPersistencia) => cotizaciones.filter((c) => c.resultado === r).length;
  const yaVinculadas = cotizaciones.filter((c) => c.estadoSincronizacion === "YA_VINCULADA").length;

  return {
    modo: guardar ? "GUARDADO" : "SIMULACION",
    total: cotizaciones.length,
    nuevas: cotizaciones.length - yaVinculadas,
    yaVinculadas,
    creadas: contar("CREADA"),
    actualizadas: contar("ACTUALIZADA"),
    omitidas: contar("OMITIDA_NO_BORRADOR") + contar("OMITIDA_CONCURRENCIA"),
    errores,
    cotizaciones,
    advertencias: [
      "Si Siesa no trae f430_fecha_vcto_cotizacion, el vencimiento se estima como fecha + 15 días (vencimientoEstimado).",
      "descuentoGlobalTasa (f430_tasa_dscto_global_cap) es informativa: no se aplica como descuento final hasta validar su semántica en UnoEE.",
      ...(guardar
        ? []
        : ["Modo simulación: no se creó ni modificó ninguna cotización en RicoSoft."]),
    ],
  };
}
