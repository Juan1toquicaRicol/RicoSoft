import { useCallback, useEffect, useState } from "react";
import { fetchAuth, fetchAuthUpload, fetchAuthBlob } from "@/lib/session";
import type { SolicitudCompra } from "@/lib/data";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.empresaId, filtros.estado, filtros.area, filtros.solicitante, filtros.desde, filtros.hasta]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { historial, loading, error, refresh };
}
