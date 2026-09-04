import type { PronosticoProductoSiesa } from "./demanda-siesa";
import type { ExistenciaItemSiesa } from "../modules/integraciones-siesa/siesa-inventario.service";
import { confianzaPorHistorial, type Confianza } from "../domain/planeacion/decisiones";

/**
 * Producción recomendada — Bloque 4 del módulo Producción & Inventario.
 *
 * Fórmula original propuesta:
 *   demanda proyectada + pedidos comprometidos + stock de seguridad
 *   − inventario disponible vendible − producción en proceso − compras en tránsito
 *
 * Fórmula REAL implementada aquí (dos términos se verificaron en vivo como
 * NO disponibles y se excluyen explícitamente, no se simulan):
 *   max(0, demandaProyectada + pedidosComprometidos − inventarioDisponible − cantidadPendienteEntrar)
 *
 * - "stock de seguridad" NO se incluye: f400_cant_nivel_min_1 /
 *   f400_cant_nivel_pedido están en 0 para TODOS los ítems (8.175 de 8.175,
 *   cia 1) — Siesa no tiene ese dato configurado, no se puede inventar.
 * - "producción en proceso" NO se incluye por separado: t851_mf_op_docto_item
 *   no tiene ninguna línea abierta (cant_ordenada > cant_completa, sin
 *   fecha_terminacion) en ninguno de los tenants verificados — o Siesa no
 *   trackea WIP en tiempo real, o el cierre es inmediato. Se usa en su
 *   lugar f400_cant_pendiente_entrar_1 (existencia), que sí tiene datos
 *   reales (94 de 8.175 ítems, cia 1) y cubre tanto compra como producción
 *   ya en camino, aunque Siesa no distingue cuál de las dos.
 * - "demanda proyectada" = ventaPromedioMensual del pronóstico (Bloque 2)
 *   ajustada por tendenciaPct, con la tendencia limitada a [-50%, +100%]
 *   para no proyectar un solo mes atípico como si fuera la norma.
 *
 * Solo aplica a mercancía vendible (esVendible=true) — no tiene sentido
 * "recomendar producción" de un repuesto o insumo de uso interno.
 */
const TENDENCIA_MIN_FACTOR = 0.5; // tendencia de hasta -50% se aplica completa
const TENDENCIA_MAX_FACTOR = 2.0; // tendencia de hasta +100% se aplica completa

export interface RecomendacionProduccionSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  demandaProyectada: number;
  pedidosComprometidos: number;
  inventarioDisponible: number;
  cantidadPendienteEntrar: number;
  produccionRecomendada: number;
  /** Venta promedio mensual real (antes de aplicar la tendencia) — la base del "por qué". */
  ventaPromedioMensual: number;
  /** % de variación reciente aplicado a la demanda proyectada; null si no hay base de comparación. */
  tendenciaPct: number | null;
  /** Cuántos de los últimos 12 meses tuvieron venta real — la base de la confianza, nunca inventada. */
  mesesConVenta: number;
  /** Misma regla que el Centro de Decisiones (confianzaPorHistorial): ninguna cifra nueva, solo reutilizada. */
  confianza: Confianza;
}

function clamp(valor: number, min: number, max: number): number {
  return Math.min(Math.max(valor, min), max);
}

/**
 * Calcula la producción recomendada por producto, cruzando el pronóstico de
 * demanda (Bloque 2) con el inventario real (Bloque 1). Función pura — sin
 * I/O. Solo devuelve productos donde realmente hace falta producir
 * (produccionRecomendada > 0) — un producto con inventario suficiente
 * aparece con recomendación 0 y se omite de la lista, igual que en el
 * ejemplo original ("Producto X ... Producción recomendada: 0").
 */
export function calcularProduccionRecomendadaSiesa(
  pronostico: PronosticoProductoSiesa[],
  existencias: ExistenciaItemSiesa[],
): RecomendacionProduccionSiesa[] {
  const existenciaPorItem = new Map(existencias.map((e) => [e.itemRowId, e]));

  const resultados: RecomendacionProduccionSiesa[] = [];
  for (const p of pronostico) {
    const e = existenciaPorItem.get(p.itemRowId);
    if (!e || !e.esVendible) continue;

    const factorTendencia =
      p.tendenciaPct === null
        ? 1
        : clamp(1 + p.tendenciaPct / 100, TENDENCIA_MIN_FACTOR, TENDENCIA_MAX_FACTOR);
    const demandaProyectada = Math.max(0, p.ventaPromedioMensual * factorTendencia);

    const produccionRecomendada = Math.max(
      0,
      demandaProyectada + e.cantidadComprometida - e.cantidadExistente - e.cantidadPendienteEntrar,
    );
    if (produccionRecomendada <= 0) continue;

    resultados.push({
      itemRowId: p.itemRowId,
      descripcion: p.descripcion,
      referencia: p.referencia,
      unidadMedida: p.unidadMedida,
      demandaProyectada,
      pedidosComprometidos: e.cantidadComprometida,
      inventarioDisponible: e.cantidadExistente,
      cantidadPendienteEntrar: e.cantidadPendienteEntrar,
      produccionRecomendada,
      ventaPromedioMensual: p.ventaPromedioMensual,
      tendenciaPct: p.tendenciaPct,
      mesesConVenta: p.mesesConVenta,
      confianza: confianzaPorHistorial(p.mesesConVenta),
    });
  }

  return resultados.sort((a, b) => b.produccionRecomendada - a.produccionRecomendada).slice(0, 20);
}
