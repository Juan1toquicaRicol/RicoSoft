import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";
import type { CargoOpcion } from "@/lib/cargos";

export interface CargoAdmin extends CargoOpcion {
  activo: boolean;
  colaboradoresAsignados: number;
}

/**
 * Cargos ACTIVOS del tenant autenticado para el selector del formulario de
 * colaborador (GET /gestion-humana/cargos/opciones). Si el usuario no tiene
 * permiso para registrar/editar colaboradores la lista queda vacía.
 */
export function useCargosOpciones(habilitado: boolean) {
  const [cargos, setCargos] = useState<CargoOpcion[]>([]);
  const [loading, setLoading] = useState(habilitado);

  const refresh = useCallback(async () => {
    if (!habilitado) {
      setCargos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setCargos(await fetchAuth("/gestion-humana/cargos/opciones"));
    } catch {
      setCargos([]);
    } finally {
      setLoading(false);
    }
  }, [habilitado]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!habilitado) return;
    window.addEventListener("cargos:actualizados", refresh);
    return () => window.removeEventListener("cargos:actualizados", refresh);
  }, [habilitado, refresh]);

  return { cargos, loading, refresh };
}

/** Catálogo completo (activos e inactivos) para la administración de cargos. */
export function useCargosAdmin(habilitado: boolean) {
  const [cargos, setCargos] = useState<CargoAdmin[]>([]);
  const [loading, setLoading] = useState(habilitado);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!habilitado) return;
    setLoading(true);
    setError("");
    try {
      setCargos(await fetchAuth("/gestion-humana/cargos"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al obtener los cargos.");
    } finally {
      setLoading(false);
    }
  }, [habilitado]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crear = useCallback(
    async (data: {
      nombre: string;
      correoCorporativoRequerido: boolean;
      departamentoId: string | null;
    }) => {
      await fetchAuth("/gestion-humana/cargos", { method: "POST", body: JSON.stringify(data) });
      await refresh();
      window.dispatchEvent(new Event("cargos:actualizados"));
    },
    [refresh],
  );

  const actualizar = useCallback(
    async (
      id: string,
      data: {
        nombre?: string;
        activo?: boolean;
        correoCorporativoRequerido?: boolean;
        departamentoId?: string | null;
      },
    ) => {
      await fetchAuth(`/gestion-humana/cargos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await refresh();
      window.dispatchEvent(new Event("cargos:actualizados"));
    },
    [refresh],
  );

  return { cargos, loading, error, crear, actualizar };
}
