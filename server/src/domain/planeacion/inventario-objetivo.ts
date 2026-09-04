import type { VentanasDemanda } from "./demanda";

/**
 * Inventario objetivo — Fase 5/6 del Centro de Planeación. Responde: "dado
 * lo que realmente se vende (ventana de 30 días, Fase 3), ¿cuánto inventario
 * DEBERÍAMOS tener?" — y compara contra el stock real para separar
 * excedente de déficit.
 *
 * stockObjetivo = promedioDiario30d × coberturaObjetivoDias × factorSeguridad
 *
 * Ambos parámetros (coberturaObjetivoDias, factorSeguridad) son
 * configurables por tenant (ConfiguracionInventario, Fase 6) — nunca
 * quemados aquí. Los defaults (45 días, factor 1.0) están centralizados en
 * UMBRALES_INVENTARIO_OBJETIVO_DEFECTO, igual que el resto de umbrales del
 * módulo (ver lib/inventario-siesa.ts, lib/cobertura-siesa.ts).
 *
 * Un producto con calidadDatos "BAJA" (menos de 3 meses de historia real)
 * igual recibe un stockObjetivo calculado — no se omite — pero la
 * confianza de esa cifra queda marcada en VentanasDemanda.calidadDatos para
 * que el consumidor (Centro de Decisiones) no la presente como si fuera
 * tan confiable como una con 12 meses de historia.
 */
export interface UmbralesInventarioObjetivo {
  coberturaObjetivoDias: number;
  factorSeguridad: number;
}

export const UMBRALES_INVENTARIO_OBJETIVO_DEFECTO: UmbralesInventarioObjetivo = {
  coberturaObjetivoDias: 45,
  factorSeguridad: 1.0,
};

export interface InventarioObjetivoItem {
  itemRowId: number;
  stockActual: number;
  stockObjetivo: number;
  /** stockActual - stockObjetivo, en meses de venta (null si no hay venta reciente calculable). */
  coberturaMeses: number | null;
  excedente: number;
  deficit: number;
  calidadDatos: VentanasDemanda["calidadDatos"];
}

export function calcularInventarioObjetivo(
  ventanas: VentanasDemanda[],
  stockPorItem: Map<number, number>,
  umbrales: UmbralesInventarioObjetivo = UMBRALES_INVENTARIO_OBJETIVO_DEFECTO,
): InventarioObjetivoItem[] {
  return ventanas.map((v) => {
    const stockActual = stockPorItem.get(v.itemRowId) ?? 0;
    const stockObjetivo =
      v.promedioDiario30d * umbrales.coberturaObjetivoDias * umbrales.factorSeguridad;
    const coberturaMeses = v.promedioMensual30d > 0 ? stockActual / v.promedioMensual30d : null;

    return {
      itemRowId: v.itemRowId,
      stockActual,
      stockObjetivo,
      coberturaMeses,
      excedente: Math.max(0, stockActual - stockObjetivo),
      deficit: Math.max(0, stockObjetivo - stockActual),
      calidadDatos: v.calidadDatos,
    };
  });
}
