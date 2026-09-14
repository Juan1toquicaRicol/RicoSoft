import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAuth } from "@/lib/session";
import { useSession } from "@/lib/session-context";

export interface NotificacionApi {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  enlace: string | null;
  leida: boolean;
  createdAt: string;
}

interface ListaNotificaciones {
  notificaciones: NotificacionApi[];
  noLeidas: number;
}

const STALE_TIME_MS = 15_000;
const POLL_INTERVAL_MS = 30_000;

/**
 * Centro de notificaciones del usuario en sesión. Refresca el contador de no
 * leídas cada 30s (más liviano que el polling de Facturas: esto no necesita
 * la misma frecuencia) y trae la lista completa solo cuando se pide
 * explícitamente (al abrir la campana, o desde "Mi actividad" en el Home),
 * para no pedir 20 notificaciones en cada refresco de fondo.
 *
 * Cacheado con React Query, keyeado por tenantId: `NotificationBell` y
 * `PanelMiActividad` (Home) instancian este hook por separado, pero al usar
 * la MISMA query key, React Query deduplica — antes eran dos peticiones
 * independientes a /notificaciones/no-leidas/contador en cada carga de Home.
 */
export function useNotificaciones() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId;
  const qkContador = ["notificaciones", "contador", tenantId] as const;
  const qkLista = ["notificaciones", "lista", tenantId] as const;

  const contadorQuery = useQuery({
    queryKey: qkContador,
    queryFn: async () => {
      const data = await fetchAuth("/notificaciones/no-leidas/contador");
      return (data.noLeidas ?? 0) as number;
    },
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME_MS,
    refetchInterval: POLL_INTERVAL_MS,
    retry: false,
  });

  const listaQuery = useQuery({
    queryKey: qkLista,
    queryFn: async () => {
      const data = await fetchAuth("/notificaciones?limite=20");
      return {
        notificaciones: (data.data ?? []) as NotificacionApi[],
        noLeidas: (data.noLeidas ?? 0) as number,
      };
    },
    // Solo se popula bajo demanda (refrescarLista), no al montar — mismo
    // comportamiento que antes: no pedir 20 notificaciones en cada carga.
    enabled: false,
    staleTime: STALE_TIME_MS,
    retry: false,
  });

  // El contador es la fuente única para el badge (bell + Home); cuando la
  // lista completa trae un noLeidas más reciente, se sincroniza ahí también.
  useEffect(() => {
    if (listaQuery.data) {
      queryClient.setQueryData(qkContador, listaQuery.data.noLeidas);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaQuery.data]);

  const refrescarLista = useCallback(() => {
    return queryClient.refetchQueries({ queryKey: qkLista });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, tenantId]);

  const marcarLeida = useCallback(
    async (id: string) => {
      queryClient.setQueryData(qkLista, (old: ListaNotificaciones | undefined) =>
        old
          ? {
              notificaciones: old.notificaciones.map((n) =>
                n.id === id ? { ...n, leida: true } : n,
              ),
              noLeidas: Math.max(0, old.noLeidas - 1),
            }
          : old,
      );
      queryClient.setQueryData(qkContador, (old: number | undefined) =>
        Math.max(0, (old ?? 1) - 1),
      );
      try {
        await fetchAuth(`/notificaciones/${id}/leida`, { method: "PATCH" });
      } catch {
        // No revertimos el optimismo por un fallo puntual; el próximo refresco corrige el estado real.
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, tenantId],
  );

  const marcarTodasLeidas = useCallback(async () => {
    queryClient.setQueryData(qkLista, (old: ListaNotificaciones | undefined) =>
      old
        ? { notificaciones: old.notificaciones.map((n) => ({ ...n, leida: true })), noLeidas: 0 }
        : old,
    );
    queryClient.setQueryData(qkContador, 0);
    try {
      await fetchAuth("/notificaciones/leer-todas", { method: "PATCH" });
    } catch {
      // Idem: el próximo refresco corrige el estado real si esto falló.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, tenantId]);

  return {
    notificaciones: listaQuery.data?.notificaciones ?? [],
    noLeidas: contadorQuery.data ?? 0,
    loading: listaQuery.isFetching,
    refrescarLista,
    marcarLeida,
    marcarTodasLeidas,
  };
}
