import { getSiesaPool } from "../../config/siesa";

/**
 * Lectura de ventas reales desde Siesa/UnoEE (t461_cm_docto_factura_venta —
 * confirmado en vivo: 85.661 documentos desde 2013, columnas de valor bruto/
 * descuento/neto/cxc ya calculadas por Siesa a nivel de encabezado). Solo
 * lectura, igual que la sincronización de proveedores — nunca se escribe
 * nada en Siesa. A diferencia de Proveedores, las ventas NO se copian a la
 * base de RicoSoft: el volumen (decenas de miles de documentos) es
 * perfectamente agregable en el momento con GROUP BY en SQL Server, así que
 * se consulta en vivo cada vez que gerencia pide el dashboard, en vez de
 * mantener una copia que podría desincronizarse.
 *
 * Identidad del cliente: t461_rowid_tercero_fact referencia
 * t200_mm_terceros.f200_rowid — la MISMA tabla de terceros ya usada por la
 * sincronización de Proveedores (t200_mm_terceros), así que el join es
 * idéntico en espíritu al que ya existe en siesa-sync.service.ts.
 *
 * IVA: a petición explícita de negocio, ninguna cifra de este módulo incluye
 * impuesto. "neto" en todas las funciones de este archivo se calcula como
 * (bruto - descuento) — el valor de la venta antes de IVA — NUNCA como
 * f461_vlr_neto (que Siesa sí calcula con IVA incluido). El campo
 * f461_vlr_imp no se consulta en ningún punto de este archivo.
 */

export interface VentaMensualSiesa {
  anio: number;
  mes: number;
  bruto: number;
  dscto: number;
  /** bruto - dscto, SIN IVA (ver nota de cabecera del archivo). */
  neto: number;
  documentos: number;
}

export interface TopClienteVentaSiesa {
  clienteRowId: number | null;
  clienteNombre: string | null;
  clienteNit: string | null;
  neto: number;
  documentos: number;
}

/**
 * Serie mensual de ventas para una compañía, desde `desde` (inclusive) hasta
 * hoy, agregada en SQL Server (GROUP BY año/mes) — nunca se traen las filas
 * de detalle a Node para esto.
 */
export async function leerVentasMensualesSiesa(
  ciaId: number,
  desde: Date,
): Promise<VentaMensualSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).input("desde", desde).query<{
    anio: number;
    mes: number;
    bruto: number;
    dscto: number;
    neto: number;
    documentos: number;
  }>(`
    SELECT
      YEAR(f461_id_fecha) AS anio,
      MONTH(f461_id_fecha) AS mes,
      SUM(f461_vlr_bruto) AS bruto,
      SUM(f461_vlr_dscto) AS dscto,
      SUM(f461_vlr_bruto - f461_vlr_dscto) AS neto,
      COUNT(*) AS documentos
    FROM t461_cm_docto_factura_venta
    WHERE f461_id_cia = @ciaId AND f461_id_fecha >= @desde
    GROUP BY YEAR(f461_id_fecha), MONTH(f461_id_fecha)
    ORDER BY anio, mes
  `);
  return recordset.map((r) => ({
    anio: r.anio,
    mes: r.mes,
    bruto: Number(r.bruto ?? 0),
    dscto: Number(r.dscto ?? 0),
    neto: Number(r.neto ?? 0),
    documentos: r.documentos,
  }));
}

/** Top N clientes por valor vendido (sin IVA), dentro de un rango de fechas [desde, hasta). */
export async function leerTopClientesVentaSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
  limite = 5,
): Promise<TopClienteVentaSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("desde", desde)
    .input("hasta", hasta)
    .input("limite", limite).query<{
    clienteRowId: number | null;
    clienteNombre: string | null;
    clienteNit: string | null;
    neto: number;
    documentos: number;
  }>(`
    SELECT TOP (@limite)
      f.f461_rowid_tercero_fact AS clienteRowId,
      tc.f200_razon_social AS clienteNombre,
      tc.f200_nit AS clienteNit,
      SUM(f.f461_vlr_bruto - f.f461_vlr_dscto) AS neto,
      COUNT(*) AS documentos
    FROM t461_cm_docto_factura_venta f
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = f.f461_rowid_tercero_fact
    WHERE f.f461_id_cia = @ciaId AND f.f461_id_fecha >= @desde AND f.f461_id_fecha < @hasta
    GROUP BY f.f461_rowid_tercero_fact, tc.f200_razon_social, tc.f200_nit
    ORDER BY SUM(f.f461_vlr_bruto - f.f461_vlr_dscto) DESC
  `);
  return recordset.map((r) => ({
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre,
    clienteNit: r.clienteNit,
    neto: Number(r.neto ?? 0),
    documentos: r.documentos,
  }));
}

export interface TopProductoKilosSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  kilos: number;
  /** bruto - dscto, SIN IVA. */
  neto: number;
  costo: number;
  margen: number;
}

/**
 * Top N productos por kilos vendidos, dentro de [desde, hasta). Fuente:
 * v470_ventas — vista de detalle de línea (confirmada en vivo: 800.936
 * filas), NO las tablas t448/t449/t446/t447_cm_*_item (confirmadas vacías,
 * 0 filas, en las 3 compañías reales). v470_ventas mezcla líneas de venta
 * real con movimientos internos de almacén/traslado (que traen
 * v470_rowid_docto_fact NULO y valores en 0); el filtro
 * "v470_rowid_docto_fact IS NOT NULL" aísla las líneas de venta genuinas —
 * verificado en vivo contra un documento real de t461 (factura 782081):
 * la línea de v470 correspondiente reconcilia exactamente
 * (bruto 1.700.000 - costo 950.564,5 = utilidad_prom 749.435,5).
 * Solo se suman líneas en kilogramos (v470_id_unidad_medida = 'KG'): mezclar
 * con líneas en otras unidades (ej. 'UNID') daría un total de "kilos" sin
 * sentido físico.
 */
export async function leerTopProductosVentaKilosSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
  limite = 10,
): Promise<TopProductoKilosSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("desde", desde)
    .input("hasta", hasta)
    .input("limite", limite).query<{
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    kilos: number;
    neto: number;
    costo: number;
    margen: number;
  }>(`
    SELECT TOP (@limite)
      v.v470_rowid_item_ext AS itemRowId,
      MAX(it.f120_descripcion) AS descripcion,
      MAX(it.f120_referencia) AS referencia,
      SUM(v.v470_cant_base) AS kilos,
      SUM(v.v470_vlr_bruto - ISNULL(v.v470_vlr_dscto_linea, 0) - ISNULL(v.v470_vlr_dscto_global, 0)) AS neto,
      SUM(v.v470_costo_prom_tot) AS costo,
      SUM(v.v470_utilidad_prom) AS margen
    FROM v470_ventas v
    LEFT JOIN t120_mc_items it ON it.f120_rowid = v.v470_rowid_item_ext
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde AND v.v470_id_fecha < @hasta
      AND LTRIM(RTRIM(v.v470_id_unidad_medida)) = 'KG'
    GROUP BY v.v470_rowid_item_ext
    ORDER BY SUM(v.v470_cant_base) DESC
  `);
  return recordset.map((r) => ({
    itemRowId: r.itemRowId,
    descripcion: r.descripcion?.trim() || null,
    referencia: r.referencia?.trim() || null,
    kilos: Number(r.kilos ?? 0),
    neto: Number(r.neto ?? 0),
    costo: Number(r.costo ?? 0),
    margen: Number(r.margen ?? 0),
  }));
}

