/**
 * Plan de producción con estados — Etapa J del módulo Producción &
 * Planeación. Modelo nativo de RicoSoft (PlanProduccion, ver
 * prisma/schema.prisma): Siesa no trackea WIP en tiempo real (confirmado en
 * vivo: t851_mf_op_docto_item, 0 líneas abiertas) ni tiene un MRP usable
 * (t834_mf_ordenes_planeadas, abandonado). RicoSoft nunca escribe de vuelta
 * a Siesa: este plan es solo seguimiento interno del avance de producción,
 * no crea una orden real allá.
 */
export type EstadoPlanProduccion =
  | "Planificada"
  | "Aprobada"
  | "En producción"
  | "Parcial"
  | "Terminada"
  | "Cancelada";

/**
 * Transiciones válidas por estado actual. Cancelada es alcanzable desde
 * cualquier estado no terminal (Terminada/Cancelada son terminales, sin
 * salida) — un plan se puede cancelar en cualquier punto antes de terminar,
 * pero una vez terminado o cancelado queda fijo como historial.
 */
const TRANSICIONES_VALIDAS: Record<EstadoPlanProduccion, EstadoPlanProduccion[]> = {
  Planificada: ["Aprobada", "Cancelada"],
  Aprobada: ["En producción", "Cancelada"],
  "En producción": ["Parcial", "Terminada", "Cancelada"],
  Parcial: ["Terminada", "Cancelada"],
  Terminada: [],
  Cancelada: [],
};

export function esTransicionValida(
  actual: EstadoPlanProduccion,
  siguiente: EstadoPlanProduccion,
): boolean {
  return TRANSICIONES_VALIDAS[actual].includes(siguiente);
}

export function esEstadoTerminal(estado: EstadoPlanProduccion): boolean {
  return TRANSICIONES_VALIDAS[estado].length === 0;
}
