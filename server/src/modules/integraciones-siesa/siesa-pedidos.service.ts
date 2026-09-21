import { getSiesaPool } from "../../config/siesa";

/**
 * Pedidos de UN cliente, paginados en SQL Server (OFFSET/FETCH) — mismo
 * patrón ya probado en leerHistoricoVentasSiesa/contarHistoricoVentasSiesa
 * (siesa-ventas.service.ts) contra 85K+ documentos. La identidad del cliente
 * (f430_rowid_tercero_fact) y la compañía (f430_id_cia) SIEMPRE se filtran
 * server-side; ciaId nunca llega de fuera de este archivo sin resolverse
 * antes contra Tenant.siesaCiaId (eso lo hace el controller).
 */
export interface PedidoClienteSiesa {
  pedidoRowId: number;
  numeroPedido: number;
  fecha: Date;
  estado: number | null;
  aprobado: boolean;
  backorder: boolean;
  condicionPagoCodigo: string | null;
  condicionPagoDescripcion: string | null;
  retenidoCupo: boolean;
  retenidoMora: boolean;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  valorNeto: number;
  cantidadPedida: number;
  cantidadRemisionada: number;
  cantidadFacturada: number;
}

const WHERE_PEDIDOS_CLIENTE = "d.f430_id_cia = @ciaId AND d.f430_rowid_tercero_fact = @clienteRowId";

export async function contarPedidosClienteSiesa(
  ciaId: number,
  clienteRowId: number,
): Promise<number> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId)
    .query<{ n: number }>(`SELECT COUNT(*) AS n FROM t430_cm_pv_docto d WHERE ${WHERE_PEDIDOS_CLIENTE}`);
  return recordset[0]?.n ?? 0;
}

export async function leerPedidosClienteSiesa(
  ciaId: number,
  clienteRowId: number,
  page: number,
  pageSize: number,
): Promise<PedidoClienteSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId)
    .input("skip", (page - 1) * pageSize)
    .input("take", pageSize).query<{
    pedidoRowId: number;
    numeroPedido: number;
    fecha: Date;
    estado: number | null;
    aprobado: number | null;
    backorder: number | null;
    condicionPagoCodigo: string | null;
    condicionPagoDescripcion: string | null;
    retenidoCupo: number | null;
    retenidoMora: number | null;
    vendedorRowId: number | null;
    vendedorNombre: string | null;
    valorNeto: number | null;
    cantidadPedida: number | null;
    cantidadRemisionada: number | null;
    cantidadFacturada: number | null;
  }>(`
    SELECT
      d.f430_rowid AS pedidoRowId,
      d.f430_consec_docto AS numeroPedido,
      d.f430_id_fecha AS fecha,
      d.f430_ind_estado AS estado,
      d.f430_ind_ult_estado_aprobado AS aprobado,
      d.f430_ind_backorder AS backorder,
      d.f430_id_cond_pago AS condicionPagoCodigo,
      cp.f208_descripcion AS condicionPagoDescripcion,
      d.f430_ind_retenido_cupo AS retenidoCupo,
      d.f430_ind_retenido_mora AS retenidoMora,
      d.f430_rowid_tercero_vendedor AS vendedorRowId,
      tv.f200_razon_social AS vendedorNombre,
      ISNULL(SUM(m.f431_vlr_neto), 0) AS valorNeto,
      ISNULL(SUM(m.f431_cant1_pedida), 0) AS cantidadPedida,
      ISNULL(SUM(m.f431_cant1_remisionada), 0) AS cantidadRemisionada,
      ISNULL(SUM(m.f431_cant1_facturada), 0) AS cantidadFacturada
    FROM t430_cm_pv_docto d
    LEFT JOIN t431_cm_pv_movto m ON m.f431_rowid_pv_docto = d.f430_rowid AND m.f431_id_cia = @ciaId
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = d.f430_rowid_tercero_vendedor
    LEFT JOIN t208_mm_condiciones_pago cp ON cp.f208_id_cia = @ciaId AND cp.f208_id = d.f430_id_cond_pago
    WHERE ${WHERE_PEDIDOS_CLIENTE}
    GROUP BY
      d.f430_rowid, d.f430_consec_docto, d.f430_id_fecha, d.f430_ind_estado,
      d.f430_ind_ult_estado_aprobado, d.f430_ind_backorder, d.f430_id_cond_pago,
      cp.f208_descripcion, d.f430_ind_retenido_cupo, d.f430_ind_retenido_mora,
      d.f430_rowid_tercero_vendedor, tv.f200_razon_social
    ORDER BY d.f430_id_fecha DESC, d.f430_rowid DESC
    OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
  `);

  return recordset.map((r) => ({
    pedidoRowId: r.pedidoRowId,
    numeroPedido: r.numeroPedido,
    fecha: r.fecha,
    estado: r.estado,
    aprobado: r.aprobado === 1,
    backorder: r.backorder === 1,
    condicionPagoCodigo: r.condicionPagoCodigo?.trim() || null,
    condicionPagoDescripcion: r.condicionPagoDescripcion?.trim() || null,
    retenidoCupo: r.retenidoCupo === 1,
    retenidoMora: r.retenidoMora === 1,
    vendedorRowId: r.vendedorRowId,
    vendedorNombre: r.vendedorNombre?.trim() || null,
    valorNeto: Number(r.valorNeto ?? 0),
    cantidadPedida: Number(r.cantidadPedida ?? 0),
    cantidadRemisionada: Number(r.cantidadRemisionada ?? 0),
    cantidadFacturada: Number(r.cantidadFacturada ?? 0),
  }));
}

