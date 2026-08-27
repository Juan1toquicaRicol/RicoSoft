import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuth, fetchAuthUpload, fetchAuthBlob } from "@/lib/session";

export type EstadoOrdenIntl = "Borrador" | "Confirmada" | "Cerrada" | "Anulada";
export type EstadoLoteImportacion =
  | "En tránsito"
  | "En puerto"
  | "En inspección"
  | "Liberado pre-compra"
  | "Nacionalizado";

export interface ItemOrdenCompraIntl {
  id: string;
  descripcion: string;
  subpartidaArancelariaId: string | null;
  subpartida: { id: string; subpartida: string; descripcion: string } | null;
  cantidad: number;
  pesoKg: number | null;
  volumenM3: number | null;
  valorUnitarioFob: number;
}

export interface CosteoImportacionDetalle {
  id: string;
  itemId: string;
  valorCifUsd: number;
  trmLiquidacion: number;
  valorCifCop: number;
  arancelCop: number;
  ivaTotalCop: number;
  ivaDescontableCop: number;
  ivaCapitalizableCop: number;
  fletesNacionalesCop: number;
  agenciamientoCop: number;
  otrosCostosCop: number;
  diferenciaCambioCop: number;
  cantidad: number;
  costoTotalCop: number;
  costoUnitarioCop: number;
  esProvisional: boolean;
  fechaLiquidacion: string;
}

export interface VistoBuenoAduanero {
  id: string;
  entidad: string;
  numero: string | null;
  estado: string;
  fecha: string | null;
  archivo: { nombre: string; mime: string | null; tamano: number | null } | null;
}

export interface ExpedienteAduanero {
  id: string;
  numeroDIM: string | null;
  fechaDIM: string | null;
  certificadoOrigenTlc: string | null;
  fechaLevante: string | null;
  estado: string;
  documentos: {
    dim: { nombre: string; mime: string | null; tamano: number | null } | null;
    facturaComercial: { nombre: string; mime: string | null; tamano: number | null } | null;
    certificadoOrigen: { nombre: string; mime: string | null; tamano: number | null } | null;
  };
  vistosBuenos: VistoBuenoAduanero[];
}

export interface LoteImportacion {
  id: string;
  ordenCompraId: string;
  blAwb: string;
  contenedor: string | null;
  precinto: string | null;
  puertoOrigen: string;
  puertoDestino: string;
  naviera: string | null;
  fechaEmbarque: string | null;
  fechaLlegadaEstimada: string | null;
  fechaLlegadaReal: string | null;
  estado: EstadoLoteImportacion;
  expediente: ExpedienteAduanero | null;
  costeos: CosteoImportacionDetalle[];
}

export interface OrdenCompraIntl {
  id: string;
  numeroOrden: string;
  incoterm: string;
  proveedorExtranjero: string;
  paisOrigen: string;
  moneda: string;
  trmPactada: number;
  valorEstimadoTotal: number;
  estado: EstadoOrdenIntl;
  observaciones: string | null;
  responsable: { id: string; nombre: string } | null;
  createdAt: string;
  items: ItemOrdenCompraIntl[];
  lotes: LoteImportacion[];
  historial: { fecha: string; actor: string; accion: string; detalle: string | null }[];
}

export interface ItemOrdenInput {
  descripcion: string;
  subpartidaArancelariaId?: string | null;
  cantidad: number;
  pesoKg?: number | null;
  volumenM3?: number | null;
  valorUnitarioFob: number;
}

export interface CrearOrdenInput {
  numeroOrden: string;
  incoterm: string;
  proveedorExtranjero: string;
  paisOrigen: string;
  moneda: string;
  trmPactada: number;
  observaciones?: string;
  items: ItemOrdenInput[];
}

export interface CrearLoteInput {
  blAwb: string;
  contenedor?: string;
  precinto?: string;
  puertoOrigen: string;
  puertoDestino: string;
  naviera?: string;
  fechaEmbarque?: string;
  fechaLlegadaEstimada?: string;
}

export interface LiquidarCosteoInput {
  trmLiquidacion: number;
  valorCifTotalUsd: number;
  arancelTotalCop: number;
  ivaTotalCop: number;
  ivaDescontableCop?: number;
  fletesNacionalesCop?: number;
  agenciamientoCop?: number;
  otrosCostosCop?: number;
}

export type TipoDocumentoExpediente = "dim" | "factura-comercial" | "certificado-origen";

