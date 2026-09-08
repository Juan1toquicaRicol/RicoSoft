// Clean TypeScript interfaces and utility functions for RicoSoft (No dummy mock data)

export type EstadoFactura = "Pendiente" | "Aprobada" | "Pagada" | "Rechazada";

export const PrioridadOptions = {
  Baja: "Baja",
  Media: "Media",
  Alta: "Alta",
  Crítica: "Crítica",
  Urgente: "Urgente",
} as const;

export type Prioridad = (typeof PrioridadOptions)[keyof typeof PrioridadOptions];

export interface Factura {
  id: string;
  empresaId: string; // 'EMP-01' | 'EMP-02' | 'EMP-03'
  numero: string;
  proveedor: string;
  nit: string;
  servicioId?: string | null;
  servicio?: { id: string; nombre: string } | null;
  solicitudCompraId?: string | null;
  // Trazabilidad completa: SC de origen -> cotización ganadora del cuadro
  // comparativo (proveedor, valor, tiempo de entrega) -> quién la aprobó.
  solicitudCompraRel?: {
    id: string;
    item: string;
    estado: string;
    aprobadaPor: string | null;
    aprobadaEn: string | null;
    cotizacionGanadora: {
      proveedorId: string | null;
      proveedorNombre: string;
      proveedorNit: string;
      valorTotalCOP: number;
      tiempoEntregaDias: number;
    } | null;
  } | null;
  centroCostos?: string;
  area: string;
  responsable: string;
  fecha: string;
  vence: string;
  // Condiciones/datos de pago del proveedor (snapshot al recibir la
  // factura, editable después vía PATCH /:id/condiciones-pago).
  condicionesPago: string | null;
  datosPago: string | null;
  subtotal: number;
  iva: number;
  total: number;
  moneda: "COP" | "USD";
  estado: EstadoFactura;
  // Derivada en backend: no es un estado nuevo, solo indica que "vence" ya
  // pasó y la factura sigue sin pagarse/rechazarse.
  vencida: boolean;
  prioridad: Prioridad;
  origen: "Correo" | "Portal" | "OCR" | "Carga manual";
  totalPagado: number;
  saldoPendiente: number;
  alertaValor: { mensaje: string } | null;
  archivo: {
    nombre: string;
    mime: string | null;
    tamano: number | null;
    subidoPor: string | null;
    subidoEn: string | null;
  } | null;
  historial: { fecha: string; actor: string; accion: string; detalle?: string }[];
}

export type EstadoEmpleado = "Activo" | "Licencia" | "Retirado" | "Liquidado";

export interface HistorialSalario {
  fecha: string;
  salarioAnterior: number;
  nuevoSalario: number;
  motivo: string;
}

export interface Empleado {
  id: string;
  empresaId: string; // 'RC' | 'FL' | 'GR'
  documento: string;
  nombres: string;
  apellidos: string;
  correo: string;
  cargo: string;
  area: string;
  fechaContratacion: string;
  fechaLiquidacion?: string;
  salarioActual: number;
  historicoSalario: HistorialSalario[];
  estado: EstadoEmpleado;
  strikesCount: number;
}

export type EstadoPermiso = "Pendiente" | "Aprobado" | "Rechazado";

export interface Permiso {
  id: string;
  empresaId: string;
  empleadoId: string;
  nombreEmpleado: string;
  tipoPermiso: "Vacaciones" | "Licencia Médica" | "Cita Médica" | "Calamidad Doméstica" | "Otro";
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  observaciones: string;
  estado: EstadoPermiso;
  fechaSolicitud: string;
}

export type GravedadStrike = "Leve" | "Grave" | "Muy Grave";

export interface FaltaStrike {
  id: string;
  empresaId: string;
  empleadoId: string;
  nombreEmpleado: string;
  fecha: string;
  gravedad: GravedadStrike;
  motivo: string;
  descargos?: string;
  registradoPor: string;
}

export type EstadoSolicitudCompra =
  "Pendiente" | "En Cotización" | "Aprobada" | "Rechazada" | "Comprado" | "Facturada" | "Recibida";

/**
 * Solicitud de compra que todavía puede recibir una factura (ver GET
 * /solicitudes-compra/disponibles-para-factura) — no es SolicitudCompra
 * completa, solo lo que necesita el selector de Recepcionar Factura, con
 * el saldo pendiente ya calculado en el backend.
 */
export interface SolicitudDisponibleParaFactura {
  id: string;
  empresaId: string;
  item: string;
  descripcion: string | null;
  proveedorId: string | null;
  proveedor: string | null;
  valorEstimado: number;
  estado: string;
  fechaSolicitud: string;
  facturado: number;
  saldoPendiente: number;
}

