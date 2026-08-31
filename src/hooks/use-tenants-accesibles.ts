import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface TenantAccesible {
  id: string;
  nombre: string;
  subdomain: string;
}

/**
 * Empresas (tenants) a las que el usuario autenticado puede cambiarse: su
 * tenant "hogar" + cualquier membresía activa. Alimenta el selector de
 * empresa del menú principal — ver AppShell. Se recalcula siempre en el
 * backend (GET /auth/tenants-accesibles); nunca se decide en el frontend.
 */
export function useTenantsAccesibles() {
  const [tenants, setTenants] = useState<TenantAccesible[]>([]);
  const [tenantActualId, setTenantActualId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuth("/auth/tenants-accesibles");
      setTenants(Array.isArray(data.tenants) ? data.tenants : []);
      setTenantActualId(data.tenantActualId ?? null);
    } catch {
      setTenants([]);
      setTenantActualId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tenants, tenantActualId, loading, refresh };
}
