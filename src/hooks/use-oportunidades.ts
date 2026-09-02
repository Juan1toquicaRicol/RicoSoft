import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface OportunidadProducto {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidadOfertable: number;
  potencialVenta: number;
}

export interface OportunidadCliente {
  clienteRowId: number | null;
  clienteNombre: string | null;
  potencialTotal: number;
  productos: OportunidadProducto[];
}

export interface OportunidadComercial {
  disponible: boolean;
  motivo?: string;
  totalPotencialVenta?: number;
  clientes?: OportunidadCliente[];
}

/** Oportunidad comercial: qué le podemos vender a cada cliente con el inventario disponible hoy. */
export function useOportunidadComercial() {
  const [oportunidad, setOportunidad] = useState<OportunidadComercial>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/inventario/oportunidad-comercial");
      setOportunidad(data);
    } catch (err: any) {
      setError(err.message || "Error cargando la oportunidad comercial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { oportunidad, loading, error, refresh };
}
