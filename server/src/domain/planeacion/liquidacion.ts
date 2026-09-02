import type { ItemInventarioClasificado } from "../../lib/inventario-siesa";

/**
 * Score de liquidación — Fase D del Centro de Planeación. Reemplaza el
 * criterio anterior de "más de 180 días = liquidar" (insuficiente: un
 * producto de $50.000 sin vender hace 200 días no es lo mismo que uno de
 * $80.000.000) por un score 0-100 que combina varias señales reales.
 *
 * Solo aplica a mercancía ya identificada en riesgo por
 * lib/inventario-siesa.ts (clasificacion "exceso", "obsolescencia" o
 * "sin_movimiento", naturaleza="producto") — este módulo NO reclasifica
 * inventario, solo prioriza lo que ya está marcado en riesgo.
 *
 * Señales usadas (todas verificables contra datos reales ya disponibles):
 * - antigüedad (días sin venta, o "nunca vendió" para sin_movimiento):
 *   hasta 40 pts — entre más viejo, más urgente.
 * - valor inmovilizado (capital atrapado): hasta 30 pts, por bandas —
 *   mientras más dinero detenido, mayor prioridad de negocio.
 * - demanda reciente (ventaPromedioMensual del pronóstico, Bloque 2):
 *   hasta 30 pts — si NUNCA hay demanda reciente reportada (el producto no
 *   aparece en el pronóstico, o su venta promedio es 0), el score sube al
 *   máximo: no hay evidencia de que vaya a rotar por sí solo.
 *
 * LIMITACIÓN DOCUMENTADA: no se usa "frecuencia histórica de venta" ni
 * "tendencia" como señales independientes — evaluarLiquidacion ya recibe
 * ventaPromedioMensual y tendenciaPct del mismo pronóstico (Bloque 2) que
 * ambos usan la misma ventana de 12 meses; agregarlas por separado
 * duplicaría la misma señal con otro nombre en vez de aportar información
 * nueva. Si en el futuro se agrega historial de descuentos u ofertas
 * pasadas, esa sí sería una señal nueva a incorporar aquí.
 */
export type PrioridadLiquidacion = "CRITICA" | "ALTA" | "MEDIA" | "BAJA";

export interface CandidatoLiquidacionSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidadExistente: number;
  valorTotal: number;
  diasSinVenta: number | null;
  ventaPromedioMensual: number;
  score: number;
  prioridad: PrioridadLiquidacion;
}

function puntajeAntiguedad(diasSinVenta: number | null): number {
  if (diasSinVenta === null) return 40; // nunca vendió: máxima incertidumbre de rotación
  if (diasSinVenta > 365) return 40;
  if (diasSinVenta > 180) return 30;
  if (diasSinVenta > 90) return 20;
  return 10;
}

function puntajeValor(valorTotal: number): number {
  if (valorTotal > 50_000_000) return 30;
  if (valorTotal > 10_000_000) return 20;
  if (valorTotal > 1_000_000) return 10;
  return 5;
}

function puntajeDemanda(ventaPromedioMensual: number): number {
  if (ventaPromedioMensual <= 0) return 30;
  if (ventaPromedioMensual < 5) return 20;
  if (ventaPromedioMensual < 20) return 10;
  return 0;
}

function prioridadDeScore(score: number): PrioridadLiquidacion {
  if (score >= 80) return "CRITICA";
  if (score >= 60) return "ALTA";
  if (score >= 35) return "MEDIA";
  return "BAJA";
}

/**
 * Calcula el score de liquidación para los ítems ya marcados en riesgo
 * (exceso/obsolescencia/sin_movimiento). ventaPromedioPorItem viene del
 * pronóstico de demanda (Bloque 2) — un ítem ausente de ese mapa se trata
 * como demanda 0 (nunca aparece con ventas en los últimos 12 meses).
 */
export function calcularCandidatosLiquidacionSiesa(
  items: ItemInventarioClasificado[],
  ventaPromedioPorItem: Map<number, number>,
): CandidatoLiquidacionSiesa[] {
  const candidatos = items
    .filter(
      (it) =>
        it.naturaleza === "producto" &&
        (it.clasificacion === "exceso" ||
          it.clasificacion === "obsolescencia" ||
          it.clasificacion === "sin_movimiento"),
    )
    .map((it) => {
      const ventaPromedioMensual = ventaPromedioPorItem.get(it.itemRowId) ?? 0;
      const score =
        puntajeAntiguedad(it.diasSinVenta) + puntajeValor(it.valorTotal) + puntajeDemanda(ventaPromedioMensual);

      return {
        itemRowId: it.itemRowId,
        descripcion: it.descripcion,
        referencia: it.referencia,
        unidadMedida: it.unidadMedida,
        cantidadExistente: it.cantidadExistente,
        valorTotal: it.valorTotal,
        diasSinVenta: it.diasSinVenta,
        ventaPromedioMensual,
        score,
        prioridad: prioridadDeScore(score),
      };
    });

  return candidatos.sort((a, b) => b.score - a.score).slice(0, 20);
}