export interface VentaMensualProductoSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  anio: number;
  mes: number;
  cantidad: number;
}

/**
 * Cantidad vendida por producto y por mes, desde `desde` hasta hoy — base
 * para el pronóstico de demanda (venta promedio, tendencia, irregularidad,
 * pérdida de rotación — ver calcularPronosticoDemandaSiesa en
 * lib/demanda-siesa.ts). Verificado en vivo: ningún ítem (0 de 420
 * revisados, cia 1, 12 meses) se vende en más de una unidad de medida
 * distinta — sumar v470_cant_base por ítem es seguro, no mezcla kilos con
 * unidades para el mismo producto.
 */
export async function leerVentasMensualesPorProductoSiesa(
  ciaId: number,
  desde: Date,
): Promise<VentaMensualProductoSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).input("desde", desde).query<{
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    unidadMedida: string | null;
    anio: number;
    mes: number;
    cantidad: number;
  }>(`
    SELECT
      v.v470_rowid_item_ext AS itemRowId,
      MAX(it.f120_descripcion) AS descripcion,
      MAX(it.f120_referencia) AS referencia,
      MAX(LTRIM(RTRIM(v.v470_id_unidad_medida))) AS unidadMedida,
      YEAR(v.v470_id_fecha) AS anio,
      MONTH(v.v470_id_fecha) AS mes,
      SUM(v.v470_cant_base) AS cantidad
    FROM v470_ventas v
    LEFT JOIN t120_mc_items it ON it.f120_rowid = v.v470_rowid_item_ext
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde
    GROUP BY v.v470_rowid_item_ext, YEAR(v.v470_id_fecha), MONTH(v.v470_id_fecha)
  `);
  return recordset.map((r) => ({
    itemRowId: r.itemRowId,
    descripcion: r.descripcion?.trim() || null,
    referencia: r.referencia?.trim() || null,
    unidadMedida: r.unidadMedida?.trim() || null,
    anio: r.anio,
    mes: r.mes,
    cantidad: Number(r.cantidad ?? 0),
  }));
}

export interface VentaProductoRangoSiesa {
  itemRowId: number;
  cantidad: number;
  neto: number;
}

/**
 * Cantidad + neto vendidos por producto dentro de un rango de fechas
 * arbitrario [desde, hasta) — Fase 3 del motor de demanda (ventanas de 30/
 * 90/180 días). Mismo filtro y misma fuente ya verificados en vivo para
 * leerVentasMensualesPorProductoSiesa (v470_ventas, v470_rowid_docto_fact
 * IS NOT NULL para excluir movimientos internos de almacén/traslado que no
 * son ventas reales) — esta función solo cambia la agregación de
 * mes-calendario a un rango de días exacto, para poder calcular ventanas
 * móviles (30/90/180 días) sin duplicar la consulta mensual.
 */
export async function leerVentasPorProductoEnRangoSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
): Promise<VentaProductoRangoSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("desde", desde)
    .input("hasta", hasta).query<{
    itemRowId: number;
    cantidad: number;
    neto: number;
  }>(`
    SELECT
      v.v470_rowid_item_ext AS itemRowId,
      SUM(v.v470_cant_base) AS cantidad,
      SUM(v.v470_vlr_bruto - ISNULL(v.v470_vlr_dscto_linea, 0) - ISNULL(v.v470_vlr_dscto_global, 0)) AS neto
    FROM v470_ventas v
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde AND v.v470_id_fecha < @hasta
    GROUP BY v.v470_rowid_item_ext
  `);
  return recordset.map((r) => ({
    itemRowId: r.itemRowId,
    cantidad: Number(r.cantidad ?? 0),
    neto: Number(r.neto ?? 0),
  }));
}

export interface TopClienteMargenSiesa {
  clienteRowId: number | null;
  clienteNombre: string | null;
  neto: number;
  costo: number;
  margen: number;
}

/**
 * Top N clientes por margen/utilidad real (no por valor vendido), dentro de
 * [desde, hasta). Fuente: v470_ventas (línea de detalle, con costo/margen
 * reales) unida a t461_cm_docto_factura_venta para resolver el cliente —
 * v470_ventas no trae el tercero directamente. Join verificado en vivo:
 * 100% de cobertura (29/29 líneas del mes actual, cia 1) contra t461, y los
 * montos reconcilian exactamente (neto - costo = margen, fila por fila).
 */
export async function leerTopClientesPorMargenSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
  limite = 5,
): Promise<TopClienteMargenSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("desde", desde)
    .input("hasta", hasta)
    .input("limite", limite).query<{
    clienteRowId: number | null;
    clienteNombre: string | null;
    neto: number;
    costo: number;
    margen: number;
  }>(`
    SELECT TOP (@limite)
      f.f461_rowid_tercero_fact AS clienteRowId,
      MAX(tc.f200_razon_social) AS clienteNombre,
      SUM(v.v470_vlr_bruto - ISNULL(v.v470_vlr_dscto_linea, 0) - ISNULL(v.v470_vlr_dscto_global, 0)) AS neto,
      SUM(v.v470_costo_prom_tot) AS costo,
      SUM(v.v470_utilidad_prom) AS margen
    FROM v470_ventas v
    INNER JOIN t461_cm_docto_factura_venta f
      ON f.f461_rowid_docto = v.v470_rowid_docto_fact AND f.f461_id_cia = v.v470_id_cia
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = f.f461_rowid_tercero_fact
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde AND v.v470_id_fecha < @hasta
    GROUP BY f.f461_rowid_tercero_fact
    ORDER BY SUM(v.v470_utilidad_prom) DESC
  `);
  return recordset.map((r) => ({
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre,
    neto: Number(r.neto ?? 0),
    costo: Number(r.costo ?? 0),
    margen: Number(r.margen ?? 0),
  }));
}

export interface TopVendedorMargenSiesa {
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  neto: number;
  costo: number;
  margen: number;
}

/**
 * Top N vendedores por margen/utilidad real (no por valor vendido), dentro
 * de [desde, hasta). Mismo patrón y mismo join ya verificado que
 * leerTopClientesPorMargenSiesa — solo cambia el tercero que se agrupa
 * (f461_rowid_tercero_vendedor en vez de f461_rowid_tercero_fact).
 */
export async function leerTopVendedoresPorMargenSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
  limite = 10,
): Promise<TopVendedorMargenSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("desde", desde)
    .input("hasta", hasta)
    .input("limite", limite).query<{
    vendedorRowId: number | null;
    vendedorNombre: string | null;
    neto: number;
    costo: number;
    margen: number;
  }>(`
    SELECT TOP (@limite)
      f.f461_rowid_tercero_vendedor AS vendedorRowId,
      MAX(tv.f200_razon_social) AS vendedorNombre,
      SUM(v.v470_vlr_bruto - ISNULL(v.v470_vlr_dscto_linea, 0) - ISNULL(v.v470_vlr_dscto_global, 0)) AS neto,
      SUM(v.v470_costo_prom_tot) AS costo,
      SUM(v.v470_utilidad_prom) AS margen
    FROM v470_ventas v
    INNER JOIN t461_cm_docto_factura_venta f
      ON f.f461_rowid_docto = v.v470_rowid_docto_fact AND f.f461_id_cia = v.v470_id_cia
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = f.f461_rowid_tercero_vendedor
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde AND v.v470_id_fecha < @hasta
    GROUP BY f.f461_rowid_tercero_vendedor
    ORDER BY SUM(v.v470_utilidad_prom) DESC
  `);
  return recordset.map((r) => ({
    vendedorRowId: r.vendedorRowId,
    vendedorNombre: r.vendedorNombre,
    neto: Number(r.neto ?? 0),
    costo: Number(r.costo ?? 0),
    margen: Number(r.margen ?? 0),
  }));
}

export interface ActividadMensualClienteSiesa {
  clienteRowId: number | null;
  clienteNombre: string | null;
  anio: number;
  mes: number;
  neto: number;
}

/**
 * Venta neta por cliente y por mes, desde `desde` hasta hoy — usada para
 * detectar alertas comerciales (clientes recurrentes que dejaron de comprar,
 * caídas fuertes mes a mes en clientes top). Agregado en SQL Server; el
 * cálculo de qué cuenta como "recurrente" o "caída" es responsabilidad de
 * calcularAlertasComercialesSiesa (función pura, en lib/ventas-siesa.ts).
 */
export async function leerActividadMensualClientesSiesa(
  ciaId: number,
  desde: Date,
): Promise<ActividadMensualClienteSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).input("desde", desde).query<{
    clienteRowId: number | null;
    clienteNombre: string | null;
    anio: number;
    mes: number;
    neto: number;
  }>(`
    SELECT
      f.f461_rowid_tercero_fact AS clienteRowId,
      MAX(tc.f200_razon_social) AS clienteNombre,
      YEAR(f.f461_id_fecha) AS anio,
      MONTH(f.f461_id_fecha) AS mes,
      SUM(f.f461_vlr_bruto - f.f461_vlr_dscto) AS neto
    FROM t461_cm_docto_factura_venta f
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = f.f461_rowid_tercero_fact
    WHERE f.f461_id_cia = @ciaId AND f.f461_id_fecha >= @desde
    GROUP BY f.f461_rowid_tercero_fact, YEAR(f.f461_id_fecha), MONTH(f.f461_id_fecha)
  `);
  return recordset.map((r) => ({
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre,
    anio: r.anio,
    mes: r.mes,
    neto: Number(r.neto ?? 0),
  }));
}

export interface ActividadMensualKilosClienteSiesa {
  clienteRowId: number | null;
  anio: number;
  mes: number;
  kilos: number;
}

/**
 * Kilos vendidos por cliente y por mes, desde `desde` hasta hoy. Fuente:
 * v470_ventas (línea de detalle) unida a t461 para resolver el cliente —
 * mismo patrón y mismas garantías ya verificadas en
 * leerTopClientesPorMargenSiesa. Solo se suman líneas en KG (mismo criterio
 * que leerTopProductosVentaKilosSiesa): mezclar con líneas en otras
 * unidades (ej. 'UNID') no tendría sentido físico.
 */
export async function leerActividadMensualKilosClientesSiesa(
  ciaId: number,
  desde: Date,
): Promise<ActividadMensualKilosClienteSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).input("desde", desde).query<{
    clienteRowId: number | null;
    anio: number;
    mes: number;
    kilos: number;
  }>(`
    SELECT
      f.f461_rowid_tercero_fact AS clienteRowId,
      YEAR(v.v470_id_fecha) AS anio,
      MONTH(v.v470_id_fecha) AS mes,
      SUM(v.v470_cant_base) AS kilos
    FROM v470_ventas v
    INNER JOIN t461_cm_docto_factura_venta f
      ON f.f461_rowid_docto = v.v470_rowid_docto_fact AND f.f461_id_cia = v.v470_id_cia
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde
      AND LTRIM(RTRIM(v.v470_id_unidad_medida)) = 'KG'
    GROUP BY f.f461_rowid_tercero_fact, YEAR(v.v470_id_fecha), MONTH(v.v470_id_fecha)
  `);
  return recordset.map((r) => ({
    clienteRowId: r.clienteRowId,
    anio: r.anio,
    mes: r.mes,
    kilos: Number(r.kilos ?? 0),
  }));
}

export interface UltimaCompraClienteSiesa {
  clienteRowId: number | null;
  ultimaCompra: Date;
}

/**
 * Fecha de la última compra de cada cliente, dentro de [desde, hoy] —
 * ventana amplia (recomendado 12 meses) para poder calcular "días desde la
 * última compra" incluso de clientes que llevan varios meses inactivos.
 */
export async function leerUltimaCompraClientesSiesa(
  ciaId: number,
  desde: Date,
): Promise<UltimaCompraClienteSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).input("desde", desde).query<{
    clienteRowId: number | null;
    ultimaCompra: Date;
  }>(`
    SELECT f.f461_rowid_tercero_fact AS clienteRowId, MAX(f.f461_id_fecha) AS ultimaCompra
    FROM t461_cm_docto_factura_venta f
    WHERE f.f461_id_cia = @ciaId AND f.f461_id_fecha >= @desde
    GROUP BY f.f461_rowid_tercero_fact
  `);
  return recordset.map((r) => ({ clienteRowId: r.clienteRowId, ultimaCompra: r.ultimaCompra }));
}

export interface VentaDiariaVendedorSiesa {
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  /** Fecha de calendario en UTC (medianoche) — mismo criterio que f461_id_fecha. */
  dia: Date;
  neto: number;
  documentos: number;
}

/**
 * Ventas por vendedor y por día, dentro de [desde, hasta). El vendedor
 * (f461_rowid_tercero_vendedor) es un tercero más — mismo join a
 * t200_mm_terceros que ya se usa para el cliente (f461_rowid_tercero_fact).
 * Agregado en SQL Server (GROUP BY vendedor + día); el resultado es pequeño
 * (vendedores × días del rango, no el detalle de cada documento) y se
 * termina de resumir en Node (ver calcularVentasPorVendedor).
 */
export async function leerVentasDiariasPorVendedorSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
): Promise<VentaDiariaVendedorSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("desde", desde)
    .input("hasta", hasta).query<{
    vendedorRowId: number | null;
    vendedorNombre: string | null;
    dia: Date;
    neto: number;
    documentos: number;
  }>(`
    SELECT
      f.f461_rowid_tercero_vendedor AS vendedorRowId,
      tv.f200_razon_social AS vendedorNombre,
      CAST(f.f461_id_fecha AS date) AS dia,
      SUM(f.f461_vlr_bruto - f.f461_vlr_dscto) AS neto,
      COUNT(*) AS documentos
    FROM t461_cm_docto_factura_venta f
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = f.f461_rowid_tercero_vendedor
    WHERE f.f461_id_cia = @ciaId AND f.f461_id_fecha >= @desde AND f.f461_id_fecha < @hasta
    GROUP BY f.f461_rowid_tercero_vendedor, tv.f200_razon_social, CAST(f.f461_id_fecha AS date)
    ORDER BY dia ASC
  `);
  return recordset.map((r) => ({
    vendedorRowId: r.vendedorRowId,
    vendedorNombre: r.vendedorNombre,
    dia: r.dia,
    neto: Number(r.neto ?? 0),
    documentos: r.documentos,
  }));
}

