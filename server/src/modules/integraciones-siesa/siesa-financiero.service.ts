import { getSiesaPool } from "../../config/siesa";

/**
 * Saldos abiertos reales de terceros, módulo Financiero de Siesa
 * (t353_co_saldo_abierto) — confirmado en vivo: sigue alimentándose HOY
 * (documentos con fecha 2026-09-01), a diferencia de t5353_saldos_cxc /
 * t5354_saldos_cxp (las tablas "oficiales" de cartera/CxP), que dejaron de
 * usarse en 2018 y hoy solo devolverían un acumulado congelado y falso.
 *
 * t353.rowid_docto referencia SIEMPRE t350_co_docto_contable (verificado en
 * vivo: 100% de match, para todos los tipos de documento reales).
 *
 * Clasificación cartera (nos deben) vs CxP (debemos): NO se usa el código
 * de tipo de documento (id_tipo_docto_cruce) — se probó y varía por
 * compañía/configuración (facturas de compra reales aparecieron bajo ~10
 * códigos internos distintos y no documentados, ej. FPI/CS/DSF/DEC). En su
 * lugar se aplica la convención contable universal de partida doble para un
 * auxiliar de terceros: saldo débito (total_db > total_cr) = el tercero nos
 * debe (cartera); saldo crédito (total_cr > total_db) = le debemos
 * (CxP). Verificado con datos reales: las facturas de venta (tipos
 * FV/FVE/FVC, confirmadas por join 1:1 contra
 * t461_cm_docto_factura_venta) siempre tienen saldo débito; las causaciones
 * de gastos a proveedores reales (notas como "ARRENDAMIENTO IMPRESORA",
 * "SUSCRIPCION PLATAFORMA...", con terceros reales y fecha de vencimiento
 * real) siempre tienen saldo crédito.
 */
export interface SaldoAbiertoSiesa {
  terceroRowId: number | null;
  terceroNombre: string | null;
  terceroNit: string | null;
  vence: Date;
  /** total_db - total_cr. Positivo = nos deben (cartera). Negativo = debemos (CxP). */
  saldo: number;
}

export async function leerSaldosAbiertosSiesa(ciaId: number): Promise<SaldoAbiertoSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).query<{
    terceroRowId: number | null;
    terceroNombre: string | null;
    terceroNit: string | null;
    vence: Date;
    saldo: number;
  }>(`
    SELECT
      s.f353_rowid_tercero AS terceroRowId,
      tc.f200_razon_social AS terceroNombre,
      tc.f200_nit AS terceroNit,
      COALESCE(s.f353_fecha_vcto, s.f353_fecha) AS vence,
      (s.f353_total_db - s.f353_total_cr) AS saldo
    FROM t353_co_saldo_abierto s
    LEFT JOIN t200_mm_terceros tc ON tc.f200_rowid = s.f353_rowid_tercero
    WHERE s.f353_id_cia = @ciaId
      AND s.f353_fecha_cancelacion IS NULL
      AND (s.f353_total_db - s.f353_total_cr) <> 0
  `);
  return recordset.map((r) => ({
    terceroRowId: r.terceroRowId,
    terceroNombre: r.terceroNombre,
    terceroNit: r.terceroNit,
    vence: r.vence,
    saldo: Number(r.saldo ?? 0),
  }));
}
