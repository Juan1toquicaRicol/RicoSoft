import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { clearSession, fetchCurrentUser, SessionUser } from "./session";

interface SessionContextType {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
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

  return (
    <SessionContext.Provider value={{ user, loading, refresh, logout }}>
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
