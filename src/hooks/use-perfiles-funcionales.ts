import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface UsuarioPerfil {
  id: string;
  nombre: string;
  email: string;
}

export interface PerfilFuncional {
  id: string;
  departamentoId: string;
  departamentoNombre: string | null;
  nombre: string;
  esJefeDeArea: boolean;
  activo: boolean;
  createdAt: string;
  usuarios: UsuarioPerfil[];
  usuariosCount: number;
}

/**
 * Perfiles funcionales (Fase 5.2): agrupan usuarios dentro de un área para
 * uso futuro del motor de destinatarios (Fase 5.3) — no otorgan permisos,
 * son independientes de Rol.
 */
export function usePerfilesFuncionales(departamentoId?: string) {
  const [perfiles, setPerfiles] = useState<PerfilFuncional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = departamentoId ? `?departamentoId=${departamentoId}` : "";
      const data = await fetchAuth(`/perfiles-funcionales${qs}`);
      setPerfiles(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando los perfiles funcionales.");
    } finally {
      setLoading(false);
    }
  }, [departamentoId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crearPerfil = useCallback(
    async (data: { departamentoId: string; nombre: string; esJefeDeArea?: boolean }) => {
      await fetchAuth("/perfiles-funcionales", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const actualizarPerfil = useCallback(
    async (id: string, data: { nombre?: string; esJefeDeArea?: boolean; activo?: boolean }) => {
      await fetchAuth(`/perfiles-funcionales/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh],
  );

  const eliminarPerfil = useCallback(
    async (id: string) => {
      await fetchAuth(`/perfiles-funcionales/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const agregarUsuario = useCallback(
    async (perfilId: string, userId: string) => {
      await fetchAuth(`/perfiles-funcionales/${perfilId}/usuarios`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      await refresh();
    },
    [refresh],
  );

  const quitarUsuario = useCallback(
    async (perfilId: string, userId: string) => {
      await fetchAuth(`/perfiles-funcionales/${perfilId}/usuarios/${userId}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [refresh],
  );

  return {
    perfiles,
    loading,
    error,
    refresh,
    crearPerfil,
    actualizarPerfil,
    eliminarPerfil,
    agregarUsuario,
    quitarUsuario,
  };
}
