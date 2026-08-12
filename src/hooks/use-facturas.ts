import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuth, fetchAuthUpload, fetchAuthBlob } from "@/lib/session";
import type { Factura } from "@/lib/data";

export function useFacturas() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (opciones: { silencioso?: boolean } = {}) => {
    if (!opciones.silencioso) setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/facturas");
      setFacturas(data);
    } catch (err: any) {
      setError(err.message || "Error cargando facturas.");
    } finally {
      if (!opciones.silencioso) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addFactura = useCallback(
    async (data: {
      empresaId: string;
      numero: string;
      proveedor: string;
      nit: string;
      area: string;
      responsable: string;
      vence: string;
      subtotal: number;
      iva: number;
      moneda: string;
      prioridad: string;
      origen: string;
    }) => {
      await fetchAuth("/facturas", { method: "POST", body: JSON.stringify(data) });
      await refresh();
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

  return {
    facturas,
    loading,
    error,
    refresh,
    addFactura,
    updateEstadoFactura,
    subirArchivoFactura,
    eliminarArchivoFactura,
    descargarArchivoFactura,
    agregarComentarioFactura,
  };
}

/**
 * Refresca los datos de facturas cada `intervaloMs` mientras el componente
 * que la usa esté montado (p. ej. el detalle de una factura), para que
 * comentarios, cambios de estado o el documento adjunto hechos por otro
 * usuario aparezcan sin recargar la página manualmente.
 */
export function usePollingFacturas(
  refresh: (opciones?: { silencioso?: boolean }) => Promise<void>,
  intervaloMs = 6000,
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const interval = setInterval(() => {
      refreshRef.current({ silencioso: true });
    }, intervaloMs);
    return () => clearInterval(interval);
  }, [intervaloMs]);
}
