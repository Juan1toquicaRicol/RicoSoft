import { getSiesaPool } from "../../config/siesa";

/**
 * Lectura de inventario real desde Siesa/UnoEE (t400_cm_existencia —
 * confirmado en vivo: 8.175 ítems en Ricol, $7.098M en valor, con última
 * venta hasta hoy). Solo lectura — nunca se escribe nada en Siesa.
 *
 * t400_cm_existencia es por ítem+bodega; se agrega por ítem (SUM entre
 * bodegas) porque para la primera pieza del módulo (inventario disponible a
 * nivel gerencial) la bodega específica no es relevante todavía — sí lo
 * será cuando se construya la vista por bodega/ubicación.
 *
 * naturaleza (t120_mc_items.f120_ind_tipo_item + f120_ind_venta) —
 * verificado en vivo (cia 1 y 2): tipo=2 son servicios reales (FLETE,
 * BODEGAJE, TRANSPORTE), tipo=3 son repuestos reales (tornillos), tipo=1
 * es mercancía/materia prima física normal. Combinado con esVendible ya
 * verificado (ind_venta=0 → 100% de esos ítems nunca tuvieron una venta):
 * - "servicio": tipo=2
 * - "repuesto": tipo=3
 * - "insumo": tipo=1 (o sin dato) y no vendible — materia prima/insumo físico
 * - "producto": tipo=1 (o sin dato) y vendible — mercancía real
 *
 * IMPORTANTE — planeación nativa de Siesa confirmada en vivo como NO
 * usable, en dos frentes distintos:
 * - MRP (t834_mf_ordenes_planeadas): abandonado — 19 filas en total, todas
 *   de 2023, 0 en 2 de los 3 tenants.
 * - Stock de seguridad / punto de pedido (f400_cant_nivel_min_1 /
 *   f400_cant_nivel_pedido): configurados en 0 de 8.175 ítems (cia 1) —
 *   nadie los usa. No se puede calcular "producción recomendada" con un
 *   stock de seguridad real porque Siesa no tiene ese dato.
 * - Producción en proceso (t851_mf_op_docto_item, líneas de orden de
 *   producción con cant_ordenada > cant_completa y sin fecha de
 *   terminación): 0 líneas abiertas encontradas (cia 1) — o Siesa no
 *   trackea WIP en tiempo real, o el proceso de cierre es inmediato.
 * Cualquier recomendación de producción/compra se calcula con lógica
 * propia sobre los campos que SÍ tienen datos reales, no sobre estos.
 */
export type NaturalezaInventario = "producto" | "servicio" | "repuesto" | "insumo";

export interface ExistenciaItemSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  cantidadExistente: number;
  cantidadComprometida: number;
  /** f400_cant_pendiente_entrar_1 — cantidad ya en camino (compra o producción, Siesa no distingue). */
  cantidadPendienteEntrar: number;
  /** Costo total (Siesa, costo promedio × cantidad) sumado entre bodegas. */
  valorTotal: number;
  /** Fecha real más reciente de venta de este ítem, entre todas las bodegas. Null = sin venta registrada. */
  fechaUltimaVenta: Date | null;
  /** t120_mc_items.f120_ind_venta — false = materia prima/repuesto/insumo, no mercancía. */
  esVendible: boolean;
  naturaleza: NaturalezaInventario;
  /**
   * t120_mc_items.f120_id_unidad_inventario — unidad de medida REAL del
   * ítem (verificado en vivo, cia 1: KG en 3.983 ítems, UNID en 3.410, M en
   * 146, GL en 43 — no todo el catálogo es kilos, ej. "DUOPLOCK POLICOLOR"
   * se maneja en UNID). Null si el ítem no tiene match en t120_mc_items.
   */
  unidadMedida: string | null;
}

function clasificarNaturaleza(tipoItem: number | null, esVendible: boolean): NaturalezaInventario {
  if (tipoItem === 2) return "servicio";
  if (tipoItem === 3) return "repuesto";
  return esVendible ? "producto" : "insumo";
}

export async function leerExistenciasSiesa(ciaId: number): Promise<ExistenciaItemSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).query<{
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    cantidadExistente: number;
    cantidadComprometida: number;
    cantidadPendienteEntrar: number;
    valorTotal: number;
    fechaUltimaVenta: Date | null;
    indVenta: number | null;
    tipoItem: number | null;
    unidadMedida: string | null;
  }>(`
    SELECT
      e.f400_rowid_item_ext AS itemRowId,
      MAX(it.f120_descripcion) AS descripcion,
      MAX(it.f120_referencia) AS referencia,
      SUM(e.f400_cant_existencia_1) AS cantidadExistente,
      SUM(e.f400_cant_comprometida_1) AS cantidadComprometida,
      SUM(e.f400_cant_pendiente_entrar_1) AS cantidadPendienteEntrar,
      SUM(e.f400_costo_prom_tot) AS valorTotal,
      MAX(e.f400_fecha_ult_venta) AS fechaUltimaVenta,
      MAX(it.f120_ind_venta) AS indVenta,
      MAX(it.f120_ind_tipo_item) AS tipoItem,
      MAX(LTRIM(RTRIM(it.f120_id_unidad_inventario))) AS unidadMedida
    FROM t400_cm_existencia e
    LEFT JOIN t120_mc_items it ON it.f120_rowid = e.f400_rowid_item_ext
    WHERE e.f400_id_cia = @ciaId
    GROUP BY e.f400_rowid_item_ext
  `);
  return recordset.map((r) => {
    // Sin match en t120 (indVenta null) se trata como vendible: es más seguro
    // mostrar de más un ítem en el análisis de rotación que ocultarlo.
    const esVendible = r.indVenta !== 0;
    return {
      itemRowId: r.itemRowId,
      descripcion: r.descripcion?.trim() || null,
      referencia: r.referencia?.trim() || null,
      cantidadExistente: Number(r.cantidadExistente ?? 0),
      cantidadComprometida: Number(r.cantidadComprometida ?? 0),
      cantidadPendienteEntrar: Number(r.cantidadPendienteEntrar ?? 0),
      valorTotal: Number(r.valorTotal ?? 0),
      fechaUltimaVenta: r.fechaUltimaVenta,
      esVendible,
      naturaleza: clasificarNaturaleza(r.tipoItem, esVendible),
      unidadMedida: r.unidadMedida?.trim() || null,
    };
  });
}

