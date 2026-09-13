import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuth, fetchAuthUpload, fetchAuthBlob } from "@/lib/session";

export type EstadoOrdenIntl = "Borrador" | "Confirmada" | "Cerrada" | "Anulada";
export type EstadoLoteImportacion =
  "En tránsito" | "En puerto" | "En inspección" | "Liberado pre-compra" | "Nacionalizado";

export interface ItemOrdenCompraIntl {
  id: string;
  descripcion: string;
  referencia: string | null;
  /** Código con el que el proveedor identifica el ítem en su cotización —
   * texto libre, para uso futuro de la Bandeja Inteligente. */
  referenciaProveedor: string | null;
  unidadMedida: string | null;
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

// BOOKED | GATE_IN | LOADED | DEPARTED | TRANSSHIPMENT | ARRIVED_PORT |
// DISCHARGED | DELIVERED — mismo catálogo EXACTO que
// EVENTOS_CONTENEDOR_VALIDOS en maritime-tracking-provider.ts.
export type EventoContenedorTipo =
  | "BOOKED"
  | "GATE_IN"
  | "LOADED"
  | "DEPARTED"
  | "TRANSSHIPMENT"
  | "ARRIVED_PORT"
  | "DISCHARGED"
  | "DELIVERED";

export interface EventoContenedor {
  tipo: EventoContenedorTipo;
  fecha: string;
  ubicacion: string | null;
}

export interface ContenedorLote {
  id: string;
  numero: string;
  ultimoEvento: EventoContenedorTipo | null;
  ultimoEventoFecha: string | null;
  eventos: EventoContenedor[];
}

// PENDIENTE (nunca sincronizado) | ACTIVO | SIN_DATOS | ERROR — mismo
// catálogo EXACTO que LoteImportacion.estadoTracking en el backend.
export type EstadoTracking = "PENDIENTE" | "ACTIVO" | "SIN_DATOS" | "ERROR";

export interface TrackingLote {
  estado: EstadoTracking;
  proveedor: string | null;
  ultimoError: string | null;
  ultimaSincronizacion: string | null;
  etaActual: string | null;
  /** Diferencia en días entre el ETA del tracking marítimo y el ETA
   * informado por el proveedor (fechaLlegadaEstimada) — positivo = retraso,
   * negativo = adelanto. Null si todavía no hay ambos datos para comparar. */
  variacionEtaDias: number | null;
  posicion: {
    lat: number;
    lon: number;
    fecha: string | null;
    velocidadNudos: number | null;
    rumboGrados: number | null;
  } | null;
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
  forwarder: string | null;
  booking: string | null;
  fechaEmbarque: string | null;
  fechaLlegadaEstimada: string | null;
  fechaLlegadaReal: string | null;
  estado: EstadoLoteImportacion;
  buque: { nombre: string | null; imo: string | null; mmsi: string | null } | null;
  tracking: TrackingLote;
  contenedores: ContenedorLote[];
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

export type ResponsableTipo =
  "Interno" | "Proveedor" | "AgenciaAduana" | "Transportador" | "Naviera" | "Otro";

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

// Cotización | Proforma Invoice | Oferta comercial | Otros — mismo catálogo
// EXACTO que TIPOS_DOCUMENTO_ORDEN en importaciones.controller.ts.
export type TipoDocumentoOrdenIntl = "cotizacion" | "proforma" | "oferta-comercial" | "otros";

export const TIPOS_DOCUMENTO_ORDEN_INTL: { tipo: TipoDocumentoOrdenIntl; etiqueta: string }[] = [
  { tipo: "cotizacion", etiqueta: "Cotización" },
  { tipo: "proforma", etiqueta: "Proforma Invoice" },
  { tipo: "oferta-comercial", etiqueta: "Oferta comercial" },
  { tipo: "otros", etiqueta: "Otros" },
];

export interface DocumentoOrdenCompraIntl {
  id: string;
  tipo: string;
  nombreOriginal: string;
  mime: string;
  tamano: number;
  subidoPorNombre: string | null;
  createdAt: string;
}

export interface RequisitoProveedorImportacion {
  id: string;
  tipo: string;
  nombre: string;
  descripcion: string | null;
  obligatorio: boolean;
  activo: boolean;
  orden: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrdenCompraIntl {
  id: string;
  codigo: string;
  numeroOrden: string;
  /** Fecha explícita de la orden pactada con el proveedor — distinta de
   * createdAt (timestamp de auditoría del registro). */
  fechaOrden: string;
  incoterm: string;
  /** Lugar pactado del Incoterm (ej. "Shanghai, China") — texto libre. */
  lugarPactado: string | null;
  proveedorId: string | null;
  proveedorExtranjero: string;
  /** Presente solo cuando la orden quedó ligada a un Proveedor real (no
   * texto libre) — incluye sus requisitos de importación VIGENTES (ver
   * decisión de referencia viva). */
  proveedor: {
    id: string;
    nombre: string;
    nit: string;
    requisitos: RequisitoProveedorImportacion[];
  } | null;
  paisOrigen: string;
  moneda: string;
  formaPago: string | null;
  condicionPago: string | null;
  detallePago: string | null;
  trmPactada: number;
  tasaCambioFecha: string | null;
  tasaCambioFuente: string | null;
  fechaRequeridaLlegada: string | null;
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
  documentos: DocumentoOrdenCompraIntl[];
  situacionActual: SituacionActual;
}

export interface ItemOrdenInput {
  descripcion: string;
  referencia?: string | null;
  referenciaProveedor?: string | null;
  unidadMedida?: string | null;
  subpartidaArancelariaId?: string | null;
  cantidad: number;
  pesoKg?: number | null;
  volumenM3?: number | null;
  valorUnitarioFob: number;
}

export interface CrearOrdenInput {
  numeroOrden: string;
  fechaOrden?: string;
  incoterm: string;
  lugarPactado?: string | null;
  proveedorId?: string | null;
  proveedorExtranjero?: string;
  paisOrigen: string;
  moneda: string;
  trmPactada: number;
  tasaCambioFecha?: string | null;
  tasaCambioFuente?: string | null;
  formaPago?: string | null;
  condicionPago?: string | null;
  detallePago?: string | null;
  fechaRequeridaLlegada?: string | null;
  responsableId?: string | null;
  observaciones?: string;
  items: ItemOrdenInput[];
}

export interface TrmOficial {
  valor: number;
  vigenciaDesde: string;
  vigenciaHasta: string;
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
  booking?: string;
  forwarder?: string;
  buqueNombre?: string;
  buqueImo?: string;
  buqueMmsi?: string;
}

export type ActualizarEmbarqueInput = Partial<CrearLoteInput>;

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

/**
 * Sube un documento inicial a una orden ya creada — función standalone (no
 * depende de useOrdenCompraIntl) para el formulario de creación
 * (importaciones.nueva.tsx), que solo conoce el id de la orden recién
 * registrada, no tiene el hook de detalle montado todavía.
 */
export async function subirDocumentoOrdenCompraIntlStandalone(
  ordenId: string,
  tipo: TipoDocumentoOrdenIntl,
  file: File,
) {
  const formData = new FormData();
  formData.append("archivo", file);
  return fetchAuthUpload(`/importaciones/${ordenId}/documentos/${tipo}`, formData);
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
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Error cargando las órdenes de compra internacionales.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addOrden = useCallback(
    async (data: CrearOrdenInput) => {
      // Devuelve la orden creada (con su id) para que el formulario de
      // creación pueda subir los "Documentos iniciales" inmediatamente
      // después — la orden ya existe en ese momento, así que se reutiliza
      // el mismo endpoint de documentos que usa la pantalla de detalle.
      const creada = (await fetchAuth("/importaciones", {
        method: "POST",
        body: JSON.stringify(data),
      })) as OrdenCompraIntl;
      await refresh();
      return creada;
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

/** Consulta puntual (no un hook con estado propio): el modal de creación la
 * dispara desde un botón, no la necesita al montar. */
export async function obtenerTrmOficial(): Promise<TrmOficial> {
  return fetchAuth("/importaciones/trm-oficial");
}

export interface ItemBusquedaSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
}

/**
 * Autocompletado de ítem para la tabla de "Ítems de la Orden" — mismo
 * patrón que useProveedorBusqueda (use-proveedores.ts): búsqueda server-side
 * contra el maestro de Siesa, sin descargar ningún catálogo completo. Si el
 * tenant no tiene Siesa configurado (`disponible:false`), el consumidor cae
 * a captura 100% manual — nunca bloquea crear la orden.
 */
export function useBuscarItemsSiesa() {
  const [opciones, setOpciones] = useState<ItemBusquedaSiesa[]>([]);
  const [loading, setLoading] = useState(false);
  const [disponible, setDisponible] = useState(true);

  const buscar = useCallback(async (texto: string) => {
    if (texto.trim().length < 2) {
      setOpciones([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchAuth(
        `/importaciones/items-siesa/buscar?search=${encodeURIComponent(texto)}`,
      );
      setDisponible(!!data.disponible);
      setOpciones(data.disponible && Array.isArray(data.items) ? data.items : []);
    } catch {
      setOpciones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { opciones, loading, disponible, buscar };
}

export interface ResponsableImportacionOpcion {
  id: string;
  nombre: string;
}

/**
 * Usuarios activos del tenant para el selector "Responsable de la
 * importación" del formulario de creación — no reemplaza al creador de la
 * orden (queda registrado en el historial/auditoría igual que antes).
 */
export function useResponsablesImportacion() {
  const [opciones, setOpciones] = useState<ResponsableImportacionOpcion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    fetchAuth("/importaciones/responsables")
      .then((data) => {
        if (!cancelado) setOpciones(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelado) setOpciones([]);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return { opciones, loading };
}

export interface NuevoRequisitoProveedor {
  tipo: string;
  nombre: string;
  descripcion?: string | null;
  obligatorio?: boolean;
  orden?: number;
}

export interface ActualizarRequisitoProveedor {
  tipo?: string;
  nombre?: string;
  descripcion?: string | null;
  obligatorio?: boolean;
  activo?: boolean;
  orden?: number;
}

export interface ProveedorConfigurado {
  id: string;
  nombre: string;
  nit: string;
  paisOrigen: string | null;
  materialesHabituales: string[];
  totalRequisitos: number;
}

/**
 * Proveedores que ya tienen algo configurado (país, materiales o al menos un
 * requisito) — para "Proveedores y Requisitos", así quedan visibles de una
 * vez sin tener que volver a buscarlos en el selector cada vez que se entra
 * a la página.
 */
export function useProveedoresConfigurados() {
  const [proveedores, setProveedores] = useState<ProveedorConfigurado[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuth("/importaciones/proveedores/configurados");
      setProveedores(Array.isArray(data) ? data : []);
    } catch {
      setProveedores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { proveedores, loading, refresh };
}

/**
 * Requisitos de importación de UN proveedor (sección "Proveedores y
 * requisitos"). Por defecto solo trae los activos; `incluirInactivos`
 * (pantalla de administración) también trae los desactivados para poder
 * reactivarlos.
 */
export function useRequisitosProveedor(proveedorId: string | undefined, incluirInactivos = false) {
  const [proveedor, setProveedor] = useState<{
    id: string;
    nombre: string;
    nit: string;
    paisOrigen: string | null;
    materialesHabituales: string[];
  } | null>(null);
  const [requisitos, setRequisitos] = useState<RequisitoProveedorImportacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!proveedorId) {
      setProveedor(null);
      setRequisitos([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = incluirInactivos ? "?incluirInactivos=true" : "";
      const data = await fetchAuth(`/importaciones/proveedores/${proveedorId}/requisitos${qs}`);
      setProveedor(data.proveedor);
      setRequisitos(data.requisitos);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando los requisitos del proveedor.");
    } finally {
      setLoading(false);
    }
  }, [proveedorId, incluirInactivos]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crearRequisito = useCallback(
    async (datos: NuevoRequisitoProveedor) => {
      if (!proveedorId) return;
      await fetchAuth(`/importaciones/proveedores/${proveedorId}/requisitos`, {
        method: "POST",
        body: JSON.stringify(datos),
      });
      await refresh();
    },
    [proveedorId, refresh],
  );

  const actualizarRequisito = useCallback(
    async (requisitoId: string, datos: ActualizarRequisitoProveedor) => {
      await fetchAuth(`/importaciones/proveedores/requisitos/${requisitoId}`, {
        method: "PATCH",
        body: JSON.stringify(datos),
      });
      await refresh();
    },
    [refresh],
  );

  const eliminarRequisito = useCallback(
    async (requisitoId: string) => {
      await fetchAuth(`/importaciones/proveedores/requisitos/${requisitoId}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [refresh],
  );

  // Configuración general del proveedor mismo (no un requisito): país de
  // origen y materiales habituales — instant-persist, igual que el toggle de
  // "activo" de un requisito: no hay botón "Guardar" que se pueda perder al
  // cambiar de módulo.
  const actualizarConfiguracionProveedor = useCallback(
    async (datos: { paisOrigen?: string; materialesHabituales?: string[] }) => {
      if (!proveedorId) return;
      await fetchAuth(`/proveedores/${proveedorId}`, {
        method: "PATCH",
        body: JSON.stringify(datos),
      });
      await refresh();
    },
    [proveedorId, refresh],
  );

  return {
    proveedor,
    requisitos,
    loading,
    error,
    refresh,
    crearRequisito,
    actualizarRequisito,
    eliminarRequisito,
    actualizarConfiguracionProveedor,
  };
}

export function useOrdenCompraIntl(id: string | undefined) {
  const [orden, setOrden] = useState<OrdenCompraIntl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (opciones: { silencioso?: boolean } = {}) => {
      if (!id) return;
      if (!opciones.silencioso) setLoading(true);
      setError("");
      try {
        const data = await fetchAuth(`/importaciones/${id}`);
        setOrden(data);
      } catch (err: unknown) {
        // Un refresco en segundo plano (polling) que falla no debe tapar la
        // página con un mensaje de error — el usuario sigue viendo los
        // últimos datos cargados; solo se muestra si es la carga inicial.
        if (!opciones.silencioso) {
          setError(
            err instanceof Error ? err.message : "Error cargando la orden de compra internacional.",
          );
        }
      } finally {
        if (!opciones.silencioso) setLoading(false);
      }
    },
    [id],
  );

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

  const actualizarEmbarqueLote = useCallback(
    async (loteId: string, data: ActualizarEmbarqueInput) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/embarque`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh],
  );

  const agregarContenedor = useCallback(
    async (loteId: string, numero: string) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/contenedores`, {
        method: "POST",
        body: JSON.stringify({ numero }),
      });
      await refresh();
    },
    [refresh],
  );

  const eliminarContenedor = useCallback(
    async (loteId: string, contenedorId: string) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/contenedores/${contenedorId}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [refresh],
  );

  const sincronizarTracking = useCallback(
    async (loteId: string) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/tracking/sincronizar`, { method: "POST" });
      await refresh();
    },
    [refresh],
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
      await fetchAuth(`/importaciones/lotes/${loteId}/expediente`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh],
  );

  const subirDocumentoExpediente = useCallback(
    async (loteId: string, tipo: TipoDocumentoExpediente, file: File) => {
      const formData = new FormData();
      formData.append("archivo", file);
      await fetchAuthUpload(
        `/importaciones/lotes/${loteId}/expediente/documentos/${tipo}`,
        formData,
      );
      await refresh();
    },
    [refresh],
  );

  const eliminarDocumentoExpediente = useCallback(
    async (loteId: string, tipo: TipoDocumentoExpediente) => {
      await fetchAuth(`/importaciones/lotes/${loteId}/expediente/documentos/${tipo}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [refresh],
  );

  const descargarDocumentoExpediente = useCallback(
    async (loteId: string, tipo: TipoDocumentoExpediente) => {
      return fetchAuthBlob(`/importaciones/lotes/${loteId}/expediente/documentos/${tipo}`);
    },
    [],
  );

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
      await fetchAuth(`/importaciones/vistos-buenos/${vistoId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
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

  const subirDocumentoOrden = useCallback(
    async (ordenId: string, tipo: TipoDocumentoOrdenIntl, file: File) => {
      const formData = new FormData();
      formData.append("archivo", file);
      await fetchAuthUpload(`/importaciones/${ordenId}/documentos/${tipo}`, formData);
      await refresh();
    },
    [refresh],
  );

  const eliminarDocumentoOrden = useCallback(
    async (ordenId: string, documentoId: string) => {
      await fetchAuth(`/importaciones/${ordenId}/documentos/${documentoId}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const descargarDocumentoOrden = useCallback(async (ordenId: string, documentoId: string) => {
    return fetchAuthBlob(`/importaciones/${ordenId}/documentos/${documentoId}`);
  }, []);

  const crearActividad = useCallback(
    async (data: CrearActividadInput) => {
      if (!id) return;
      await fetchAuth(`/importaciones/${id}/actividades`, {
        method: "POST",
        body: JSON.stringify(data),
      });
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
      await fetchAuth(`/importaciones/${id}/novedades`, {
        method: "POST",
        body: JSON.stringify(data),
      });
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
      await fetchAuth(`/importaciones/${id}/cerrar`, {
        method: "POST",
        body: JSON.stringify(opts ?? {}),
      });
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
    actualizarEmbarqueLote,
    agregarContenedor,
    eliminarContenedor,
    sincronizarTracking,
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
    subirDocumentoOrden,
    eliminarDocumentoOrden,
    descargarDocumentoOrden,
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
