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
    } catch (err: any) {
      setError(err.message || "Error cargando servicios.");
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
      proveedor: string;
      periodicidad: string;
      costo: number;
      moneda: string;
      fechaRenovacion: string;
      responsableArea: string;
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

  return { suscripciones, loading, error, refresh, addSuscripcion, toggleEstadoSuscripcion };
}
