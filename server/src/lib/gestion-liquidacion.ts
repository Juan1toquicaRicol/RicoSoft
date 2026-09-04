/**
 * Gestión de liquidación — Fase G del Centro de Planeación (acción
 * "Gestionar liquidación" sobre una decisión "liquidar"). Registra el
 * seguimiento de la decisión empresarial; RicoSoft nunca ajusta las
 * existencias reales en Siesa (solo lectura). "EJECUTADA" significa que la
 * empresa realizó la acción comercial/operativa fuera de esta integración.
 */
export type EstadoGestionLiquidacion =
  "PENDIENTE" | "EN_REVISION" | "APROBADA" | "RECHAZADA" | "EJECUTADA";

const TRANSICIONES_VALIDAS: Record<EstadoGestionLiquidacion, EstadoGestionLiquidacion[]> = {
  PENDIENTE: ["EN_REVISION", "RECHAZADA"],
  EN_REVISION: ["APROBADA", "RECHAZADA"],
  APROBADA: ["EJECUTADA", "RECHAZADA"],
  RECHAZADA: [],
  EJECUTADA: [],
};

export function esTransicionValidaLiquidacion(
  actual: EstadoGestionLiquidacion,
  siguiente: EstadoGestionLiquidacion,
): boolean {
  return TRANSICIONES_VALIDAS[actual].includes(siguiente);
}

export function esEstadoTerminalLiquidacion(estado: EstadoGestionLiquidacion): boolean {
  return TRANSICIONES_VALIDAS[estado].length === 0;
}
