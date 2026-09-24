import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";
import type { ResultadoSincronizacionCotizaciones } from "@/lib/sincronizacion-cotizaciones";

export interface ItemComercial {
  id?: string;
  itemRowId: number | null;
  referencia: string | null;
  descripcion: string;
  bodegaRowId: number | null;
  bodega: string | null;
  unidadMedida: string | null;
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  ivaPct: number;
}

export interface TotalesComercial {
  subtotal: number;
  descuentos: number;
  impuestos: number;
  total: number;
}

export interface DocumentoRelacionadoResumen {
  id: string;
  numero: number;
  estado: string;
  createdAt?: string;
}

export interface Cotizacion extends TotalesComercial {
  id: string;
  numero: number;
  numeroFormateado: string;
  tenantId: string;
  clienteRowId: number;
  clienteNombre: string;
  clienteNit: string | null;
  contacto: string | null;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
  vendedorNombre: string | null;
  fecha: string;
  fechaVencimiento: string | null;
  estado: string;
  moneda: string;
  observaciones: string | null;
  erpNumero: string | null;
  creadoPorNombre: string;
  createdAt: string;
  items: ItemComercial[];
  proformas?: DocumentoRelacionadoResumen[];
  pedidos?: DocumentoRelacionadoResumen[];
}

export interface PedidoComercial extends TotalesComercial {
  id: string;
  numero: number;
  numeroFormateado: string;
  cotizacionId: string | null;
  proformaId: string | null;
  clienteRowId: number;
  clienteNombre: string;
  clienteNit: string | null;
  vendedorNombre: string | null;
  fecha: string;
  estado: string;
  moneda: string;
  observaciones: string | null;
  erpNumero: string | null;
  erpRowId?: number | null;
  creadoPorNombre: string;
  createdAt: string;
  items: ItemComercial[];
  cotizacion?: { id: string; numero: number; estado: string } | null;
  proforma?: { id: string; numero: number; estado: string } | null;
}

export type EstadoCompromiso =
  | "SIN_VINCULO_ERP"
  | "SIESA_NO_ENCONTRADO"
  | "NO_COMPROMETIDO"
  | "COMPROMETIDO";

/** Compromiso de inventario de un pedido en Siesa (solo lectura). Mantiene
 * separados el estado comercial (RicoSoft), el de sincronización y el
 * operativo de Siesa. */
export interface CompromisoInventarioPedido {
  pedidoId: string;
  numero: number;
  erpRowId: number | null;
  estadoComercial: string;
  estadoSincronizacion: string;
  compromiso: EstadoCompromiso;
  siesa: {
    pdvRowId: number;
    pdvNumero: number;
    estadoOperativo: string;
    /** Etiqueta visible: Comprometido, Facturado, Retenido... */
    estadoUnoee: string;
    cantidadPedida: number;
    cantidadComprometida: number;
    cantidadRemisionada: number;
    cantidadFacturada: number;
    lineas: number;
    lineasComprometidas: number;
  } | null;
}

export interface DocumentoBandeja {
  /** Solo pedidos, con incluirCompromiso=true. */
  compromiso?: CompromisoInventarioPedido | null;
  tipo: "cotizacion" | "proforma" | "pedido";
  id: string;
  numero: string;
  cliente: string;
  fecha: string;
  estado: string;
  valor: number;
  documentoRelacionado: string | null;
  erp: string | null;
}

export interface CotizacionPayload {
  numero?: number;
  clienteRowId: number;
  clienteNombre: string;
  clienteNit?: string | null;
  contacto?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  telefono?: string | null;
  vendedorNombre?: string | null;
  fechaVencimiento?: string | null;
  moneda?: string;
  observaciones?: string | null;
  items: ItemComercial[];
}

