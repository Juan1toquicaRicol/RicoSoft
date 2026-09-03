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

export type EtapaImportacion =
  | "Orden"
  | "Documentación"
  | "Embarque"
  | "Tránsito"
  | "Aduana"
  | "Nacionalización"
  | "Pagos"
  | "Recepción"
  | "Cierre";

export type ResponsableTipo = "Interno" | "Proveedor" | "AgenciaAduana" | "Transportador" | "Naviera" | "Otro";

export const ETIQUETA_RESPONSABLE_TIPO: Record<ResponsableTipo, string> = {
  Interno: "Interno (Ricol)",
  Proveedor: "Proveedor",
  AgenciaAduana: "Agencia de aduanas",
  Transportador: "Transportador",
  Naviera: "Naviera",
  Otro: "Otro",
};

export type EstadoActividad = "Pendiente" | "EnCurso" | "Completada" | "Bloqueada" | "Omitida";

export interface ActividadImportacion {
  id: string;
  ordenCompraId: string;
  loteId: string | null;
  nombre: string;
  etapa: EtapaImportacion;
  responsableTipo: ResponsableTipo;
  responsableNombre: string | null;
  fechaPlanificada: string | null;
  fechaLimite: string | null;
  fechaReal: string | null;
  estado: EstadoActividad;
  dependeDeId: string | null;
  observacion: string | null;
}

export type TipoNovedad =
  | "Retraso"
  | "DocumentoFaltante"
  | "Inconsistencia"
  | "Dano"
  | "Faltante"
  | "ProblemaAduanero"
  | "ProblemaProveedor"
  | "ProblemaTransporte"
  | "ProblemaFinanciero"
  | "Bloqueo"
  | "Otro";

export const ETIQUETA_TIPO_NOVEDAD: Record<TipoNovedad, string> = {
  Retraso: "Retraso",
  DocumentoFaltante: "Documento faltante",
  Inconsistencia: "Inconsistencia",
  Dano: "Daño",
  Faltante: "Faltante",
  ProblemaAduanero: "Problema aduanero",
  ProblemaProveedor: "Problema con el proveedor",
  ProblemaTransporte: "Problema de transporte",
  ProblemaFinanciero: "Problema financiero",
  Bloqueo: "Bloqueo",
  Otro: "Otro",
};

export type OrigenNovedad = "Interno" | "Externo" | "PorDeterminar";
export type PrioridadNovedad = "Alta" | "Media" | "Baja";
export type EstadoNovedad = "Abierta" | "EnGestion" | "Resuelta";

export interface NovedadImportacion {
  id: string;
  ordenCompraId: string;
  tipo: TipoNovedad;
  descripcion: string;
  origen: OrigenNovedad;
  responsable: string | null;
  prioridad: PrioridadNovedad;
  impacto: string | null;
  fechaDeteccion: string;
  fechaLimite: string | null;
  estado: EstadoNovedad;
  accionRequerida: string | null;
  responsableResolucion: string | null;
  fechaResolucion: string | null;
  automatica: boolean;
  creadoPor: string | null;
  createdAt: string;
}

export type EstadoPago = "Pendiente" | "Pagado" | "Anulado";

export interface PagoImportacion {
  id: string;
  ordenCompraId: string;
  concepto: string;
  valor: number;
  moneda: string;
  fechaVencimiento: string | null;
  estado: EstadoPago;
  fechaPago: string | null;
  responsable: string | null;
  comprobante: { nombre: string; mime: string | null; tamano: number | null } | null;
  observaciones: string | null;
  createdAt: string;
}

export interface SituacionActual {
  etapaActual: string;
  atencion: string | null;
  responsable: string | null;
  diasRetraso: number | null;
  proximaAccion: string | null;
}

export interface OrdenCompraIntl {
  id: string;
  codigo: string;
  numeroOrden: string;
  incoterm: string;
  proveedorExtranjero: string;
  paisOrigen: string;
  moneda: string;
  trmPactada: number;
  valorEstimadoTotal: number;
  estado: EstadoOrdenIntl;
  fechaEstimadaCierre: string | null;
  fechaCierre: string | null;
  observaciones: string | null;
  responsable: { id: string; nombre: string } | null;
  createdAt: string;
  items: ItemOrdenCompraIntl[];
  lotes: LoteImportacion[];
  historial: {
    fecha: string;
    actor: string;
    accion: string;
    detalle: string | null;
    origen: "Sistema" | "Manual";
    responsable: string | null;
    etapa: EtapaImportacion | null;
    evidencia: { nombre: string; mime: string | null; tamano: number | null } | null;
  }[];
  actividades: ActividadImportacion[];
  novedades: NovedadImportacion[];
  pagos: PagoImportacion[];
  situacionActual: SituacionActual;
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

export interface CrearActividadInput {
  nombre: string;
  etapa: EtapaImportacion;
  responsableTipo: ResponsableTipo;
  responsableNombre?: string;
  fechaPlanificada?: string;
  fechaLimite?: string;
  loteId?: string;
  dependeDeId?: string;
}

export interface CrearNovedadInput {
  tipo: TipoNovedad;
  descripcion: string;
  origen?: OrigenNovedad;
  responsable?: string;
  prioridad?: PrioridadNovedad;
  impacto?: string;
  fechaLimite?: string;
  accionRequerida?: string;
}

export interface CrearPagoInput {
  concepto: string;
  valor: number;
  moneda?: string;
  fechaVencimiento?: string;
  observaciones?: string;
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

  const crearActividad = useCallback(
    async (data: CrearActividadInput) => {
      if (!id) return;
      await fetchAuth(`/importaciones/${id}/actividades`, { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [id, refresh],
  );

  const completarActividad = useCallback(
    async (actividadId: string, observacion?: string) => {
      await fetchAuth(`/importaciones/actividades/${actividadId}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "Completada", observacion }),
      });
      await refresh();
    },
    [refresh],
  );

  const crearNovedad = useCallback(
    async (data: CrearNovedadInput) => {
      if (!id) return;
      await fetchAuth(`/importaciones/${id}/novedades`, { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [id, refresh],
  );

  const resolverNovedad = useCallback(
    async (novedadId: string, comentario?: string) => {
      await fetchAuth(`/importaciones/novedades/${novedadId}/resolver`, {
        method: "PATCH",
        body: JSON.stringify({ comentario }),
      });
      await refresh();
    },
    [refresh],
  );

  const crearPago = useCallback(
    async (data: CrearPagoInput) => {
      if (!id) return;
      await fetchAuth(`/importaciones/${id}/pagos`, { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [id, refresh],
  );

  const marcarPagoPagado = useCallback(
    async (pagoId: string) => {
      await fetchAuth(`/importaciones/pagos/${pagoId}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "Pagado" }),
      });
      await refresh();
    },
    [refresh],
  );

  const cerrarOrden = useCallback(
    async (opts?: { forzar?: boolean; justificacion?: string }) => {
      if (!id) return;
      await fetchAuth(`/importaciones/${id}/cerrar`, { method: "POST", body: JSON.stringify(opts ?? {}) });
      await refresh();
    },
    [id, refresh],
  );

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
    crearActividad,
    completarActividad,
    crearNovedad,
    resolverNovedad,
    crearPago,
    marcarPagoPagado,
    cerrarOrden,
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
