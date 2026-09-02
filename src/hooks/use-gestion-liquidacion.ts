import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type EstadoGestionLiquidacion = "PENDIENTE" | "EN_REVISION" | "APROBADA" | "RECHAZADA" | "EJECUTADA";
export type CategoriaLiquidacion = "CRITICA" | "ALTA" | "MEDIA" | "BAJA";

export interface GestionLiquidacion {
  id: string;
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  cantidadExistente: number;
  valorTotal: number;
  score: number;
  categoria: CategoriaLiquidacion;
  motivo: string;
  estado: EstadoGestionLiquidacion;
  responsable: string;
  createdAt: string;
  actualizadoEn: string;
}

export interface CrearGestionLiquidacionInput {
  itemRowId: number;
  descripcion?: string | null;
  referencia?: string | null;
  cantidadExistente: number;
  valorTotal: number;
  score: number;
  categoria: CategoriaLiquidacion;
  motivo: string;
}

/**
 * Gestión de liquidación (Fase G) — registro interno de la decisión
 * empresarial, nunca un ajuste real de inventario en Siesa. Los datos de
 * creación vienen SIEMPRE del Centro de Decisiones (GET /inventario/decisiones);
 * este hook no recalcula score ni categoría, solo los persiste tal cual.
 */
export function useGestionesLiquidacion() {
  const [gestiones, setGestiones] = useState<GestionLiquidacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/gestion-liquidacion");
      setGestiones(data);
    } catch (err: any) {
      setError(err.message || "Error cargando las gestiones de liquidación.");
    } finally {
      setLoading(false);
    }
  }, []);

  const crear = useCallback(
    async (input: CrearGestionLiquidacionInput) => {
      const data = await fetchAuth("/gestion-liquidacion", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await refresh();
      return data as GestionLiquidacion;
    },
    [refresh],
  );

  const actualizarEstado = useCallback(
    async (id: string, estado: EstadoGestionLiquidacion) => {
      await fetchAuth(`/gestion-liquidacion/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      });
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { gestiones, loading, error, refresh, crear, actualizarEstado };
}
