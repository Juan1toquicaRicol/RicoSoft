import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface AgregadoDias {
  promedio: number | null;
  minimo: number | null;
  maximo: number | null;
  cantidadAnalizada: number;
  cantidadExcluida: number;
}

export interface Tendencia {
  actual: number | null;
  referencia: number | null;
  variacionPorcentual: number | null;
  variacionAbsoluta: number | null;
}

export interface DesglosePorClave {
  clave: string;
  agregado: AgregadoDias;
}

export interface ResumenAnaliticaImportaciones {
  leadTime: {
    agregado: AgregadoDias;
    tendencia: Tendencia;
    desglosePorProveedor: DesglosePorClave[];
    desglosePorOrigen: DesglosePorClave[];
  };
  tiempoDesaduanamiento: {
    agregado: AgregadoDias;
    tendencia: Tendencia;
    desglosePorPuerto: DesglosePorClave[];
  };
  factorIncrementoLogistico: {
    agregado: AgregadoDias;
    tendencia: Tendencia;
    desglosePorProveedor: DesglosePorClave[];
  };
  totalOperacionesConsideradas: number;
}

export interface OperacionAnalitica {
  ordenCompraId: string;
  numeroOrden: string;
  codigo: string | null;
  proveedorNombre: string;
  paisOrigen: string;
  puertoDestino: string | null;
  fechaOrden: string;
  fechaDisponibleBodega: string | null;
  fechaDisponibleBodegaOrigen: string | null;
  fechaLlegadaPuerto: string | null;
  fechaLlegadaPuertoOrigen: string | null;
  fechaNacionalizado: string | null;
  fechaNacionalizadoOrigen: string | null;
  leadTimeDias: number | null;
  tiempoDesaduanamientoDias: number | null;
  valorFobTotalCop: number | null;
  costoLandedFinalCop: number | null;
  factorIncrementoLogisticoPct: number | null;
  excluidoLeadTime: boolean;
  excluidoDesaduanamiento: boolean;
  excluidoFactorLogistico: boolean;
}

export interface FiltrosAnaliticaImportaciones {
  desde?: string;
  hasta?: string;
  proveedorId?: string;
  paisOrigen?: string;
  puerto?: string;
}

function construirQuery(filtros: FiltrosAnaliticaImportaciones): string {
  const params = new URLSearchParams();
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  if (filtros.proveedorId) params.set("proveedorId", filtros.proveedorId);
  if (filtros.paisOrigen) params.set("paisOrigen", filtros.paisOrigen);
  if (filtros.puerto) params.set("puerto", filtros.puerto);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Analítica de Importaciones V1 — carga el resumen agregado (3 KPIs) y el
 * detalle tabular de operaciones desde el backend
 * (importaciones-analitica.service.ts), que ya hace toda la agregación y
 * exclusión de datos insuficientes. El frontend nunca calcula ni infiere
 * nada aquí, solo muestra lo que el backend devuelve.
 */
export function useImportacionesAnalitica(filtros: FiltrosAnaliticaImportaciones) {
  const [resumen, setResumen] = useState<ResumenAnaliticaImportaciones | null>(null);
  const [operaciones, setOperaciones] = useState<OperacionAnalitica[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filtrosKey = JSON.stringify(filtros);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = construirQuery(filtros);
      const [resumenData, operacionesData] = await Promise.all([
        fetchAuth(`/importaciones/analitica/resumen${query}`),
        fetchAuth(`/importaciones/analitica/operaciones${query}`),
      ]);
      setResumen(resumenData as ResumenAnaliticaImportaciones);
      setOperaciones(
        Array.isArray(operacionesData?.operaciones) ? operacionesData.operaciones : [],
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error cargando la analítica de importaciones.",
      );
      setResumen(null);
      setOperaciones([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { resumen, operaciones, loading, error, refresh };
}
