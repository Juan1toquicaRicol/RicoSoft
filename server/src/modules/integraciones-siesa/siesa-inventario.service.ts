import { getSiesaPool } from "../../config/siesa";
import {
  determinarEstadoPedidoVentaSiesa,
  type EstadoPedidoVentaSiesa,
} from "../../lib/pedidos-venta-siesa";

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
  /** Código visible de la bodega en Siesa (f150_id, ej. "023") — distinto
   * del bodegaRowId interno, es el número que el usuario reconoce. */
  codigo: string;
  nombre: string;
}

export async function leerBodegasSiesa(ciaId: number): Promise<BodegaSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).query<{
    bodegaRowId: number;
    codigo: string | null;
    nombre: string | null;
  }>(`
    SELECT f150_rowid AS bodegaRowId, f150_id AS codigo, f150_descripcion AS nombre
    FROM t150_mc_bodegas
    WHERE f150_id_cia = @ciaId
    ORDER BY f150_id
  `);
  return recordset.map((r) => ({
    bodegaRowId: r.bodegaRowId,
    codigo: r.codigo?.trim() || String(r.bodegaRowId),
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
  const { recordset } = await pool.request().input("ciaId", ciaId).input("bodegaRowId", bodegaRowId)
    .query<{
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
export interface ItemMaestroSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  esVendible: boolean;
  naturaleza: NaturalezaInventario;
}

/**
 * Listado PAGINADO del maestro de ítems (t120_mc_items) — a diferencia de
 * buscarItemsSiesa (autocompletado, exige búsqueda, tope fijo de
 * resultados), esta función sirve la pantalla administrativa de
 * clasificación funcional: necesita poder listar el catálogo completo
 * (miles de ítems, ver ExistenciaItemSiesa) sin descargarlo todo al
 * navegador. `search` es opcional aquí (sin él, pagina el catálogo
 * completo); mismo criterio de naturaleza ya verificado en
 * leerExistenciasSiesa, reutilizado tal cual. Excluye servicios y
 * repuestos (tipo=2/3) — esta pantalla es para clasificar materia
 * prima/mercancía física (resinas, masterbatch, insumos), no fletes ni
 * tornillos.
 */
export async function listarItemsMaestroSiesa(
  ciaId: number,
  opciones: {
    search?: string;
    page: number;
    pageSize: number;
    /**
     * Filtro opcional por itemRowId, resuelto de antemano en RicoSoft (p.
     * ej. "solo los ítems ya clasificados con X" o "excluye los ya
     * clasificados"). Se traduce a IN/NOT IN en SQL para que el filtrado y
     * la paginación ocurran en Siesa en vez de traer el catálogo completo a
     * Node — ver listarItemsConClasificacion en item-clasificaciones.controller.ts.
     * Con listas muy grandes (más de LIMITE_IDS_EN_CLAUSULA) el llamador
     * debe usar otra estrategia: SQL Server limita a ~2100 parámetros por
     * consulta.
     */
    itemRowIdsFiltro?: { modo: "incluir" | "excluir"; ids: number[] };
  },
): Promise<{ items: ItemMaestroSiesa[]; total: number }> {
  const pool = await getSiesaPool();
  const condicionBusqueda = opciones.search
    ? "AND (f120_descripcion LIKE @search OR f120_referencia LIKE @search)"
    : "";

  const filtro = opciones.itemRowIdsFiltro;
  let condicionIds = "";
  if (filtro) {
    if (filtro.ids.length === 0) {
      // IN () vacío nunca matchea nada; NOT IN () de una lista vacía
      // matchea todo — ambos son válidos como constante SQL, sin parámetros.
      condicionIds = filtro.modo === "incluir" ? "AND 1 = 0" : "";
    } else {
      const parametros = filtro.ids.map((_, i) => `@id${i}`).join(", ");
      condicionIds = `AND f120_rowid ${filtro.modo === "incluir" ? "IN" : "NOT IN"} (${parametros})`;
    }
  }

  const requestBase = () => {
    const req = pool.request().input("ciaId", ciaId);
    if (opciones.search) req.input("search", `%${opciones.search}%`);
    if (filtro) filtro.ids.forEach((id, i) => req.input(`id${i}`, id));
    return req;
  };

  // Esta pantalla es para clasificar materia prima/mercancía física
  // (resinas, masterbatch, insumos) — se excluyen tipo=2 (servicios reales:
  // FLETE, BODEGAJE) y tipo=3 (repuestos reales: tornillos), verificados en
  // vivo (ver comentario de clasificarNaturaleza más arriba). No se filtra
  // por esVendible: tanto "producto" como "insumo" deben poder clasificarse.
  const condicionNaturaleza = "AND ISNULL(f120_ind_tipo_item, 1) NOT IN (2, 3)";

  const [itemsResult, totalResult] = await Promise.all([
    requestBase()
      .input("skip", (opciones.page - 1) * opciones.pageSize)
      .input("take", opciones.pageSize).query<{
      itemRowId: number;
      descripcion: string | null;
      referencia: string | null;
      unidadMedida: string | null;
      indVenta: number | null;
      tipoItem: number | null;
    }>(`
      SELECT
        f120_rowid AS itemRowId,
        f120_descripcion AS descripcion,
        f120_referencia AS referencia,
        LTRIM(RTRIM(f120_id_unidad_inventario)) AS unidadMedida,
        f120_ind_venta AS indVenta,
        f120_ind_tipo_item AS tipoItem
      FROM t120_mc_items
      WHERE f120_id_cia = @ciaId ${condicionBusqueda} ${condicionIds} ${condicionNaturaleza}
      ORDER BY f120_descripcion
      OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
    `),
    requestBase().query<{ n: number }>(`
      SELECT COUNT(*) AS n FROM t120_mc_items
      WHERE f120_id_cia = @ciaId ${condicionBusqueda} ${condicionIds} ${condicionNaturaleza}
    `),
  ]);

  const items = itemsResult.recordset.map((r) => {
    const esVendible = r.indVenta !== 0;
    return {
      itemRowId: r.itemRowId,
      descripcion: r.descripcion?.trim() || null,
      referencia: r.referencia?.trim() || null,
      unidadMedida: r.unidadMedida?.trim() || null,
      esVendible,
      naturaleza: clasificarNaturaleza(r.tipoItem, esVendible),
    };
  });

  return { items, total: totalResult.recordset[0]?.n ?? 0 };
}

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

/**
 * Detalle de pedidos de venta que generan el "Comprometido (estimado)" de
 * un ítem — origen real verificado en vivo de f400_cant_comprometida_1
 * (ver auditoría cerrada: t431_cm_pv_movto.f431_cant1_comprometida
 * coincide en 99,5% de las unidades comprometidas de t400 para cia 1,
 * agrupando por ítem+bodega; el 0,5% restante es una discrepancia real sin
 * explicación identificada, no se fuerza a cuadrar). Un solo SELECT
 * parametrizado, sin N+1. Cliente resuelto vía t200_mm_terceros (misma
 * tabla y patrón de join que siesa-ventas.service.ts) priorizando
 * f430_rowid_tercero_fact sobre f430_rowid_tercero_rem cuando ambos
 * existen.
 */
export interface PedidoComprometidoSiesa {
  pvDoctoRowId: number;
  numeroDocumento: number;
  tipoDocto: number | null;
  clienteRowId: number | null;
  clienteNombre: string | null;
  itemRowId: number;
  referencia: string | null;
  descripcion: string | null;
  cantidadPedida: number;
  cantidadComprometida: number;
  cantidadRemisionada: number;
  cantidadFacturada: number;
  fechaPedido: Date | null;
  fechaEntrega: Date | null;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  estado: EstadoPedidoVentaSiesa;
  /** Estado crudo de la línea (t431.f431_ind_estado) — dato técnico, se
   * expone junto al `estado` interpretado para la vista de "todos los
   * detalles" que no quiere ocultar nada. */
  indEstadoLinea: number | null;
  /** Estado crudo del documento (t430.f430_ind_estado). */
  indEstadoDocto: number | null;
  /** Flags individuales — mismos que ya alimentan `determinarEstadoPedidoVentaSiesa`,
   * expuestos aparte porque la vista de detalle completo debe poder mostrar
   * cada uno por separado, no solo la etiqueta ya interpretada. */
  indUltEstadoAprobado: boolean | null;
  indBackorderDocto: boolean | null;
  indBackorderLinea: boolean | null;
  indRetenidoMargen: boolean | null;
  indRetenidoCupo: boolean | null;
  indRetenidoMora: boolean | null;
  indRetenidoBloqueo: boolean | null;
  indRetenidoAnticipo: boolean | null;
  indRemisionado: boolean | null;
  indFacturado: boolean | null;
}

export async function leerPedidosComprometidosSiesa(
  ciaId: number,
  itemRowId?: number,
): Promise<PedidoComprometidoSiesa[]> {
  const pool = await getSiesaPool();
  const request = pool.request().input("ciaId", ciaId);
  if (itemRowId !== undefined) request.input("itemRowId", itemRowId);
  const { recordset } = await request.query<{
    pvDoctoRowId: number;
    numeroDocumento: number;
    tipoDocto: number | null;
    clienteRowId: number | null;
    clienteNombre: string | null;
    itemRowId: number;
    referencia: string | null;
    descripcion: string | null;
    cantidadPedida: number;
    cantidadComprometida: number;
    cantidadRemisionada: number;
    cantidadFacturada: number;
    fechaPedido: Date | null;
    fechaEntrega: Date | null;
    vendedorRowId: number | null;
    vendedorNombre: string | null;
    indEstadoLinea: number | null;
    indEstadoDocto: number | null;
    indUltEstadoAprobado: boolean | null;
    indBackorderDocto: boolean | null;
    indBackorderLinea: boolean | null;
    indRetenidoMargen: boolean | null;
    indRetenidoCupo: boolean | null;
    indRetenidoMora: boolean | null;
    indRetenidoBloqueo: boolean | null;
    indRetenidoAnticipo: boolean | null;
    indRemisionado: boolean | null;
    indFacturado: boolean | null;
  }>(`
    SELECT
      t430.f430_rowid AS pvDoctoRowId,
      t430.f430_consec_docto AS numeroDocumento,
      t430.f430_id_tipo_docto AS tipoDocto,
      COALESCE(t430.f430_rowid_tercero_fact, t430.f430_rowid_tercero_rem) AS clienteRowId,
      COALESCE(tcf.f200_razon_social, tcr.f200_razon_social) AS clienteNombre,
      t431.f431_rowid_item_ext AS itemRowId,
      it.f120_referencia AS referencia,
      it.f120_descripcion AS descripcion,
      t431.f431_cant1_pedida AS cantidadPedida,
      t431.f431_cant1_comprometida AS cantidadComprometida,
      t431.f431_cant1_remisionada AS cantidadRemisionada,
      t431.f431_cant1_facturada AS cantidadFacturada,
      t430.f430_id_fecha AS fechaPedido,
      t431.f431_fecha_entrega AS fechaEntrega,
      COALESCE(t431.f431_rowid_tercero_vendedor, t430.f430_rowid_tercero_vendedor) AS vendedorRowId,
      COALESCE(tvl.f200_razon_social, tvd.f200_razon_social) AS vendedorNombre,
      t431.f431_ind_estado AS indEstadoLinea,
      t430.f430_ind_estado AS indEstadoDocto,
      t430.f430_ind_ult_estado_aprobado AS indUltEstadoAprobado,
      t430.f430_ind_backorder AS indBackorderDocto,
      t431.f431_ind_backorder AS indBackorderLinea,
      t430.f430_ind_retenido_margen AS indRetenidoMargen,
      t430.f430_ind_retenido_cupo AS indRetenidoCupo,
      t430.f430_ind_retenido_mora AS indRetenidoMora,
      t430.f430_ind_retenido_bloqueo AS indRetenidoBloqueo,
      t430.f430_ind_retenido_anticipo AS indRetenidoAnticipo,
      t430.f430_ind_remisionado AS indRemisionado,
      t430.f430_ind_facturado AS indFacturado
    FROM t431_cm_pv_movto t431
    INNER JOIN t430_cm_pv_docto t430 ON t430.f430_rowid = t431.f431_rowid_pv_docto
    LEFT JOIN t120_mc_items it ON it.f120_rowid = t431.f431_rowid_item_ext
    LEFT JOIN t200_mm_terceros tcf ON tcf.f200_rowid = t430.f430_rowid_tercero_fact
    LEFT JOIN t200_mm_terceros tcr ON tcr.f200_rowid = t430.f430_rowid_tercero_rem
    LEFT JOIN t200_mm_terceros tvl ON tvl.f200_rowid = t431.f431_rowid_tercero_vendedor
    LEFT JOIN t200_mm_terceros tvd ON tvd.f200_rowid = t430.f430_rowid_tercero_vendedor
    WHERE t431.f431_id_cia = @ciaId
      ${itemRowId !== undefined ? "AND t431.f431_rowid_item_ext = @itemRowId" : ""}
      AND t431.f431_cant1_comprometida > 0
    ORDER BY t430.f430_id_fecha DESC
  `);

  return recordset.map((r) => ({
    pvDoctoRowId: r.pvDoctoRowId,
    numeroDocumento: r.numeroDocumento,
    tipoDocto: r.tipoDocto,
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre?.trim() || null,
    itemRowId: r.itemRowId,
    referencia: r.referencia?.trim() || null,
    descripcion: r.descripcion?.trim() || null,
    cantidadPedida: Number(r.cantidadPedida ?? 0),
    cantidadComprometida: Number(r.cantidadComprometida ?? 0),
    cantidadRemisionada: Number(r.cantidadRemisionada ?? 0),
    cantidadFacturada: Number(r.cantidadFacturada ?? 0),
    fechaPedido: r.fechaPedido,
    fechaEntrega: r.fechaEntrega,
    vendedorRowId: r.vendedorRowId,
    vendedorNombre: r.vendedorNombre?.trim() || null,
    indEstadoLinea: r.indEstadoLinea,
    indEstadoDocto: r.indEstadoDocto,
    indUltEstadoAprobado: r.indUltEstadoAprobado,
    indBackorderDocto: r.indBackorderDocto,
    indBackorderLinea: r.indBackorderLinea,
    indRetenidoMargen: r.indRetenidoMargen,
    indRetenidoCupo: r.indRetenidoCupo,
    indRetenidoMora: r.indRetenidoMora,
    indRetenidoBloqueo: r.indRetenidoBloqueo,
    indRetenidoAnticipo: r.indRetenidoAnticipo,
    indRemisionado: r.indRemisionado,
    indFacturado: r.indFacturado,
    estado: determinarEstadoPedidoVentaSiesa({
      indUltEstadoAprobado: r.indUltEstadoAprobado,
      indBackorderDocto: r.indBackorderDocto,
      indBackorderLinea: r.indBackorderLinea,
      indRetenidoMargen: r.indRetenidoMargen,
      indRetenidoCupo: r.indRetenidoCupo,
      indRetenidoMora: r.indRetenidoMora,
      indRetenidoBloqueo: r.indRetenidoBloqueo,
      indRetenidoAnticipo: r.indRetenidoAnticipo,
      indRemisionado: r.indRemisionado,
      indFacturado: r.indFacturado,
      cantPedida: Number(r.cantidadPedida ?? 0),
      cantRemisionada: Number(r.cantidadRemisionada ?? 0),
      cantFacturada: Number(r.cantidadFacturada ?? 0),
    }),
  }));
}
