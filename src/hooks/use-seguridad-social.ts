import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type TipoSeguridadSocial = "EPS" | "ARL" | "FONDO_PENSIONES" | "TIPO_CONTRATO";

export interface ItemSeguridadSocial {
  id: string;
  tipo: TipoSeguridadSocial;
  nombre: string;
  activo: boolean;
}

export interface OpcionesSeguridadSocial {
  eps: string[];
  arl: string[];
  fondosPensiones: string[];
  tiposContrato: string[];
}

const VACIO: OpcionesSeguridadSocial = { eps: [], arl: [], fondosPensiones: [], tiposContrato: [] };

/** EPS/ARL/fondos ACTIVOS del tenant para los selectores del colaborador. */
export function useOpcionesSeguridadSocial(habilitado: boolean) {
  const [opciones, setOpciones] = useState<OpcionesSeguridadSocial>(VACIO);

  useEffect(() => {
    if (!habilitado) {
      setOpciones(VACIO);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const data = await fetchAuth("/gestion-humana/catalogo-seguridad-social/opciones");
        if (!cancelado) setOpciones(data);
      } catch {
        if (!cancelado) setOpciones(VACIO);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [habilitado]);

  return opciones;
}

/** Catálogo completo (activos e inactivos) de un tipo, para administrarlo. */
export function useCatalogoSeguridadSocial(tipo: TipoSeguridadSocial) {
  const [items, setItems] = useState<ItemSeguridadSocial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchAuth(`/gestion-humana/catalogo-seguridad-social?tipo=${tipo}`));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al obtener el catálogo.");
    } finally {
      setLoading(false);
    }
  }, [tipo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crear = useCallback(
    async (nombre: string) => {
      await fetchAuth("/gestion-humana/catalogo-seguridad-social", {
        method: "POST",
        body: JSON.stringify({ tipo, nombre }),
      });
      await refresh();
    },
    [refresh, tipo],
  );

  const actualizar = useCallback(
    async (id: string, data: { nombre?: string; activo?: boolean }) => {
      await fetchAuth(`/gestion-humana/catalogo-seguridad-social/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh],
  );

  return { items, loading, error, crear, actualizar };
}