export interface VentaConHoraSiesa {
  id: number;
  /** f461_ts: momento real de creación del documento en Siesa (fecha + hora). */
  hora: Date;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  clienteRowId: number | null;
  clienteNombre: string | null;
  neto: number;
}

/**
 * Detalle de ventas (documento por documento, con hora real) dentro de
 * [desde, hasta) — usado para el detalle de "hoy" en Ventas diarias por
 * vendedor. f461_id_fecha es solo fecha de calendario (medianoche UTC, sin
 * hora real — confirmado en la exploración); f461_ts sí trae hora real de
 * creación del documento, así que es la que se usa acá. El rango de fechas
 * sigue filtrando por f461_id_fecha (la fecha de negocio del documento, no
 * la de creación), para no mezclar documentos de otros días creados/
 * editados hoy.
 */
export async function leerVentasDeHoyConHoraSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
): Promise<VentaConHoraSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("desde", desde)
    .input("hasta", hasta).query<{
    id: number;
    hora: Date;
    vendedorRowId: number | null;
    vendedorNombre: string | null;
    clienteRowId: number | null;
    clienteNombre: string | null;
    neto: number;
  }>(`
    SELECT
      f.f461_rowid_docto AS id,
      f.f461_ts AS hora,
      f.f461_rowid_tercero_vendedor AS vendedorRowId,
      tv.f200_razon_social AS vendedorNombre,
      f.f461_rowid_tercero_fact AS clienteRowId,
      tc.f200_razon_social AS clienteNombre,
      (f.f461_vlr_bruto - f.f461_vlr_dscto) AS neto
    FROM t461_cm_docto_factura_venta f
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = f.f461_rowid_tercero_vendedor
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = f.f461_rowid_tercero_fact
    WHERE f.f461_id_cia = @ciaId AND f.f461_id_fecha >= @desde AND f.f461_id_fecha < @hasta
    ORDER BY f.f461_ts DESC
  `);
  return recordset.map((r) => ({
    id: r.id,
    hora: r.hora,
    vendedorRowId: r.vendedorRowId,
    vendedorNombre: r.vendedorNombre,
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre,
    neto: Number(r.neto ?? 0),
  }));
}

export interface DocumentoVentaSiesa {
  id: number;
  fecha: Date;
  referencia: string | null;
  bruto: number;
  dscto: number;
  /** bruto - dscto, SIN IVA. */
  neto: number;
  clienteRowId: number | null;
  clienteNombre: string | null;
  clienteNit: string | null;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
}

export interface FiltrosHistoricoVentas {
  ciaId: number;
  desde: Date;
  hasta: Date;
  /** Texto libre: busca por nombre/NIT de cliente o nombre de vendedor. */
  search?: string;
  /** Filtros globales de la analítica comercial (drill-down): entidad exacta, no texto libre. */
  vendedorRowId?: number;
  clienteRowId?: number;
  /** Producto: filtra por EXISTS contra v470_ventas (el producto vive a nivel de línea, no de encabezado). */
  itemRowId?: number;
}

// f461_num_docto_referencia es el único campo de referencia de texto libre
// que trae t461_cm_docto_factura_venta a nivel de encabezado — no existe un
// consecutivo de factura de venta formateado en esta tabla (ver auditoría:
// no se inventó ningún campo). Se muestra tal cual bajo "Referencia"; el
// identificador estable es f461_rowid_docto (id interno de Siesa).
//
// Exportada (no solo usada internamente) para poder probarla como función
// pura, sin depender del túnel VPN hacia Siesa — construye SQL, nunca lo
// ejecuta.
export function construirWhereHistorico(f: FiltrosHistoricoVentas) {
  const condiciones = [
    "f.f461_id_cia = @ciaId",
    "f.f461_id_fecha >= @desde",
    "f.f461_id_fecha < @hasta",
  ];
  if (f.search) {
    condiciones.push(
      "(tc.f200_razon_social LIKE @search OR tc.f200_nit LIKE @search OR tv.f200_razon_social LIKE @search)",
    );
  }
  if (f.vendedorRowId !== undefined) {
    condiciones.push("f.f461_rowid_tercero_vendedor = @vendedorRowId");
  }
  if (f.clienteRowId !== undefined) {
    condiciones.push("f.f461_rowid_tercero_fact = @clienteRowId");
  }
  if (f.itemRowId !== undefined) {
    condiciones.push(
      "EXISTS (SELECT 1 FROM v470_ventas v WHERE v.v470_rowid_docto_fact = f.f461_rowid_docto AND v.v470_rowid_item_ext = @itemRowId)",
    );
  }
  return condiciones.join(" AND ");
}

/**
 * Histórico paginado de documentos de venta — a diferencia de las funciones
 * anteriores (agregadas), esta SÍ devuelve filas de detalle, pero solo la
 * página pedida (OFFSET/FETCH en SQL Server): con 85.661 documentos en
 * total, nunca se trae el histórico completo a Node ni al navegador.
 */
export async function leerHistoricoVentasSiesa(
  filtros: FiltrosHistoricoVentas,
  page: number,
  pageSize: number,
): Promise<DocumentoVentaSiesa[]> {
  const pool = await getSiesaPool();
  const request = pool
    .request()
    .input("ciaId", filtros.ciaId)
    .input("desde", filtros.desde)
    .input("hasta", filtros.hasta)
    .input("skip", (page - 1) * pageSize)
    .input("take", pageSize);
  if (filtros.search) request.input("search", `%${filtros.search}%`);
  if (filtros.vendedorRowId !== undefined) request.input("vendedorRowId", filtros.vendedorRowId);
  if (filtros.clienteRowId !== undefined) request.input("clienteRowId", filtros.clienteRowId);
  if (filtros.itemRowId !== undefined) request.input("itemRowId", filtros.itemRowId);

  const { recordset } = await request.query<{
    id: number;
    fecha: Date;
    referencia: string | null;
    bruto: number;
    dscto: number;
    neto: number;
    clienteRowId: number | null;
    clienteNombre: string | null;
    clienteNit: string | null;
    vendedorRowId: number | null;
    vendedorNombre: string | null;
  }>(`
    SELECT
      f.f461_rowid_docto AS id,
      f.f461_id_fecha AS fecha,
      f.f461_num_docto_referencia AS referencia,
      f.f461_vlr_bruto AS bruto,
      f.f461_vlr_dscto AS dscto,
      (f.f461_vlr_bruto - f.f461_vlr_dscto) AS neto,
      f.f461_rowid_tercero_fact AS clienteRowId,
      tc.f200_razon_social AS clienteNombre,
      tc.f200_nit AS clienteNit,
      f.f461_rowid_tercero_vendedor AS vendedorRowId,
      tv.f200_razon_social AS vendedorNombre
    FROM t461_cm_docto_factura_venta f
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = f.f461_rowid_tercero_fact
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = f.f461_rowid_tercero_vendedor
    WHERE ${construirWhereHistorico(filtros)}
    ORDER BY f.f461_id_fecha DESC, f.f461_rowid_docto DESC
    OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
  `);
  return recordset.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    referencia: r.referencia,
    bruto: Number(r.bruto ?? 0),
    dscto: Number(r.dscto ?? 0),
    neto: Number(r.neto ?? 0),
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre,
    clienteNit: r.clienteNit,
    vendedorRowId: r.vendedorRowId,
    vendedorNombre: r.vendedorNombre,
  }));
}

