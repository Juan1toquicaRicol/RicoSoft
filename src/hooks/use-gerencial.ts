import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type CategoriaIndicador =
  "finanzas" | "ventas" | "inventario" | "produccion" | "compras" | "riesgos";
export type NivelIndicador = "critico" | "alto" | "medio" | "bajo" | "informativo";
export type TendenciaIndicador = "subida" | "bajada" | "estable" | "sin_datos";
export type UnidadIndicador = "COP" | "unidades" | "dias" | "%" | "conteo";
export type CalidadDatosIndicador = "ALTA" | "MEDIA" | "BAJA";

export interface AccionIndicador {
  label: string;
  ruta: string;
}

export interface IndicadorGerencial {
  id: string;
  categoria: CategoriaIndicador;
  titulo: string;
  valor: number;
  unidad: UnidadIndicador;
  tendencia: TendenciaIndicador;
  variacionPct: number | null;
  periodo: string;
  impacto: number | null;
  nivel: NivelIndicador;
  calidadDatos: CalidadDatosIndicador | null;
  fuente: string;
  detalle: Record<string, unknown>;
  accion: AccionIndicador | null;
}

export interface ResumenPorCategoria {
  categoria: CategoriaIndicador;
  cantidad: number;
  criticos: number;
  altos: number;
}

export interface CentroGerencial {
  disponibleSiesa: boolean;
  motivoSiesaNoDisponible: string | null;
  indicadores: IndicadorGerencial[];
  resumenPorCategoria: ResumenPorCategoria[];
}

/** Centro Gerencial: indicadores conectados de finanzas, ventas, inventario, producción, compras y riesgos. */
export function useCentroGerencial() {
  const [centro, setCentro] = useState<CentroGerencial | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/gerencial/resumen");
      setCentro(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el Centro Gerencial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { centro, loading, error, refresh };
}
