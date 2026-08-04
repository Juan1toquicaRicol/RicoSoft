export type EstadoFactura =
  | "Recibida"
  | "En revisión"
  | "Pendiente"
  | "Aprobada"
  | "Rechazada"
  | "Devuelta"
  | "Pagada"
  | "Archivada";

export type Prioridad = "Baja" | "Media" | "Alta" | "Crítica";

export interface Factura {
  id: string;
  numero: string;
  proveedor: string;
  nit: string;
  empresa: string;
  contrato: string;
  centroCostos: string;
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
  favorito: boolean;
  origen: "Correo" | "Portal" | "OCR" | "Carga manual";
  historial: { fecha: string; actor: string; accion: string; detalle?: string }[];
}

export const kpis = {
  recibidas: 1284,
  pendientes: 176,
  aprobadas: 842,
  rechazadas: 39,
  pagadas: 703,
  vencidas: 22,
  proximasVencer: 47,
  valorMes: 4820500000,
  valorAprobado: 3612400000,
  valorPendiente: 918300000,
  valorPagado: 2894700000,
  tiempoAprobacion: "1.8 días",
  tiempoRespuesta: "5.4 horas",
};

export const serieMensual = [
  { mes: "Ene", recibido: 2980, aprobado: 2410, pagado: 2050 },
  { mes: "Feb", recibido: 3240, aprobado: 2690, pagado: 2280 },
  { mes: "Mar", recibido: 3610, aprobado: 3020, pagado: 2540 },
  { mes: "Abr", recibido: 3390, aprobado: 2870, pagado: 2460 },
  { mes: "May", recibido: 4120, aprobado: 3410, pagado: 2910 },
  { mes: "Jun", recibido: 4480, aprobado: 3620, pagado: 3080 },
  { mes: "Jul", recibido: 4820, aprobado: 3612, pagado: 2894 },
];

export const proyeccion = [
  { mes: "Ago", real: null as number | null, proyectado: 5010 },
  { mes: "Sep", real: null as number | null, proyectado: 5240 },
  { mes: "Oct", real: null as number | null, proyectado: 5480 },
  { mes: "Nov", real: null as number | null, proyectado: 5610 },
  { mes: "Dic", real: null as number | null, proyectado: 6120 },
];

export const porArea = [
  { nombre: "Operaciones", valor: 1420 },
  { nombre: "Tecnología", valor: 980 },
  { nombre: "Compras", valor: 860 },
  { nombre: "Recursos Humanos", valor: 540 },
  { nombre: "Jurídica", valor: 320 },
];

export const topProveedores = [
  { nombre: "Suministros Andinos S.A.S.", nit: "900.123.456-1", valor: 812400000, facturas: 64 },
  { nombre: "Constructora del Norte", nit: "830.998.221-4", valor: 645900000, facturas: 28 },
  { nombre: "TechCloud Colombia", nit: "901.554.010-7", valor: 512300000, facturas: 41 },
  { nombre: "Logística Integral Ltda.", nit: "800.442.117-9", valor: 398700000, facturas: 52 },
  { nombre: "Servicios Jurídicos Uribe", nit: "901.220.883-2", valor: 214500000, facturas: 12 },
];

export const alertas = [
  { titulo: "3 facturas exceden el valor del contrato C-2041", tipo: "Sobrecosto", nivel: "Crítica" },
  { titulo: "22 facturas vencidas sin aprobación de Tesorería", tipo: "Vencimiento", nivel: "Alta" },
  { titulo: "Posible duplicado: FV-88213 / FV-88214", tipo: "Duplicidad", nivel: "Media" },
  { titulo: "Contrato C-1980 finaliza en 12 días", tipo: "Contrato", nivel: "Media" },
];

