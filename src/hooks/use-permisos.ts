import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface PermisoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  modulo: string;
  esSistema: boolean;
  activo: boolean;
}

export interface DatosPermiso {
  codigo: string;
  nombre: string;
  descripcion?: string;
  modulo: string;
}

/**
 * Catálogo de permisos administrable desde Configuración > Permisos. Los
 * permisos del sistema (esSistema=true) se siembran automáticamente en el
 * backend la primera vez que se consulta; los que crea un administrador
 * quedan disponibles de inmediato para asignar a Roles (ver
 * configuracion.roles.tsx), aunque solo tienen efecto real una vez que algún
 * endpoint del backend los exige explícitamente.
 */
export function usePermisosCatalogo() {
  const [permisos, setPermisos] = useState<PermisoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/permisos");
      setPermisos(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el catálogo de permisos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crearPermiso = useCallback(
    async (data: DatosPermiso) => {
      const creado: PermisoCatalogo = await fetchAuth("/permisos", {
        method: "POST",
        body: JSON.stringify(data),
      });
      await refresh();
      return creado;
    },
    [refresh],
  );

  const actualizarPermiso = useCallback(
    async (id: string, data: Partial<Omit<DatosPermiso, "codigo">> & { activo?: boolean }) => {
      await fetchAuth(`/permisos/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const eliminarPermiso = useCallback(
    async (id: string) => {
      await fetchAuth(`/permisos/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { permisos, loading, error, refresh, crearPermiso, actualizarPermiso, eliminarPermiso };
}