export interface ActualizarExpedienteInput {
  numeroDIM?: string | null;
  fechaDIM?: string | null;
  certificadoOrigenTlc?: string | null;
  fechaLevante?: string | null;
  estado?: string | null;
}

export interface CrearVistoBuenoInput {
  entidad: string;
  numero?: string;
  fecha?: string;
}

export interface ActualizarVistoBuenoInput {
  entidad?: string;
  numero?: string | null;
  estado?: string;
  fecha?: string | null;
}

export function useImportaciones() {
  const [ordenes, setOrdenes] = useState<OrdenCompraIntl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/importaciones");
      setOrdenes(data);
    } catch (err: any) {
      setError(err.message || "Error cargando las órdenes de compra internacionales.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addOrden = useCallback(
    async (data: CrearOrdenInput) => {
      await fetchAuth("/importaciones", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const anularOrden = useCallback(
    async (id: string) => {
      await fetchAuth(`/importaciones/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { ordenes, loading, error, refresh, addOrden, anularOrden };
}

export function useOrdenCompraIntl(id: string | undefined) {
  const [orden, setOrden] = useState<OrdenCompraIntl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/importaciones/${id}`);
      setOrden(data);
    } catch (err: any) {
      setError(err.message || "Error cargando la orden de compra internacional.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addLote = useCallback(
    async (data: CrearLoteInput) => {
      if (!id) return;
      await fetchAuth(`/importaciones/${id}/lotes`, { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [id, refresh],
  );

  const actualizarEstadoLote = useCallback(
    async (loteId: string, estado: string) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      });
      await refresh();
    },
    [refresh],
  );

  const recibirPreCompraPlanta = useCallback(
    async (loteId: string) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/recibir-pre-compra`, { method: "PATCH" });
      await refresh();
    },
    [refresh],
  );

  const liquidarCosteoImportacion = useCallback(
    async (loteId: string, data: LiquidarCosteoInput) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/liquidar-costeo`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh],
  );

  const actualizarExpediente = useCallback(
    async (loteId: string, data: ActualizarExpedienteInput) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/expediente`, { method: "PUT", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const subirDocumentoExpediente = useCallback(
    async (loteId: string, tipo: TipoDocumentoExpediente, file: File) => {
      const formData = new FormData();
      formData.append("archivo", file);
      await fetchAuthUpload(`/importaciones/lotes/${loteId}/expediente/documentos/${tipo}`, formData);
      await refresh();
    },
    [refresh],
  );

  const eliminarDocumentoExpediente = useCallback(
    async (loteId: string, tipo: TipoDocumentoExpediente) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/expediente/documentos/${tipo}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const descargarDocumentoExpediente = useCallback(async (loteId: string, tipo: TipoDocumentoExpediente) => {
    return fetchAuthBlob(`/importaciones/lotes/${loteId}/expediente/documentos/${tipo}`);
  }, []);

  const crearVistoBueno = useCallback(
    async (loteId: string, data: CrearVistoBuenoInput) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/expediente/vistos-buenos`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh],
  );

  const actualizarVistoBueno = useCallback(
    async (vistoId: string, data: ActualizarVistoBuenoInput) => {
      await fetchAuth(`/importaciones/vistos-buenos/${vistoId}`, { method: "PATCH", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const subirDocumentoVistoBueno = useCallback(
    async (vistoId: string, file: File) => {
      const formData = new FormData();
      formData.append("archivo", file);
      await fetchAuthUpload(`/importaciones/vistos-buenos/${vistoId}/documento`, formData);
      await refresh();
    },
    [refresh],
  );

  const descargarDocumentoVistoBueno = useCallback(async (vistoId: string) => {
    return fetchAuthBlob(`/importaciones/vistos-buenos/${vistoId}/documento`);
  }, []);

  return {
    orden,
    loading,
    error,
    refresh,
    addLote,
    actualizarEstadoLote,
    recibirPreCompraPlanta,
    liquidarCosteoImportacion,
    actualizarExpediente,
    subirDocumentoExpediente,
    eliminarDocumentoExpediente,
    descargarDocumentoExpediente,
    crearVistoBueno,
    actualizarVistoBueno,
    subirDocumentoVistoBueno,
    descargarDocumentoVistoBueno,
  };
}

/**
 * Refresco casi-en-tiempo-real del detalle de una orden mientras está
 * visible, mismo patrón que usePollingFacturas: varias áreas (compras,
 * logística, aduanas) pueden tocar el mismo lote a lo largo de días/semanas.
 */
export function usePollingOrdenCompraIntl(refresh: () => void | Promise<void>, intervaloMs = 6000) {
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