/**
 * Cotizaciones/pedidos de venta para vincular con una Proforma —
 * t430_cm_pv_docto ES el documento PDV (Pedido De Venta) de Siesa; este
 * módulo no tiene acceso a una tabla de "cotización" separada, así que la
 * cotización visible al usuario y el documento ERP se resuelven sobre el
 * MISMO registro t430 (ver nota en proformas.controller.ts). El id externo
 * real que RicoSoft guarda (Proforma.cotizacionIdExterno) es SIEMPRE
 * f430_rowid, nunca el consecutivo visible.
 */
export interface CotizacionSiesaResumen {
  cotizacionIdExterno: string;
  cotizacionNumero: string;
  erpDocumentoNumero: string | null;
  clienteRowId: number;
  clienteNombre: string | null;
  fecha: Date;
}

/** Busca por el número visible de documento (ej. "34147" o "COT-34147") —
 * acotado SIEMPRE a la compañía Siesa del tenant autenticado (ciaId nunca
 * llega de fuera de este archivo sin resolverse antes contra
 * Tenant.siesaCiaId, igual que el resto de servicios de este módulo). */
export async function buscarCotizacionesSiesa(
  ciaId: number,
  search: string,
  limite = 20,
): Promise<CotizacionSiesaResumen[]> {
  const soloDigitos = search.replace(/\D+/g, "");
  const pool = await getSiesaPool();
  const request = pool
    .request()
    .input("ciaId", ciaId)
    .input("consec", soloDigitos ? Number(soloDigitos) : -1)
    .input("top", limite);
  const { recordset } = await request.query<{
    cotizacionIdExterno: number;
    cotizacionNumero: number;
    clienteRowId: number;
    clienteNombre: string | null;
    fecha: Date;
  }>(`
    SELECT TOP (@top)
      d.f430_rowid AS cotizacionIdExterno,
      d.f430_consec_docto AS cotizacionNumero,
      d.f430_rowid_tercero_fact AS clienteRowId,
      tc.f200_razon_social AS clienteNombre,
      d.f430_id_fecha AS fecha
    FROM t430_cm_pv_docto d
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = d.f430_rowid_tercero_fact
    WHERE d.f430_id_cia = @ciaId
      AND d.f430_id_tipo_docto = 'CDV'
      AND (@consec = -1 OR d.f430_consec_docto = @consec)
    ORDER BY d.f430_id_fecha DESC, d.f430_rowid DESC
  `);

  return recordset.map((r) => ({
    cotizacionIdExterno: String(r.cotizacionIdExterno),
    cotizacionNumero: `COT-${r.cotizacionNumero}`,
    erpDocumentoNumero: `PDV-${r.cotizacionNumero}`,
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre?.trim() || null,
    fecha: r.fecha,
  }));
}

