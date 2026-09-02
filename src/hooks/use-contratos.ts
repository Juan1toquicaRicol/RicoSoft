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

export interface ContratosFiltros {
  empresaId?: string;
  estado?: string;
  search?: string;
  // Opcionales: con `page`, el backend responde el envelope paginado real
  // ({items,page,pageSize,total,totalPages}). Sin él, array plano de
  // siempre (compatibilidad con quien necesita el catálogo completo, p. ej.
  // el select de "contrato relacionado" en Facturas/Servicios).
  page?: number;
  pageSize?: number;
}

export function useContratos(filtros: ContratosFiltros = {}) {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filtros.empresaId) params.set("empresaId", filtros.empresaId);
      if (filtros.estado) params.set("estado", filtros.estado);
      if (filtros.search) params.set("search", filtros.search);
      if (filtros.page) {
        params.set("page", String(filtros.page));
        params.set("pageSize", String(filtros.pageSize ?? 25));
      }
      const qs = params.toString();
      const data = await fetchAuth(`/contratos${qs ? `?${qs}` : ""}`);
      if (Array.isArray(data)) {
        setContratos(data);
        setTotal(data.length);
        setTotalPages(1);
      } else {
        setContratos(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      }
    } catch (err: any) {
      setError(err.message || "Error cargando contratos.");
    } finally {
      setLoading(false);
    }
  }, [filtros.empresaId, filtros.estado, filtros.search, filtros.page, filtros.pageSize]);

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

  return {
    contratos,
    total,
    totalPages,
    loading,
    error,
    refresh,
    addContrato,
    updateEstadoContrato,
    eliminarContrato,
  };
}
