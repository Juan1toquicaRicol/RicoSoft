/**
 * OTIF (On Time In Full, versión "on time") — Fase 2.1 del Motor de
 * Decisiones (P0 Logística). Función pura, sin I/O: recibe despachos ya
 * consultados de la base de RicoSoft (nunca de Siesa — Despacho es un
 * modelo propio, snapshot de una venta real, ver schema.prisma) y calcula
 * el % de despachos entregados a tiempo.
 *
 * Deliberadamente NO mide "In Full" (cantidad completa vs. cantidad
 * entregada por línea): eso requeriría comparar DespachoLinea.cantidadSolicitada
 * contra cantidadEntregada agregada por despacho, que es una decisión de
 * negocio distinta (¿qué margen de faltante cuenta como "no completo"?) no
 * resuelta en la Fase 2.1 — se deja fuera en vez de inventar un umbral.
 *
 * "A tiempo" = fechaEntregaReal <= fechaEntregaEstimada. Un despacho sin
 * fechaEntregaEstimada registrada no se puede evaluar (no hay promesa
 * contra la cual medir) y se excluye del total, no se cuenta como
 * incumplido ni como cumplido — evita inflar o desinflar el % con datos
 * incompletos.
 */

export interface DespachoParaOtif {
  id: string;
  estado: string;
  fechaEntregaEstimada: Date | null;
  fechaEntregaReal: Date | null;
}

export interface ResultadoOtif {
  /** Despachos ENTREGADO/ENTREGA_PARCIAL con ambas fechas presentes (los únicos evaluables). */
  totalEvaluable: number;
  aTiempo: number;
  /** null cuando totalEvaluable es 0 — "sin datos", nunca 0% engañoso. */
  otifPct: number | null;
  /** Despachos entregados pero sin fechaEntregaEstimada — no se pueden evaluar, se reportan aparte. */
  sinFechaEstimada: number;
}

const ESTADOS_ENTREGADOS = new Set(["ENTREGADO", "ENTREGA_PARCIAL"]);

export function calcularOtif(despachos: DespachoParaOtif[]): ResultadoOtif {
  const entregados = despachos.filter((d) => ESTADOS_ENTREGADOS.has(d.estado));

  let totalEvaluable = 0;
  let aTiempo = 0;
  let sinFechaEstimada = 0;

  for (const d of entregados) {
    if (!d.fechaEntregaEstimada) {
      sinFechaEstimada += 1;
      continue;
    }
    // fechaEntregaReal debería existir siempre que el estado ya sea
    // ENTREGADO/ENTREGA_PARCIAL (se autocompleta al hacer la transición,
    // ver despachos.controller.ts), pero se valida igual por si un dato
    // viejo/corregido a mano no la tiene — mismo criterio que sin estimada.
    if (!d.fechaEntregaReal) {
      sinFechaEstimada += 1;
      continue;
    }
    totalEvaluable += 1;
    if (d.fechaEntregaReal.getTime() <= d.fechaEntregaEstimada.getTime()) {
      aTiempo += 1;
    }
  }

  return {
    totalEvaluable,
    aTiempo,
    otifPct: totalEvaluable > 0 ? Math.round((aTiempo / totalEvaluable) * 1000) / 10 : null,
    sinFechaEstimada,
  };
}
