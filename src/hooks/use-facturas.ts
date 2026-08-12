import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";
import type { Factura } from "@/lib/data";

export function useFacturas() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/facturas");
      setFacturas(data);
    } catch (err: any) {
      setError(err.message || "Error cargando facturas.");
    } finally {
      setLoading(false);
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

  return { facturas, loading, error, refresh, addFactura, updateEstadoFactura };
}
