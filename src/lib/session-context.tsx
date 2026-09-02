import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import {
  clearSession,
  fetchCurrentUser,
  fetchAuth,
  setToken,
  setUltimaEmpresaPreferida,
  SessionUser,
} from "./session";

interface SessionContextType {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
  /** Cambia de empresa activa (tenant) sin tener que volver a loguearse:
   * pide un JWT nuevo escogido para ese tenant (el backend valida de nuevo
   * que el usuario tenga membresía) y refresca la sesión. */
  switchTenant: (tenantId: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const current = await fetchCurrentUser();
    setUser(current);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      const response = await fetchAuth("/auth/switch-tenant", {
        method: "POST",
        body: JSON.stringify({ tenantId }),
      });
      setToken(response.token);
      if (response.user?.tenantId) setUltimaEmpresaPreferida(response.user.tenantId);
      await refresh();
    },
    [refresh],
  );

  return (
    <SessionContext.Provider value={{ user, loading, refresh, logout, switchTenant }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession debe usarse dentro de un SessionProvider");
  }
  return ctx;
}
