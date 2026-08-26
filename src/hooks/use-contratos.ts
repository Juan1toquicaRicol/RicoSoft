import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface Contrato {
  id: string;
  empresaId: string;
  proveedor: string;
  cliente: string | null;
  responsable: string;
  supervisor: string | null;
  gerente: string | null;
  area: string;
  centroCostos: string | null;
  valorContratado: number;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  observaciones: string | null;
  createdAt: string;
}

export function useContratos() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/contratos");
      setContratos(data);
    } catch (err: any) {
      setError(err.message || "Error cargando contratos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addContrato = useCallback(
    async (data: {
      empresaId: string;
      proveedorId: string;
      cliente?: string;
      responsableId: string;
      supervisor?: string;
      gerente?: string;
      area: string;
      centroCostos?: string;
      valorContratado: number;
      fechaInicio: string;
      fechaFin: string;
      observaciones?: string;
    }) => {
      await fetchAuth("/contratos", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const updateEstadoContrato = useCallback(
    async (id: string, estado: string) => {
      await fetchAuth(`/contratos/${id}`, { method: "PATCH", body: JSON.stringify({ estado }) });
      await refresh();
    },
    [refresh],
  );

  const eliminarContrato = useCallback(
    async (id: string) => {
      await fetchAuth(`/contratos/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { contratos, loading, error, refresh, addContrato, updateEstadoContrato, eliminarContrato };
}
