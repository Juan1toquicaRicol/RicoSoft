/**
 * Hitos reales de un lote de importación — funciones puras, sin I/O.
 *
 * Un hito es un hecho del mundo real con fecha y origen (quién lo registró).
 * NO sustituye ni se mezcla con las fechas estimadas del proveedor
 * (LoteImportacion.fechaLlegadaEstimada) ni con la estimación en vivo del
 * tracking marítimo (LoteImportacion.etaTrackingActual): son datos con dueños
 * distintos y nunca se escriben unos sobre otros.
 *
 * Tipos:
 *  - EMBARQUE_REAL, LLEGADA_PUERTO, INSPECCION_ADUANERA: los registra una
 *    persona (confirmación humana / dato del forwarder o la agencia) con
 *    importaciones.gestionar_transito.
 *  - RECEPCION_PLANTA: solo la deriva el sistema al recibir el lote en planta
 *    (importaciones.recibir); no se puede forjar desde el endpoint manual.
 *
 * El levante aduanero no es un hito de esta tabla: sigue siendo
 * ExpedienteAduanero.fechaLevante (única fuente). La liberación para
 * inventario disponible no se modela: no hay inventario por lote ni regla de
 * Calidad definida en el repositorio.
 */

export const TIPOS_HITO_LOTE = [
  "EMBARQUE_REAL",
  "LLEGADA_PUERTO",
  "INSPECCION_ADUANERA",
  "RECEPCION_PLANTA",
] as const;
export type TipoHitoLote = (typeof TIPOS_HITO_LOTE)[number];

/** Hitos que una persona puede registrar o corregir a mano. */
export const TIPOS_HITO_MANUAL: readonly TipoHitoLote[] = [
  "EMBARQUE_REAL",
  "LLEGADA_PUERTO",
  "INSPECCION_ADUANERA",
];

export const ETIQUETA_HITO: Record<TipoHitoLote, string> = {
  EMBARQUE_REAL: "Embarque (real)",
  LLEGADA_PUERTO: "Llegada a puerto (real)",
  INSPECCION_ADUANERA: "Inspección aduanera",
  RECEPCION_PLANTA: "Recepción física en planta",
};

export function esTipoHitoLote(valor: unknown): valor is TipoHitoLote {
  return typeof valor === "string" && (TIPOS_HITO_LOTE as readonly string[]).includes(valor);
}

export function esTipoHitoManual(valor: unknown): valor is TipoHitoLote {
  return esTipoHitoLote(valor) && TIPOS_HITO_MANUAL.includes(valor);
}

/** Pares (antes, después) que no pueden quedar invertidos en el tiempo. */
const ORDEN_CRONOLOGICO: ReadonlyArray<readonly [TipoHitoLote, TipoHitoLote]> = [
  ["EMBARQUE_REAL", "LLEGADA_PUERTO"],
  ["LLEGADA_PUERTO", "INSPECCION_ADUANERA"],
  ["LLEGADA_PUERTO", "RECEPCION_PLANTA"],
];

/** Tolerancia hacia el futuro: fechas de solo-día llegan a medianoche UTC. */
const TOLERANCIA_FUTURO_MS = 24 * 60 * 60 * 1000;

export type HitosExistentes = Partial<Record<TipoHitoLote, Date>>;

/**
 * Valida un hito nuevo/corregido contra los hitos que ya tiene el lote.
 * Devuelve null si es válido o el mensaje de error en español.
 */
export function validarHito(
  tipo: TipoHitoLote,
  fecha: Date,
  existentes: HitosExistentes,
  ahora: Date,
): string | null {
  if (Number.isNaN(fecha.getTime())) return "La fecha del hito no es válida.";
  if (fecha.getTime() > ahora.getTime() + TOLERANCIA_FUTURO_MS) {
    return "La fecha de un hito real no puede estar en el futuro.";
  }
  for (const [antes, despues] of ORDEN_CRONOLOGICO) {
    if (tipo === despues && existentes[antes] && fecha.getTime() < existentes[antes]!.getTime()) {
      return `${ETIQUETA_HITO[despues]} no puede ser anterior a ${ETIQUETA_HITO[antes]} (${existentes[antes]!.toISOString().slice(0, 10)}).`;
    }
    if (tipo === antes && existentes[despues] && fecha.getTime() > existentes[despues]!.getTime()) {
      return `${ETIQUETA_HITO[antes]} no puede ser posterior a ${ETIQUETA_HITO[despues]} (${existentes[despues]!.toISOString().slice(0, 10)}).`;
    }
  }
  return null;
}
