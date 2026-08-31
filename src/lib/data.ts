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
  contratoId?: string | null;
  contratoRel?: { id: string; proveedor: string } | null;
  contrato?: string;
  solicitudCompraId?: string | null;
  solicitudCompraRel?: { id: string; item: string } | null;
  centroCostos?: string;
  area: string;
  responsable: string;
  fecha: string;
  vence: string;
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
  "Pendiente" | "En Cotización" | "Aprobada" | "Rechazada" | "Comprado" | "Facturada";

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
  // registradas (máx. 3) y si ya hay una elegida como ganadora. Se requieren
  // las 3 completas + ganadora antes de poder aprobar la solicitud.
  cotizacionesResumen: {
    total: number;
    requeridas: number;
    tieneGanadora: boolean;
  };
  factura?: { id: string; numero: string; estado: string } | null;
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
  contratoId?: string | null;
  contratoRel?: { id: string; proveedor: string } | null;
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

// --- Créditos de clientes ---
export type EstadoCredito = "Al día" | "Por vencer" | "Vencido" | "Paz y Salvo";

export interface CreditoCliente {
  id: string;
  cliente: string;
  cupo: number;
  saldo: number;
  vence: string;
  estado: EstadoCredito;
}
