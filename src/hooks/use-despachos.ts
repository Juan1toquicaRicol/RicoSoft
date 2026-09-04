import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type EstadoDespacho =
  | "RECIBIDO"
  | "PREPARANDO"
  | "PREPARADO"
  | "PENDIENTE_CARGUE"
  | "CARGANDO"
  | "CARGADO"
  | "DESPACHADO"
  | "EN_TRANSITO"
  | "ENTREGADO"
  | "ENTREGA_PARCIAL"
  | "DEVUELTO"
  | "CANCELADO";

export interface Despacho {
  id: string;
  siesaDocRowId: number;
  siesaDocReferencia: string | null;
  clienteNombre: string;
  clienteNit: string | null;
  direccionEntrega: string | null;
  contactoEntrega: string | null;
  telefonoContacto: string | null;
  bodegaRowId: number | null;
  bodegaNombre: string | null;
  valorPedido: number;
  estado: EstadoDespacho;
  vehiculoPlaca: string | null;
  vehiculoTipo: string | null;
  conductorNombre: string | null;
  conductorTelefono: string | null;
  fechaCargue: string | null;
  fechaDespacho: string | null;
  fechaEntregaEstimada: string | null;
  fechaEntregaReal: string | null;
  recibidoPor: string | null;
  responsable: string;
  createdAt: string;
  _count?: { lineas: number; novedades: number };
}

export interface DespachoLinea {
  id: string;
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidadSolicitada: number;
  cantidadPreparada: number | null;
  cantidadDespachada: number | null;
  cantidadEntregada: number | null;
  observacion: string | null;
}

export type EstadoNovedad = "ABIERTA" | "RESUELTA";

export interface DespachoNovedad {
  id: string;
  tipo: string;
  descripcion: string;
  estado: EstadoNovedad;
  usuario: string;
  createdAt: string;
  resueltaPor: string | null;
  fechaResolucion: string | null;
  observacionResolucion: string | null;
}

export interface EventoDespacho {
  id: string;
  accion: string;
  detalle: string;
  datosAnteriores: string | null;
  datosNuevos: string | null;
  usuarioAfectado: string | null;
  createdAt: string;
}

export interface DetalleDespacho {
  despacho: Despacho;
  lineas: DespachoLinea[];
  novedades: DespachoNovedad[];
  eventos: EventoDespacho[];
}

export interface FiltrosDespachos {
  page?: number;
  pageSize?: number;
  estado?: EstadoDespacho;
  clienteSearch?: string;
  bodegaRowId?: number;
  conductorSearch?: string;
  desde?: string;
  hasta?: string;
}

function construirQuery(filtros: object): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Listado paginado de despachos, filtrable por estado/cliente/bodega/conductor/fecha. */
export function useDespachos(filtros: FiltrosDespachos) {
  const [items, setItems] = useState<Despacho[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/despachos${construirQuery(filtros)}`);
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando los despachos.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crear = useCallback(
    async (input: CrearDespachoInput) => {
      const data = await fetchAuth("/despachos", { method: "POST", body: JSON.stringify(input) });
      await refresh();
      return data as Despacho;
    },
    [refresh],
  );

  return { items, total, totalPages, loading, error, refresh, crear };
}

/** Conteo de despachos por estado — indicadores clicables del listado. */
export function useResumenDespachos() {
  const [porEstado, setPorEstado] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuth("/despachos/resumen");
      setPorEstado(data.porEstado ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { porEstado, loading, refresh };
}

export interface DocumentoVenta {
  id: number;
  fecha: string;
  referencia: string | null;
  neto: number;
  clienteNombre: string | null;
  clienteNit: string | null;
}

export interface DocumentosVentaParaDespacho {
  disponible: boolean;
  motivo?: string;
  items?: DocumentoVenta[];
  total?: number;
}

/** Documentos de venta reales de Siesa (últimos 90 días) para originar un despacho. */
export function useDocumentosVentaParaDespacho() {
  const [loading, setLoading] = useState(false);

  const buscar = useCallback(async (search: string): Promise<DocumentosVentaParaDespacho> => {
    setLoading(true);
    try {
      return await fetchAuth(
        `/despachos/documentos-venta${construirQuery({ search, pageSize: 10 })}`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  return { buscar, loading };
}

export interface CrearDespachoInput {
  siesaDocRowId: number;
  direccionEntrega?: string | null;
  contactoEntrega?: string | null;
  telefonoContacto?: string | null;
  bodegaRowId?: number | null;
  bodegaNombre?: string | null;
  fechaEntregaEstimada?: string | null;
}

export interface ActualizarEstadoDespachoInput {
  estado: EstadoDespacho;
  observacion?: string | null;
  vehiculoPlaca?: string | null;
  vehiculoTipo?: string | null;
  conductorNombre?: string | null;
  conductorTelefono?: string | null;
  recibidoPor?: string | null;
}

/** Detalle de un despacho: cabecera + líneas + novedades + línea de tiempo (reutiliza Auditoria). */
export function useDespacho(id: string | undefined) {
  const [detalle, setDetalle] = useState<DetalleDespacho | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/despachos/${id}`);
      setDetalle(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el despacho.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const actualizarEstado = useCallback(
    async (input: ActualizarEstadoDespachoInput) => {
      await fetchAuth(`/despachos/${id}/estado`, { method: "PATCH", body: JSON.stringify(input) });
      await refresh();
    },
    [id, refresh],
  );

  const actualizarLinea = useCallback(
    async (
      lineaId: string,
      input: {
        cantidadPreparada?: number | null;
        cantidadDespachada?: number | null;
        cantidadEntregada?: number | null;
        observacion?: string | null;
      },
    ) => {
      await fetchAuth(`/despachos/${id}/lineas/${lineaId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      await refresh();
    },
    [id, refresh],
  );

  const crearNovedad = useCallback(
    async (tipo: string, descripcion: string) => {
      await fetchAuth(`/despachos/${id}/novedades`, {
        method: "POST",
        body: JSON.stringify({ tipo, descripcion }),
      });
      await refresh();
    },
    [id, refresh],
  );

  const resolverNovedad = useCallback(
    async (novedadId: string, observacionResolucion?: string) => {
      await fetchAuth(`/despachos/${id}/novedades/${novedadId}/resolver`, {
        method: "PATCH",
        body: JSON.stringify({ observacionResolucion }),
      });
      await refresh();
    },
    [id, refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    detalle,
    loading,
    error,
    refresh,
    actualizarEstado,
    actualizarLinea,
    crearNovedad,
    resolverNovedad,
  };
}
