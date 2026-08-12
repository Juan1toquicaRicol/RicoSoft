import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface ModuloApi {
  id: string;
  clave: string;
  nombre: string;
  ruta: string;
  icono: string;
  activo: boolean;
  orden: number;
  departamentoId: string | null;
  departamento: { id: string; nombre: string } | null;
}

/**
 * Catálogo completo de módulos (incluye inactivos), usado en la pantalla de
 * administración de Configuración. Requiere el permiso modulos.ver.
 */
export function useModulos() {
  const [modulos, setModulos] = useState<ModuloApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/modulos");
      setModulos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando módulos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const actualizarModulo = useCallback(
    async (
      id: string,
      cambios: { departamentoId?: string | null; activo?: boolean; orden?: number },
    ) => {
      await fetchAuth(`/modulos/${id}`, { method: "PATCH", body: JSON.stringify(cambios) });
      await refresh();
    },
    [refresh],
  );

  return { modulos, loading, error, refresh, actualizarModulo };
}

/**
 * Catálogo reducido a módulos activos, usado para construir el sidebar.
 * Accesible para cualquier usuario autenticado.
 */
export function useModulosMenu() {
  const [modulos, setModulos] = useState<ModuloApi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const data = await fetchAuth("/modulos/menu");
        if (!cancelado) setModulos(data);
      } catch {
        if (!cancelado) setModulos([]);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return { modulos, loading };
}