export const facturas: Factura[] = [
  {
    id: "f-1",
    numero: "FV-88213",
    proveedor: "Suministros Andinos S.A.S.",
    nit: "900.123.456-1",
    empresa: "Holding Central S.A.",
    contrato: "C-2041",
    centroCostos: "CC-OPS-01",
    area: "Operaciones",
    responsable: "Laura Restrepo",
    fecha: "2026-07-28",
    vence: "2026-08-27",
    subtotal: 24500000,
    iva: 4655000,
    total: 29155000,
    moneda: "COP",
    estado: "Pendiente",
    prioridad: "Alta",
    favorito: true,
    origen: "OCR",
    historial: [
      { fecha: "28 jul, 09:12", actor: "Sistema", accion: "Factura recibida", detalle: "Bandeja facturacion@empresa.com" },
      { fecha: "28 jul, 09:12", actor: "OCR", accion: "Datos extraídos", detalle: "Confianza 97%" },
      { fecha: "28 jul, 09:13", actor: "Motor de reglas", accion: "Ruta asignada", detalle: "Monto > 20M → Gerencia + Dir. Financiero" },
      { fecha: "28 jul, 14:40", actor: "Laura Restrepo", accion: "En revisión" },
    ],
  },
  {
    id: "f-2",
    numero: "FV-88190",
    proveedor: "TechCloud Colombia",
    nit: "901.554.010-7",
    empresa: "Holding Central S.A.",
    contrato: "C-1980",
    centroCostos: "CC-TI-04",
    area: "Tecnología",
    responsable: "Andrés Gómez",
    fecha: "2026-07-25",
    vence: "2026-08-09",
    subtotal: 8900000,
    iva: 1691000,
    total: 10591000,
    moneda: "COP",
    estado: "Aprobada",
    prioridad: "Media",
    favorito: false,
    origen: "Portal",
    historial: [
      { fecha: "25 jul, 08:02", actor: "Sistema", accion: "Factura recibida" },
      { fecha: "25 jul, 10:15", actor: "Andrés Gómez", accion: "Aprobada", detalle: "Servicio validado contra contrato" },
    ],
  },
  {
    id: "f-3",
    numero: "FV-87740",
    proveedor: "Logística Integral Ltda.",
    nit: "800.442.117-9",
    empresa: "Filial Caribe S.A.S.",
    contrato: "C-1755",
    centroCostos: "CC-LOG-02",
    area: "Compras",
    responsable: "Carolina Díaz",
    fecha: "2026-07-11",
    vence: "2026-07-26",
    subtotal: 3200000,
    iva: 608000,
    total: 3808000,
    moneda: "COP",
    estado: "Rechazada",
    prioridad: "Baja",
    favorito: false,
    origen: "Correo",
    historial: [
      { fecha: "11 jul, 16:20", actor: "Sistema", accion: "Factura recibida" },
      { fecha: "12 jul, 09:05", actor: "Carolina Díaz", accion: "Rechazada", detalle: "Sin orden de compra asociada" },
    ],
  },
  {
    id: "f-4",
    numero: "FV-88301",
    proveedor: "Constructora del Norte",
    nit: "830.998.221-4",
    empresa: "Holding Central S.A.",
    contrato: "C-2101",
    centroCostos: "CC-INF-01",
    area: "Operaciones",
    responsable: "Mauricio Peña",
    fecha: "2026-08-01",
    vence: "2026-08-31",
    subtotal: 145000000,
    iva: 27550000,
    total: 172550000,
    moneda: "COP",
    estado: "En revisión",
    prioridad: "Crítica",
    favorito: true,
    origen: "OCR",
    historial: [
      { fecha: "1 ago, 07:44", actor: "Sistema", accion: "Factura recibida" },
      { fecha: "1 ago, 07:45", actor: "Motor de reglas", accion: "Escalamiento", detalle: "Monto > 100M → Gerencia" },
    ],
  },
  {
    id: "f-5",
    numero: "FV-88044",
    proveedor: "Servicios Jurídicos Uribe",
    nit: "901.220.883-2",
    empresa: "Filial Andina S.A.S.",
    contrato: "C-1902",
    centroCostos: "CC-JUR-01",
    area: "Jurídica",
    responsable: "Sofía Marín",
    fecha: "2026-07-18",
    vence: "2026-08-17",
    subtotal: 18000000,
    iva: 3420000,
    total: 21420000,
    moneda: "COP",
    estado: "Pagada",
    prioridad: "Media",
    favorito: false,
    origen: "Carga manual",
    historial: [
      { fecha: "18 jul, 11:30", actor: "Sistema", accion: "Factura recibida" },
      { fecha: "19 jul, 08:10", actor: "Sofía Marín", accion: "Aprobada" },
      { fecha: "30 jul, 15:00", actor: "Tesorería", accion: "Pagada", detalle: "Transferencia 4402118" },
    ],
  },
  {
    id: "f-6",
    numero: "FV-88322",
    proveedor: "Suministros Andinos S.A.S.",
    nit: "900.123.456-1",
    empresa: "Filial Caribe S.A.S.",
    contrato: "C-2041",
    centroCostos: "CC-OPS-03",
    area: "Operaciones",
    responsable: "Laura Restrepo",
    fecha: "2026-08-02",
    vence: "2026-08-12",
    subtotal: 6400000,
    iva: 1216000,
    total: 7616000,
    moneda: "COP",
    estado: "Recibida",
    prioridad: "Alta",
    favorito: false,
    origen: "Correo",
    historial: [{ fecha: "2 ago, 06:50", actor: "Sistema", accion: "Factura recibida" }],
  },
];

