import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface Regla {
  id: string;
  nombre: string;
  prioridad: number;
  activa: boolean;
  ejecuciones: number;
  condiciones: string[];
  acciones: string[];
}

export function useReglas() {
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/reglas");
      setReglas(data);
    } catch (err: any) {
      setError(err.message || "Error cargando reglas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleActiva = useCallback(
    async (regla: Regla) => {
      setReglas((prev) => prev.map((r) => (r.id === regla.id ? { ...r, activa: !r.activa } : r)));
      try {
        await fetchAuth(`/reglas/${regla.id}`, {
          method: "PATCH",
          body: JSON.stringify({ activa: !regla.activa }),
        });
      } catch (err: any) {
        await refresh();
        throw err;
      }
    },
    [refresh],
  );

  const addRegla = useCallback(
    async (data: { nombre: string; prioridad: number; condiciones: string[]; acciones: string[] }) => {
      await fetchAuth("/reglas", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const eliminarRegla = useCallback(
    async (id: string) => {
      await fetchAuth(`/reglas/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { reglas, loading, error, refresh, toggleActiva, addRegla, eliminarRegla };
}
