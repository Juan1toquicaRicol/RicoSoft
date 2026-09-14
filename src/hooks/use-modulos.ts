import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuth } from "@/lib/session";
import { useSession } from "@/lib/session-context";

export interface ModuloApi {
  id: string;
  clave: string;
  nombre: string;
  ruta: string;
  icono: string;
  activo: boolean;
  orden: number;
  alcance: "GENERAL" | "TENANT";
  /** Código de PERMISOS_SISTEMA requerido para ver/usar el módulo; null =
   * visible para cualquier usuario autenticado. */
  permisoClave: string | null;
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
      cambios: {
        departamentoId?: string | null;
        activo?: boolean;
        orden?: number;
        alcance?: "GENERAL" | "TENANT";
        permisoClave?: string | null;
      },
    ) => {
      await fetchAuth(`/modulos/${id}`, { method: "PATCH", body: JSON.stringify(cambios) });
      await refresh();
    },
    [refresh],
  );

  return { modulos, loading, error, refresh, actualizarModulo };
}

// Módulos rara vez cambian minuto a minuto (un admin los reordena/asigna
// ocasionalmente desde Configuración > Módulos) — no hace falta pedirlos de
// nuevo en cada navegación del sidebar.
const STALE_TIME_MENU_MS = 2 * 60_000;

/**
 * Catálogo reducido a módulos activos, usado para construir el sidebar.
 * Accesible para cualquier usuario autenticado.
 *
 * El backend ya filtra por lo que el usuario realmente puede usar (ver
 * listarModulosMenu en modulos.controller.ts) — este hook nunca decide
 * visibilidad en el cliente, solo refleja lo que llega.
 *
 * La query key incluye `tenantId` y los permisos del usuario: AppShell (donde
 * vive el sidebar) nunca se desmonta al cambiar de empresa en caliente ni
 * cuando SessionContext refresca la sesión tras un cambio de rol/permisos —
 * sin esto en la key, el menú seguiría mostrando los módulos de antes hasta
 * un refresh manual. Cacheado con React Query: antes se repetía la misma
 * petición en cada remount de AppShell (cada clic del sidebar); ahora se
 * reutiliza mientras la key no cambie y no haya pasado STALE_TIME_MENU_MS.
 */
export function useModulosMenu() {
  const { user } = useSession();
  const permisosKey = user?.permisos.join(",") ?? "";

  const query = useQuery({
    queryKey: ["modulos-menu", user?.tenantId, permisosKey],
    queryFn: () => fetchAuth("/modulos/menu") as Promise<ModuloApi[]>,
    enabled: Boolean(user?.tenantId),
    staleTime: STALE_TIME_MENU_MS,
    // El hook original no reintentaba ante un fallo.
    retry: false,
  });

  return { modulos: query.data ?? [], loading: query.isLoading };
}
