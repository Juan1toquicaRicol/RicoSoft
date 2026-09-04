import type { ExistenciaItemSiesa } from "../modules/integraciones-siesa/siesa-inventario.service";
import type { PronosticoProductoSiesa } from "./demanda-siesa";

/**
 * Cobertura de inventario — Parte 4 del módulo Producción & Planeación:
 * "con lo que tenemos hoy, ¿cuántos días aguantamos vendiendo al ritmo
 * normal?"
 *
 *   diasCobertura = existenciaDisponible ÷ (ventaPromedioMensual ÷ 30)
 *
 * Cruza el inventario real (Bloque 1, t400_cm_existencia) con la demanda
 * ya calculada (Bloque 2, calcularPronosticoDemandaSiesa — mismo dato, sin
 * recalcularlo). Cuando un producto no tiene demanda calculada (no aparece
 * en el pronóstico — sin venta en los últimos 12 meses completos),
 * diasCobertura es null: no se inventa una cobertura "infinita" ni "cero",
 * se reporta explícitamente que no hay base para calcularla.
 *
 * Solo aplica a mercancía vendible — la cobertura de un insumo/repuesto no
 * tiene el mismo sentido (no se "vende", se consume).
 */
export interface UmbralesCoberturaSiesa {
  diasRupturaCobertura: number;
  diasSobreCobertura: number;
}

export const UMBRALES_COBERTURA_DEFECTO: UmbralesCoberturaSiesa = {
  diasRupturaCobertura: 15,
  diasSobreCobertura: 180,
};

export interface ItemCoberturaSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  existenciaDisponible: number;
  ventaPromedioMensual: number;
  /** Null = sin demanda calculada en los últimos 12 meses (no hay base para estimar cobertura). */
  diasCobertura: number | null;
}

export interface ResumenCoberturaSiesa {
  /** Promedio simple sobre los ítems vendibles con cobertura calculable. Null si ninguno la tiene. */
  coberturaPromedioDias: number | null;
  /** Ítems vendibles con demanda real y menos de 15 días de cobertura — riesgo de quedarse sin stock pronto. */
  riesgoRuptura: ItemCoberturaSiesa[];
  /** Ítems vendibles con más de 180 días de cobertura — mismo umbral que "obsolescencia" en Bloque 1, por consistencia. */
  sobreCobertura: ItemCoberturaSiesa[];
}

/**
 * Calcula la cobertura de cada producto vendible y arma dos listas
 * accionables: riesgo de ruptura (cobertura muy baja) y sobre-cobertura
 * (demasiado inventario para el ritmo de venta actual). Función pura — sin
 * I/O — ambas fuentes (existencias, pronóstico) ya se verificaron en vivo
 * por separado.
 */
export function calcularResumenCoberturaSiesa(
  existencias: ExistenciaItemSiesa[],
  pronostico: PronosticoProductoSiesa[],
  umbrales: UmbralesCoberturaSiesa = UMBRALES_COBERTURA_DEFECTO,
): ResumenCoberturaSiesa {
  const pronosticoPorItem = new Map(pronostico.map((p) => [p.itemRowId, p]));

  const items: ItemCoberturaSiesa[] = [];
  for (const e of existencias) {
    if (!e.esVendible) continue;
    const p = pronosticoPorItem.get(e.itemRowId);
    const ventaPromedioMensual = p?.ventaPromedioMensual ?? 0;
    const ventaDiaria = ventaPromedioMensual / 30;
    const diasCobertura = ventaDiaria > 0 ? Math.round(e.cantidadExistente / ventaDiaria) : null;

    items.push({
      itemRowId: e.itemRowId,
      descripcion: e.descripcion,
      referencia: e.referencia,
      unidadMedida: p?.unidadMedida ?? null,
      existenciaDisponible: e.cantidadExistente,
      ventaPromedioMensual,
      diasCobertura,
    });
  }

  const conCobertura = items.filter(
    (i): i is ItemCoberturaSiesa & { diasCobertura: number } => i.diasCobertura !== null,
  );
  const coberturaPromedioDias =
    conCobertura.length > 0
      ? Math.round(conCobertura.reduce((acc, i) => acc + i.diasCobertura, 0) / conCobertura.length)
      : null;

  const riesgoRuptura = conCobertura
    .filter((i) => i.diasCobertura < umbrales.diasRupturaCobertura)
    .sort((a, b) => a.diasCobertura - b.diasCobertura)
    .slice(0, 15);

  const sobreCobertura = conCobertura
    .filter((i) => i.diasCobertura > umbrales.diasSobreCobertura)
    .sort((a, b) => b.diasCobertura - a.diasCobertura)
    .slice(0, 15);

  return { coberturaPromedioDias, riesgoRuptura, sobreCobertura };
}
