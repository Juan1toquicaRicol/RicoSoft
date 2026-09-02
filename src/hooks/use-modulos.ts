import { useCallback, useEffect, useState } from "react";
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

/**
 * Catálogo reducido a módulos activos, usado para construir el sidebar.
 * Accesible para cualquier usuario autenticado.
 *
 * El backend ya filtra por lo que el usuario realmente puede usar (ver
 * listarModulosMenu en modulos.controller.ts) — este hook nunca decide
 * visibilidad en el cliente, solo refleja lo que llega.
 *
 * Depende de `user?.tenantId` y de `user?.permisos`: AppShell (donde vive el
 * sidebar) nunca se desmonta al cambiar de empresa en caliente ni cuando
 * SessionContext refresca la sesión tras un cambio de rol/permisos — sin
 * estas dependencias el menú seguiría mostrando los módulos de antes hasta
 * un refresh manual de la página.
 */
export function useModulosMenu() {
  const { user } = useSession();
  const [modulos, setModulos] = useState<ModuloApi[]>([]);
  const [loading, setLoading] = useState(true);
  const permisosKey = user?.permisos.join(",") ?? "";

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
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
  }, [user?.tenantId, permisosKey]);

  return { modulos, loading };
}
