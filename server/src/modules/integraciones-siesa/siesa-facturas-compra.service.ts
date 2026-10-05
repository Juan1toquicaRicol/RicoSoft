import { getSiesaPool } from "../../config/siesa";

/**
 * Facturas de proveedores (compra/servicios) registradas en Siesa —
 * t455_cm_factura_docto, confirmada en exploración de solo lectura
 * (2026-09-28): es la cabecera de factura de compra real y sigue
 * alimentándose hoy (a diferencia de t5354_saldos_cxp, congelada desde
 * 2018 — ver comentario en siesa-financiero.service.ts). t527_gc_ci_docto_cp
 * tiene 0 filas, no se usa.
 *
 * Alcance aprobado (2026-10-01): SOLO lectura de t455 + el tercero
 * (t200_mm_terceros) relacionado. No se vincula con el modelo Factura nativo
 * de RicoSoft por NIT/número/prefijo ni ninguna otra coincidencia — esa es
 * una decisión funcional explícitamente fuera de este alcance. No se toca
 * t451_cm_docto_compras en esta fase.
 *
 * f455_vlr_cxp es el valor de cuenta por pagar TAL COMO QUEDÓ REGISTRADO EN
 * LA FACTURA al causarla — NUNCA el saldo pendiente actualizado (pagos,
 * notas crédito, etc. después de la causación). El saldo abierto real/vivo
 * de un tercero se consulta aparte, en t353 vía
 * leerSaldosAbiertosSiesa (siesa-financiero.service.ts).
 */
export interface FacturaCompraSiesa {
  facturaRowId: number;
  ciaId: number;
  terceroRowId: number | null;
  terceroNombre: string | null;
  terceroNit: string | null;
  prefijo: string | null;
  numero: number | null;
  fechaDocumentoProveedor: Date | null;
  fechaEmision: Date | null;
  /** Valor neto de la factura, en la moneda de causación. */
  valorNeto: number;
  /** Valor de CxP registrado en la factura (ver comentario del módulo) —
   * NUNCA mostrar como "saldo pendiente actual". */
  valorCxpRegistrado: number;
  valorImpuesto: number;
  valorDescuento: number;
  valorRetencion: number;
  monedaCausacion: string | null;
}

export interface FiltrosFacturasCompraSiesa {
  /** Busca por razón social o NIT del proveedor (LIKE, igual que el resto
   * de búsquedas de terceros en este módulo — ver siesa-clientes.service.ts). */
  search?: string;
  desde?: Date;
  hasta?: Date;
}

/** WHERE compartido entre contar y listar — un solo lugar para no
 * desincronizar el filtro del total y el de la página (mismo riesgo ya
 * documentado en otros servicios de este módulo). ciaId SIEMPRE viene ya
 * resuelto por el controlador contra Tenant.siesaCiaId — nunca de fuera de
 * este archivo sin resolverse antes. */
function construirWhere(request: import("mssql").Request, filtros: FiltrosFacturasCompraSiesa) {
  const condiciones = ["f.f455_id_cia = @ciaId"];
  if (filtros.search?.trim()) {
    request.input("search", `%${filtros.search.trim()}%`);
    condiciones.push("(t.f200_razon_social LIKE @search OR t.f200_nit LIKE @search)");
  }
  if (filtros.desde) {
    request.input("desde", filtros.desde);
    condiciones.push("f.f455_fecha_docto_prov >= @desde");
  }
  if (filtros.hasta) {
    request.input("hasta", filtros.hasta);
    condiciones.push("f.f455_fecha_docto_prov <= @hasta");
  }
  return condiciones.join(" AND ");
}

export async function contarFacturasCompraSiesa(
  ciaId: number,
  filtros: FiltrosFacturasCompraSiesa = {},
): Promise<number> {
  const pool = await getSiesaPool();
  const request = pool.request().input("ciaId", ciaId);
  const where = construirWhere(request, filtros);
  const { recordset } = await request.query<{ n: number }>(`
    SELECT COUNT(*) AS n
    FROM t455_cm_factura_docto f
    LEFT JOIN t200_mm_terceros t ON t.f200_rowid = f.f455_rowid_tercero
    WHERE ${where}
  `);
  return recordset[0]?.n ?? 0;
}

export async function listarFacturasCompraSiesa(
  ciaId: number,
  filtros: FiltrosFacturasCompraSiesa,
  page: number,
  pageSize: number,
): Promise<FacturaCompraSiesa[]> {
  const pool = await getSiesaPool();
  const request = pool
    .request()
    .input("ciaId", ciaId)
    .input("skip", (page - 1) * pageSize)
    .input("take", pageSize);
  const where = construirWhere(request, filtros);

  const { recordset } = await request.query<{
    facturaRowId: number;
    ciaId: number;
    terceroRowId: number | null;
    terceroNombre: string | null;
    terceroNit: string | null;
    prefijo: string | null;
    numero: number | null;
    fechaDocumentoProveedor: Date | null;
    fechaEmision: Date | null;
    valorNeto: number | null;
    valorCxpRegistrado: number | null;
    valorImpuesto: number | null;
    valorDescuento: number | null;
    valorRetencion: number | null;
    monedaCausacion: string | null;
  }>(`
    SELECT
      f.f455_rowid_docto AS facturaRowId,
      f.f455_id_cia AS ciaId,
      f.f455_rowid_tercero AS terceroRowId,
      t.f200_razon_social AS terceroNombre,
      t.f200_nit AS terceroNit,
      f.f455_prefijo_docto_prov AS prefijo,
      f.f455_numero_docto_prov AS numero,
      f.f455_fecha_docto_prov AS fechaDocumentoProveedor,
      f.f455_fecha_emision AS fechaEmision,
      f.f455_vlr_neto AS valorNeto,
      f.f455_vlr_cxp AS valorCxpRegistrado,
      f.f455_vlr_imp AS valorImpuesto,
      f.f455_vlr_dscto AS valorDescuento,
      f.f455_vlr_ret AS valorRetencion,
      f.f455_id_moneda_causacion AS monedaCausacion
    FROM t455_cm_factura_docto f
    LEFT JOIN t200_mm_terceros t ON t.f200_rowid = f.f455_rowid_tercero
    WHERE ${where}
    ORDER BY f.f455_fecha_docto_prov DESC, f.f455_rowid_docto DESC
    OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
  `);

  return recordset.map((r) => ({
    facturaRowId: r.facturaRowId,
    ciaId: r.ciaId,
    terceroRowId: r.terceroRowId,
    terceroNombre: r.terceroNombre?.trim() || null,
    terceroNit: r.terceroNit?.trim() || null,
    prefijo: r.prefijo?.trim() || null,
    numero: r.numero,
    fechaDocumentoProveedor: r.fechaDocumentoProveedor,
    fechaEmision: r.fechaEmision,
    valorNeto: Number(r.valorNeto ?? 0),
    valorCxpRegistrado: Number(r.valorCxpRegistrado ?? 0),
    valorImpuesto: Number(r.valorImpuesto ?? 0),
    valorDescuento: Number(r.valorDescuento ?? 0),
    valorRetencion: Number(r.valorRetencion ?? 0),
    monedaCausacion: r.monedaCausacion?.trim() || null,
  }));
}
