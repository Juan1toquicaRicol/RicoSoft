import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";
import type { CreditoCliente } from "@/lib/data";

export interface CreditosFiltros {
  estado?: string;
}

export function useCreditos(filtros: CreditosFiltros = {}) {
  const [creditos, setCreditos] = useState<CreditoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filtros.estado && filtros.estado !== "Todos") params.set("estado", filtros.estado);
      const qs = params.toString();
      const data = await fetchAuth(`/creditos${qs ? `?${qs}` : ""}`);
      setCreditos(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando créditos.");
    } finally {
      setLoading(false);
    }
  }, [filtros.estado]);

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

  return {
    creditos,
    loading,
    error,
    refresh,
    addCredito,
    registrarPago,
    marcarPazYSalvo,
    eliminarCredito,
  };
}

export interface ResumenCreditos {
  porRecaudar: number;
  vencido: number;
  porVencer: number;
  alDia: number;
  clientesEnMora: number;
  cupoTotal: number;
  utilizacionPct: number;
}

/** KPIs del crédito manual, calculados en backend a partir de las mismas
 * filas que useCreditos — nunca una suma aproximada en el frontend. */
export function useResumenCreditos() {
  const [resumen, setResumen] = useState<ResumenCreditos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/creditos/resumen");
      setResumen(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el resumen de créditos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { resumen, loading, error, refresh };
}

export interface ClienteCarteraSiesa {
  cliente: string;
  nit: string | null;
  /** Total pendiente de cobro (vencido + porVencer + alDia). */
  saldo: number;
  /** Solo la porción cuya fecha de vencimiento ya pasó. */
  vencido: number;
  /** Pendiente, no vencido, dentro de la ventana de alerta temprana. */
  porVencer: number;
  /** Pendiente, no vencido, fuera de la ventana de alerta. */
  alDia: number;
  /** Días de mora de la obligación más vencida de este cliente. 0 si no hay mora. */
  diasMora: number;
  /** Fecha de vencimiento más próxima entre sus documentos abiertos. */
  vence: string;
  estado: string;
}

export interface ResumenCarteraSiesa {
  porRecaudar: number;
  vencido: number;
  porVencer: number;
  alDia: number;
  clientesEnMora: number;
}

/**
 * Cartera real por cliente, leída en vivo de Siesa — de solo lectura (no
 * hay acciones de registrar pago/paz-y-salvo aquí, eso vive en Siesa).
 * Paginada y con búsqueda server-side: un tenant real puede tener miles de
 * saldos abiertos. `resumen` refleja SIEMPRE la cartera completa, no solo
 * la página actual ni el filtro de búsqueda vigente.
 */
export function useCarteraSiesa() {
  const [items, setItems] = useState<ClienteCarteraSiesa[]>([]);
  const [resumen, setResumen] = useState<ResumenCarteraSiesa | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (opts?: { search?: string; estado?: string; page?: number; pageSize?: number }) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (opts?.search) params.set("search", opts.search);
        if (opts?.estado && opts.estado !== "Todos") params.set("estado", opts.estado);
        params.set("page", String(opts?.page ?? 1));
        params.set("pageSize", String(opts?.pageSize ?? 25));
        const data = await fetchAuth(`/creditos/cartera-siesa?${params.toString()}`);
        setDisponible(data.disponible !== false);
        setMotivo(data.motivo || "");
        setItems(Array.isArray(data.items) ? data.items : []);
        setResumen(data.resumen ?? null);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setPage(data.page ?? 1);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error cargando la cartera de Siesa.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, resumen, disponible, motivo, total, page, totalPages, loading, error, refresh };
}
