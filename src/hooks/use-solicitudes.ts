import { useCallback, useEffect, useState } from "react";
import { fetchAuth, fetchAuthUpload, fetchAuthBlob } from "@/lib/session";
import type {
  CotizacionProveedor,
  SolicitudCompra,
  SolicitudDisponibleParaFactura,
} from "@/lib/data";

/**
 * Solicitudes de compra ACTIVAS (Pendiente / En Cotización). En cuanto una
 * solicitud se aprueba o rechaza, el backend deja de incluirla aquí y pasa a
 * formar parte de la Historia de Compras (misma tabla, sin pérdida de datos).
 */
export function useSolicitudes() {
  const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/solicitudes-compra");
      setSolicitudes(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando solicitudes de compra.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addSolicitudCompra = useCallback(
    async (data: {
      empresaId: string;
      area: string;
      solicitanteId: string;
      proveedorId?: string;
      item: string;
      descripcion: string;
      cantidad: number;
      valorEstimado: number;
      prioridad: string;
    }) => {
      const creada: SolicitudCompra = await fetchAuth("/solicitudes-compra", {
        method: "POST",
        body: JSON.stringify(data),
      });
      await refresh();
      return creada;
    },
    [refresh],
  );

  const subirCotizacionSolicitud = useCallback(
    async (id: string, file: File) => {
      const formData = new FormData();
      formData.append("archivo", file);
      await fetchAuthUpload(`/solicitudes-compra/${id}/archivo`, formData);
      await refresh();
    },
    [refresh],
  );

  const updateEstadoSolicitudCompra = useCallback(
    async (id: string, estado: SolicitudCompra["estado"], comentario?: string) => {
      await fetchAuth(`/solicitudes-compra/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado, comentario }),
      });
      await refresh();
    },
    [refresh],
  );

  const eliminarSolicitudCompra = useCallback(
    async (id: string) => {
      await fetchAuth(`/solicitudes-compra/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const confirmarRecepcionSolicitud = useCallback(
    async (id: string, comentario?: string) => {
      await fetchAuth(`/solicitudes-compra/${id}/confirmar-recepcion`, {
        method: "POST",
        body: JSON.stringify({ comentario }),
      });
      await refresh();
    },
    [refresh],
  );

  return {
    solicitudesCompra: solicitudes,
    loading,
    error,
    refresh,
    addSolicitudCompra,
    subirCotizacionSolicitud,
    updateEstadoSolicitudCompra,
    eliminarSolicitudCompra,
    confirmarRecepcionSolicitud,
  };
}

/**
 * Una solicitud puntual por id (página de detalle /solicitudes-compra/$id)
 * — a diferencia de useSolicitudes (solo activas) o useHistorialCompras
 * (solo resueltas), esta funciona sin importar el estado, porque la página
 * de detalle debe poder abrirse directo con un link o recargarse.
 */
export function useSolicitudDetalle(id: string | undefined) {
  const [solicitud, setSolicitud] = useState<SolicitudCompra | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/solicitudes-compra/${id}`);
      setSolicitud(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando la solicitud de compra.");
      setSolicitud(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const cambiarEstado = useCallback(
    async (estado: SolicitudCompra["estado"], comentario?: string) => {
      await fetchAuth(`/solicitudes-compra/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado, comentario }),
      });
      await refresh();
    },
    [id, refresh],
  );

  const confirmarRecepcion = useCallback(
    async (comentario?: string) => {
      await fetchAuth(`/solicitudes-compra/${id}/confirmar-recepcion`, {
        method: "POST",
        body: JSON.stringify({ comentario }),
      });
      await refresh();
    },
    [id, refresh],
  );

  const subirCotizacion = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("archivo", file);
      await fetchAuthUpload(`/solicitudes-compra/${id}/archivo`, formData);
      await refresh();
    },
    [id, refresh],
  );

  return { solicitud, loading, error, refresh, cambiarEstado, confirmarRecepcion, subirCotizacion };
}

export interface HistorialFiltros {
  empresaId?: string;
  estado?: string;
  area?: string;
  solicitante?: string;
  desde?: string;
  hasta?: string;
  // Opcionales: si se pasa `page`, el backend responde el envelope paginado
  // real ({items,page,pageSize,total,totalPages}) en vez del array plano.
  // Sin `page` (p. ej. el selector de "solicitudes Comprado" en Facturas,
  // que necesita el conjunto completo para elegir cuál facturar), el
  // contrato no cambia.
  page?: number;
  pageSize?: number;
}

export async function descargarCotizacionSolicitud(id: string) {
  return fetchAuthBlob(`/solicitudes-compra/${id}/archivo`);
}

/**
 * Cuadro comparativo de cotizaciones de proveedor de una solicitud de
 * compra: listar, agregar (hasta 3), eliminar y elegir la ganadora.
 */
