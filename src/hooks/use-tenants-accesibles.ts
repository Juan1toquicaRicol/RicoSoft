import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAuth } from "@/lib/session";
import { useSession } from "@/lib/session-context";

export interface TenantAccesible {
  id: string;
  nombre: string;
  subdomain: string;
}

// Depende de qué USUARIO está logueado, no de en qué tenant está activo ahora
// (la lista de membresías es la misma sin importar con cuál empresa entró) —
// por eso la key usa user.id y no tenantId: cambiar de empresa activa no debe
// disparar un refetch de algo que no cambió.
const STALE_TIME_MS = 5 * 60_000;

/**
 * Empresas (tenants) a las que el usuario autenticado puede cambiarse: su
 * tenant "hogar" + cualquier membresía activa. Alimenta el selector de
 * empresa del menú principal — ver AppShell. Se recalcula siempre en el
 * backend (GET /auth/tenants-accesibles); nunca se decide en el frontend.
 *
 * Cacheado con React Query: antes se volvía a pedir en cada remount de
 * AppShell (cada navegación entre páginas); ahora, si ya se pidió hace menos
 * de STALE_TIME_MS, se reutiliza sin ir a red.
 */
export function useTenantsAccesibles() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const queryKey = ["tenants-accesibles", user?.id] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await fetchAuth("/auth/tenants-accesibles");
      return {
        tenants: (Array.isArray(data.tenants) ? data.tenants : []) as TenantAccesible[],
        tenantActualId: (data.tenantActualId ?? null) as string | null,
      };
    },
    enabled: Boolean(user?.id),
    staleTime: STALE_TIME_MS,
    // El hook original no reintentaba ante un fallo — se mantiene ese
    // comportamiento en vez de adoptar el retry por defecto de React Query.
    retry: false,
  });

  const refresh = useCallback(() => {
    return queryClient.refetchQueries({ queryKey: ["tenants-accesibles", user?.id] });
  }, [queryClient, user?.id]);

  return {
    tenants: query.data?.tenants ?? [],
    tenantActualId: query.data?.tenantActualId ?? null,
    loading: query.isLoading,
    refresh,
  };
}