/** Bandeja agregada — Comercial → Gestión Comercial. */
export function useDocumentosComerciales(params: {
  tipo?: "todos" | "cotizacion" | "proforma" | "pedido";
  search?: string;
  estado?: string;
  /** Solo pedidos: trae el estado en Siesa de cada pedido (una consulta en lote). */
  incluirCompromiso?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const [items, setItems] = useState<DocumentoBandeja[]>([]);
  const [total, setTotal] = useState(0);
  const [compromisoDisponible, setCompromisoDisponible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { tipo, search, estado, incluirCompromiso, page = 1, pageSize = 25 } = params;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("tipo", tipo ?? "todos");
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      if (search) qs.set("search", search);
      if (estado) qs.set("estado", estado);
      if (incluirCompromiso) qs.set("incluirCompromiso", "true");
      const data = await fetchAuth(`/comercial/documentos?${qs.toString()}`);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setCompromisoDisponible(data.compromisoDisponible !== false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No fue posible cargar la bandeja comercial.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, search, estado, incluirCompromiso, page, pageSize]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, total, compromisoDisponible, loading, error, refresh };
}

export function useCotizacion(id: string | null) {
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/comercial/cotizaciones/${id}`);
      setCotizacion(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No fue posible cargar la cotización.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { cotizacion, loading, error, refresh };
}

export function usePedidoComercial(id: string | null) {
  const [pedido, setPedido] = useState<PedidoComercial | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/comercial/pedidos/${id}`);
      setPedido(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No fue posible cargar el pedido.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { pedido, loading, error, refresh };
}

export interface ItemEstadoUnoee {
  lineaRowId: number;
  itemRowId: number | null;
  referencia: string | null;
  descripcion: string | null;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  descuentos: number;
  estado: string;
  cantidadRemisionada: number;
  cantidadPendiente: number;
}

export interface CabeceraEstadoUnoee {
  consecutivo: string;
  estado: string;
  valorTotal: number;
  descuentos: number;
  impuestos: number;
}

/** "Estado del Pedido UnoEE": PDV de Siesa vinculado (solo lectura). */
export interface EstadoPedidoUnoee {
  pedidoId: string;
  /** false = sin documento ERP: "El pedido no ha sido enviado". */
  vinculado: boolean;
  erpRowId: number | null;
  estadoComercial: string;
  estadoSincronizacion: string;
  encontradoEnSiesa: boolean;
  cabecera: CabeceraEstadoUnoee | null;
  items: ItemEstadoUnoee[];
}

export function useEstadoPedidoUnoee(id: string | null) {
  const [estado, setEstado] = useState<EstadoPedidoUnoee | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      setEstado(await fetchAuth(`/comercial/pedidos/${id}/estado-unoee`));
    } catch (err: unknown) {
      setEstado(null);
      setError(err instanceof Error ? err.message : "No fue posible consultar Siesa.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { estado, loading, error, refresh };
}

export function useCrearCotizacion() {
  const [loading, setLoading] = useState(false);
  const crear = useCallback(async (payload: CotizacionPayload): Promise<Cotizacion> => {
    setLoading(true);
    try {
      return await fetchAuth("/comercial/cotizaciones", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } finally {
      setLoading(false);
    }
  }, []);
  return { crear, loading };
}

export function useAccionesCotizacion() {
  const accion = useCallback(async (id: string, path: string, observacion?: string) => {
    return fetchAuth(`/comercial/cotizaciones/${id}/${path}`, {
      method: "POST",
      body: JSON.stringify({ observacion: observacion ?? null }),
    });
  }, []);

  return {
    enviar: (id: string) => accion(id, "enviar"),
    aprobar: (id: string) => accion(id, "aprobar"),
    rechazar: (id: string, observacion?: string) => accion(id, "rechazar", observacion),
    anular: (id: string, observacion?: string) => accion(id, "anular", observacion),
    crearProforma: (id: string) =>
      fetchAuth(`/comercial/cotizaciones/${id}/proforma`, { method: "POST", body: JSON.stringify({}) }),
    /** Vincula/corrige a mano el documento Siesa (CDV rowid) de esta cotización. */
    asignarErp: (id: string, erpRowId: number) =>
      fetchAuth(`/comercial/cotizaciones/${id}/asignar-erp`, {
        method: "POST",
        body: JSON.stringify({ erpRowId }),
      }),
    /** Borrado PERMANENTE — solo superadmin, distinto de anular. */
    eliminar: (id: string) => fetchAuth(`/comercial/cotizaciones/${id}`, { method: "DELETE" }),
  };
}

/** POST /comercial/cotizaciones/siesa/sincronizar (permiso cotizaciones.gestionar). */
export function useSincronizarCotizacionesSiesa() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sincronizar = useCallback(
    async (params: { desde?: string; guardar: boolean; limite?: number }) => {
      setLoading(true);
      setError("");
      try {
        return (await fetchAuth("/comercial/cotizaciones/siesa/sincronizar", {
          method: "POST",
          body: JSON.stringify(params),
        })) as ResultadoSincronizacionCotizaciones;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "No fue posible sincronizar con Siesa.");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { sincronizar, loading, error };
}

export function useAccionesPedido() {
  const accion = useCallback(async (id: string, path: string, observacion?: string) => {
    return fetchAuth(`/comercial/pedidos/${id}/${path}`, {
      method: "POST",
      body: JSON.stringify({ observacion: observacion ?? null }),
    });
  }, []);

  return {
    confirmar: (id: string) => accion(id, "confirmar"),
    marcarListoParaErp: (id: string) => accion(id, "listo-erp"),
    anular: (id: string, observacion?: string) => accion(id, "anular", observacion),
    crearDesdeProforma: (proformaId: string) =>
      fetchAuth(`/comercial/proformas/${proformaId}/pedido`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    /** Borrado PERMANENTE — solo superadmin. */
    eliminar: (id: string) => fetchAuth(`/comercial/pedidos/${id}`, { method: "DELETE" }),
  };
}
