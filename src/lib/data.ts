// Clean TypeScript interfaces and utility functions for RicoSoft (No dummy mock data)

export type EstadoFactura = "Pendiente" | "Aprobada" | "Pagada" | "Rechazada";

export type Prioridad = "Baja" | "Media" | "Alta" | "Crítica";

export interface Factura {
  id: string;
  empresaId: string; // 'EMP-01' | 'EMP-02' | 'EMP-03'
  numero: string;
  proveedor: string;
  nit: string;
  contrato?: string;
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
  prioridad: Prioridad;
  origen: "Correo" | "Portal" | "OCR" | "Carga manual";
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
  empresaId: string; // '001' | '002' | '003'
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

export type EstadoSolicitudCompra = "Pendiente" | "En Cotización" | "Aprobada" | "Rechazada" | "Comprado";

export interface SolicitudCompra {
  id: string;
  empresaId: string;
  area: AreaEmpresa;
  solicitante: string;
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
}

export type AreaEmpresa = "Sistemas" | "Comercial" | "Produccion" | "Gestion Humana" | "Contabilidad" | "Mantenimiento" | "Compras" | "Logistica" | "Gerencia";

export type PeriodicidadServicio = "Mensual" | "Anual" | "Trimestral";

export interface ServicioSuscripcion {
  id: string;
  empresaId: string;
  area: AreaEmpresa | string;
  nombreServicio: string;
  proveedor: string;
  periodicidad: PeriodicidadServicio;
  costo: number;
  moneda: "COP" | "USD";
  fechaRenovacion: string;
  estado: "Activo" | "Inactivo" | "Pendiente Renovación";
  responsableArea: string;
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
  return new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// --- Créditos de clientes ---
export type EstadoCredito = "Al día" | "Por vencer" | "Vencido";

export interface CreditoCliente {
  id: string;
  cliente: string;
  cupo: number;
  saldo: number;
  vence: string;
  estado: EstadoCredito;
}

