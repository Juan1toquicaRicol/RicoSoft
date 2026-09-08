import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type TipoDestinatario =
  "USUARIO" | "PERFIL" | "AREA" | "RESPONSABLE_REGISTRO" | "JEFE_AREA" | "PERMISO";

export interface Destinatario {
  id: string;
  tipo: TipoDestinatario;
  usuarioId: string | null;
  usuarioNombre: string | null;
  perfilId: string | null;
  perfilNombre: string | null;
  departamentoId: string | null;
  departamentoNombre: string | null;
  permisoClave: string | null;
}

export interface ReglaDestinatarios {
  id: string;
  evento: string;
  activa: boolean;
  createdAt: string;
  destinatarios: Destinatario[];
}

export interface NuevoDestinatario {
  tipo: TipoDestinatario;
  usuarioId?: string;
  perfilId?: string;
  departamentoId?: string;
  permisoClave?: string;
}

/**
 * Motor genérico de destinatarios (Fase 5.3): administración de qué
 * usuarios/perfiles/áreas/permisos deben enterarse de cada evento. La
 * resolución real (a Set<userId>) vive en el backend
 * (lib/motor-destinatarios.ts) — ningún evento real la dispara todavía.
 */
export function useReglasDestinatarios(evento?: string) {
  const [reglas, setReglas] = useState<ReglaDestinatarios[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = evento ? `?evento=${encodeURIComponent(evento)}` : "";
      const data = await fetchAuth(`/reglas-destinatarios${qs}`);
      setReglas(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando las reglas de destinatarios.");
    } finally {
      setLoading(false);
    }
  }, [evento]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crearRegla = useCallback(
    async (data: { evento: string; activa?: boolean; destinatarios: NuevoDestinatario[] }) => {
      await fetchAuth("/reglas-destinatarios", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const actualizarRegla = useCallback(
    async (id: string, data: { evento?: string; activa?: boolean }) => {
      await fetchAuth(`/reglas-destinatarios/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh],
  );

  const eliminarRegla = useCallback(
    async (id: string) => {
      await fetchAuth(`/reglas-destinatarios/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const agregarDestinatario = useCallback(
    async (reglaId: string, destinatario: NuevoDestinatario) => {
      await fetchAuth(`/reglas-destinatarios/${reglaId}/destinatarios`, {
        method: "POST",
        body: JSON.stringify(destinatario),
      });
      await refresh();
    },
    [refresh],
  );

  const quitarDestinatario = useCallback(
    async (reglaId: string, destinatarioId: string) => {
      await fetchAuth(`/reglas-destinatarios/${reglaId}/destinatarios/${destinatarioId}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [refresh],
  );

  return {
    reglas,
    loading,
    error,
    refresh,
    crearRegla,
    actualizarRegla,
    eliminarRegla,
    agregarDestinatario,
    quitarDestinatario,
  };
}
