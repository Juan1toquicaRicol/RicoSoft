/**
 * Semáforo OFICIAL de estado operativo de Ricol S.A.S. (flujo comercial e
 * integración ERP Siesa). Cinco tonos; cada estado del sistema se traduce a UNO
 * de ellos aquí — la vista nunca decide colores por su cuenta:
 *
 *   success  verde   · Comprometido, Facturado, Aprobado, Aceptada…
 *   warning  ámbar   · Pendiente de envío a ERP, Retenido, Backorder…
 *   danger   rojo    · Error, No enviado, No encontrado, Anulada…
 *   info     azul    · Vinculado, Parcialmente remisionado/facturado…
 *   neutral  gris    · Sin vínculo, No comprometido, estados sin semántica…
 *
 * Los colores viven en tokens CSS (--estado-<tono>-bg|fg|border en styles.css).
 */
export type TonoEstado = "success" | "warning" | "danger" | "info" | "neutral";

export const TONOS_ESTADO: readonly TonoEstado[] = ["success", "warning", "danger", "info", "neutral"];

/** Estados operativos de Siesa / integración (etiqueta o valor crudo -> tono). */
const TONO_OPERATIVO: Record<string, TonoEstado> = {
  // Inventario comprometido / operativo Siesa
  Comprometido: "success",
  "No comprometido": "neutral",
  "Sin comprometer": "neutral",
  Facturado: "success",
  Remisionado: "success",
  "Remisionado/Facturado completo": "success",
  "Parcialmente facturado": "info",
  "Parcialmente remisionado": "info",
  "Pendiente de aprobación": "warning",
  Backorder: "warning",
  Retenido: "warning",
  "En proceso": "neutral",
  // Integración ERP
  "Pendiente de envío a ERP": "warning",
  "El pedido no ha sido enviado": "danger",
  "No encontrado en Siesa": "danger",
  Vinculado: "info",
  VINCULADO: "info",
  "Sin vínculo": "neutral",
  NO_VINCULADO: "neutral",
  ERROR_VINCULACION: "danger",
};

type CategoriaLegada = "positivo" | "pendiente" | "negativo" | "neutro";

const TONO_POR_CATEGORIA: Record<CategoriaLegada, TonoEstado> = {
  positivo: "success",
  pendiente: "warning",
  negativo: "danger",
  neutro: "neutral",
};

/** Estados de los demás módulos (categoría histórica -> tono del semáforo). */
const CATEGORIA_LEGADA: Record<string, CategoriaLegada> = {
  Aprobada: "positivo",
  Aprobado: "positivo",
  Activo: "positivo",
  "Al día": "positivo",
  "Paz y Salvo": "positivo",
  Pagada: "positivo",
  Comprado: "positivo",
  Facturada: "positivo",
  Recibida: "positivo",
  Pendiente: "pendiente",
  "En Cotización": "pendiente",
  "Por vencer": "pendiente",
  "Pendiente Renovación": "pendiente",
  Rechazada: "negativo",
  Rechazado: "negativo",
  Vencido: "negativo",
  Inactivo: "negativo",
  Confirmada: "pendiente",
  "En tránsito": "pendiente",
  "En puerto": "pendiente",
  "En inspección": "pendiente",
  "En trámite": "pendiente",
  "Liberado pre-compra": "pendiente",
  "Levante autorizado": "positivo",
  Nacionalizado: "positivo",
  Cerrada: "positivo",
  Anulada: "negativo",

  // Estados de Proforma (valores crudos): ENVIADA -> ACEPTADA -> PEDIDO_CREADO | ANULADA.
  ENVIADA: "pendiente",
  ACEPTADA: "positivo",
  PEDIDO_CREADO: "positivo",
  ANULADA: "negativo",

  // Estados crudos del enum EstadoDespacho (Despachos pasa el valor del
  // enum tal cual, no una etiqueta traducida) y estado de novedad.
  RECIBIDO: "neutro",
  PREPARANDO: "neutro",
  PREPARADO: "neutro",
  PENDIENTE_CARGUE: "neutro",
  CARGANDO: "pendiente",
  CARGADO: "pendiente",
  DESPACHADO: "pendiente",
  EN_TRANSITO: "pendiente",
  ENTREGADO: "positivo",
  ENTREGA_PARCIAL: "pendiente",
  DEVUELTO: "negativo",
  CANCELADO: "negativo",
  ABIERTA: "pendiente",
  RESUELTA: "positivo",
};

/** Tono del semáforo para un estado (operativo primero; luego el catálogo histórico). */
export function tonoDeEstado(estado: string): TonoEstado {
  const operativo = TONO_OPERATIVO[estado];
  if (operativo) return operativo;
  const legada = CATEGORIA_LEGADA[estado];
  return legada ? TONO_POR_CATEGORIA[legada] : "neutral";
}

/** Clases Tailwind (sobre los tokens --estado-*) de cada tono. Literales para que
 * el escáner de Tailwind las detecte. */
export const CLASES_TONO_ESTADO: Record<TonoEstado, string> = {
  success: "border-estado-success-border bg-estado-success-bg text-estado-success-fg",
  warning: "border-estado-warning-border bg-estado-warning-bg text-estado-warning-fg",
  danger: "border-estado-danger-border bg-estado-danger-bg text-estado-danger-fg",
  info: "border-estado-info-border bg-estado-info-bg text-estado-info-fg",
  neutral: "border-estado-neutral-border bg-estado-neutral-bg text-estado-neutral-fg",
};
