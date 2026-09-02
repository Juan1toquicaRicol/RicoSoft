import type { VentaProductoRangoSiesa } from "../../modules/integraciones-siesa/siesa-ventas.service";
import type { PronosticoProductoSiesa } from "../../lib/demanda-siesa";

/**
 * Motor de demanda — Fase 3/12 del Centro de Planeación. Ventanas móviles
 * (30/90/180 días) + promedios diario/semanal/mensual, con un indicador de
 * CALIDAD DE DATOS explícito por producto — verificado en vivo (cia 1,
 * Ricol): de 426 productos con algo de historia en 12 meses, solo 51 tienen
 * los 12 meses completos, 104 tienen entre 6 y 11, y 271 tienen 5 o menos.
 * Mostrar "confianza alta" sobre un producto con 1-2 meses de historia sería
 * falso — por eso cada cálculo de demanda declara su propia calidad.
 *
 * NO duplica lib/demanda-siesa.ts (tendencia, irregularidad, pérdida de
 * rotación siguen calculándose ahí, sobre la serie de 12 meses) — este
 * módulo aporta SOLO lo que esa serie mensual no puede dar: ventanas de
 * días exactos (30/90/180), que necesitan v470_ventas agregado por rango,
 * no por mes calendario.
 */
export type CalidadDatos = "ALTA" | "MEDIA" | "BAJA";

const DIAS_30 = 30;
const DIAS_90 = 90;
const DIAS_180 = 180;

export interface VentanasDemanda {
  itemRowId: number;
  ventas30d: number;
  ventas90d: number;
  ventas180d: number;
  promedioDiario30d: number;
  promedioSemanal30d: number;
  promedioMensual30d: number;
  /** Meses (dentro de los últimos 12) con al menos una venta registrada — base real de la calidad de datos. */
  mesesConVenta: number;
  calidadDatos: CalidadDatos;
}

/**
 * Calidad de datos según cuántos de los últimos 12 meses tuvieron venta
 * real — umbral documentado, no un estándar universal: 9+ meses es
 * suficiente para confiar en un promedio/tendencia mensual, 3-8 meses da
 * una señal parcial (útil pero no concluyente), menos de 3 es
 * estadísticamente insuficiente para inferir nada.
 */
export function clasificarCalidadDatos(mesesConVenta: number): CalidadDatos {
  if (mesesConVenta >= 9) return "ALTA";
  if (mesesConVenta >= 3) return "MEDIA";
  return "BAJA";
}

/**
 * Combina las ventanas de 30/90/180 días (agregadas en Siesa por rango
 * exacto) con mesesConVenta (ya calculado por
 * calcularPronosticoDemandaSiesa, lib/demanda-siesa.ts — no se recalcula
 * aquí) para dar, por producto, una foto de demanda reciente con su propia
 * calidad de datos.
 */
export function calcularVentanasDemanda(
  ventas30d: VentaProductoRangoSiesa[],
  ventas90d: VentaProductoRangoSiesa[],
  ventas180d: VentaProductoRangoSiesa[],
  pronostico: PronosticoProductoSiesa[],
): VentanasDemanda[] {
  const mapa90 = new Map(ventas90d.map((v) => [v.itemRowId, v.cantidad]));
  const mapa180 = new Map(ventas180d.map((v) => [v.itemRowId, v.cantidad]));
  const mesesPorItem = new Map(pronostico.map((p) => [p.itemRowId, p.mesesConVenta]));

  // Universo de ítems: unión de todo lo que vendió en cualquiera de las 3
  // ventanas — un producto sin venta en 30d pero sí en 90d/180d sigue
  // siendo relevante para "perdiendo rotación".
  const itemRowIds = new Set<number>([
    ...ventas30d.map((v) => v.itemRowId),
    ...ventas90d.map((v) => v.itemRowId),
    ...ventas180d.map((v) => v.itemRowId),
  ]);

  const resultado: VentanasDemanda[] = [];
  for (const itemRowId of itemRowIds) {
    const c30 = ventas30d.find((v) => v.itemRowId === itemRowId)?.cantidad ?? 0;
    const c90 = mapa90.get(itemRowId) ?? 0;
    const c180 = mapa180.get(itemRowId) ?? 0;
    const mesesConVenta = mesesPorItem.get(itemRowId) ?? 0;

    resultado.push({
      itemRowId,
      ventas30d: c30,
      ventas90d: c90,
      ventas180d: c180,
      promedioDiario30d: c30 / DIAS_30,
      promedioSemanal30d: (c30 / DIAS_30) * 7,
      promedioMensual30d: (c30 / DIAS_30) * 30,
      mesesConVenta,
      calidadDatos: clasificarCalidadDatos(mesesConVenta),
    });
  }

  return resultado;
}

export { DIAS_30, DIAS_90, DIAS_180 };
