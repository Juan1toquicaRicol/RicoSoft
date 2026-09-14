/**
 * Estado legible de una línea de pedido de venta de Siesa (t431_cm_pv_movto
 * + t430_cm_pv_docto) — traducción determinística de los flags/estado
 * crudos confirmados en vivo (ver auditoría cerrada del módulo
 * "Comprometido (estimado)"). Función pura, sin acceso a datos, para poder
 * testear cada combinación de flags de forma aislada.
 *
 * Reglas — en este orden de precedencia (la primera que aplique gana):
 * 1. "Pendiente de aprobación": `indUltEstadoAprobado === false`.
 * 2. "Backorder": `indBackorderDocto === true` o `indBackorderLinea === true`.
 * 3. "Retenido": cualquiera de `indRetenidoMargen`, `indRetenidoCupo`,
 *    `indRetenidoMora`, `indRetenidoBloqueo`, `indRetenidoAnticipo` es true.
 * 4. "Remisionado/Facturado completo": `indFacturado === true` (facturado
 *    completo implica remisionado, así que se reporta el estado más
 *    avanzado).
 * 5. "Parcialmente facturado": `cantFacturada > 0` y `cantFacturada <
 *    cantPedida` (hay factura parcial, aunque el flag de documento
 *    `indFacturado` todavía no esté en true).
 * 6. "Parcialmente remisionado": `indRemisionado === true` o
 *    (`cantRemisionada > 0` y `cantRemisionada < cantPedida`), sin
 *    facturación registrada.
 * 7. "Aprobado": `indUltEstadoAprobado === true` y ninguna de las
 *    condiciones anteriores aplica (pedido aprobado, sin remisión/factura
 *    todavía, sin retención ni backorder).
 * 8. "En proceso": fallback neutral — combinación de flags no cubierta por
 *    las reglas anteriores (ej. datos incompletos/nulos). No se inventa
 *    ninguna regla de negocio no verificada en la auditoría.
 */
export interface FlagsPedidoVentaSiesa {
  indUltEstadoAprobado: boolean | null;
  indBackorderDocto: boolean | null;
  indBackorderLinea: boolean | null;
  indRetenidoMargen: boolean | null;
  indRetenidoCupo: boolean | null;
  indRetenidoMora: boolean | null;
  indRetenidoBloqueo: boolean | null;
  indRetenidoAnticipo: boolean | null;
  indRemisionado: boolean | null;
  indFacturado: boolean | null;
  cantPedida: number;
  cantRemisionada: number;
  cantFacturada: number;
}

export type EstadoPedidoVentaSiesa =
  | "Pendiente de aprobación"
  | "Backorder"
  | "Retenido"
  | "Remisionado/Facturado completo"
  | "Parcialmente facturado"
  | "Parcialmente remisionado"
  | "Aprobado"
  | "En proceso";

export function determinarEstadoPedidoVentaSiesa(
  flags: FlagsPedidoVentaSiesa,
): EstadoPedidoVentaSiesa {
  if (flags.indUltEstadoAprobado === false) return "Pendiente de aprobación";

  if (flags.indBackorderDocto === true || flags.indBackorderLinea === true) return "Backorder";

  if (
    flags.indRetenidoMargen === true ||
    flags.indRetenidoCupo === true ||
    flags.indRetenidoMora === true ||
    flags.indRetenidoBloqueo === true ||
    flags.indRetenidoAnticipo === true
  ) {
    return "Retenido";
  }

  if (flags.indFacturado === true) return "Remisionado/Facturado completo";

  if (flags.cantFacturada > 0 && flags.cantFacturada < flags.cantPedida) {
    return "Parcialmente facturado";
  }

  if (
    flags.indRemisionado === true ||
    (flags.cantRemisionada > 0 && flags.cantRemisionada < flags.cantPedida)
  ) {
    return "Parcialmente remisionado";
  }

  if (flags.indUltEstadoAprobado === true) return "Aprobado";

  return "En proceso";
}
