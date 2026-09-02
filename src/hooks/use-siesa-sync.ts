import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type EstadoSincronizacionSiesa =
  "EN_COLA" | "EN_CURSO" | "COMPLETADO" | "FALLIDO" | "CANCELADO";

export interface SincronizacionSiesa {
  id: string;
  ciaId: number;
  estado: EstadoSincronizacionSiesa;
  iniciadoPor: { id: string; nombre: string } | null;
  iniciadoEn: string;
  finalizadoEn: string | null;
  leidos: number;
  creados: number;
  actualizados: number;
  desactivados: number;
  sinCambios: number;
  erroresCount: number;
  errores: { nit: string; mensaje: string }[];
  mensajeError: string | null;
}

const ESTADOS_ACTIVOS: EstadoSincronizacionSiesa[] = ["EN_COLA", "EN_CURSO"];

/**
 * Historial + disparo de sincronizaciones con Siesa, para
 * Configuración > Integraciones > Siesa. Mientras haya una corrida
 * EN_COLA/EN_CURSO, hace polling cada 2s de su detalle para mostrar
 * progreso — sin WebSockets, como pide el plan (primera versión).
 */
export function useSiesaSync() {
  const [historial, setHistorial] = useState<SincronizacionSiesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activa, setActiva] = useState<SincronizacionSiesa | null>(null);
  const [disparando, setDisparando] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargarHistorial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/integraciones/siesa/sincronizaciones?limit=10");
      const items: SincronizacionSiesa[] = Array.isArray(data.items) ? data.items : [];
      setHistorial(items);
      const enCurso = items.find((i) => ESTADOS_ACTIVOS.includes(i.estado));
      setActiva(enCurso ?? null);
    } catch (err: any) {
      setError(err.message || "Error cargando el historial de sincronizaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  // Polling mientras haya una corrida activa.
  useEffect(() => {
    if (!activa) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const detalle: SincronizacionSiesa = await fetchAuth(
          `/integraciones/siesa/sincronizaciones/${activa.id}`,
        );
        if (ESTADOS_ACTIVOS.includes(detalle.estado)) {
          setActiva(detalle);
          setHistorial((prev) => prev.map((h) => (h.id === detalle.id ? detalle : h)));
        } else {
          // Terminó: recarga el historial completo (contadores finales + auditoría).
          await cargarHistorial();
        }
      } catch {
        // Fallo puntual del polling; se reintenta en el siguiente tick.
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa?.id]);

  const sincronizar = useCallback(async () => {
    setDisparando(true);
    try {
      await fetchAuth("/integraciones/siesa/proveedores/sincronizar", { method: "POST" });
      await cargarHistorial();
    } finally {
      setDisparando(false);
    }
  }, [cargarHistorial]);

  const cancelar = useCallback(
    async (id: string) => {
      await fetchAuth(`/integraciones/siesa/sincronizaciones/${id}/cancelar`, { method: "POST" });
      await cargarHistorial();
    },
    [cargarHistorial],
  );

  return {
    historial,
    activa,
    loading,
    error,
    disparando,
    sincronizar,
    cancelar,
    refresh: cargarHistorial,
  };
}
