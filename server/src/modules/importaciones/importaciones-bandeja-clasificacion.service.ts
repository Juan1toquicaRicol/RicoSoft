/**
 * Clasificación determinística de un correo/adjunto (§4 de la
 * especificación) — señales de asunto/remitente/nombre de archivo/MIME.
 * Sin IA en V1 (ver auditoría): si estas reglas no alcanzan, el correo
 * queda clasificado como "OTRO" y sigue el pipeline igual (una
 * clasificación débil no bloquea la extracción/matching, solo es menos
 * informativa en el listado de la Bandeja).
 */
export const TIPOS_CLASIFICACION_VALIDOS = [
  "COTIZACION",
  "CONFIRMACION_ORDEN",
  "ORDEN_COMPRA",
  "PRODUCCION",
  "AVISO_DESPACHO",
  "FACTURA",
  "PACKING_LIST",
  "BL",
  "AWB",
  "CERTIFICADO",
  "DOCUMENTACION",
  "RECLAMACION",
  "CONSULTA",
  "OTRO",
] as const;

export type TipoClasificacion = (typeof TIPOS_CLASIFICACION_VALIDOS)[number];

interface ReglaClasificacion {
  tipo: TipoClasificacion;
  patrones: RegExp[];
}

// Orden importa: la primera regla que matchee gana. Cotización/Confirmación/
// Orden antes que Factura/PackingList porque un correo de seguimiento suele
// mencionar varias palabras a la vez (ej. "attached invoice for your PO").
const REGLAS: ReglaClasificacion[] = [
  { tipo: "COTIZACION", patrones: [/quotation/i, /cotizaci[oó]n/i, /\bquote\b/i] },
  {
    tipo: "CONFIRMACION_ORDEN",
    patrones: [/order\s*confirmation/i, /confirmaci[oó]n\s*de\s*orden/i, /po\s*confirmation/i],
  },
  // Deliberadamente SIN un patrón genérico "\bPO\b": esa sigla aparece como
  // REFERENCIA en casi cualquier tipo de documento (un packing list, una
  // factura o un aviso de despacho mencionan "PO-4587" sin ser ellos mismos
  // una orden de compra) — solo la frase completa es señal confiable de que
  // el documento ES una orden de compra.
  {
    tipo: "ORDEN_COMPRA",
    patrones: [/purchase\s*order/i, /orden\s*de\s*compra/i],
  },
  { tipo: "PRODUCCION", patrones: [/production/i, /producci[oó]n/i, /manufactur/i] },
  {
    tipo: "AVISO_DESPACHO",
    patrones: [/shipping\s*confirmation/i, /shipment/i, /aviso\s*de\s*despacho/i, /despacho/i],
  },
  { tipo: "FACTURA", patrones: [/invoice/i, /factura/i] },
  { tipo: "PACKING_LIST", patrones: [/packing\s*list/i, /lista\s*de\s*empaque/i] },
  { tipo: "BL", patrones: [/bill\s*of\s*lading/i, /\bb\/?l\b/i] },
  { tipo: "AWB", patrones: [/air\s*waybill/i, /\bawb\b/i] },
  { tipo: "CERTIFICADO", patrones: [/certificate/i, /certificado/i] },
  { tipo: "RECLAMACION", patrones: [/claim/i, /reclamaci[oó]n/i, /complaint/i] },
  { tipo: "CONSULTA", patrones: [/inquiry/i, /consulta/i, /question/i] },
];

/**
 * Clasifica usando asunto + remitente + nombres de archivo adjuntos, en ese
 * orden de peso (el asunto suele ser la señal más confiable). Devuelve
 * "OTRO" si ninguna regla matchea — nunca null, para no bifurcar el
 * pipeline en un caso especial.
 */
export function clasificarCorreo(datos: {
  asunto: string;
  remitente: string;
  nombresAdjuntos: string[];
}): TipoClasificacion {
  const textoCompleto = [datos.asunto, datos.remitente, ...datos.nombresAdjuntos].join(" ");
  for (const regla of REGLAS) {
    if (regla.patrones.some((p) => p.test(textoCompleto))) return regla.tipo;
  }
  return "OTRO";
}