/**
 * Bodegas reales (t150_mc_bodegas) — verificado en vivo: los rowid
 * coinciden 1:1 con t400_cm_existencia.f400_rowid_bodega (ej. bodega 13 =
 * "ALMACEN BOGOTA", 334 ítems reales ahí). Usadas para el selector de toma
 * física (Etapa I) — RicoSoft no tiene bodegas propias, siempre las de Siesa.
 */
export interface BodegaSiesa {
  bodegaRowId: number;
  nombre: string;
}

export async function leerBodegasSiesa(ciaId: number): Promise<BodegaSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).query<{
    bodegaRowId: number;
    nombre: string | null;
  }>(`
    SELECT f150_rowid AS bodegaRowId, f150_descripcion AS nombre
    FROM t150_mc_bodegas
    WHERE f150_id_cia = @ciaId
    ORDER BY f150_descripcion
  `);
  return recordset.map((r) => ({
    bodegaRowId: r.bodegaRowId,
    nombre: r.nombre?.trim() || `Bodega ${r.bodegaRowId}`,
  }));
}

export interface ExistenciaItemBodegaSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  cantidadExistente: number;
  /** f400_costo_prom_uni — costo unitario en ESA bodega específica, para valorar la diferencia de la toma física. */
  costoUnitario: number;
}

/**
 * Existencia real de una bodega específica, sin agregar entre bodegas (a
 * diferencia de leerExistenciasSiesa) — es el "listado esperado" con el que
 * se arma una toma física nueva. Solo mercancía (naturaleza="producto" o
 * cualquier ítem con existencia real): no tiene sentido contar físicamente
 * un servicio (flete/bodegaje), así que se excluyen los tipo=2.
 */
export async function leerExistenciaPorBodegaSiesa(
  ciaId: number,
  bodegaRowId: number,
): Promise<ExistenciaItemBodegaSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("bodegaRowId", bodegaRowId).query<{
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    cantidadExistente: number;
    costoUnitario: number;
  }>(`
    SELECT
      e.f400_rowid_item_ext AS itemRowId,
      MAX(it.f120_descripcion) AS descripcion,
      MAX(it.f120_referencia) AS referencia,
      e.f400_cant_existencia_1 AS cantidadExistente,
      e.f400_costo_prom_uni AS costoUnitario
    FROM t400_cm_existencia e
    LEFT JOIN t120_mc_items it ON it.f120_rowid = e.f400_rowid_item_ext
    WHERE e.f400_id_cia = @ciaId AND e.f400_rowid_bodega = @bodegaRowId
      AND ISNULL(it.f120_ind_tipo_item, 1) <> 2
    GROUP BY e.f400_rowid_item_ext, e.f400_cant_existencia_1, e.f400_costo_prom_uni
  `);
  return recordset.map((r) => ({
    itemRowId: r.itemRowId,
    descripcion: r.descripcion?.trim() || null,
    referencia: r.referencia?.trim() || null,
    cantidadExistente: Number(r.cantidadExistente ?? 0),
    costoUnitario: Number(r.costoUnitario ?? 0),
  }));
}

export interface ItemBusquedaSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
}

/**
 * Autocompletado de producto por descripción o referencia — para el campo
 * "Referencia" del módulo Ventas (verificado en vivo: f120_referencia trae
 * espacios de relleno fijo, ej. "DUO O                    ", por eso se
 * recorta con LTRIM/RTRIM). Búsqueda directa contra el maestro de ítems de
 * Siesa (t120_mc_items) — no hay catálogo propio de productos en RicoSoft.
 */
export async function buscarItemsSiesa(
  ciaId: number,
  search: string,
  limite = 10,
): Promise<ItemBusquedaSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("search", `%${search}%`)
    .input("limite", limite).query<{
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    unidadMedida: string | null;
  }>(`
    SELECT TOP (@limite)
      f120_rowid AS itemRowId,
      f120_descripcion AS descripcion,
      f120_referencia AS referencia,
      LTRIM(RTRIM(f120_id_unidad_inventario)) AS unidadMedida
    FROM t120_mc_items
    WHERE f120_id_cia = @ciaId
      AND (f120_descripcion LIKE @search OR f120_referencia LIKE @search)
    ORDER BY f120_descripcion
  `);
  return recordset.map((r) => ({
    itemRowId: r.itemRowId,
    descripcion: r.descripcion?.trim() || null,
    referencia: r.referencia?.trim() || null,
    unidadMedida: r.unidadMedida?.trim() || null,
  }));
}
