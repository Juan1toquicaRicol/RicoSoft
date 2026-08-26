import { useCallback, useEffect, useState } from "react";
import { fetchAuth, fetchAuthUpload, fetchAuthBlob } from "@/lib/session";

export interface Pago {
  id: string;
  facturaId: string;
  fecha: string;
  valor: number;
  metodoPago: string;
  referencia: string | null;
  comprobante: { nombre: string; mime: string | null; tamano: number | null } | null;
  registradoPorNombre: string;
  observaciones: string | null;
  estado: "Confirmado" | "Anulado";
  createdAt: string;
}

export const METODOS_PAGO: string[] = ["Transferencia", "Efectivo", "Cheque", "Tarjeta", "Otro"];

/** Pagos de una factura concreta: soporta pagos parciales (una factura puede
 * tener varios) y expone el saldo pendiente calculado en backend. */
export function usePagosFactura(facturaId: string | undefined) {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [totalPagado, setTotalPagado] = useState(0);
  const [saldoPendiente, setSaldoPendiente] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!facturaId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/facturas/${facturaId}/pagos`);
      setPagos(data.data ?? []);
      setTotalPagado(data.totalPagado ?? 0);
      setSaldoPendiente(data.saldoPendiente ?? 0);
    } catch (err: any) {
      setError(err.message || "Error cargando los pagos.");
    } finally {
      setLoading(false);
    }
  }, [facturaId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const registrarPago = useCallback(
    async (datos: {
      fecha?: string;
      valor: number;
      metodoPago: string;
      referencia?: string;
      observaciones?: string;
    }) => {
      if (!facturaId) throw new Error("Falta el id de la factura.");
      const resultado = await fetchAuth(`/facturas/${facturaId}/pagos`, {
        method: "POST",
        body: JSON.stringify(datos),
      });
      await refresh();
      return resultado as { pago: Pago; factura: { id: string; estado: string } | null };
    },
    [facturaId, refresh],
  );

  const anularPago = useCallback(
    async (pagoId: string) => {
      if (!facturaId) throw new Error("Falta el id de la factura.");
      const resultado = await fetchAuth(`/facturas/${facturaId}/pagos/${pagoId}/anular`, { method: "PATCH" });
      await refresh();
      return resultado as { pago: Pago; factura: { id: string; estado: string } | null };
    },
    [facturaId, refresh],
  );

  const subirComprobante = useCallback(
    async (pagoId: string, file: File) => {
      if (!facturaId) throw new Error("Falta el id de la factura.");
      const formData = new FormData();
      formData.append("archivo", file);
      await fetchAuthUpload(`/facturas/${facturaId}/pagos/${pagoId}/comprobante`, formData);
      await refresh();
    },
    [facturaId, refresh],
  );

  const descargarComprobante = useCallback(
    async (pagoId: string) => {
      if (!facturaId) throw new Error("Falta el id de la factura.");
      return fetchAuthBlob(`/facturas/${facturaId}/pagos/${pagoId}/comprobante`);
    },
    [facturaId],
  );

  return {
    pagos,
    totalPagado,
    saldoPendiente,
    loading,
    error,
    refresh,
    registrarPago,
    anularPago,
    subirComprobante,
    descargarComprobante,
  };
}