export interface Contrato {
  id: string;
  proveedor: string;
  empresa: string;
  supervisor: string;
  area: string;
  centroCostos: string;
  valor: number;
  ejecutado: number;
  inicio: string;
  fin: string;
  estado: "Vigente" | "Por vencer" | "Finalizado";
}

export const contratos: Contrato[] = [
  { id: "C-2041", proveedor: "Suministros Andinos S.A.S.", empresa: "Holding Central S.A.", supervisor: "Laura Restrepo", area: "Operaciones", centroCostos: "CC-OPS-01", valor: 1200000000, ejecutado: 812400000, inicio: "2026-01-15", fin: "2026-12-31", estado: "Vigente" },
  { id: "C-1980", proveedor: "TechCloud Colombia", empresa: "Holding Central S.A.", supervisor: "Andrés Gómez", area: "Tecnología", centroCostos: "CC-TI-04", valor: 640000000, ejecutado: 512300000, inicio: "2025-08-16", fin: "2026-08-15", estado: "Por vencer" },
  { id: "C-2101", proveedor: "Constructora del Norte", empresa: "Holding Central S.A.", supervisor: "Mauricio Peña", area: "Operaciones", centroCostos: "CC-INF-01", valor: 3400000000, ejecutado: 1980000000, inicio: "2026-03-01", fin: "2027-02-28", estado: "Vigente" },
  { id: "C-1755", proveedor: "Logística Integral Ltda.", empresa: "Filial Caribe S.A.S.", supervisor: "Carolina Díaz", area: "Compras", centroCostos: "CC-LOG-02", valor: 480000000, ejecutado: 398700000, inicio: "2025-05-01", fin: "2026-04-30", estado: "Finalizado" },
  { id: "C-1902", proveedor: "Servicios Jurídicos Uribe", empresa: "Filial Andina S.A.S.", supervisor: "Sofía Marín", area: "Jurídica", centroCostos: "CC-JUR-01", valor: 260000000, ejecutado: 214500000, inicio: "2026-02-01", fin: "2027-01-31", estado: "Vigente" },
];

export interface Regla {
  id: string;
  nombre: string;
  activa: boolean;
  prioridad: number;
  condiciones: string[];
  acciones: string[];
  ejecuciones: number;
}

export const reglas: Regla[] = [
  {
    id: "R-01",
    nombre: "Alto valor → Comité financiero",
    activa: true,
    prioridad: 1,
    condiciones: ["Monto > $20.000.000", "Empresa = Holding Central S.A."],
    acciones: ["Enviar a Gerencia", "Enviar a Director Financiero", "Prioridad = Alta"],
    ejecuciones: 214,
  },
  {
    id: "R-02",
    nombre: "Contrato con supervisor único",
    activa: true,
    prioridad: 2,
    condiciones: ["Factura pertenece a contrato", "Contrato tiene supervisor asignado"],
    acciones: ["Enviar únicamente al supervisor del contrato"],
    ejecuciones: 1032,
  },
  {
    id: "R-03",
    nombre: "Proveedor crítico de infraestructura",
    activa: true,
    prioridad: 3,
    condiciones: ["Proveedor = Constructora del Norte", "Monto > $100.000.000"],
    acciones: ["Enviar a Gerencia", "Enviar a Tesorería", "Prioridad = Crítica"],
    ejecuciones: 48,
  },
  {
    id: "R-04",
    nombre: "Servicios recurrentes de TI",
    activa: false,
    prioridad: 4,
    condiciones: ["Tipo de gasto = Servicios TI", "Periodicidad = Mensual"],
    acciones: ["Aprobación automática hasta $5.000.000", "Notificar a Contabilidad"],
    ejecuciones: 76,
  },
];

export const creditos = [
  { cliente: "Distribuciones Vega", cupo: 500000000, saldo: 182000000, estado: "Activo", vence: "2026-09-15" },
  { cliente: "Comercial Ríos S.A.", cupo: 320000000, saldo: 298000000, estado: "Pendiente", vence: "2026-08-20" },
  { cliente: "Grupo Delta", cupo: 850000000, saldo: 412000000, estado: "Activo", vence: "2026-11-01" },
  { cliente: "Almacenes Sur", cupo: 150000000, saldo: 150000000, estado: "Vencido", vence: "2026-07-05" },
];

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
