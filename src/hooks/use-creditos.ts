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

  const addCredito = useCallback(
    async (data: { cliente: string; cupo: number; saldo: number; vence: string }) => {
      await fetchAuth("/creditos", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const registrarPago = useCallback(
    async (id: string, monto: number) => {
      await fetchAuth(`/creditos/${id}/pago`, { method: "POST", body: JSON.stringify({ monto }) });
      await refresh();
    },
    [refresh],
  );

  const marcarPazYSalvo = useCallback(
    async (id: string) => {
      await fetchAuth(`/creditos/${id}/paz-y-salvo`, { method: "POST" });
      await refresh();
    },
    [refresh],
  );

  const eliminarCredito = useCallback(
    async (id: string) => {
      await fetchAuth(`/creditos/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { creditos, loading, error, refresh, addCredito, registrarPago, marcarPazYSalvo, eliminarCredito };
}
