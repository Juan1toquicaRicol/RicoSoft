import { getSiesaPool } from "../../config/siesa";

/**
 * Remisiones de UN cliente, encabezado paginado. Incluye tanto remisiones
 * con pedido (f460_rowid_pv_docto no nulo) como sin pedido — venta directa
 * (f470_id_concepto=501) o devolución (502), ver leerLineasRemisionSiesa
 * para el detalle que permite distinguirlas. No se fuerza ninguna relación
 * con pedido que no exista físicamente (confirmado con datos reales:
 * ~11.6K movimientos de remisión sin línea de pedido asociada).
 */
export interface RemisionClienteSiesa {
  remisionRowId: number;
  fecha: Date;
  pedidoRowId: number | null;
  numeroPedido: number | null;
  facturaRowId: number | null;
  valorNeto: number;
  cantidadTotal: number;
  numLineas: number;
}

const WHERE_REMISIONES_CLIENTE =
  "r.f460_id_cia = @ciaId AND r.f460_rowid_tercero_fact = @clienteRowId";

export async function contarRemisionesClienteSiesa(
  ciaId: number,
  clienteRowId: number,
): Promise<number> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId)
    .query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM t460_cm_docto_remision_venta r WHERE ${WHERE_REMISIONES_CLIENTE}`,
    );
  return recordset[0]?.n ?? 0;
}

export async function leerRemisionesClienteSiesa(
  ciaId: number,
  clienteRowId: number,
  page: number,
  pageSize: number,
): Promise<RemisionClienteSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId)
    .input("skip", (page - 1) * pageSize)
    .input("take", pageSize).query<{
    remisionRowId: number;
    fecha: Date;
    pedidoRowId: number | null;
    numeroPedido: number | null;
    facturaRowId: number | null;
    valorNeto: number | null;
    cantidadTotal: number | null;
    numLineas: number | null;
  }>(`
    SELECT
      r.f460_rowid_docto AS remisionRowId,
      r.f460_id_fecha AS fecha,
      r.f460_rowid_pv_docto AS pedidoRowId,
      pd.f430_consec_docto AS numeroPedido,
      r.f460_rowid_docto_factura AS facturaRowId,
      r.f460_vlr_neto AS valorNeto,
      ISNULL(SUM(t.f470_cant_base), 0) AS cantidadTotal,
      COUNT(t.f470_rowid) AS numLineas
    FROM t460_cm_docto_remision_venta r
    LEFT JOIN t430_cm_pv_docto pd ON pd.f430_rowid = r.f460_rowid_pv_docto
    LEFT JOIN t470_cm_movto_invent t ON t.f470_rowid_docto = r.f460_rowid_docto AND t.f470_id_cia = @ciaId
    WHERE ${WHERE_REMISIONES_CLIENTE}
    GROUP BY
      r.f460_rowid_docto, r.f460_id_fecha, r.f460_rowid_pv_docto, pd.f430_consec_docto,
      r.f460_rowid_docto_factura, r.f460_vlr_neto
    ORDER BY r.f460_id_fecha DESC, r.f460_rowid_docto DESC
    OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
  `);

  return recordset.map((r) => ({
    remisionRowId: r.remisionRowId,
    fecha: r.fecha,
    pedidoRowId: r.pedidoRowId,
    numeroPedido: r.numeroPedido,
    facturaRowId: r.facturaRowId,
    valorNeto: Number(r.valorNeto ?? 0),
    cantidadTotal: Number(r.cantidadTotal ?? 0),
    numLineas: Number(r.numLineas ?? 0),
  }));
}

export interface LineaRemisionSiesa {
  movtoRowId: number;
  lineaPedidoRowId: number | null;
  /** 501 = venta directa/asociada a pedido, 502 = devolución — confirmado con datos reales. */
  concepto: number;
  origen: "PEDIDO" | "VENTA_DIRECTA" | "DEVOLUCION";
  itemRowId: number;
  referencia: string | null;
  descripcion: string | null;
  cantidad: number;
  unidadMedida: string | null;
  bodegaRowId: number | null;
  bodegaNombre: string | null;
  lote: string | null;
  costoTotal: number;
}

const CONCEPTO_VENTA = 501;
const CONCEPTO_DEVOLUCION = 502;

function clasificarOrigen(
  concepto: number,
  lineaPedidoRowId: number | null,
): LineaRemisionSiesa["origen"] {
  if (concepto === CONCEPTO_DEVOLUCION) return "DEVOLUCION";
  return lineaPedidoRowId !== null ? "PEDIDO" : "VENTA_DIRECTA";
}

/**
 * Líneas de UNA remisión — unida contra t460 filtrando por (ciaId,
 * clienteRowId) para impedir IDOR (mismo criterio que las líneas de
 * pedido). Trae bodega/lote reales por línea (confirmado con datos reales
 * que pueden variar entre remisiones de una misma línea de pedido).
 */
export async function leerLineasRemisionClienteSiesa(
  ciaId: number,
  clienteRowId: number,
  remisionRowId: number,
): Promise<LineaRemisionSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId)
    .input("remisionRowId", remisionRowId).query<{
    movtoRowId: number;
    lineaPedidoRowId: number | null;
    concepto: number;
    itemRowId: number;
    referencia: string | null;
    descripcion: string | null;
    cantidad: number;
    unidadMedida: string | null;
    bodegaRowId: number | null;
    bodegaNombre: string | null;
    lote: string | null;
    costoTotal: number;
  }>(`
    SELECT
      t.f470_rowid AS movtoRowId,
      t.f470_rowid_pv_movto AS lineaPedidoRowId,
      t.f470_id_concepto AS concepto,
      t.f470_rowid_item_ext AS itemRowId,
      it.f120_referencia AS referencia,
      it.f120_descripcion AS descripcion,
      t.f470_cant_base AS cantidad,
      t.f470_id_unidad_medida AS unidadMedida,
      t.f470_rowid_bodega AS bodegaRowId,
      b.f150_descripcion AS bodegaNombre,
      t.f470_id_lote AS lote,
      t.f470_costo_prom_tot AS costoTotal
    FROM t470_cm_movto_invent t
    INNER JOIN t460_cm_docto_remision_venta r
      ON r.f460_rowid_docto = t.f470_rowid_docto
      AND r.f460_id_cia = @ciaId
      AND r.f460_rowid_tercero_fact = @clienteRowId
    LEFT JOIN t120_mc_items it ON it.f120_rowid = t.f470_rowid_item_ext
    LEFT JOIN t150_mc_bodegas b ON b.f150_rowid = t.f470_rowid_bodega
    WHERE t.f470_id_cia = @ciaId AND t.f470_rowid_docto = @remisionRowId
    ORDER BY t.f470_rowid
  `);

  return recordset.map((r) => ({
    movtoRowId: r.movtoRowId,
    lineaPedidoRowId: r.lineaPedidoRowId,
    concepto: r.concepto,
    origen: clasificarOrigen(r.concepto, r.lineaPedidoRowId),
    itemRowId: r.itemRowId,
    referencia: r.referencia?.trim() || null,
    descripcion: r.descripcion?.trim() || null,
    cantidad: Number(r.cantidad ?? 0),
    unidadMedida: r.unidadMedida?.trim() || null,
    bodegaRowId: r.bodegaRowId,
    bodegaNombre: r.bodegaNombre?.trim() || null,
    lote: r.lote?.trim() || null,
    costoTotal: Number(r.costoTotal ?? 0),
  }));
}
