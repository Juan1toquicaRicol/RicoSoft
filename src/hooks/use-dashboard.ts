import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface DashboardFacturas {
  total: number;
  porEstado: Record<string, number>;
  valorPendiente: number;
  valorAprobado: number;
  valorPagado: number;
  vencidas: number;
  topProveedores: { nombre: string; valor: number }[];
}

export interface DashboardSolicitudes {
  total: number;
  porEstado: Record<string, number>;
}

export interface DashboardImportaciones {
  totalLotes: number;
  enTransito: number;
  nacionalizados: number;
  pendientesDocumentacion: number;
}

export interface DashboardCreditos {
  total: number;
  totalSaldo: number;
  pendientes: number;
  topDeudores: { cliente: string; saldo: number }[];
}

export interface DashboardResumen {
  facturas?: DashboardFacturas;
  solicitudes?: DashboardSolicitudes;
  creditos?: DashboardCreditos;
  importaciones?: DashboardImportaciones;
}

export function useDashboard() {
  const [resumen, setResumen] = useState<DashboardResumen>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/analitica/dashboard");
      setResumen(data);
    } catch (err: any) {
      setError(err.message || "Error cargando los indicadores del dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { resumen, loading, error, refresh };
}