export interface CotizacionSiesaDetalle extends CotizacionSiesaResumen {
  clienteNit: string | null;
  direccion: string | null;
  telefono: string | null;
  ciudad: string | null;
  condicionPagoDescripcion: string | null;
  vendedorNombre: string | null;
  fechaEntrega: Date | null;
  items: {
    itemRowId: number | null;
    referencia: string | null;
    descripcion: string | null;
    cantidad: number;
    precioUnitario: number;
    descuentoPct: number | null;
    ivaPct: number | null;
  }[];
}

/**
 * Detalle completo de UNA cotización/pedido — cotizacionIdExterno es
 * SIEMPRE f430_rowid. Se filtra también por ciaId, así que un id de otra
 * compañía/tenant nunca devuelve filas (mismo 404 silencioso que el resto
 * del sistema usa contra IDOR). Campos que Siesa no expone en este flujo
 * (condición de pago detallada del documento, fecha de entrega) quedan en
 * null en vez de inventarse.
 */
export async function leerCotizacionSiesa(
  ciaId: number,
  cotizacionIdExterno: string,
): Promise<CotizacionSiesaDetalle | null> {
  const rowId = Number(cotizacionIdExterno);
  if (!Number.isInteger(rowId)) return null;

  const pool = await getSiesaPool();
  const encabezado = await pool.request().input("ciaId", ciaId).input("rowId", rowId).query<{
    cotizacionIdExterno: number;
    cotizacionNumero: number;
    clienteRowId: number;
    clienteNombre: string | null;
    clienteNit: string | null;
    fecha: Date;
    condicionPagoDescripcion: string | null;
    vendedorNombre: string | null;
  }>(`
    SELECT
      d.f430_rowid AS cotizacionIdExterno,
      d.f430_consec_docto AS cotizacionNumero,
      d.f430_rowid_tercero_fact AS clienteRowId,
      tc.f200_razon_social AS clienteNombre,
      tc.f200_nit AS clienteNit,
      d.f430_id_fecha AS fecha,
      cp.f208_descripcion AS condicionPagoDescripcion,
      tv.f200_razon_social AS vendedorNombre
    FROM t430_cm_pv_docto d
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = d.f430_rowid_tercero_fact
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = d.f430_rowid_tercero_vendedor
    LEFT JOIN t208_mm_condiciones_pago cp ON cp.f208_id_cia = @ciaId AND cp.f208_id = d.f430_id_cond_pago
    WHERE d.f430_id_cia = @ciaId AND d.f430_rowid = @rowId AND d.f430_id_tipo_docto = 'CDV'
  `);

  const enc = encabezado.recordset[0];
  if (!enc) return null;

  const lineas = await pool.request().input("ciaId", ciaId).input("rowId", rowId).query<{
    itemRowId: number | null;
    referencia: string | null;
    descripcion: string | null;
    cantidad: number | null;
    precioUnitario: number | null;
    descuentoLinea: number | null;
    valorNeto: number | null;
    impuesto: number | null;
  }>(`
    SELECT
      m.f431_rowid_item_ext AS itemRowId,
      it.f120_referencia AS referencia,
      it.f120_descripcion AS descripcion,
      m.f431_cant1_pedida AS cantidad,
      m.f431_precio_unitario_base AS precioUnitario,
      m.f431_vlr_dscto_linea AS descuentoLinea,
      m.f431_vlr_neto AS valorNeto,
      m.f431_vlr_imp AS impuesto
    FROM t431_cm_pv_movto m
    LEFT JOIN t120_mc_items it ON it.f120_rowid = m.f431_rowid_item_ext
    WHERE m.f431_id_cia = @ciaId AND m.f431_rowid_pv_docto = @rowId
    ORDER BY m.f431_rowid
  `);

  return {
    cotizacionIdExterno: String(enc.cotizacionIdExterno),
    cotizacionNumero: `COT-${enc.cotizacionNumero}`,
    erpDocumentoNumero: `PDV-${enc.cotizacionNumero}`,
    clienteRowId: enc.clienteRowId,
    clienteNombre: enc.clienteNombre?.trim() || null,
    clienteNit: enc.clienteNit?.trim() || null,
    direccion: null,
    telefono: null,
    ciudad: null,
    condicionPagoDescripcion: enc.condicionPagoDescripcion?.trim() || null,
    vendedorNombre: enc.vendedorNombre?.trim() || null,
    fecha: enc.fecha,
    fechaEntrega: null,
    items: lineas.recordset.map((l) => {
      const cantidad = Number(l.cantidad ?? 0);
      const precioUnitario = Number(l.precioUnitario ?? 0);
      const base = cantidad * precioUnitario;
      const descuentoPct =
        base > 0 && l.descuentoLinea ? Math.round((Number(l.descuentoLinea) / base) * 10000) / 100 : 0;
      const ivaPct =
        l.valorNeto && Number(l.valorNeto) > 0 && l.impuesto
          ? Math.round((Number(l.impuesto) / Number(l.valorNeto)) * 10000) / 100
          : null;
      return {
        itemRowId: l.itemRowId,
        referencia: l.referencia?.trim() || null,
        descripcion: l.descripcion?.trim() || null,
        cantidad,
        precioUnitario,
        descuentoPct,
        ivaPct,
      };
    }),
  };
}