/** Total de documentos que matchean los mismos filtros que leerHistoricoVentasSiesa, para paginar. */
export async function contarHistoricoVentasSiesa(filtros: FiltrosHistoricoVentas): Promise<number> {
  const pool = await getSiesaPool();
  const request = pool
    .request()
    .input("ciaId", filtros.ciaId)
    .input("desde", filtros.desde)
    .input("hasta", filtros.hasta);
  if (filtros.search) request.input("search", `%${filtros.search}%`);
  if (filtros.vendedorRowId !== undefined) request.input("vendedorRowId", filtros.vendedorRowId);
  if (filtros.clienteRowId !== undefined) request.input("clienteRowId", filtros.clienteRowId);
  if (filtros.itemRowId !== undefined) request.input("itemRowId", filtros.itemRowId);

  const { recordset } = await request.query<{ n: number }>(`
    SELECT COUNT(*) AS n
    FROM t461_cm_docto_factura_venta f
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = f.f461_rowid_tercero_fact
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = f.f461_rowid_tercero_vendedor
    WHERE ${construirWhereHistorico(filtros)}
  `);
  return recordset[0]?.n ?? 0;
}

export interface LineaDocumentoVentaSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidad: number;
}

/**
 * Líneas de producto de UN documento de venta real específico
 * (t461_cm_docto_factura_venta.f461_rowid_docto) — base para congelar el
 * snapshot de un Despacho (Control de Despachos): cliente/producto/
 * cantidades vienen de aquí, nunca inventados. Mismo filtro y misma fuente
 * ya verificados en vivo (v470_ventas, v470_rowid_docto_fact IS NOT NULL
 * para excluir movimientos internos de almacén) que el resto de este
 * archivo — nueva consulta, misma garantía de datos reales.
 */
export async function leerLineasDocumentoVentaSiesa(
  ciaId: number,
  docRowId: number,
): Promise<LineaDocumentoVentaSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).input("docRowId", docRowId)
    .query<{
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    unidadMedida: string | null;
    cantidad: number;
  }>(`
    SELECT
      v.v470_rowid_item_ext AS itemRowId,
      MAX(it.f120_descripcion) AS descripcion,
      MAX(it.f120_referencia) AS referencia,
      MAX(LTRIM(RTRIM(v.v470_id_unidad_medida))) AS unidadMedida,
      SUM(v.v470_cant_base) AS cantidad
    FROM v470_ventas v
    LEFT JOIN t120_mc_items it ON it.f120_rowid = v.v470_rowid_item_ext
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact = @docRowId
    GROUP BY v.v470_rowid_item_ext
  `);
  return recordset.map((r) => ({
    itemRowId: r.itemRowId,
    descripcion: r.descripcion?.trim() || null,
    referencia: r.referencia?.trim() || null,
    unidadMedida: r.unidadMedida?.trim() || null,
    cantidad: Number(r.cantidad ?? 0),
  }));
}

/**
 * Encabezado de UN documento de venta real por su id interno de Siesa
 * (f461_rowid_docto) — mismos campos/joins ya verificados en
 * leerHistoricoVentasSiesa, solo que aquí se busca uno puntual (para armar
 * el Despacho a partir de un documento elegido, en vez de listar/paginar).
 */
export async function leerDocumentoVentaPorIdSiesa(
  ciaId: number,
  docRowId: number,
): Promise<DocumentoVentaSiesa | null> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).input("docRowId", docRowId)
    .query<{
    id: number;
    fecha: Date;
    referencia: string | null;
    bruto: number;
    dscto: number;
    neto: number;
    clienteRowId: number | null;
    clienteNombre: string | null;
    clienteNit: string | null;
    vendedorRowId: number | null;
    vendedorNombre: string | null;
  }>(`
    SELECT
      f.f461_rowid_docto AS id,
      f.f461_id_fecha AS fecha,
      f.f461_num_docto_referencia AS referencia,
      f.f461_vlr_bruto AS bruto,
      f.f461_vlr_dscto AS dscto,
      (f.f461_vlr_bruto - f.f461_vlr_dscto) AS neto,
      f.f461_rowid_tercero_fact AS clienteRowId,
      tc.f200_razon_social AS clienteNombre,
      tc.f200_nit AS clienteNit,
      f.f461_rowid_tercero_vendedor AS vendedorRowId,
      tv.f200_razon_social AS vendedorNombre
    FROM t461_cm_docto_factura_venta f
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = f.f461_rowid_tercero_fact
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = f.f461_rowid_tercero_vendedor
    WHERE f.f461_id_cia = @ciaId AND f.f461_rowid_docto = @docRowId
  `);
  const r = recordset[0];
  if (!r) return null;
  return {
    id: r.id,
    fecha: r.fecha,
    referencia: r.referencia,
    bruto: Number(r.bruto ?? 0),
    dscto: Number(r.dscto ?? 0),
    neto: Number(r.neto ?? 0),
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre,
    clienteNit: r.clienteNit,
    vendedorRowId: r.vendedorRowId,
    vendedorNombre: r.vendedorNombre,
  };
}

export interface PrecioPromedioItemSiesa {
  /** Suma de líneas realmente vendidas en la ventana — 0 si no hubo ventas recientes. */
  lineas: number;
  cantidadTotal: number;
  netoTotal: number;
  costoTotal: number;
}

/**
 * Precio/costo promedio ponderado real de un ítem, sobre sus ventas
 * recientes (v470_ventas, mismo filtro v470_rowid_docto_fact IS NOT NULL ya
 * verificado en el resto de este archivo). NO es un "precio de lista": es
 * el promedio de lo que realmente se facturó — el llamador divide
 * netoTotal/cantidadTotal y costoTotal/cantidadTotal para el precio/costo
 * unitario, y puede devolver null si cantidadTotal es 0 (sin ventas
 * recientes, no se inventa un precio).
 */
export async function leerPrecioPromedioItemSiesa(
  ciaId: number,
  itemRowId: number,
  desde: Date,
): Promise<PrecioPromedioItemSiesa> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("itemRowId", itemRowId)
    .input("desde", desde).query<{
    lineas: number;
    cantidadTotal: number;
    netoTotal: number;
    costoTotal: number;
  }>(`
    SELECT
      COUNT(*) AS lineas,
      SUM(v.v470_cant_base) AS cantidadTotal,
      SUM(v.v470_vlr_bruto - ISNULL(v.v470_vlr_dscto_linea, 0) - ISNULL(v.v470_vlr_dscto_global, 0)) AS netoTotal,
      SUM(v.v470_costo_prom_tot) AS costoTotal
    FROM v470_ventas v
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_item_ext = @itemRowId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde
  `);
  const r = recordset[0];
  return {
    lineas: r?.lineas ?? 0,
    cantidadTotal: Number(r?.cantidadTotal ?? 0),
    netoTotal: Number(r?.netoTotal ?? 0),
    costoTotal: Number(r?.costoTotal ?? 0),
  };
}

