/** Máquina de estados de Proforma (espejo del backend,
 * server/src/modules/proformas/proformas-estados.ts):
 *   ENVIADA -> ACEPTADA -> PEDIDO_CREADO;  ENVIADA | ACEPTADA -> ANULADA.
 * PEDIDO_CREADO y ANULADA son inmutables. El backend es la autoridad; esto
 * solo decide qué botones mostrar. */
export type EstadoProforma = "ENVIADA" | "ACEPTADA" | "PEDIDO_CREADO" | "ANULADA";

export interface AccionesProforma {
  /** "Aceptar Proforma": solo ENVIADA. */
  puedeAceptar: boolean;
  /** "Crear Pedido": solo ACEPTADA. */
  puedeCrearPedido: boolean;
  /** Vincular ERP / editar: solo estados mutables (ENVIADA, ACEPTADA). */
  puedeEditar: boolean;
  esInmutable: boolean;
}

export function accionesProforma(
  estado: string,
  permisos: {
    gestionarProformas: boolean;
    /** comercial.proformas.aceptar */
    aceptarProformas: boolean;
    gestionarPedidos: boolean;
  },
): AccionesProforma {
  const esInmutable = estado === "PEDIDO_CREADO" || estado === "ANULADA";
  return {
    puedeAceptar: permisos.aceptarProformas && estado === "ENVIADA",
    puedeCrearPedido: permisos.gestionarPedidos && estado === "ACEPTADA",
    puedeEditar: permisos.gestionarProformas && !esInmutable,
    esInmutable,
  };
}

/** Proformas que pueden originar un pedido (filtro del menú "Nuevo pedido"). */
export const ESTADO_PROFORMA_PARA_PEDIDO: EstadoProforma = "ACEPTADA";