export interface LineaPedidoSiesa {
  lineaRowId: number;
  itemRowId: number;
  referencia: string | null;
  descripcion: string | null;
  cantidadPedida: number;
  cantidadRemisionada: number;
  cantidadFacturada: number;
  cantidadPendiente: number;
  precioUnitario: number;
  descuentoLinea: number;
  descuentoGlobal: number;
  impuesto: number;
  valorNeto: number;
}

/**
 * Líneas de UN pedido — SIEMPRE unidas contra t430 filtrando por
 * (ciaId, clienteRowId) además del pedidoRowId pedido: esto es lo que
 * impide el IDOR de "conozco un pedidoRowId de otro cliente/tenant y lo
 * pido igual" — si el pedido no es de ese cliente en esa compañía, el join
 * no devuelve filas, nunca un error revelador (mismo 404 silencioso que ya
 * usa el resto del sistema para IDOR).
 */
export async function leerLineasPedidoClienteSiesa(
  ciaId: number,
  clienteRowId: number,
  pedidoRowId: number,
): Promise<LineaPedidoSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId)
    .input("pedidoRowId", pedidoRowId).query<{
    lineaRowId: number;
    itemRowId: number;
    referencia: string | null;
    descripcion: string | null;
    cantidadPedida: number;
    cantidadRemisionada: number;
    cantidadFacturada: number;
    precioUnitario: number;
    descuentoLinea: number;
    descuentoGlobal: number;
    impuesto: number;
    valorNeto: number;
  }>(`
    SELECT
      m.f431_rowid AS lineaRowId,
      m.f431_rowid_item_ext AS itemRowId,
      it.f120_referencia AS referencia,
      it.f120_descripcion AS descripcion,
      m.f431_cant1_pedida AS cantidadPedida,
      m.f431_cant1_remisionada AS cantidadRemisionada,
      m.f431_cant1_facturada AS cantidadFacturada,
      m.f431_precio_unitario_base AS precioUnitario,
      m.f431_vlr_dscto_linea AS descuentoLinea,
      m.f431_vlr_dscto_global AS descuentoGlobal,
      m.f431_vlr_imp AS impuesto,
      m.f431_vlr_neto AS valorNeto
    FROM t431_cm_pv_movto m
    INNER JOIN t430_cm_pv_docto d
      ON d.f430_rowid = m.f431_rowid_pv_docto
      AND d.f430_id_cia = @ciaId
      AND d.f430_rowid_tercero_fact = @clienteRowId
    LEFT JOIN t120_mc_items it ON it.f120_rowid = m.f431_rowid_item_ext
    WHERE m.f431_id_cia = @ciaId AND m.f431_rowid_pv_docto = @pedidoRowId
    ORDER BY m.f431_rowid
  `);

  return recordset.map((r) => ({
    lineaRowId: r.lineaRowId,
    itemRowId: r.itemRowId,
    referencia: r.referencia?.trim() || null,
    descripcion: r.descripcion?.trim() || null,
    cantidadPedida: Number(r.cantidadPedida ?? 0),
    cantidadRemisionada: Number(r.cantidadRemisionada ?? 0),
    cantidadFacturada: Number(r.cantidadFacturada ?? 0),
    cantidadPendiente: Math.max(0, Number(r.cantidadPedida ?? 0) - Number(r.cantidadRemisionada ?? 0)),
    precioUnitario: Number(r.precioUnitario ?? 0),
    descuentoLinea: Number(r.descuentoLinea ?? 0),
    descuentoGlobal: Number(r.descuentoGlobal ?? 0),
    impuesto: Number(r.impuesto ?? 0),
    valorNeto: Number(r.valorNeto ?? 0),
  }));
}

