import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface CumplimientoLogistico {
  totalEvaluable: number;
  aTiempo: number;
  /** null = sin datos evaluables en el período (nunca 0% engañoso). */
  otifPct: number | null;
  /** Despachos entregados sin fechaEntregaEstimada/fechaEntregaReal — no se pudieron evaluar. */
  sinFechaEstimada: number;
  periodo: { desde: string | null; hasta: string | null };
}

export interface FiltroCumplimiento {
  /** ISO date, opcional — sin filtro cubre todo el histórico del tenant. */
  desde?: string;
  hasta?: string;
}

/** OTIF (a tiempo) del tenant — Motor de Decisiones, Fase 2.1 P0 Logística. */
export function useCumplimientoLogistico(filtro: FiltroCumplimiento = {}) {
  const [cumplimiento, setCumplimiento] = useState<CumplimientoLogistico | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filtro.desde) params.set("desde", filtro.desde);
      if (filtro.hasta) params.set("hasta", filtro.hasta);
      const qs = params.toString();
      const data = await fetchAuth(`/logistica/cumplimiento${qs ? `?${qs}` : ""}`);
      setCumplimiento(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el cumplimiento logístico.");
    } finally {
      setLoading(false);
    }
  }, [filtro.desde, filtro.hasta]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { cumplimiento, loading, error, refresh };
}

export interface NovedadAbierta {
  id: string;
  despachoId: string;
  tipo: string;
  descripcion: string;
  clienteNombre: string;
  createdAt: string;
  diasAbierta: number;
}

export interface ConteoPorClave {
  clave: string;
  cantidad: number;
}

export interface ResumenNovedadesAbiertas {
  novedades: NovedadAbierta[];
  porTipo: ConteoPorClave[];
  porCliente: ConteoPorClave[];
}

/** Novedades de despacho abiertas, ordenadas por antigüedad, con recurrencia por tipo/cliente. */
export function useNovedadesAbiertas() {
  const [resumen, setResumen] = useState<ResumenNovedadesAbiertas>({
    novedades: [],
    porTipo: [],
    porCliente: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/logistica/novedades-abiertas");
      setResumen(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando las novedades abiertas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...resumen, loading, error, refresh };
}
