import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface BucketsAntiguedad {
  vencido: number;
  dias0a30: number;
  dias31a60: number;
  dias61a90: number;
  mas90: number;
}

export interface AlertaGerencial {
  tipo: string;
  severidad: "alta" | "media";
  mensaje: string;
}

export interface TerceroSaldoSiesa {
  terceroRowId: number | null;
  nombre: string;
  nit: string | null;
  saldo: number;
  porcentaje: number | null;
}

export interface ResumenSaldosSiesa {
  total: number;
  buckets: BucketsAntiguedad;
  topTerceros: TerceroSaldoSiesa[];
  concentracionTopTercero: number | null;
}

export interface FinancieroSiesa {
  disponible: boolean;
  motivo?: string;
  cartera?: ResumenSaldosSiesa;
  cuentasPorPagar?: ResumenSaldosSiesa;
}

export interface ResumenGerencial {
  ventas: { disponible: boolean; motivo: string };
  /** Cartera/CxP reales leídas en vivo desde el módulo Financiero de Siesa (t353_co_saldo_abierto). */
  financieroSiesa: FinancieroSiesa;
  cartera: {
    total: number;
    buckets: BucketsAntiguedad;
    topClientes: { cliente: string; saldo: number; porcentaje: number | null }[];
    concentracionTopCliente: number | null;
  };
  cuentasPorPagar: {
    total: number;
    buckets: BucketsAntiguedad;
    topProveedores: {
      proveedorId: string | null;
      nombre: string;
      saldo: number;
      porcentaje: number | null;
    }[];
    concentracionTopProveedor: number | null;
  };
  flujo: Record<
    string,
    { dias: number; ingresosEsperados: number; egresosEsperados: number; neto: number }
  >;
  alertas: AlertaGerencial[];
}

const RESUMEN_GERENCIAL_VACIO: ResumenGerencial = {
  ventas: { disponible: false, motivo: "" },
  financieroSiesa: { disponible: false },
  cartera: {
    total: 0,
    buckets: { vencido: 0, dias0a30: 0, dias31a60: 0, dias61a90: 0, mas90: 0 },
    topClientes: [],
    concentracionTopCliente: null,
  },
  cuentasPorPagar: {
    total: 0,
    buckets: { vencido: 0, dias0a30: 0, dias31a60: 0, dias61a90: 0, mas90: 0 },
    topProveedores: [],
    concentracionTopProveedor: null,
  },
  flujo: {},
  alertas: [],
};

export interface VentasGerencial {
  disponible: boolean;
  motivo?: string;
  periodoActual?: {
    anio: number;
    mes: number;
    bruto: number;
    dscto: number;
    /** bruto - dscto, sin IVA. */
    neto: number;
    documentos: number;
    ticketPromedio: number;
  };
  periodoAnterior?: { anio: number; mes: number; neto: number } | null;
  variacionNetaPct?: number | null;
  serieMensual?: { anio: number; mes: number; bruto: number; neto: number; documentos: number }[];
  topClientes?: {
    clienteRowId: number | null;
    clienteNombre: string | null;
    clienteNit: string | null;
    neto: number;
    documentos: number;
  }[];
  /** Top productos por kilos vendidos en el mes actual (fuente: v470_ventas). */
  topProductosKilos?: {
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    kilos: number;
    neto: number;
    costo: number;
    margen: number;
  }[];
  /** Top clientes por margen/utilidad real del mes actual (no por valor vendido). */
  topClientesPorMargen?: {
    clienteRowId: number | null;
    clienteNombre: string | null;
    neto: number;
    costo: number;
    margen: number;
  }[];
}

