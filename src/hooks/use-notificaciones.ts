import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface NotificacionApi {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  enlace: string | null;
  leida: boolean;
  createdAt: string;
}

/**
 * Centro de notificaciones del usuario en sesión. Refresca el contador de no
 * leídas cada 30s (más liviano que el polling de Facturas: esto no necesita
 * la misma frecuencia) y trae la lista completa solo cuando se abre la
 * campana, para no pedir 20 notificaciones en cada refresco de fondo.
 */
export function useNotificaciones() {
  const [notificaciones, setNotificaciones] = useState<NotificacionApi[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [loading, setLoading] = useState(false);

  const refrescarContador = useCallback(async () => {
    try {
      const data = await fetchAuth("/notificaciones/no-leidas/contador");
      setNoLeidas(data.noLeidas ?? 0);
    } catch {
      // Silencioso: un fallo puntual del contador de fondo no debe interrumpir al usuario.
    }
  }, []);

  const refrescarLista = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuth("/notificaciones?limite=20");
      setNotificaciones(data.data ?? []);
      setNoLeidas(data.noLeidas ?? 0);
    } catch {
      // Silencioso: se deja la última lista conocida en pantalla.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refrescarContador();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refrescarContador();
    }, 30_000);
    return () => clearInterval(interval);
  }, [refrescarContador]);

  const marcarLeida = useCallback(async (id: string) => {
    setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
    setNoLeidas((prev) => Math.max(0, prev - 1));
    try {
      await fetchAuth(`/notificaciones/${id}/leida`, { method: "PATCH" });
    } catch {
      // No revertimos el optimismo por un fallo puntual; el próximo refresco corrige el estado real.
    }
  }, []);

  const marcarTodasLeidas = useCallback(async () => {
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
    setNoLeidas(0);
    try {
      await fetchAuth("/notificaciones/leer-todas", { method: "PATCH" });
    } catch {
      // Idem: el próximo refresco corrige el estado real si esto falló.
    }
  }, []);

  return { notificaciones, noLeidas, loading, refrescarLista, marcarLeida, marcarTodasLeidas };
}
