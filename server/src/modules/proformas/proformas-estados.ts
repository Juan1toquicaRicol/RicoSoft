/**
 * Máquina de estados de Proforma:
 *
 *   ENVIADA (default) --aceptar--> ACEPTADA --crear pedido--> PEDIDO_CREADO
 *   ENVIADA | ACEPTADA --anular--> ANULADA
 *
 * PEDIDO_CREADO y ANULADA son INMUTABLES: no admiten edición, aceptación ni
 * anulación. Solo una ACEPTADA puede originar un Pedido Comercial.
 */
export const ESTADO_PROFORMA = {
  ENVIADA: "ENVIADA",
  ACEPTADA: "ACEPTADA",
  PEDIDO_CREADO: "PEDIDO_CREADO",
  ANULADA: "ANULADA",
} as const;

export type EstadoProforma = (typeof ESTADO_PROFORMA)[keyof typeof ESTADO_PROFORMA];

const INMUTABLES: readonly string[] = [ESTADO_PROFORMA.PEDIDO_CREADO, ESTADO_PROFORMA.ANULADA];

/** true si la proforma ya no admite edición, aceptación ni anulación. */
export function esProformaInmutable(estado: string): boolean {
  return INMUTABLES.includes(estado);
}

/** Puede aceptarse solo desde ENVIADA. */
export function puedeAceptarProforma(estado: string): boolean {
  return estado === ESTADO_PROFORMA.ENVIADA;
}

/** Puede originar un Pedido Comercial solo si está ACEPTADA. */
export function puedeCrearPedidoDesdeProforma(estado: string): boolean {
  return estado === ESTADO_PROFORMA.ACEPTADA;
}

/** Mensaje uniforme para un intento sobre una proforma inmutable. */
export function mensajeProformaInmutable(estado: string): string {
  return estado === ESTADO_PROFORMA.PEDIDO_CREADO
    ? "La proforma ya generó un pedido y no admite cambios."
    : "La proforma está anulada y no admite cambios.";
}
