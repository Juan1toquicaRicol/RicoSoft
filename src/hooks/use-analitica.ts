import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface ResumenAnalitica {
  serieMensual: { mes: string; recibido: number; aprobado: number; pagado: number }[];
  topProveedores: { nit: string; nombre: string; valor: number; facturas: number }[];
  porArea: { nombre: string; valor: number }[];
  proyeccion: { mes: string; real: null; proyectado: number }[];
}

const VACIO: ResumenAnalitica = { serieMensual: [], topProveedores: [], porArea: [], proyeccion: [] };

export function useAnalitica() {
  const [resumen, setResumen] = useState<ResumenAnalitica>(VACIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/analitica/resumen");
      setResumen(data);
    } catch (err: any) {
      setError(err.message || "Error cargando la analítica.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...resumen, loading, error, refresh };
}