export interface ClientePorItemSiesa {
  clienteRowId: number | null;
  clienteNombre: string | null;
  cantidadHistorica: number;
  netoHistorico: number;
}

/**
 * Clientes reales que compran UN ítem específico, dentro de [desde, hoy) —
 * "¿a quién se le vende esto?" para el contexto de producto de Ventas.
 * Mismo join v470_ventas → t461 ya verificado en vivo (ver
 * leerComprasPorClienteProductoSiesa) pero filtrado a un solo ítem en SQL
 * en vez de traer el cruce completo cliente×producto.
 */
export async function leerClientesPorItemSiesa(
  ciaId: number,
  itemRowId: number,
  desde: Date,
  limite = 10,
): Promise<ClientePorItemSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("itemRowId", itemRowId)
    .input("desde", desde)
    .input("limite", limite).query<{
    clienteRowId: number | null;
    clienteNombre: string | null;
    cantidadHistorica: number;
    netoHistorico: number;
  }>(`
    SELECT TOP (@limite)
      f.f461_rowid_tercero_fact AS clienteRowId,
      MAX(tc.f200_razon_social) AS clienteNombre,
      SUM(v.v470_cant_base) AS cantidadHistorica,
      SUM(v.v470_vlr_bruto - ISNULL(v.v470_vlr_dscto_linea, 0) - ISNULL(v.v470_vlr_dscto_global, 0)) AS netoHistorico
    FROM v470_ventas v
    INNER JOIN t461_cm_docto_factura_venta f
      ON f.f461_rowid_docto = v.v470_rowid_docto_fact AND f.f461_id_cia = v.v470_id_cia
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = f.f461_rowid_tercero_fact
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_item_ext = @itemRowId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde
    GROUP BY f.f461_rowid_tercero_fact
    ORDER BY SUM(v.v470_cant_base) DESC
  `);
  return recordset.map((r) => ({
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre,
    cantidadHistorica: Number(r.cantidadHistorica ?? 0),
    netoHistorico: Number(r.netoHistorico ?? 0),
  }));
}

export interface CompraClienteProductoSiesa {
  clienteRowId: number | null;
  clienteNombre: string | null;
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidadHistorica: number;
  netoHistorico: number;
}

/**
 * Cuánto le ha comprado cada cliente a cada producto, desde `desde` hasta
 * hoy — base para la oportunidad comercial (Bloque 5): cruzar "qué
 * productos ya compra este cliente" contra "qué tenemos disponible hoy"
 * (ver calcularOportunidadComercialSiesa en lib/oportunidad-comercial-siesa.ts).
 * Mismo join v470_ventas → t461 ya verificado en vivo en
 * leerTopClientesPorMargenSiesa.
 */
export async function leerComprasPorClienteProductoSiesa(
  ciaId: number,
  desde: Date,
): Promise<CompraClienteProductoSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).input("desde", desde).query<{
    clienteRowId: number | null;
    clienteNombre: string | null;
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    unidadMedida: string | null;
    cantidadHistorica: number;
    netoHistorico: number;
  }>(`
    SELECT
      f.f461_rowid_tercero_fact AS clienteRowId,
      MAX(tc.f200_razon_social) AS clienteNombre,
      v.v470_rowid_item_ext AS itemRowId,
      MAX(it.f120_descripcion) AS descripcion,
      MAX(it.f120_referencia) AS referencia,
      MAX(LTRIM(RTRIM(v.v470_id_unidad_medida))) AS unidadMedida,
      SUM(v.v470_cant_base) AS cantidadHistorica,
      SUM(v.v470_vlr_bruto - ISNULL(v.v470_vlr_dscto_linea, 0) - ISNULL(v.v470_vlr_dscto_global, 0)) AS netoHistorico
    FROM v470_ventas v
    INNER JOIN t461_cm_docto_factura_venta f
      ON f.f461_rowid_docto = v.v470_rowid_docto_fact AND f.f461_id_cia = v.v470_id_cia
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = f.f461_rowid_tercero_fact
    LEFT JOIN t120_mc_items it ON it.f120_rowid = v.v470_rowid_item_ext
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde
    GROUP BY f.f461_rowid_tercero_fact, v.v470_rowid_item_ext
  `);
  return recordset.map((r) => ({
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre,
    itemRowId: r.itemRowId,
    descripcion: r.descripcion?.trim() || null,
    referencia: r.referencia?.trim() || null,
    unidadMedida: r.unidadMedida?.trim() || null,
    cantidadHistorica: Number(r.cantidadHistorica ?? 0),
    netoHistorico: Number(r.netoHistorico ?? 0),
  }));
}

export interface ClienteVentaConsolidadaFilaSiesa {
  clienteRowId: number | null;
  clienteNombre: string | null;
  clienteNit: string | null;
  neto: number;
  costo: number;
  margen: number;
  kilos: number;
  documentos: number;
}

/**
 * Venta + kilos + margen + # documentos por cliente, dentro de [desde,
 * hasta) — la vista consolidada que pide "Inteligencia > Clientes" (Pareto
 * incluido, calculado en Node por calcularParetoClientes sobre este mismo
 * resultado, nunca en SQL). Mismo join v470_ventas -> t461 ya verificado en
 * vivo por leerTopClientesPorMargenSiesa (reconciliación exacta neto-costo=
 * margen); kilos con el mismo criterio ya usado en
 * leerActividadMensualKilosClientesSiesa (solo unidad 'KG', vía SUM
 * condicional para no necesitar una segunda consulta).
 */
export async function leerVentasPorClienteConsolidadoSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
  limite = 50,
): Promise<ClienteVentaConsolidadaFilaSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("desde", desde)
    .input("hasta", hasta)
    .input("limite", limite).query<{
    clienteRowId: number | null;
    clienteNombre: string | null;
    clienteNit: string | null;
    neto: number;
    costo: number;
    margen: number;
    kilos: number;
    documentos: number;
  }>(`
    SELECT TOP (@limite)
      f.f461_rowid_tercero_fact AS clienteRowId,
      MAX(tc.f200_razon_social) AS clienteNombre,
      MAX(tc.f200_nit) AS clienteNit,
      SUM(v.v470_vlr_bruto - ISNULL(v.v470_vlr_dscto_linea, 0) - ISNULL(v.v470_vlr_dscto_global, 0)) AS neto,
      SUM(v.v470_costo_prom_tot) AS costo,
      SUM(v.v470_utilidad_prom) AS margen,
      SUM(CASE WHEN LTRIM(RTRIM(v.v470_id_unidad_medida)) = 'KG' THEN v.v470_cant_base ELSE 0 END) AS kilos,
      COUNT(DISTINCT v.v470_rowid_docto_fact) AS documentos
    FROM v470_ventas v
    INNER JOIN t461_cm_docto_factura_venta f
      ON f.f461_rowid_docto = v.v470_rowid_docto_fact AND f.f461_id_cia = v.v470_id_cia
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = f.f461_rowid_tercero_fact
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde AND v.v470_id_fecha < @hasta
    GROUP BY f.f461_rowid_tercero_fact
    ORDER BY SUM(v.v470_vlr_bruto - ISNULL(v.v470_vlr_dscto_linea, 0) - ISNULL(v.v470_vlr_dscto_global, 0)) DESC
  `);
  return recordset.map((r) => ({
    clienteRowId: r.clienteRowId,
    clienteNombre: r.clienteNombre,
    clienteNit: r.clienteNit,
    neto: Number(r.neto ?? 0),
    costo: Number(r.costo ?? 0),
    margen: Number(r.margen ?? 0),
    kilos: Number(r.kilos ?? 0),
    documentos: r.documentos,
  }));
}