export interface SolicitudCompra {
  id: string;
  empresaId: string;
  area: string;
  solicitanteId?: string | null;
  solicitante: string;
  proveedorId?: string | null;
  proveedor?: string | null;
  item: string;
  descripcion: string;
  cantidad: number;
  valorEstimado: number;
  prioridad: Prioridad;
  estado: EstadoSolicitudCompra;
  fechaSolicitud: string;
  fechaResolucion?: string | null;
  resueltoPorId?: string | null;
  resueltoPorNombre?: string | null;
  comentarioResolucion?: string | null;
  cotizacion?: {
    nombre: string;
    mime: string | null;
    tamano: number | null;
    subidoPor: string | null;
    subidoEn: string | null;
  } | null;
  // Resumen del cuadro comparativo de cotizaciones de proveedor: cuántas hay
  // registradas (mín. `minimo`, máx. `maximo`) y si ya hay una elegida como
  // ganadora. Se requieren al menos `minimo` cotización(es) + ganadora antes
  // de poder aprobar la solicitud (antes se exigían exactamente 3).
  cotizacionesResumen: {
    total: number;
    minimo: number;
    maximo: number;
    tieneGanadora: boolean;
    menorValor: number | null;
  };
  factura?: { id: string; numero: string; estado: string } | null;
  // Confirmación del solicitante original de que recibió físicamente el
  // producto/servicio (ver confirmarRecepcionSolicitud). Solo se llena
  // cuando estado === "Recibida".
  recepcion?: {
    confirmadaPor: string | null;
    confirmadaEn: string;
    comentario: string | null;
  } | null;
}

/** Una de las (hasta 3) cotizaciones de proveedor del cuadro comparativo de
 * una solicitud de compra. */
export interface CotizacionProveedor {
  id: string;
  solicitudCompraId: string;
  proveedorId: string | null;
  proveedorNombre: string;
  proveedorNit: string;
  valorTotalCOP: number;
  tiempoEntregaDias: number;
  esGanadora: boolean;
  archivo: { nombre: string; mime: string; tamano: number };
  subidoPor: string;
  createdAt: string;
}

export type AreaEmpresa =
  | "Sistemas"
  | "Comercial"
  | "Produccion"
  | "Gestion Humana"
  | "Contabilidad"
  | "Mantenimiento"
  | "Compras"
  | "Logistica"
  | "Gerencia";

export type PeriodicidadServicio = "Mensual" | "Anual" | "Trimestral";

export interface ServicioSuscripcion {
  id: string;
  empresaId: string;
  area: AreaEmpresa | string;
  nombreServicio: string;
  descripcion?: string | null;
  proveedorId?: string | null;
  proveedor: string;
  periodicidad: PeriodicidadServicio;
  costo: number;
  moneda: "COP" | "USD";
  fechaInicio?: string | null;
  fechaFin?: string | null;
  diaVencimiento?: number | null;
  fechaRenovacion: string;
  estado: "Activo" | "Inactivo" | "Pendiente Renovación";
  responsableId?: string | null;
  responsableArea: string;
  observaciones?: string | null;
  // Solo viene presente en el detalle (GET /servicios/:id), reconstruido a
  // partir de Auditoria — ver obtenerServicio en el backend.
  historial?: { fecha: string; actor: string; accion: string; detalle?: string }[];
}

// Utility formatting functions
export function money(value: number, moneda = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 0,
  }).format(value);
}

export function compact(value: number) {
  return new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

/**
 * Formatea una cantidad junto con su unidad de medida real (viene de Siesa,
 * v470_id_unidad_medida) — cuando la unidad es KG y la cantidad llega a
 * 1.000 o más, se muestra en toneladas ("37,4 t") en vez del número crudo
 * en kilos, que es como el negocio lee estas cifras en la práctica. Para
 * cualquier otra unidad (UND, servicios, etc.) o cantidades menores a
 * 1.000 kg, se mantiene el formato compacto de siempre.
 */
export function formatCantidad(cantidad: number, unidadMedida?: string | null): string {
  const unidad = (unidadMedida ?? "").trim().toUpperCase();
  if (unidad === "KG" && Math.abs(cantidad) >= 1000) {
    const toneladas = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(
      cantidad / 1000,
    );
    return `${toneladas} t`;
  }
  return unidadMedida ? `${compact(cantidad)} ${unidadMedida}` : compact(cantidad);
}

// --- Créditos de clientes ---
export type EstadoCredito = "Al día" | "Por vencer" | "Vencido" | "Paz y Salvo";

export interface CreditoCliente {
  id: string;
  cliente: string;
  cupo: number;
  /** Total pendiente de cobro (vencido + porVencer + alDia). NO es "lo vencido". */
  saldo: number;
  /** Solo la porción de `saldo` cuya fecha de vencimiento ya pasó. */
  vencido: number;
  /** Pendiente, no vencido, dentro de la ventana de alerta temprana. */
  porVencer: number;
  /** Pendiente, no vencido, fuera de la ventana de alerta. */
  alDia: number;
  /** Días de mora si está vencido; 0 en caso contrario. */
  diasMora: number;
  vence: string;
  estado: EstadoCredito;
}
