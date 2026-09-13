import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type MetricaKey = "margen" | "ventas" | "clientes";
export type DimensionKey = "cliente" | "vendedor" | "fecha";
export type OrdenDireccion = "asc" | "desc";
export type VisualizacionKey = "tabla" | "barras" | "linea" | "area" | "dona";

export interface DimensionDefinition {
  key: DimensionKey;
  label: string;
}

export interface MetricDefinition {
  key: MetricaKey;
  label: string;
  descripcion: string;
  allowedDimensions: DimensionKey[];
  camposOrdenables: { key: string; label: string }[];
}

export interface CatalogoAnalisis {
  metricas: MetricDefinition[];
  dimensiones: DimensionDefinition[];
  visualizacionesPorDimension: Record<DimensionKey, VisualizacionKey[]>;
}

/** Catálogo cerrado de métricas/dimensiones/visualizaciones — el usuario solo elige de aquí, nunca envía una combinación libre. */
export function useCatalogoAnalisis() {
  const [catalogo, setCatalogo] = useState<CatalogoAnalisis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchAuth("/analitica/analisis/catalogo");
        setCatalogo(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error cargando el catálogo de análisis.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { catalogo, loading, error };
}

export interface ConfiguracionAnalisis {
  metrica: MetricaKey;
  dimensionPrincipal: DimensionKey;
  dimensionSecundaria?: DimensionKey;
  fechaInicio: string;
  fechaFin: string;
  filtros?: { vendedorId?: number; clienteId?: number };
  orden?: OrdenDireccion;
  ordenarPor?: string;
  limite?: number;
  visualizacion?: VisualizacionKey;
}

export interface FilaAnalisis {
  etiqueta: string;
  id: number | null;
  neto?: number;
  costo?: number;
  margen?: number;
  kilos?: number;
  documentos?: number;
}

export interface ResultadoAnalisis {
  disponible: boolean;
  motivo?: string;
  filas: FilaAnalisis[];
  totales: { neto?: number; costo?: number; margen?: number; kilos?: number; documentos?: number };
}

/** Ejecuta una configuración de análisis (ya armada por el constructor) contra el backend, que la revalida contra el catálogo cerrado. */
export function useEjecutarAnalisis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ejecutar = useCallback(
    async (config: ConfiguracionAnalisis): Promise<ResultadoAnalisis> => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchAuth("/analitica/analisis/ejecutar", {
          method: "POST",
          body: JSON.stringify(config),
        });
        return data;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error ejecutando el análisis.";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { ejecutar, loading, error };
}

export interface AnalisisGuardado {
  id: string;
  nombre: string;
  configuracion: ConfiguracionAnalisis;
  createdAt: string;
  updatedAt: string;
}

/** "Mis análisis": lista/crea/elimina configuraciones guardadas, privadas por usuario dentro del tenant. */
export function useAnalisisGuardados() {
  const [analisis, setAnalisis] = useState<AnalisisGuardado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/analitica/analisis/guardados");
      setAnalisis(data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando tus análisis guardados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const guardar = useCallback(
    async (nombre: string, configuracion: ConfiguracionAnalisis) => {
      const creado = await fetchAuth("/analitica/analisis/guardados", {
        method: "POST",
        body: JSON.stringify({ nombre, configuracion }),
      });
      await refresh();
      return creado as AnalisisGuardado;
    },
    [refresh],
  );

  const eliminar = useCallback(
    async (id: string) => {
      await fetchAuth(`/analitica/analisis/guardados/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { analisis, loading, error, refresh, guardar, eliminar };
}
