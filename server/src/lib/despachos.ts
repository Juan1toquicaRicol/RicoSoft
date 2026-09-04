/**
 * Control de Despachos — máquina de estados logísticos. RicoSoft nunca
 * escribe de vuelta a Siesa: este flujo es seguimiento 100% nativo sobre
 * un documento de venta real ya facturado en Siesa (ver prisma/schema.prisma,
 * modelo Despacho). "NOVEDAD" no es un estado bloqueante único en esta
 * máquina — las novedades (DespachoNovedad) se registran en paralelo sin
 * congelar el pipeline; solo si el negocio decide explícitamente que una
 * novedad amerita devolver o cancelar, se transiciona a DEVUELTO/CANCELADO.
 * Esta simplificación se documenta porque el spec original no definía a
 * qué estado debería volver un despacho tras "resolver" una novedad
 * genérica — inventar esa regla habría sido una suposición de negocio no
 * verificada.
 */
export type EstadoDespacho =
  | "RECIBIDO"
  | "PREPARANDO"
  | "PREPARADO"
  | "PENDIENTE_CARGUE"
  | "CARGANDO"
  | "CARGADO"
  | "DESPACHADO"
  | "EN_TRANSITO"
  | "ENTREGADO"
  | "ENTREGA_PARCIAL"
  | "DEVUELTO"
  | "CANCELADO";

const TRANSICIONES_VALIDAS: Record<EstadoDespacho, EstadoDespacho[]> = {
  RECIBIDO: ["PREPARANDO", "CANCELADO"],
  PREPARANDO: ["PREPARADO", "CANCELADO"],
  PREPARADO: ["PENDIENTE_CARGUE", "CANCELADO"],
  PENDIENTE_CARGUE: ["CARGANDO", "CANCELADO"],
  CARGANDO: ["CARGADO", "CANCELADO"],
  CARGADO: ["DESPACHADO", "CANCELADO"],
  DESPACHADO: ["EN_TRANSITO"],
  EN_TRANSITO: ["ENTREGADO", "ENTREGA_PARCIAL", "DEVUELTO"],
  ENTREGADO: [],
  ENTREGA_PARCIAL: ["DEVUELTO"],
  DEVUELTO: [],
  CANCELADO: [],
};

export function esTransicionValidaDespacho(
  actual: EstadoDespacho,
  siguiente: EstadoDespacho,
): boolean {
  return TRANSICIONES_VALIDAS[actual].includes(siguiente);
}

export function esEstadoTerminalDespacho(estado: EstadoDespacho): boolean {
  return TRANSICIONES_VALIDAS[estado].length === 0;
}

export function estadosSiguientesDespacho(estado: EstadoDespacho): EstadoDespacho[] {
  return TRANSICIONES_VALIDAS[estado];
}

/**
 * Campos adicionales que cada transición espera recibir — el controller los
 * valida antes de aceptar el cambio de estado (no inventa valores, y no
 * permite "CARGADO" sin vehículo/conductor, ni "ENTREGADO" sin quién
 * recibió). Devuelve la lista de claves requeridas; el llamador decide qué
 * hacer si faltan.
 */
export function camposRequeridosParaTransicion(siguiente: EstadoDespacho): string[] {
  switch (siguiente) {
    case "CARGANDO":
      return ["vehiculoPlaca", "conductorNombre"];
    case "DESPACHADO":
      return ["fechaDespacho"];
    case "ENTREGADO":
    case "ENTREGA_PARCIAL":
      return ["recibidoPor"];
    default:
      return [];
  }
}

/**
 * Líneas de un despacho con cantidad faltante (solicitada - preparada) —
 * usado para decidir si un despacho puede marcarse "PREPARADO" sin
 * faltantes, o si debe quedar como preparación parcial. Función pura.
 */
export interface LineaDespachoConFaltante {
  itemRowId: number;
  cantidadSolicitada: number;
  cantidadPreparada: number | null;
  faltante: number;
}

export function calcularFaltantesPreparacion(
  lineas: { itemRowId: number; cantidadSolicitada: number; cantidadPreparada: number | null }[],
): LineaDespachoConFaltante[] {
  return lineas
    .map((l) => ({
      itemRowId: l.itemRowId,
      cantidadSolicitada: l.cantidadSolicitada,
      cantidadPreparada: l.cantidadPreparada,
      faltante: Math.max(0, l.cantidadSolicitada - (l.cantidadPreparada ?? 0)),
    }))
    .filter((l) => l.faltante > 0);
}
