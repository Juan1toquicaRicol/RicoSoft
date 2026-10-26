import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type EstadoComprobacion = "OK" | "FALLO" | "DESCONOCIDO" | "OMITIDO" | "NO_CONFIGURADO";

export interface Comprobacion {
  estado: EstadoComprobacion;
  latenciaMs: number | null;
  mensaje: string | null;
}

export type EstadoGeneralSiesa = "OPERATIVO" | "DEGRADADO" | "CAIDO" | "NO_CONFIGURADO";

export interface ReporteMonitoreoSiesa {
  comprobadoEn: string;
  duracionTotalMs: number;
  estadoGeneral: EstadoGeneralSiesa;
  desdeCache: boolean;
  configuracion: {
    configurada: boolean;
    host: string | null;
    puerto: number | null;
    variablesFaltantes: string[];
  };
  conectividad: Comprobacion;
  sql: Comprobacion;
  vistas: (Comprobacion & { nombre: string })[];
  vpn: {
    interfazTunel: Comprobacion & { interfaces: string[] };
    rutaSiesa: Comprobacion & { direccion: string | null };
    conectividadSql: Comprobacion;
  };
  tenant: { siesaCiaConfigurada: boolean };
}

/** Salud de Siesa y de la VPN (solo lectura, cacheada unos segundos en el servidor). */
export function useMonitoreoSiesa() {
  const [reporte, setReporte] = useState<ReporteMonitoreoSiesa | null>(null);
  const [loading, setLoading] = useState(true);
  const [comprobando, setComprobando] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (forzar = false) => {
    if (forzar) setComprobando(true);
    else setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/monitoreo/siesa${forzar ? "?forzar=true" : ""}`);
      setReporte(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al comprobar el estado de Siesa.");
    } finally {
      setLoading(false);
      setComprobando(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { reporte, loading, comprobando, error, refresh };
}

export type EstadoJob = "NO_CONFIGURADO" | "PROGRAMADO" | "EN_EJECUCION" | "OK" | "FALLIDO";
export type OrigenJob = "SCHEDULER" | "BAJO_DEMANDA" | "NO_EXISTE";

export interface JobMonitoreado {
  id: string;
  nombre: string;
  descripcion: string;
  origen: OrigenJob;
  estado: EstadoJob;
  motivo: string | null;
  cron: string | null;
  ultimaEjecucion: string | null;
  ultimaEjecucionExitosa: string | null;
  ultimaEjecucionFallida: string | null;
  duracionUltimaMs: number | null;
  mensajeUltimoError: string | null;
  proximaEjecucion: string | null;
}

/** Estado de los procesos en background (crons in-process + sincronización a demanda). */
export const REFRESCO_JOBS_MS = 30_000;

export function useMonitoreoJobs() {
  const [jobs, setJobs] = useState<JobMonitoreado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generadoEn, setGeneradoEn] = useState<string | null>(null);

  // `silencioso`: el refresco automático no vacía la tabla ni muestra el spinner;
  // si falla, conserva lo último que se vio y solo muestra el error.
  const refresh = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/monitoreo/jobs");
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      setGeneradoEn(typeof data?.generadoEn === "string" ? data.generadoEn : null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al obtener el estado de los procesos.");
      if (!silencioso) setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(true), REFRESCO_JOBS_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { jobs, loading, error, refresh, generadoEn };
}
