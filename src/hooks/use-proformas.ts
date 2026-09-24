import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface ClienteBusquedaProforma {
  clienteRowId: number;
  nombre: string | null;
  nit: string | null;
}

export interface RespuestaDatosFacturacionCliente {
  disponible: boolean;
  motivo?: string;
  cliente?: {
    nit: string | null;
    razonSocial: string | null;
    condicionPagoDescripcion: string | null;
    vendedorNombre: string | null;
  };
  facturacion?: {
    contactoNombre: string | null;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    ciudad: string | null;
    departamento: string | null;
  } | null;
}

export interface BodegaProforma {
  bodegaRowId: number;
  codigo: string;
  nombre: string;
}

export interface RespuestaBodegasProforma {
  disponible: boolean;
  motivo?: string;
  bodegas: BodegaProforma[];
}

export interface ConfiguracionComercial {
  retencionFuentePct: number;
  retencionIvaPct: number;
  retencionIcaPct: number;
  /** Siguiente consecutivo de Proforma vigente (max(contador, MAX+1)); el PUT
   * solo acepta valores iguales o superiores a él. */
  siguienteConsecutivoProforma: number;
}

export interface ProformaItem {
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

export interface CotizacionBusqueda {
  cotizacionIdExterno: string;
  cotizacionNumero: string;
  erpDocumentoNumero: string | null;
  clienteRowId: number;
  clienteNombre: string | null;
  fecha: string;
}

export interface CotizacionDetalle extends CotizacionBusqueda {
  clienteNit: string | null;
  direccion: string | null;
  telefono: string | null;
  ciudad: string | null;
  condicionPagoDescripcion: string | null;
  vendedorNombre: string | null;
  fechaEntrega: string | null;
  items: {
    itemRowId: number | null;
    referencia: string | null;
    descripcion: string | null;
    cantidad: number;
    precioUnitario: number;
    descuentoPct: number | null;
    ivaPct: number | null;
  }[];
}

/** Buscador de cotizaciones de origen (Siesa) por número visible. */
export function useBusquedaCotizaciones() {
  const [loading, setLoading] = useState(false);

  const buscar = useCallback(async (q: string): Promise<CotizacionBusqueda[]> => {
    if (q.trim().length < 1) return [];
    setLoading(true);
    try {
      const data = await fetchAuth(`/proformas/cotizaciones/buscar?q=${encodeURIComponent(q)}`);
      return data.disponible ? (data.items ?? []) : [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { buscar, loading };
}

export function useDetalleCotizacion() {
  const [loading, setLoading] = useState(false);

  const consultar = useCallback(
    async (
      cotizacionIdExterno: string,
    ): Promise<{ disponible: boolean; motivo?: string; cotizacion?: CotizacionDetalle }> => {
      setLoading(true);
      try {
        return await fetchAuth(`/proformas/cotizaciones/${encodeURIComponent(cotizacionIdExterno)}`);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { consultar, loading };
}

export interface ProformaPayload {
  /** Consecutivo sugerido/editable — si se omite, el backend sigue
   * calculándolo automáticamente como hasta ahora. */
  numero?: number;
  /** Cotización de origen (opcional) — el backend revalida contra Siesa. */
  cotizacionIdExterno?: string | null;
  clienteRowId: number;
  clienteNombre: string;
  clienteNit: string | null;
  contacto: string | null;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
  formaPago: string | null;
  fechaVencimiento: string | null;
  vendedorNombre: string | null;
  ocNumero: string | null;
  documentoAlterno: string | null;
  remisiones: string | null;
  moneda: string;
  observaciones: string | null;
  aplicaRetencion: boolean;
  retencionPct: number;
  aplicaRetencionIva: boolean;
  retencionIvaPct: number;
  aplicaIca: boolean;
  icaPct: number;
  items: ProformaItem[];
}

/** Totales SIEMPRE calculados por el backend (domain/ventas/proforma-calculo.ts)
 * — el frontend nunca los envía, solo los muestra. */
export interface TotalesProforma {
  totalBruto: number;
  subtotal: number;
  iva: number;
  retencionFuente: number;
  retencionIva: number;
  retencionIca: number;
  total: number;
}

export interface Proforma extends ProformaPayload, TotalesProforma {
  id: string;
  numero: number;
  createdAt: string;
  creadoPorNombre: string;
  estado: string;
  cotizacionOrigen: string | null;
  cotizacionNumero: string | null;
  erpDocumentoNumero: string | null;
  /** Cotización INTERNA de RicoSoft (módulo Comercial → Gestión Comercial),
   * cuando la proforma se creó desde ella — independiente de las columnas
   * externas de arriba. */
  cotizacionId: string | null;
  cotizacion?: { id: string; numero: number; estado: string } | null;
  pedidosComerciales?: { id: string; numero: number; estado: string }[];
}

/** Autocompletado de cliente para la proforma — consulta bajo demanda. */
export function useBusquedaClientesProforma() {
  const [loading, setLoading] = useState(false);

  const buscar = useCallback(async (search: string): Promise<ClienteBusquedaProforma[]> => {
    if (search.trim().length < 2) return [];
    setLoading(true);
    try {
      const data = await fetchAuth(
        `/proformas/clientes/buscar?search=${encodeURIComponent(search)}`,
      );
      return data.disponible ? (data.items ?? []) : [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { buscar, loading };
}

export function useDatosFacturacionCliente() {
  const [loading, setLoading] = useState(false);

  const consultar = useCallback(
    async (clienteRowId: number): Promise<RespuestaDatosFacturacionCliente> => {
      setLoading(true);
      try {
        return await fetchAuth(`/proformas/clientes/${clienteRowId}/datos-facturacion`);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { consultar, loading };
}

/** Bodegas reales de Siesa para el selector por ítem — sin catálogo propio. */
export function useBodegasProforma() {
  const [bodegas, setBodegas] = useState<BodegaProforma[]>([]);
  const [loading, setLoading] = useState(true);
  const [motivo, setMotivo] = useState<string | undefined>();

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      try {
        const data: RespuestaBodegasProforma = await fetchAuth("/proformas/bodegas");
        if (!vivo) return;
        setBodegas(data.disponible ? data.bodegas : []);
        setMotivo(data.motivo);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return { bodegas, loading, motivo };
}

/** Siguiente número de proforma sugerido — NO lo reserva, el usuario puede editarlo. */
export function useSiguienteNumeroProforma() {
  const consultar = useCallback(async (): Promise<number> => {
    const data = await fetchAuth("/proformas/siguiente-numero");
    return data.numero as number;
  }, []);

  return { consultar };
}

/** Tasas de retención del tenant (Ventas > Proformas) — valores iniciales
 * de una proforma nueva; cambiarlas nunca afecta proformas ya creadas
 * (cada una guarda su propio snapshot). */
export function useConfiguracionComercial() {
  const [configuracion, setConfiguracion] = useState<ConfiguracionComercial | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/proformas/configuracion-comercial");
      setConfiguracion(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando la configuración comercial.");
    } finally {
      setLoading(false);
    }
  }, []);

  const guardar = useCallback(async (valores: ConfiguracionComercial) => {
    const data = await fetchAuth("/proformas/configuracion-comercial", {
      method: "PUT",
      body: JSON.stringify(valores),
    });
    setConfiguracion(data);
    return data;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { configuracion, loading, error, refresh, guardar };
}

export function useCrearProforma() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const crear = useCallback(async (payload: ProformaPayload): Promise<Proforma> => {
    setLoading(true);
    setError("");
    try {
      return await fetchAuth("/proformas", { method: "POST", body: JSON.stringify(payload) });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No fue posible crear la proforma.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { crear, loading, error };
}

/** POST /proformas/:id/aceptar — ENVIADA -> ACEPTADA (permiso comercial.proformas.aceptar). */
export function useAceptarProforma() {
  const [loading, setLoading] = useState(false);

  const aceptar = useCallback(async (id: string) => {
    setLoading(true);
    try {
      return (await fetchAuth(`/proformas/${id}/aceptar`, { method: "POST", body: "{}" })) as {
        id: string;
        estado: string;
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return { aceptar, loading };
}

/** Borrado PERMANENTE (DELETE /proformas/:id) — solo superadmin, distinto
 * de anular (que conserva el histórico). Ver requireSuperadmin en el backend. */
export function useEliminarProforma() {
  const [loading, setLoading] = useState(false);

  const eliminar = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    try {
      await fetchAuth(`/proformas/${id}`, { method: "DELETE" });
    } finally {
      setLoading(false);
    }
  }, []);

  return { eliminar, loading };
}

/** Vincula/corrige a mano el documento Siesa (CDV) de una proforma cuando
 * el buscador automático no lo encontró — ver PATCH /proformas/:id/documento-erp. */
export function useAsignarDocumentoErpProforma() {
  const [loading, setLoading] = useState(false);

  const asignar = useCallback(async (id: string, cotizacionIdExterno: string) => {
    setLoading(true);
    try {
      return await fetchAuth(`/proformas/${id}/documento-erp`, {
        method: "PATCH",
        body: JSON.stringify({ cotizacionIdExterno }),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  return { asignar, loading };
}

export function useProforma(id: string | null) {
  const [proforma, setProforma] = useState<Proforma | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/proformas/${id}`);
      setProforma(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No fue posible cargar la proforma.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { proforma, loading, error, refresh };
}