export interface RemisionDeLineaSiesa {
  lineaRowId: number;
  remisionRowId: number | null;
  fechaRemision: Date | null;
  cantidad: number | null;
  facturaRowId: number | null;
}

/**
 * Trazabilidad línea de pedido -> remisiones parciales -> factura, en UNA
 * sola consulta (no N+1 por línea) — confirmado con datos reales que una
 * línea puede tener muchas remisiones parciales (caso real: 21 remisiones
 * para una sola línea). Mismo criterio de seguridad que arriba: unido contra
 * t430 por (ciaId, clienteRowId, pedidoRowId).
 */
export async function leerTrazabilidadPedidoClienteSiesa(
  ciaId: number,
  clienteRowId: number,
  pedidoRowId: number,
): Promise<RemisionDeLineaSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId)
    .input("pedidoRowId", pedidoRowId).query<{
    lineaRowId: number;
    remisionRowId: number | null;
    fechaRemision: Date | null;
    cantidad: number | null;
    facturaRowId: number | null;
  }>(`
    SELECT
      m.f431_rowid AS lineaRowId,
      t.f470_rowid_docto AS remisionRowId,
      r.f460_id_fecha AS fechaRemision,
      t.f470_cant_base AS cantidad,
      r.f460_rowid_docto_factura AS facturaRowId
    FROM t431_cm_pv_movto m
    INNER JOIN t430_cm_pv_docto d
      ON d.f430_rowid = m.f431_rowid_pv_docto
      AND d.f430_id_cia = @ciaId
      AND d.f430_rowid_tercero_fact = @clienteRowId
    LEFT JOIN t470_cm_movto_invent t ON t.f470_rowid_pv_movto = m.f431_rowid AND t.f470_id_cia = @ciaId
    LEFT JOIN t460_cm_docto_remision_venta r ON r.f460_rowid_docto = t.f470_rowid_docto
    WHERE m.f431_id_cia = @ciaId AND m.f431_rowid_pv_docto = @pedidoRowId
    ORDER BY m.f431_rowid, r.f460_id_fecha
  `);

  return recordset.map((r) => ({
    lineaRowId: r.lineaRowId,
    remisionRowId: r.remisionRowId,
    fechaRemision: r.fechaRemision,
    cantidad: r.cantidad !== null ? Number(r.cantidad) : null,
    facturaRowId: r.facturaRowId,
  }));
}