export interface ResumenVentaDiaSiesa {
  neto: number;
  kilos: number;
  documentos: number;
}

/**
 * Resumen agregado de ventas dentro de [desde, hasta) — dinero (t461,
 * bruto-descuento, sin IVA, mismo criterio que el resto del archivo) +
 * kilos (v470, solo unidad 'KG', mismo criterio que
 * leerActividadMensualKilosClientesSiesa). Usado para "Total ventas hoy —
 * $" y "Total ventas hoy — kg" en Analítica: un solo número por cada
 * unidad, no una serie ni un desglose — evita traer detalle para un total.
 */
export async function leerResumenVentaDiaSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
): Promise<ResumenVentaDiaSiesa> {
  const pool = await getSiesaPool();
  const [dinero, kilos] = await Promise.all([
    pool.request().input("ciaId", ciaId).input("desde", desde).input("hasta", hasta).query<{
      neto: number;
      documentos: number;
    }>(`
      SELECT
        SUM(f.f461_vlr_bruto - f.f461_vlr_dscto) AS neto,
        COUNT(*) AS documentos
      FROM t461_cm_docto_factura_venta f
      WHERE f.f461_id_cia = @ciaId AND f.f461_id_fecha >= @desde AND f.f461_id_fecha < @hasta
    `),
    pool.request().input("ciaId", ciaId).input("desde", desde).input("hasta", hasta).query<{
      kilos: number;
    }>(`
      SELECT SUM(v.v470_cant_base) AS kilos
      FROM v470_ventas v
      WHERE v.v470_id_cia = @ciaId
        AND v.v470_rowid_docto_fact IS NOT NULL
        AND v.v470_id_fecha >= @desde AND v.v470_id_fecha < @hasta
        AND LTRIM(RTRIM(v.v470_id_unidad_medida)) = 'KG'
    `),
  ]);
  return {
    neto: Number(dinero.recordset[0]?.neto ?? 0),
    documentos: dinero.recordset[0]?.documentos ?? 0,
    kilos: Number(kilos.recordset[0]?.kilos ?? 0),
  };
}

export interface HistoricoCompraProductoClienteSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidadHistorica: number;
  netoHistorico: number;
  numCompras: number;
  ultimaCompra: Date;
}

/**
 * Qué le compraba UN cliente específico, producto por producto, dentro de
 * [desde, hoy) — "¿qué dejó de comprar este cliente?" (Ventas > Clientes en
 * riesgo, drill-down por cliente). Mismo join v470_ventas -> t461 ya
 * verificado en vivo en leerTopClientesPorMargenSiesa/
 * leerComprasPorClienteProductoSiesa, filtrado a un solo cliente en SQL en
 * vez de traer el cruce completo cliente×producto. numCompras cuenta
 * documentos distintos (no líneas) para no inflar "veces que compró" si un
 * mismo producto aparece en varias líneas del mismo documento.
 */
export async function leerHistoricoComprasClienteSiesa(
  ciaId: number,
  clienteRowId: number,
  desde: Date,
): Promise<HistoricoCompraProductoClienteSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId)
    .input("desde", desde).query<{
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    unidadMedida: string | null;
    cantidadHistorica: number;
    netoHistorico: number;
    numCompras: number;
    ultimaCompra: Date;
  }>(`
    SELECT
      v.v470_rowid_item_ext AS itemRowId,
      MAX(it.f120_descripcion) AS descripcion,
      MAX(it.f120_referencia) AS referencia,
      MAX(LTRIM(RTRIM(v.v470_id_unidad_medida))) AS unidadMedida,
      SUM(v.v470_cant_base) AS cantidadHistorica,
      SUM(v.v470_vlr_bruto - ISNULL(v.v470_vlr_dscto_linea, 0) - ISNULL(v.v470_vlr_dscto_global, 0)) AS netoHistorico,
      COUNT(DISTINCT v.v470_rowid_docto_fact) AS numCompras,
      MAX(v.v470_id_fecha) AS ultimaCompra
    FROM v470_ventas v
    INNER JOIN t461_cm_docto_factura_venta f
      ON f.f461_rowid_docto = v.v470_rowid_docto_fact AND f.f461_id_cia = v.v470_id_cia
    LEFT JOIN t120_mc_items it ON it.f120_rowid = v.v470_rowid_item_ext
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND f.f461_rowid_tercero_fact = @clienteRowId
      AND v.v470_id_fecha >= @desde
    GROUP BY v.v470_rowid_item_ext
    ORDER BY MAX(v.v470_id_fecha) DESC
  `);
  return recordset.map((r) => ({
    itemRowId: r.itemRowId,
    descripcion: r.descripcion?.trim() || null,
    referencia: r.referencia?.trim() || null,
    unidadMedida: r.unidadMedida?.trim() || null,
    cantidadHistorica: Number(r.cantidadHistorica ?? 0),
    netoHistorico: Number(r.netoHistorico ?? 0),
    numCompras: r.numCompras,
    ultimaCompra: r.ultimaCompra,
  }));
}

export interface VentaRangoSiesa {
  neto: number;
  documentos: number;
}

/**
 * Total neto (SIN IVA) y número de documentos dentro de un rango arbitrario
 * [desde, hasta) — a diferencia de leerVentasMensualesSiesa (que agrega por
 * mes calendario completo), esta función soporta rangos parciales exactos
 * (p. ej. 01-15 de un mes) para el comparativo año actual vs. año anterior
 * del módulo de Objetivos. Filtra opcionalmente por vendedor
 * (f461_rowid_tercero_vendedor) para el cumplimiento de metas individuales.
 */
export async function leerVentasRangoSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
  vendedorSiesaRowId?: number | null,
): Promise<VentaRangoSiesa> {
  const pool = await getSiesaPool();
  const request = pool.request().input("ciaId", ciaId).input("desde", desde).input("hasta", hasta);
  let filtroVendedor = "";
  if (vendedorSiesaRowId != null) {
    request.input("vendedorSiesaRowId", vendedorSiesaRowId);
    filtroVendedor = "AND f461_rowid_tercero_vendedor = @vendedorSiesaRowId";
  }
  const { recordset } = await request.query<{ neto: number; documentos: number }>(`
    SELECT
      SUM(f461_vlr_bruto - f461_vlr_dscto) AS neto,
      COUNT(*) AS documentos
    FROM t461_cm_docto_factura_venta
    WHERE f461_id_cia = @ciaId AND f461_id_fecha >= @desde AND f461_id_fecha < @hasta
      ${filtroVendedor}
  `);
  const fila = recordset[0];
  return { neto: Number(fila?.neto ?? 0), documentos: fila?.documentos ?? 0 };
}

