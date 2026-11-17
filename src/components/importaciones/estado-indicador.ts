/**
 * Distingue, usando SOLO lo que devuelve el backend de analítica:
 * - "sin-operaciones": totalOperacionesConsideradas === 0 (no hay órdenes en
 *   los estados incluidos, dentro del periodo y filtros).
 * - "datos-insuficientes": hay operaciones pero ninguna cuenta para el
 *   indicador (promedio null y cantidadAnalizada 0; el backend las cuenta en
 *   cantidadExcluida).
 * - "con-datos": el indicador tiene promedio.
 */
export type EstadoIndicador = "sin-operaciones" | "datos-insuficientes" | "con-datos";

export function clasificarEstadoIndicador(
  agregado: { promedio: number | null; cantidadAnalizada: number },
  totalOperacionesConsideradas: number,
): EstadoIndicador {
  if (agregado.promedio !== null && agregado.cantidadAnalizada > 0) return "con-datos";
  if (totalOperacionesConsideradas === 0) return "sin-operaciones";
  return "datos-insuficientes";
}

export const ID_DEFINICIONES_ANALITICA = "definiciones-analitica";
