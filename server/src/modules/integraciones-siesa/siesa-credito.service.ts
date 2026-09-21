import { getSiesaPool } from "../../config/siesa";

/**
 * Snapshot de análisis crediticio (t9896_pdv_clientes_analisis) — NO es la
 * cartera viva (esa sigue siendo t353_co_saldo_abierto, ver
 * siesa-financiero.service.ts / GET /creditos/cartera-siesa). Confirmado en
 * vivo contra UnoEE_Ricol_Real: esta tabla está VACÍA (0 filas) en esta
 * instancia hoy — PDV nunca la ha poblado. La función devuelve `null` en ese
 * caso (no un objeto con ceros, que se leería como "cliente sin cartera" en
 * vez de "dato no disponible") — el caller decide cómo comunicarlo.
 */
export interface IndicadorCreditoSiesa {
  cupoCredito: number;
  disponible: number;
  carteraCorriente: number;
  carteraVencida: number;
  diasPromedioVencido: number | null;
  diasPromedioPago: number | null;
  bloquearCupo: boolean;
  bloquearMora: boolean;
  bloquear: boolean;
}

export async function leerIndicadorCreditoSiesa(
  ciaId: number,
  clienteRowId: number,
): Promise<IndicadorCreditoSiesa | null> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId).query<{
    cupoCredito: number | null;
    disponible: number | null;
    carteraCorriente: number | null;
    carteraVencida: number | null;
    diasPromedioVencido: number | null;
    diasPromedioPago: number | null;
    bloquearCupo: number | null;
    bloquearMora: number | null;
    bloquear: number | null;
  }>(`
    SELECT TOP 1
      f9896_cupo_credito AS cupoCredito,
      f9896_disponible AS disponible,
      f9896_cartera_corriente AS carteraCorriente,
      f9896_cartera_vencida AS carteraVencida,
      f9896_dias_prom_vencido AS diasPromedioVencido,
      f9896_dias_prom_pago AS diasPromedioPago,
      f9896_bloquear_cupo AS bloquearCupo,
      f9896_bloquear_mora AS bloquearMora,
      f9896_bloquear AS bloquear
    FROM t9896_pdv_clientes_analisis
    WHERE f9896_id_cia = @ciaId AND f9896_rowid_tercero = @clienteRowId
    ORDER BY f9896_ts DESC
  `);

  const fila = recordset[0];
  if (!fila) return null;

  return {
    cupoCredito: Number(fila.cupoCredito ?? 0),
    disponible: Number(fila.disponible ?? 0),
    carteraCorriente: Number(fila.carteraCorriente ?? 0),
    carteraVencida: Number(fila.carteraVencida ?? 0),
    diasPromedioVencido: fila.diasPromedioVencido,
    diasPromedioPago: fila.diasPromedioPago,
    bloquearCupo: fila.bloquearCupo === 1,
    bloquearMora: fila.bloquearMora === 1,
    bloquear: fila.bloquear === 1,
  };
}