export interface KilosRangoSiesa {
  kilos: number;
}

/**
 * Kilos vendidos dentro de un rango arbitrario [desde, hasta) — misma
 * fuente y filtros que leerTopProductosVentaKilosSiesa (v470_ventas,
 * v470_rowid_docto_fact IS NOT NULL, solo líneas en KG), pero sin agrupar
 * por producto: un único total, para el cumplimiento de metaVolumenKg.
 */
export async function leerKilosRangoSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
  vendedorSiesaRowId?: number | null,
): Promise<KilosRangoSiesa> {
  const pool = await getSiesaPool();
  const request = pool.request().input("ciaId", ciaId).input("desde", desde).input("hasta", hasta);
  let filtroVendedor = "";
  if (vendedorSiesaRowId != null) {
    request.input("vendedorSiesaRowId", vendedorSiesaRowId);
    filtroVendedor = "AND f.f461_rowid_tercero_vendedor = @vendedorSiesaRowId";
  }
  const { recordset } = await request.query<{ kilos: number }>(`
    SELECT SUM(v.v470_cant_base) AS kilos
    FROM v470_ventas v
    INNER JOIN t461_cm_docto_factura_venta f
      ON f.f461_rowid_docto = v.v470_rowid_docto_fact AND f.f461_id_cia = v.v470_id_cia
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde AND v.v470_id_fecha < @hasta
      AND LTRIM(RTRIM(v.v470_id_unidad_medida)) = 'KG'
      ${filtroVendedor}
  `);
  return { kilos: Number(recordset[0]?.kilos ?? 0) };
}

export interface VendedorCatalogoSiesa {
  vendedorRowId: number;
  vendedorNombre: string | null;
}

/**
 * Catálogo de vendedores con al menos una venta en los últimos `mesesAtras`
 * meses — para el <select> del formulario de creación de objetivo VENDEDOR.
 * No trae vendedores sin actividad reciente (evita listar terceros
 * históricos que ya no venden), pero un vendedor nuevo sin ninguna venta
 * previa simplemente no aparece hasta su primera factura — limitación
 * conocida, documentada en el diseño del módulo Objetivos.
 */
export async function leerCatalogoVendedoresSiesa(
  ciaId: number,
  mesesAtras: number,
): Promise<VendedorCatalogoSiesa[]> {
  const pool = await getSiesaPool();
  const desde = new Date();
  desde.setUTCMonth(desde.getUTCMonth() - mesesAtras);
  const { recordset } = await pool.request().input("ciaId", ciaId).input("desde", desde).query<{
    vendedorRowId: number;
    vendedorNombre: string | null;
  }>(`
    SELECT DISTINCT
      f.f461_rowid_tercero_vendedor AS vendedorRowId,
      tv.f200_razon_social AS vendedorNombre
    FROM t461_cm_docto_factura_venta f
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = f.f461_rowid_tercero_vendedor
    WHERE f.f461_id_cia = @ciaId
      AND f.f461_id_fecha >= @desde
      AND f.f461_rowid_tercero_vendedor IS NOT NULL
    ORDER BY tv.f200_razon_social ASC
  `);
  return recordset.map((r) => ({
    vendedorRowId: r.vendedorRowId,
    vendedorNombre: r.vendedorNombre?.trim() || null,
  }));
}

export interface VentaVendedorRangoSiesa {
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  neto: number;
  documentos: number;
}

/**
 * Venta neta (SIN IVA) por vendedor dentro de un rango arbitrario
 * [desde, hasta) — a diferencia de leerVentasDiariasPorVendedorSiesa (que
 * desglosa día a día para "hoy/ayer/mes actual" del Centro Comercial), esta
 * función agrega el RANGO COMPLETO de una sola vez, sin desglose diario.
 * Es la fuente correcta para el "aporte por vendedor" de un objetivo — un
 * objetivo trimestral/anual necesita la venta de todo su rango, no solo la
 * del mes en curso.
 */
export async function leerVentasPorVendedorRangoSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
): Promise<VentaVendedorRangoSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("desde", desde)
    .input("hasta", hasta).query<{
    vendedorRowId: number | null;
    vendedorNombre: string | null;
    neto: number;
    documentos: number;
  }>(`
    SELECT
      f.f461_rowid_tercero_vendedor AS vendedorRowId,
      tv.f200_razon_social AS vendedorNombre,
      SUM(f.f461_vlr_bruto - f.f461_vlr_dscto) AS neto,
      COUNT(*) AS documentos
    FROM t461_cm_docto_factura_venta f
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = f.f461_rowid_tercero_vendedor
    WHERE f.f461_id_cia = @ciaId AND f.f461_id_fecha >= @desde AND f.f461_id_fecha < @hasta
    GROUP BY f.f461_rowid_tercero_vendedor, tv.f200_razon_social
  `);
  return recordset.map((r) => ({
    vendedorRowId: r.vendedorRowId,
    vendedorNombre: r.vendedorNombre?.trim() || null,
    neto: Number(r.neto ?? 0),
    documentos: r.documentos,
  }));
}

export interface KilosVendedorRangoSiesa {
  vendedorRowId: number | null;
  kilos: number;
}

/**
 * Kilos vendidos por vendedor dentro de un rango arbitrario [desde, hasta)
 * — mismos filtros que leerKilosRangoSiesa (v470_rowid_docto_fact IS NOT
 * NULL, solo líneas en KG), agrupado por vendedor vía el join a t461 para
 * el "aporte por vendedor" (kilos) de un objetivo.
 */
export async function leerKilosPorVendedorRangoSiesa(
  ciaId: number,
  desde: Date,
  hasta: Date,
): Promise<KilosVendedorRangoSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("desde", desde)
    .input("hasta", hasta).query<{
    vendedorRowId: number | null;
    kilos: number;
  }>(`
    SELECT
      f.f461_rowid_tercero_vendedor AS vendedorRowId,
      SUM(v.v470_cant_base) AS kilos
    FROM v470_ventas v
    INNER JOIN t461_cm_docto_factura_venta f
      ON f.f461_rowid_docto = v.v470_rowid_docto_fact AND f.f461_id_cia = v.v470_id_cia
    WHERE v.v470_id_cia = @ciaId
      AND v.v470_rowid_docto_fact IS NOT NULL
      AND v.v470_id_fecha >= @desde AND v.v470_id_fecha < @hasta
      AND LTRIM(RTRIM(v.v470_id_unidad_medida)) = 'KG'
    GROUP BY f.f461_rowid_tercero_vendedor
  `);
  return recordset.map((r) => ({
    vendedorRowId: r.vendedorRowId,
    kilos: Number(r.kilos ?? 0),
  }));
}
