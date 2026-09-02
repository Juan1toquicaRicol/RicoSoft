import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface BodegaSiesa {
  bodegaRowId: number;
  nombre: string;
}

export interface BodegasSiesa {
  disponible: boolean;
  motivo?: string;
  bodegas?: BodegaSiesa[];
}

/** Bodegas reales de Siesa disponibles para iniciar una toma física. */
export function useBodegasSiesa() {
  const [bodegas, setBodegas] = useState<BodegasSiesa>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/toma-fisica/bodegas");
      setBodegas(data);
    } catch (err: any) {
      setError(err.message || "Error cargando las bodegas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { bodegas, loading, error, refresh };
}

export type EstadoTomaFisica = "Abierta" | "Cerrada";

export interface TomaFisica {
  id: string;
  bodegaRowId: number;
  bodegaNombre: string;
  fecha: string;
  estado: EstadoTomaFisica;
  responsable: string;
  createdAt: string;
  cerradaEn: string | null;
  _count: { lineas: number };
}

/** Lista de tomas físicas del tenant (cabecera, sin líneas), más recientes primero. */
export function useTomasFisicas() {
  const [tomas, setTomas] = useState<TomaFisica[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/toma-fisica");
      setTomas(data);
    } catch (err: any) {
      setError(err.message || "Error cargando las tomas físicas.");
    } finally {
      setLoading(false);
    }
  }, []);

  const crear = useCallback(
    async (bodegaRowId: number) => {
      const data = await fetchAuth("/toma-fisica", {
        method: "POST",
        body: JSON.stringify({ bodegaRowId }),
      });
      await refresh();
      return data as TomaFisica;
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tomas, loading, error, refresh, crear };
}

export interface LineaTomaFisica {
  id: string;
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  stockSistema: number;
  conteoFisico: number | null;
  valorUnitario: number;
  diferencia: number | null;
  diferenciaPct: number | null;
  valorDiferencia: number | null;
}

export interface ResumenTomaFisica {
  totalLineas: number;
  lineasContadas: number;
  lineasPendientes: number;
  valorDiferenciaTotal: number;
}

export interface DetalleTomaFisica {
  toma: TomaFisica;
  lineas: LineaTomaFisica[];
  resumen: ResumenTomaFisica;
}

/** Detalle de una toma física: líneas con diferencia calculada en vivo + resumen. */
export function useTomaFisica(id: string | undefined) {
  const [detalle, setDetalle] = useState<DetalleTomaFisica | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/toma-fisica/${id}`);
      setDetalle(data);
    } catch (err: any) {
      setError(err.message || "Error cargando la toma física.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const registrarConteo = useCallback(
    async (lineaId: string, conteoFisico: number) => {
      await fetchAuth(`/toma-fisica/${id}/lineas/${lineaId}`, {
        method: "PATCH",
        body: JSON.stringify({ conteoFisico }),
      });
      await refresh();
    },
    [id, refresh],
  );

  const cerrar = useCallback(async () => {
    await fetchAuth(`/toma-fisica/${id}/cerrar`, { method: "PATCH" });
    await refresh();
  }, [id, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { detalle, loading, error, refresh, registrarConteo, cerrar };
}

export interface PatronDiferenciaRecurrente {
  itemRowId: number;
  descripcion: string | null;
  ocurrencias: number;
  diferenciaPromedioPct: number;
  signo: "faltante" | "sobrante";
}

/** Diferencias recurrentes entre todas las tomas físicas cerradas del tenant. */
export function usePatronesTomaFisica() {
  const [patrones, setPatrones] = useState<PatronDiferenciaRecurrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/toma-fisica/patrones");
      setPatrones(data.patrones ?? []);
    } catch (err: any) {
      setError(err.message || "Error cargando los patrones de diferencia.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { patrones, loading, error, refresh };
}
