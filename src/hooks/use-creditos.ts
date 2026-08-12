import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";
import type { CreditoCliente } from "@/lib/data";

export function useCreditos() {
  const [creditos, setCreditos] = useState<CreditoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/creditos");
      setCreditos(data);
    } catch (err: any) {
      setError(err.message || "Error cargando créditos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { creditos, loading, error, refresh };
}
