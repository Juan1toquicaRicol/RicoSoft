import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface ClasificacionFuncionalItem {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  orden: number;
  itemsAsociados: number;
  createdAt: string;
}

export interface ItemConClasificacion {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  esVendible: boolean;
  naturaleza: string;
  clasificaciones: { id: string; nombre: string; codigo: string }[];
}

/**
 * Catálogo de clasificaciones funcionales de ítems (Configuración >
 * Clasificación de ítems, área A). Se siembra solo con las 5 iniciales la
 * primera vez que se consulta — ver GET /item-clasificaciones en backend.
 */
export function useClasificacionesFuncionales() {
  const [clasificaciones, setClasificaciones] = useState<ClasificacionFuncionalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/item-clasificaciones");
      setClasificaciones(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando las clasificaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crearClasificacion = useCallback(
    async (data: { codigo: string; nombre: string; descripcion?: string; orden?: number }) => {
      const creada = await fetchAuth("/item-clasificaciones", {
        method: "POST",
        body: JSON.stringify(data),
      });
      await refresh();
      return creada as ClasificacionFuncionalItem;
    },
    [refresh],
  );

  const actualizarClasificacion = useCallback(
    async (id: string, data: { nombre?: string; descripcion?: string; orden?: number }) => {
      await fetchAuth(`/item-clasificaciones/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh],
  );

  const cambiarActivo = useCallback(
    async (id: string, activo: boolean) => {
      await fetchAuth(`/item-clasificaciones/${id}/activo`, {
        method: "PATCH",
        body: JSON.stringify({ activo }),
      });
      await refresh();
    },
    [refresh],
  );

  return {
    clasificaciones,
    loading,
    error,
    refresh,
    crearClasificacion,
    actualizarClasificacion,
    cambiarActivo,
  };
}

/**
 * Ítems del maestro de Siesa con sus clasificaciones funcionales (área B:
 * Clasificar ítems). Paginado y filtrado server-side — nunca descarga el
 * catálogo completo al navegador.
 */
export function useItemsConClasificacion() {
  const [items, setItems] = useState<ItemConClasificacion[]>([]);
  const [disponible, setDisponible] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (opts?: {
      search?: string;
      page?: number;
      pageSize?: number;
      clasificacionId?: string;
      sinClasificar?: boolean;
    }) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (opts?.search) params.set("search", opts.search);
        params.set("page", String(opts?.page ?? 1));
        params.set("pageSize", String(opts?.pageSize ?? 25));
        if (opts?.clasificacionId) params.set("clasificacionId", opts.clasificacionId);
        if (opts?.sinClasificar) params.set("sinClasificar", "true");
        const data = await fetchAuth(`/item-clasificaciones/items?${params.toString()}`);
        setDisponible(data.disponible !== false);
        setMotivo(data.motivo || "");
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setPage(data.page ?? 1);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error cargando los ítems.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const actualizarClasificacionesDeItem = useCallback(
    async (itemRowId: number, clasificacionIds: string[]) => {
      await fetchAuth(`/item-clasificaciones/items/${itemRowId}`, {
        method: "PUT",
        body: JSON.stringify({ clasificacionIds }),
      });
    },
    [],
  );

  const asignacionMasiva = useCallback(
    async (itemRowIds: number[], clasificacionId: string, accion: "asignar" | "quitar") => {
      return fetchAuth("/item-clasificaciones/asignacion-masiva", {
        method: "POST",
        body: JSON.stringify({ itemRowIds, clasificacionId, accion }),
      }) as Promise<{ solicitados: number; afectados: number; mensaje: string }>;
    },
    [],
  );

  return {
    items,
    disponible,
    motivo,
    total,
    page,
    totalPages,
    loading,
    error,
    refresh,
    actualizarClasificacionesDeItem,
    asignacionMasiva,
  };
}
