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

export interface ClienteCarteraSiesa {
  cliente: string;
  nit: string | null;
  saldo: number;
  vence: string;
  estado: string;
}

/**
 * Cartera real por cliente, leída en vivo de Siesa — de solo lectura (no
 * hay acciones de registrar pago/paz-y-salvo aquí, eso vive en Siesa).
 * Paginada y con búsqueda server-side: un tenant real puede tener miles de
 * saldos abiertos.
 */
export function useCarteraSiesa() {
  const [items, setItems] = useState<ClienteCarteraSiesa[]>([]);
  const [disponible, setDisponible] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (opts?: { search?: string; page?: number; pageSize?: number }) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (opts?.search) params.set("search", opts.search);
      params.set("page", String(opts?.page ?? 1));
      params.set("pageSize", String(opts?.pageSize ?? 25));
      const data = await fetchAuth(`/creditos/cartera-siesa?${params.toString()}`);
      setDisponible(data.disponible !== false);
      setMotivo(data.motivo || "");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setPage(data.page ?? 1);
    } catch (err: any) {
      setError(err.message || "Error cargando la cartera de Siesa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, disponible, motivo, total, page, totalPages, loading, error, refresh };
}
