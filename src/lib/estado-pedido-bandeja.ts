import type { CompromisoInventarioPedido } from "@/hooks/use-comercial";

/** Texto del estado del pedido cuando NO tiene documento ERP (PDV) vinculado. */
export const ETIQUETA_PENDIENTE_ERP = "Pendiente de envío a ERP";

export interface EstadoBandejaPedido {
  texto: string;
  /** "erp": estado operativo real de Siesa; "pendiente": aún sin PDV;
   * "comercial": no se pudo consultar Siesa, se muestra el estado comercial. */
  origen: "erp" | "pendiente" | "comercial";
}

/**
 * Estado que la bandeja de Pedidos muestra por fila:
 *  - con PDV vinculado (Siesa lo devolvió): su estado operativo UnoEE
 *    (Comprometido, Facturado, Retenido, ...);
 *  - sin documento ERP: "Pendiente de envío a ERP";
 *  - vinculado pero Siesa no lo devuelve: "No encontrado en Siesa";
 *  - Siesa no disponible (o sin datos): el estado comercial de RicoSoft.
 */
export function estadoBandejaPedido(
  estadoComercial: string,
  compromiso: CompromisoInventarioPedido | null | undefined,
): EstadoBandejaPedido {
  if (!compromiso) return { texto: estadoComercial, origen: "comercial" };
  switch (compromiso.compromiso) {
    case "SIN_VINCULO_ERP":
      return { texto: ETIQUETA_PENDIENTE_ERP, origen: "pendiente" };
    case "SIESA_NO_ENCONTRADO":
      return { texto: "No encontrado en Siesa", origen: "erp" };
    default:
      return {
        texto: compromiso.siesa?.estadoUnoee ?? estadoComercial,
        origen: compromiso.siesa ? "erp" : "comercial",
      };
  }
}
