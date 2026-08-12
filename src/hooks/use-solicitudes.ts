import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";
import type { SolicitudCompra } from "@/lib/data";

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
      solicitante: string;
      item: string;
      descripcion: string;
      cantidad: number;
      valorEstimado: number;
      prioridad: string;
    }) => {
      await fetchAuth("/solicitudes-compra", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const updateEstadoSolicitudCompra = useCallback(
    async (id: string, estado: SolicitudCompra["estado"]) => {
      await fetchAuth(`/solicitudes-compra/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      });
      await refresh();
    },
    [refresh],
  );

  return { solicitudesCompra: solicitudes, loading, error, refresh, addSolicitudCompra, updateEstadoSolicitudCompra };
}
