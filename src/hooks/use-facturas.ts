import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuth, fetchAuthUpload, fetchAuthBlob } from "@/lib/session";
import type { Factura } from "@/lib/data";

export interface FacturasFiltros {
  empresaId?: string;
  estado?: string;
  search?: string;
  // Opcionales: si se pasan, el backend responde el envelope paginado real
  // ({items,page,pageSize,total,totalPages}) en vez del array plano. Sin
  // `page`, el contrato no cambia (compatibilidad con quien todavía no pagina).
  page?: number;
  pageSize?: number;
}

export function useFacturas(filtros: FacturasFiltros = {}) {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (opciones: { silencioso?: boolean } = {}) => {
      if (!opciones.silencioso) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (filtros.empresaId) params.set("empresaId", filtros.empresaId);
        if (filtros.estado) params.set("estado", filtros.estado);
        if (filtros.search) params.set("search", filtros.search);
        if (filtros.page) {
          params.set("page", String(filtros.page));
          params.set("pageSize", String(filtros.pageSize ?? 25));
        }
        const qs = params.toString();
        const data = await fetchAuth(`/facturas${qs ? `?${qs}` : ""}`);
        if (Array.isArray(data)) {
          setFacturas(data);
          setTotal(data.length);
          setTotalPages(1);
        } else {
          setFacturas(data.items ?? []);
          setTotal(data.total ?? 0);
          setTotalPages(data.totalPages ?? 1);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error cargando facturas.");
      } finally {
        if (!opciones.silencioso) setLoading(false);
      }
    },
    [filtros.empresaId, filtros.estado, filtros.search, filtros.page, filtros.pageSize],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addFactura = useCallback(
    async (data: {
      empresaId: string;
      numero: string;
      proveedorId: string;
      servicioId?: string;
      contratoId?: string;
      solicitudCompraId?: string;
      area: string;
      responsableId: string;
      vence: string;
      subtotal: number;
      iva: number;
      moneda: string;
      prioridad: string;
      origen: string;
    }) => {
      const creada: Factura = await fetchAuth("/facturas", {
        method: "POST",
        body: JSON.stringify(data),
      });
      await refresh();
      return creada;
    },
    [refresh],
  );

  const updateEstadoFactura = useCallback(
    async (id: string, estado: Factura["estado"], detalle?: string) => {
      await fetchAuth(`/facturas/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado, detalle }),
      });
      await refresh();
    },
    [refresh],
  );

  const actualizarCondicionesPagoFactura = useCallback(
    async (id: string, data: { condicionesPago?: string; datosPago?: string }) => {
      await fetchAuth(`/facturas/${id}/condiciones-pago`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh],
  );

  const subirArchivoFactura = useCallback(
    async (id: string, file: File) => {
      const formData = new FormData();
      formData.append("archivo", file);
      await fetchAuthUpload(`/facturas/${id}/archivo`, formData);
      await refresh();
    },
    [refresh],
  );

  const eliminarArchivoFactura = useCallback(
    async (id: string) => {
      await fetchAuth(`/facturas/${id}/archivo`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const descargarArchivoFactura = useCallback(async (id: string) => {
    return fetchAuthBlob(`/facturas/${id}/archivo`);
  }, []);

  const eliminarFactura = useCallback(
    async (id: string) => {
      await fetchAuth(`/facturas/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const agregarComentarioFactura = useCallback(
    async (id: string, texto: string) => {
      await fetchAuth(`/facturas/${id}/comentarios`, {
        method: "POST",
        body: JSON.stringify({ texto }),
      });
      await refresh();
    },
    [refresh],
  );

  /**
   * Refresca una sola factura por id (usado por el polling del detalle) en
   * vez de volver a traer todo el listado del tenant cada pocos segundos.
   */
  const refreshOne = useCallback(async (id: string) => {
    try {
      const data = await fetchAuth(`/facturas/${id}`);
      setFacturas((prev) => {
        const existe = prev.some((f) => f.id === data.id);
        return existe ? prev.map((f) => (f.id === data.id ? data : f)) : [...prev, data];
      });
    } catch {
      // Silencioso: si falla un refresco en segundo plano no interrumpimos al usuario.
    }
  }, []);

  return {
    facturas,
    total,
    totalPages,
    loading,
    error,
    refresh,
    refreshOne,
    addFactura,
    updateEstadoFactura,
    actualizarCondicionesPagoFactura,
    subirArchivoFactura,
    eliminarArchivoFactura,
    descargarArchivoFactura,
    agregarComentarioFactura,
    eliminarFactura,
  };
}

/**
 * Últimas facturas de UN servicio (para su pantalla de detalle). Pide solo
 * `limite` registros al backend en vez de las miles de facturas del tenant:
 * un servicio con años de historial no debe traer todo para mostrar 20.
 */
export function useFacturasPorServicio(servicioId: string | undefined, limite = 20) {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!servicioId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/facturas?servicioId=${servicioId}&limit=${limite}`);
      setFacturas(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando las facturas del servicio.");
    } finally {
      setLoading(false);
    }
  }, [servicioId, limite]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { facturas, loading, error, refresh };
}

/**
 * Facturas relacionadas con UNA solicitud de compra (sección "Facturas
 * relacionadas" en el detalle de Solicitud de Compra) — reutiliza GET
 * /facturas?solicitudCompraId=... (mismo patrón que useFacturasPorServicio),
 * sin duplicar el listado de facturas en un endpoint propio del módulo de
 * solicitudes. Una solicitud puede tener varias facturas (facturación
 * parcial), por eso siempre es un arreglo.
 */
export function useFacturasPorSolicitud(solicitudCompraId: string | undefined) {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!solicitudCompraId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/facturas?solicitudCompraId=${solicitudCompraId}`);
      setFacturas(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando las facturas relacionadas.");
    } finally {
      setLoading(false);
    }
  }, [solicitudCompraId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { facturas, loading, error, refresh };
}

/**
 * Refresca en segundo plano cada `intervaloMs` mientras el componente que la
 * usa esté montado (p. ej. el detalle de una factura), para que comentarios,
 * cambios de estado o el documento adjunto hechos por otro usuario aparezcan
 * sin recargar la página manualmente. Se pausa cuando la pestaña no está
 * visible, para no seguir pidiendo datos de fondo indefinidamente.
 */
export function usePollingFacturas(refresh: () => void | Promise<void>, intervaloMs = 6000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState === "visible") {
        refreshRef.current();
      }
    };

    const start = () => {
      if (interval) return;
      interval = setInterval(tick, intervaloMs);
    };
    const stop = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervaloMs]);
}
