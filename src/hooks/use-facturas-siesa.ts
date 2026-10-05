import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

/**
 * Facturas de proveedores (compra/servicios) registradas en Siesa —
 * t455_cm_factura_docto, SOLO LECTURA. Separado a propósito de useFacturas
 * (facturas nativas de RicoSoft, CRUD): no son el mismo dato y no se cruzan
 * entre sí (ver comentario de alcance en
 * server/src/modules/integraciones-siesa/siesa-facturas-compra.service.ts).
 */
export interface FacturaSiesa {
  facturaRowId: number;
  ciaId: number;
  terceroRowId: number | null;
  terceroNombre: string | null;
  terceroNit: string | null;
  prefijo: string | null;
  numero: number | null;
  fechaDocumentoProveedor: string | null;
  fechaEmision: string | null;
  valorNeto: number;
  /** Valor de CxP TAL COMO QUEDÓ REGISTRADO en la factura — nunca el saldo
   * pendiente actual (eso vive en Créditos > Cartera Siesa). */
  valorCxpRegistrado: number;
  valorImpuesto: number;
  valorDescuento: number;
  valorRetencion: number;
  monedaCausacion: string | null;
}

export interface FacturasSiesaFiltros {
  search?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  pageSize?: number;
}

export function useFacturasSiesa(filtros: FacturasSiesaFiltros = {}) {
  const [items, setItems] = useState<FacturaSiesa[]>([]);
  const [total, setTotal] = useState(0);
  const [disponible, setDisponible] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filtros.search) params.set("search", filtros.search);
      if (filtros.desde) params.set("desde", filtros.desde);
      if (filtros.hasta) params.set("hasta", filtros.hasta);
      params.set("page", String(filtros.page ?? 1));
      params.set("pageSize", String(filtros.pageSize ?? 25));

      const data = await fetchAuth(`/facturas/siesa?${params.toString()}`);
      setDisponible(Boolean(data.disponible));
      setMotivo(data.motivo ?? "");
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando facturas desde Siesa.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filtros.search, filtros.desde, filtros.hasta, filtros.page, filtros.pageSize]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, total, disponible, motivo, loading, error, refresh };
}
