import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type NivelObjetivo = "EMPRESA" | "VENDEDOR";
export type TipoPeriodoObjetivo = "MENSUAL" | "TRIMESTRAL" | "ANUAL" | "PERSONALIZADO";
export type EstadoObjetivo = "BORRADOR" | "ACTIVO" | "CANCELADO" | "CERRADO";

export interface Objetivo {
  id: string;
  nivel: NivelObjetivo;
  vendedorSiesaRowId: number | null;
  vendedorSiesaNombre: string | null;
  tipoPeriodo: TipoPeriodoObjetivo;
  fechaInicio: string;
  fechaFin: string;
  anio: number;
  metaValor: number | null;
  metaVolumenKg: number | null;
  metaInventario: number | null;
  tipoMetaInventario: string | null;
  descripcion: string | null;
  estado: "BORRADOR" | "ACTIVO" | "CANCELADO";
  /** "CERRADO" cuando fechaFin ya pasó, aunque estado en BD siga "ACTIVO" — calculado por el backend. */
  estadoDerivado: EstadoObjetivo;
  creadoPorNombre: string;
  asignadoPorNombre: string | null;
  createdAt: string;
}

export interface ObjetivosFiltros {
  nivel?: NivelObjetivo;
  anio?: number;
  estado?: string;
  vendedorSiesaRowId?: number;
}

export function useObjetivos(filtros: ObjetivosFiltros = {}) {
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filtros.nivel) params.set("nivel", filtros.nivel);
      if (filtros.anio) params.set("anio", String(filtros.anio));
      if (filtros.estado) params.set("estado", filtros.estado);
      if (filtros.vendedorSiesaRowId)
        params.set("vendedorSiesaRowId", String(filtros.vendedorSiesaRowId));
      const qs = params.toString();
      const data = await fetchAuth(`/objetivos${qs ? `?${qs}` : ""}`);
      setObjetivos(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando objetivos.");
    } finally {
      setLoading(false);
    }
  }, [filtros.nivel, filtros.anio, filtros.estado, filtros.vendedorSiesaRowId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crearObjetivo = useCallback(
    async (data: {
      nivel: NivelObjetivo;
      vendedorSiesaRowId?: number;
      vendedorSiesaNombre?: string;
      tipoPeriodo: TipoPeriodoObjetivo;
      fechaInicio: string;
      fechaFin: string;
      metaValor?: number;
      metaVolumenKg?: number;
      metaInventario?: number;
      tipoMetaInventario?: string;
      descripcion?: string;
      estado?: "BORRADOR" | "ACTIVO";
    }) => {
      await fetchAuth("/objetivos", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const actualizarObjetivo = useCallback(
    async (
      id: string,
      data: Partial<
        Pick<
          Objetivo,
          "fechaInicio" | "fechaFin" | "metaValor" | "metaVolumenKg" | "descripcion" | "estado"
        >
      >,
    ) => {
      await fetchAuth(`/objetivos/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const eliminarObjetivo = useCallback(
    async (id: string) => {
      await fetchAuth(`/objetivos/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return {
    objetivos,
    loading,
    error,
    refresh,
    crearObjetivo,
    actualizarObjetivo,
    eliminarObjetivo,
  };
}

export interface CumplimientoObjetivo {
  metaValor: number | null;
  ventaRealValor: number | null;
  cumplimientoValorPct: number | null;
  faltanteValor: number | null;
  metaVolumenKg: number | null;
  volumenRealKg: number | null;
  cumplimientoVolumenPct: number | null;
  faltanteVolumenKg: number | null;
}

export interface ComparativoAnual {
  ventaActual: number;
  ventaAnterior: number;
  variacionAbsoluta: number;
  variacionPct: number | null;
}

export interface RitmoObjetivo {
  pctTiempoTranscurrido: number;
  pctMetaCumplida: number;
  ritmo: "ADELANTADO" | "ATRASADO";
  proyeccionLineal: number;
}

export interface ResumenObjetivo {
  disponible: boolean;
  motivo?: string;
  objetivo?: Objetivo;
  cumplimiento?: CumplimientoObjetivo;
  comparativo?: ComparativoAnual;
  comparativoVolumen?: ComparativoAnual;
  ritmo?: RitmoObjetivo | null;
}

export function useResumenObjetivo(id: string | null) {
  const [resumen, setResumen] = useState<ResumenObjetivo>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/objetivos/${id}/resumen`);
      setResumen(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el resumen del objetivo.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { resumen, loading, error, refresh };
}

export interface VendedorAporteObjetivo {
  vendedorRowId: number | null;
  vendedorNombre: string;
  venta: number;
  pctParticipacion: number | null;
  kilos: number;
  documentos: number;
  metaIndividual: number | null;
  cumplimientoIndividualPct: number | null;
}

export function useVendedoresObjetivo(id: string | null) {
  const [vendedores, setVendedores] = useState<VendedorAporteObjetivo[]>([]);
  const [disponible, setDisponible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/objetivos/${id}/vendedores`);
      setDisponible(data.disponible);
      setVendedores(data.vendedores ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el desglose por vendedor.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { vendedores, disponible, loading, error, refresh };
}

export interface VendedorCatalogo {
  vendedorRowId: number;
  vendedorNombre: string | null;
}

export function useCatalogoVendedores() {
  const [vendedores, setVendedores] = useState<VendedorCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/objetivos/vendedores/catalogo");
      setVendedores(data.vendedores ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el catálogo de vendedores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { vendedores, loading, error, refresh };
}