/** Ventas reales leídas en vivo desde Siesa (t461_cm_docto_factura_venta). */
export function useVentasGerencial() {
  const [ventas, setVentas] = useState<VentasGerencial>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/analitica/ventas");
      setVentas(data);
    } catch (err: any) {
      setError(err.message || "Error cargando las ventas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ventas, loading, error, refresh };
}

export interface VentaVendedor {
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  hoy: number;
  ayer: number;
  ultimos7Dias: number;
  mesActual: number;
  documentosMesActual: number;
}

export interface VentaDeHoyConHora {
  id: number;
  /** ISO string — momento real de creación del documento en Siesa (fecha + hora, UTC). */
  hora: string;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  clienteRowId: number | null;
  clienteNombre: string | null;
  neto: number;
}

export interface VendedorMargen {
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  neto: number;
  costo: number;
  margen: number;
}

export interface VentasPorVendedor {
  disponible: boolean;
  motivo?: string;
  vendedores: VentaVendedor[];
  detalleHoy: VentaDeHoyConHora[];
  /** Top vendedores por margen/utilidad real del mes actual (no por valor vendido). */
  topVendedoresPorMargen: VendedorMargen[];
}

/** Ranking de ventas diarias por vendedor (hoy/ayer/7 días/mes) + detalle de hoy con hora, leído en vivo desde Siesa. */
export function useVentasPorVendedor() {
  const [datos, setDatos] = useState<VentasPorVendedor>({
    disponible: false,
    vendedores: [],
    detalleHoy: [],
    topVendedoresPorMargen: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/analitica/ventas/vendedores");
      setDatos(data);
    } catch (err: any) {
      setError(err.message || "Error cargando las ventas por vendedor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...datos, loading, error, refresh };
}

export interface DocumentoVenta {
  id: number;
  fecha: string;
  referencia: string | null;
  bruto: number;
  dscto: number;
  /** bruto - dscto, sin IVA. */
  neto: number;
  clienteRowId: number | null;
  clienteNombre: string | null;
  clienteNit: string | null;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
}

export interface HistoricoVentasFiltros {
  desde?: string;
  hasta?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Histórico paginado de documentos de venta, leído en vivo desde Siesa. */
export function useHistoricoVentas(filtros: HistoricoVentasFiltros) {
  const [disponible, setDisponible] = useState(false);
  const [motivo, setMotivo] = useState<string | undefined>();
  const [items, setItems] = useState<DocumentoVenta[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filtros.desde) params.set("desde", filtros.desde);
      if (filtros.hasta) params.set("hasta", filtros.hasta);
      if (filtros.search) params.set("search", filtros.search);
      params.set("page", String(filtros.page ?? 1));
      params.set("pageSize", String(filtros.pageSize ?? 25));
      const data = await fetchAuth(`/analitica/ventas/historico?${params.toString()}`);
      setDisponible(data.disponible);
      setMotivo(data.motivo);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (err: any) {
      setError(err.message || "Error cargando el histórico de ventas.");
    } finally {
      setLoading(false);
    }
  }, [filtros.desde, filtros.hasta, filtros.search, filtros.page, filtros.pageSize]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { disponible, motivo, items, total, totalPages, loading, error, refresh };
}

/** Centro Gerencial Financiero: cartera, cuentas por pagar, flujo proyectado y alertas. */
export function useResumenGerencial() {
  const [resumen, setResumen] = useState<ResumenGerencial>(RESUMEN_GERENCIAL_VACIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/analitica/resumen-gerencial");
      setResumen(data);
    } catch (err: any) {
      setError(err.message || "Error cargando el resumen gerencial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { resumen, loading, error, refresh };
}

export interface ResumenAnalitica {
  serieMensual: { mes: string; recibido: number; aprobado: number; pagado: number }[];
  topProveedores: { nit: string; nombre: string; valor: number; facturas: number }[];
  porArea: { nombre: string; valor: number }[];
  proyeccion: { mes: string; real: null; proyectado: number }[];
}

const VACIO: ResumenAnalitica = {
  serieMensual: [],
  topProveedores: [],
  porArea: [],
  proyeccion: [],
};

export function useAnalitica() {
  const [resumen, setResumen] = useState<ResumenAnalitica>(VACIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/analitica/resumen");
      setResumen(data);
    } catch (err: any) {
      setError(err.message || "Error cargando la analítica.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...resumen, loading, error, refresh };
}
