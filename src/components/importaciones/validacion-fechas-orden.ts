/** id del input de fecha requerida de llegada (foco, aria-invalid/describedby). */
export const ID_CAMPO_FECHA_REQUERIDA = "fecha-requerida-llegada";

/**
 * Regla existente de HEAD, sin cambios: la fecha requerida de llegada no puede
 * ser anterior a la fecha de la orden (solo si ambas están informadas).
 */
export function fechaRequeridaAnteriorAOrden(
  fechaRequeridaLlegada: string,
  fechaOrden: string,
): boolean {
  return (
    !!fechaRequeridaLlegada &&
    !!fechaOrden &&
    new Date(fechaRequeridaLlegada) < new Date(fechaOrden)
  );
}

/** Texto del error bloqueante (etapa 3), idéntico al de HEAD. */
export const TEXTO_ERROR_FECHA_REQUERIDA =
  "La fecha requerida de llegada no puede ser anterior a la fecha de la orden.";

/**
 * Error de fecha con destino de foco (etapa 3). Tiene `focoId` pero NO
 * `campoId`: `campoId` identifica errores de precisión decimal.
 */
export function erroresFechaRequerida(
  fechaRequeridaLlegada: string,
  fechaOrden: string,
): Array<{ texto: string; etapa: 3; focoId: string }> {
  return fechaRequeridaAnteriorAOrden(fechaRequeridaLlegada, fechaOrden)
    ? [{ texto: TEXTO_ERROR_FECHA_REQUERIDA, etapa: 3, focoId: ID_CAMPO_FECHA_REQUERIDA }]
    : [];
}