export function useCotizacionesProveedor(solicitudId: string | null, onChange?: () => void) {
  const [cotizaciones, setCotizaciones] = useState<CotizacionProveedor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!solicitudId) {
      setCotizaciones([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/solicitudes-compra/${solicitudId}/cotizaciones`);
      setCotizaciones(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando las cotizaciones.");
    } finally {
      setLoading(false);
    }
  }, [solicitudId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const agregarCotizacion = useCallback(
    async (data: {
      proveedorId?: string;
      proveedorNombre?: string;
      proveedorNit?: string;
      valorTotalCOP: number;
      tiempoEntregaDias: number;
      archivo: File;
    }) => {
      if (!solicitudId) return;
      const formData = new FormData();
      if (data.proveedorId) formData.append("proveedorId", data.proveedorId);
      if (data.proveedorNombre) formData.append("proveedorNombre", data.proveedorNombre);
      if (data.proveedorNit) formData.append("proveedorNit", data.proveedorNit);
      formData.append("valorTotalCOP", String(data.valorTotalCOP));
      formData.append("tiempoEntregaDias", String(data.tiempoEntregaDias));
      formData.append("archivo", data.archivo);
      await fetchAuthUpload(`/solicitudes-compra/${solicitudId}/cotizaciones`, formData);
      await refresh();
      onChange?.();
    },
    [solicitudId, refresh, onChange],
  );

  const eliminarCotizacion = useCallback(
    async (cotizacionId: string) => {
      if (!solicitudId) return;
      await fetchAuth(`/solicitudes-compra/${solicitudId}/cotizaciones/${cotizacionId}`, {
        method: "DELETE",
      });
      await refresh();
      onChange?.();
    },
    [solicitudId, refresh, onChange],
  );

  const seleccionarGanadora = useCallback(
    async (cotizacionId: string) => {
      if (!solicitudId) return;
      await fetchAuth(
        `/solicitudes-compra/${solicitudId}/cotizaciones/${cotizacionId}/seleccionar`,
        {
          method: "POST",
        },
      );
      await refresh();
      onChange?.();
    },
    [solicitudId, refresh, onChange],
  );

  return {
    cotizaciones,
    loading,
    error,
    refresh,
    agregarCotizacion,
    eliminarCotizacion,
    seleccionarGanadora,
  };
}

export async function descargarCotizacionProveedor(solicitudId: string, cotizacionId: string) {
  return fetchAuthBlob(`/solicitudes-compra/${solicitudId}/cotizaciones/${cotizacionId}/archivo`);
}

/**
 * Variante de `agregarCotizacion` (ver useCotizacionesProveedor) que no
 * depende de un hook ya montado sobre una solicitud — se usa para subir
 * las 2-3 cotizaciones iniciales justo después de crear la solicitud, en el
 * mismo formulario de creación, sin necesidad de abrir el cuadro comparativo
 * por separado.
 */
export async function agregarCotizacionProveedor(
  solicitudId: string,
  data: {
    proveedorId?: string;
    proveedorNombre?: string;
    proveedorNit?: string;
    valorTotalCOP: number;
    tiempoEntregaDias: number;
    archivo: File;
  },
) {
  const formData = new FormData();
  if (data.proveedorId) formData.append("proveedorId", data.proveedorId);
  if (data.proveedorNombre) formData.append("proveedorNombre", data.proveedorNombre);
  if (data.proveedorNit) formData.append("proveedorNit", data.proveedorNit);
  formData.append("valorTotalCOP", String(data.valorTotalCOP));
  formData.append("tiempoEntregaDias", String(data.tiempoEntregaDias));
  formData.append("archivo", data.archivo);
  return fetchAuthUpload(`/solicitudes-compra/${solicitudId}/cotizaciones`, formData);
}

/**
 * Solicitudes de compra que todavía pueden recibir una factura (selector
 * "Solicitud de compra relacionada" en Recepcionar Factura). Se resuelve
 * server-side: prioriza el proveedor de la factura (proveedorId) y ya trae
 * el saldo pendiente calculado — el frontend nunca descarga el catálogo
 * completo de solicitudes para filtrarlo acá.
 */
export function useSolicitudesDisponiblesParaFactura(proveedorId?: string) {
  const [solicitudes, setSolicitudes] = useState<SolicitudDisponibleParaFactura[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buscar = useCallback(
    async (search?: string) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (proveedorId) params.set("proveedorId", proveedorId);
        if (search) params.set("search", search);
        const qs = params.toString();
        const data = await fetchAuth(
          `/solicitudes-compra/disponibles-para-factura${qs ? `?${qs}` : ""}`,
        );
        setSolicitudes(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Error cargando solicitudes de compra disponibles.",
        );
      } finally {
        setLoading(false);
      }
    },
    [proveedorId],
  );

  useEffect(() => {
    buscar();
  }, [buscar]);

  return { solicitudes, loading, error, buscar };
}

/**
 * Historia de compras: consulta de solo lectura sobre solicitudes ya
 * resueltas (Aprobada / Rechazada / Comprado). Reutiliza la misma tabla de
 * SolicitudCompra vía el endpoint /solicitudes-compra/historial.
 */
export function useHistorialCompras(filtros: HistorialFiltros) {
  const [historial, setHistorial] = useState<SolicitudCompra[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filtros.empresaId) params.set("empresaId", filtros.empresaId);
      if (filtros.estado) params.set("estado", filtros.estado);
      if (filtros.area) params.set("area", filtros.area);
      if (filtros.solicitante) params.set("solicitante", filtros.solicitante);
      if (filtros.desde) params.set("desde", filtros.desde);
      if (filtros.hasta) params.set("hasta", filtros.hasta);
      if (filtros.page) {
        params.set("page", String(filtros.page));
        params.set("pageSize", String(filtros.pageSize ?? 25));
      }
      const qs = params.toString();
      const data = await fetchAuth(`/solicitudes-compra/historial${qs ? `?${qs}` : ""}`);
      if (Array.isArray(data)) {
        setHistorial(data);
        setTotal(data.length);
        setTotalPages(1);
      } else {
        setHistorial(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando la historia de compras.");
    } finally {
      setLoading(false);
    }
  }, [
    filtros.empresaId,
    filtros.estado,
    filtros.area,
    filtros.solicitante,
    filtros.desde,
    filtros.hasta,
    filtros.page,
    filtros.pageSize,
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { historial, total, totalPages, loading, error, refresh };
}
