import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";
import type { ServicioSuscripcion } from "@/lib/data";

export function useServicios() {
  const [suscripciones, setSuscripciones] = useState<ServicioSuscripcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/servicios");
      setSuscripciones(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando servicios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addSuscripcion = useCallback(
    async (data: {
      empresaId: string;
      area: string;
      nombreServicio: string;
      descripcion?: string;
      proveedorId: string;
      contratoId?: string;
      periodicidad: string;
      costo: number;
      moneda: string;
      fechaInicio?: string;
      fechaFin?: string;
      diaVencimiento?: number;
      fechaRenovacion: string;
      responsableId: string;
      observaciones?: string;
    }) => {
      await fetchAuth("/servicios", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const toggleEstadoSuscripcion = useCallback(
    async (id: string) => {
      await fetchAuth(`/servicios/${id}/estado`, { method: "PATCH" });
      await refresh();
    },
    [refresh],
  );

  const eliminarSuscripcion = useCallback(
    async (id: string) => {
      await fetchAuth(`/servicios/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return {
    suscripciones,
    loading,
    error,
    refresh,
    addSuscripcion,
    toggleEstadoSuscripcion,
    eliminarSuscripcion,
  };
}

/** Un solo servicio, para su pantalla de detalle. */
export function useServicio(id: string | undefined) {
  const [servicio, setServicio] = useState<ServicioSuscripcion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/servicios/${id}`);
      setServicio(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el servicio.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { servicio, loading, error, refresh };
}
