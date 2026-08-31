import { useCallback, useEffect, useState } from "react";
import { fetchAuth, fetchAuthUpload, fetchAuthBlob } from "@/lib/session";
import type { CotizacionProveedor, SolicitudCompra } from "@/lib/data";

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
    } catch (err: any) {
      setError(err.message || "Error cargando solicitudes de compra.");
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

  return {
    solicitudesCompra: solicitudes,
    loading,
    error,
    refresh,
    addSolicitudCompra,
    subirCotizacionSolicitud,
    updateEstadoSolicitudCompra,
    eliminarSolicitudCompra,
  };
}

export interface HistorialFiltros {
  empresaId?: string;
  estado?: string;
  area?: string;
  solicitante?: string;
  desde?: string;
  hasta?: string;
}

export async function descargarCotizacionSolicitud(id: string) {
  return fetchAuthBlob(`/solicitudes-compra/${id}/archivo`);
}

/**
 * Cuadro comparativo de cotizaciones de proveedor de una solicitud de
 * compra: listar, agregar (hasta 3), eliminar y elegir la ganadora.
 */
export function useCotizacionesProveedor(solicitudId: string | null) {
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
    } catch (err: any) {
      setError(err.message || "Error cargando las cotizaciones.");
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
    },
    [solicitudId, refresh],
  );

  const eliminarCotizacion = useCallback(
    async (cotizacionId: string) => {
      if (!solicitudId) return;
      await fetchAuth(`/solicitudes-compra/${solicitudId}/cotizaciones/${cotizacionId}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [solicitudId, refresh],
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
    },
    [solicitudId, refresh],
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
 * Historia de compras: consulta de solo lectura sobre solicitudes ya
 * resueltas (Aprobada / Rechazada / Comprado). Reutiliza la misma tabla de
 * SolicitudCompra vía el endpoint /solicitudes-compra/historial.
 */
export function useHistorialCompras(filtros: HistorialFiltros) {
  const [historial, setHistorial] = useState<SolicitudCompra[]>([]);
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
      const qs = params.toString();
      const data = await fetchAuth(`/solicitudes-compra/historial${qs ? `?${qs}` : ""}`);
      setHistorial(data);
    } catch (err: any) {
      setError(err.message || "Error cargando la historia de compras.");
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
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { historial, loading, error, refresh };
}
