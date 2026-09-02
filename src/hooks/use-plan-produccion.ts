import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type EstadoPlanProduccion =
  | "Planificada"
  | "Aprobada"
  | "En producción"
  | "Parcial"
  | "Terminada"
  | "Cancelada";

export interface PlanProduccion {
  id: string;
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidadPlaneada: number;
  estado: EstadoPlanProduccion;
  fechaPlaneada: string;
  responsable: string;
  notas: string | null;
  createdAt: string;
  actualizadoEn: string;
}

export interface CrearPlanProduccionInput {
  itemRowId: number;
  descripcion?: string | null;
  referencia?: string | null;
  unidadMedida?: string | null;
  cantidadPlaneada: number;
  fechaPlaneada: string;
  notas?: string | null;
}

/** Planes de producción con estados (Etapa J) — seguimiento interno de RicoSoft, nunca escrito a Siesa. */
export function usePlanesProduccion() {
  const [planes, setPlanes] = useState<PlanProduccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/plan-produccion");
      setPlanes(data);
    } catch (err: any) {
      setError(err.message || "Error cargando los planes de producción.");
    } finally {
      setLoading(false);
    }
  }, []);

  const crear = useCallback(
    async (input: CrearPlanProduccionInput) => {
      const data = await fetchAuth("/plan-produccion", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await refresh();
      return data as PlanProduccion;
    },
    [refresh],
  );

  const actualizarEstado = useCallback(
    async (id: string, estado: EstadoPlanProduccion) => {
      await fetchAuth(`/plan-produccion/${id}/estado`, {
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

  return { planes, loading, error, refresh, crear, actualizarEstado };
}
