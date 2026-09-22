import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type ClasificacionInventario =
  "vendible" | "exceso" | "obsolescencia" | "sin_movimiento" | "servicio" | "repuesto" | "insumo";

export type NaturalezaInventario = "producto" | "servicio" | "repuesto" | "insumo";

export interface BucketInventario {
  valor: number;
  items: number;
}

export type AccionInventario = "liquidar" | "revisar" | null;

export interface ItemInventarioClasificado {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  naturaleza: NaturalezaInventario;
  cantidadExistente: number;
  cantidadComprometida: number;
  valorTotal: number;
  diasSinVenta: number | null;
  clasificacion: ClasificacionInventario;
  accionRecomendada: AccionInventario;
  /** t120_mc_items.f120_id_unidad_inventario — KG, UNID, M, GL, etc. No todo el catálogo es kilos. */
  unidadMedida: string | null;
}

export interface InventarioGerencial {
  disponible: boolean;
  motivo?: string;
  totalValor?: number;
  totalValorVendible?: number;
  totalComprometidoValor?: number;
  buckets?: Record<ClasificacionInventario, BucketInventario>;
  topRiesgo?: ItemInventarioClasificado[];
}

/** Inventario real leído en vivo desde Siesa (t400_cm_existencia). */
export function useInventarioGerencial() {
  const [inventario, setInventario] = useState<InventarioGerencial>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/inventario/resumen");
      setInventario(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el inventario.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { inventario, loading, error, refresh };
}

export interface PronosticoProducto {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  ventaPromedioMensual: number;
  tendenciaPct: number | null;
  coeficienteVariacion: number | null;
  demandaIrregular: boolean;
  perdiendoRotacion: boolean;
  mesesConVenta: number;
}

export interface PronosticoDemanda {
  disponible: boolean;
  motivo?: string;
  topDemanda?: PronosticoProducto[];
  perdiendoRotacion?: PronosticoProducto[];
  tendenciaFuerte?: PronosticoProducto[];
}

/** Pronóstico de demanda calculado en vivo sobre ventas reales por producto (Siesa). */
export function usePronosticoDemanda() {
  const [pronostico, setPronostico] = useState<PronosticoDemanda>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/inventario/demanda");
      setPronostico(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el pronóstico de demanda.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { pronostico, loading, error, refresh };
}

export interface RecomendacionProduccion {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  demandaProyectada: number;
  pedidosComprometidos: number;
  inventarioDisponible: number;
  cantidadPendienteEntrar: number;
  produccionRecomendada: number;
  ventaPromedioMensual: number;
  tendenciaPct: number | null;
  mesesConVenta: number;
  confianza: "alta" | "media" | "baja";
}

export interface ProduccionRecomendada {
  disponible: boolean;
  motivo?: string;
  recomendaciones?: RecomendacionProduccion[];
}

/** Producción recomendada calculada en vivo (demanda proyectada + comprometidos − disponible − en camino). */
export function useProduccionRecomendada() {
  const [produccion, setProduccion] = useState<ProduccionRecomendada>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/inventario/produccion-recomendada");
      setProduccion(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando la producción recomendada.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { produccion, loading, error, refresh };
}

export interface ItemCobertura {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  existenciaDisponible: number;
  ventaPromedioMensual: number;
  diasCobertura: number | null;
}

export interface Cobertura {
  disponible: boolean;
  motivo?: string;
  coberturaPromedioDias?: number | null;
  riesgoRuptura?: ItemCobertura[];
  sobreCobertura?: ItemCobertura[];
}

/** Cobertura de inventario: días que aguanta cada producto al ritmo de venta actual. */
export function useCobertura() {
  const [cobertura, setCobertura] = useState<Cobertura>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/inventario/cobertura");
      setCobertura(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando la cobertura.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { cobertura, loading, error, refresh };
}

export interface NecesidadAbastecimiento {
  componenteRowId: number;
  descripcion: string | null;
  referencia: string | null;
  cantidadNecesaria: number;
  cantidadDisponible: number;
  deficit: number;
}

export interface Abastecimiento {
  disponible: boolean;
  motivo?: string;
  necesidades?: NecesidadAbastecimiento[];
}

/** Necesidades de abastecimiento: materias primas/insumos que faltan para cubrir la producción recomendada. */
export function useAbastecimiento() {
  const [abastecimiento, setAbastecimiento] = useState<Abastecimiento>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/inventario/abastecimiento");
      setAbastecimiento(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error cargando las necesidades de abastecimiento.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { abastecimiento, loading, error, refresh };
}

export interface ConfiguracionInventario {
  diasVendible: number;
  diasExceso: number;
  diasRupturaCobertura: number;
  diasSobreCobertura: number;
  /** Fase 6 — inventario objetivo: días de cobertura deseados. */
  coberturaObjetivoDias: number;
  /** Fase 6 — multiplicador de seguridad sobre el inventario objetivo (1 = sin colchón extra). */
  factorSeguridad: number;
  /** Umbrales adicionales (auditoría de datos hardcodeados) — opcionales: si
   * se omiten al guardar, el backend conserva el valor por defecto de la columna. */
  umbralVariabilidadAltaDemanda?: number;
  umbralPerdidaRotacionDemanda?: number;
  umbralTendenciaFuertePctDemanda?: number;
  umbralAlertaTrmPct?: number;
  plazoCreditoDiasDefecto?: number;
  minimoCotizacionesSolicitud?: number;
  /** Parámetros de negocio (Ventas/Crédito/Inventario/Compras) — solo se
   * almacenan hoy, ver server/src/lib/parametros-negocio.ts. Opcionales por
   * el mismo motivo que los umbrales de arriba: si se omiten al guardar, el
   * backend conserva el valor guardado o su default. */
  margenMinimoVentaPct?: number;
  diasMaximosMora?: number;
  porcentajeMaximoUsoCupo?: number;
  toleranciaMermaPesajePct?: number;
  diasValidezOferta?: number;
  montoMinimoCotizaciones?: number;
}

/** Umbrales configurables del módulo (Parte 16) — días de vendible/exceso/ruptura/sobre-cobertura. */
export function useConfiguracionInventario() {
  const [configuracion, setConfiguracion] = useState<ConfiguracionInventario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/inventario/configuracion");
      setConfiguracion(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error cargando la configuración de inventario.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const guardar = useCallback(async (valores: ConfiguracionInventario) => {
    const data = await fetchAuth("/inventario/configuracion", {
      method: "PUT",
      body: JSON.stringify(valores),
    });
    setConfiguracion(data);
    return data;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { configuracion, loading, error, refresh, guardar };
}

export interface PedidoComprometido {
  pvDoctoRowId: number;
  numeroDocumento: number;
  tipoDocto: number | null;
  clienteRowId: number | null;
  clienteNombre: string | null;
  itemRowId: number;
  referencia: string | null;
  descripcion: string | null;
  cantidadPedida: number;
  cantidadComprometida: number;
  cantidadRemisionada: number;
  cantidadFacturada: number;
  fechaPedido: string | null;
  fechaEntrega: string | null;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  estado: string;
  indEstadoLinea: number | null;
  indEstadoDocto: number | null;
  indUltEstadoAprobado: boolean | null;
  indBackorderDocto: boolean | null;
  indBackorderLinea: boolean | null;
  indRetenidoMargen: boolean | null;
  indRetenidoCupo: boolean | null;
  indRetenidoMora: boolean | null;
  indRetenidoBloqueo: boolean | null;
  indRetenidoAnticipo: boolean | null;
  indRemisionado: boolean | null;
  indFacturado: boolean | null;
}

export interface PedidosComprometidosItem {
  disponible: boolean;
  motivo?: string;
  pedidos?: PedidoComprometido[];
  totalCantidadComprometida?: number;
  sinDocumentoIdentificable?: boolean;
}

/**
 * Detalle de pedidos de venta que originan el "Comprometido (estimado)" de
 * un ítem — bajo demanda (nunca se llama en la carga inicial de la
 * pantalla de Inventario, solo cuando el usuario pide el detalle de un
 * ítem puntual).
 */
export function usePedidosComprometidos() {
  const [datos, setDatos] = useState<PedidosComprometidosItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const consultar = useCallback(async (itemRowId: number) => {
    setLoading(true);
    setError("");
    setDatos(null);
    try {
      const data = await fetchAuth(`/inventario/productos/${itemRowId}/comprometidos`);
      setDatos(data as PedidosComprometidosItem);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando los pedidos comprometidos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const limpiar = useCallback(() => {
    setDatos(null);
    setError("");
  }, []);

  return { datos, loading, error, consultar, limpiar };
}

export interface PedidosComprometidosTodos {
  disponible: boolean;
  motivo?: string;
  pedidos?: PedidoComprometido[];
  totalCantidadComprometida?: number;
}

/**
 * Detalle COMPLETO de "Comprometido (estimado)" — todos los pedidos de
 * venta que comprometen inventario en toda la compañía, sin filtrar por
 * producto. La tarjeta de Inventario es un agregado de todo el portafolio,
 * así que su detalle tampoco debe obligar a buscar un producto primero
 * (una sola consulta a Siesa, se carga al entrar a la pantalla de detalle).
 */
export function usePedidosComprometidosTodos() {
  const [datos, setDatos] = useState<PedidosComprometidosTodos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/inventario/comprometidos");
      setDatos(data as PedidosComprometidosTodos);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando los pedidos comprometidos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { datos, loading, error, refresh };
}

export type TipoDecision = "producir" | "comprar" | "liquidar" | "no_producir" | "riesgo_quiebre";
export type PrioridadDecision = "alta" | "media" | "baja";
export type ConfianzaDecision = "alta" | "media" | "baja";

export interface AccionDecision {
  tipo: "plan-produccion" | "solicitud-compra" | "gestion-liquidacion" | "detalle";
  itemRowId: number;
  descripcion: string | null;
  cantidad?: number;
}

/** Datos de respaldo por tipo de decisión — vienen calculados del backend, nunca se recalculan aquí. */
export interface DetalleDecision {
  demandaProyectada?: number;
  inventarioDisponible?: number;
  pedidosComprometidos?: number;
  capacidadMaxima?: number | null;
  materialLimitante?: string | null;
  deficitProductivo?: number;
  cantidadNecesaria?: number;
  cantidadDisponible?: number;
  deficit?: number;
  score?: number;
  categoriaLiquidacion?: "CRITICA" | "ALTA" | "MEDIA" | "BAJA";
  cantidadExistente?: number;
  diasSinVenta?: number | null;
  ventaPromedioMensual?: number;
  diasCobertura?: number | null;
  /** Fase H — ventanas móviles de venta real (30/90/180 días) e inventario objetivo, cuando están disponibles. */
  ventas30d?: number;
  ventas90d?: number;
  ventas180d?: number;
  stockObjetivo?: number;
  excedenteSobreObjetivo?: number;
  calidadDatos?: "ALTA" | "MEDIA" | "BAJA";
}

export interface DecisionPlaneacion {
  tipo: TipoDecision;
  itemRowId: number;
  titulo: string;
  referencia: string | null;
  cantidad: number | null;
  unidadMedida: string | null;
  cuando: null;
  motivo: string;
  impacto: number;
  prioridad: PrioridadDecision;
  confianza: ConfianzaDecision;
  /** Fase 12 — de qué tabla/consulta real sale este número, y con qué calidad de historia. */
  fuente: string;
  detalle: DetalleDecision;
  accion: AccionDecision;
}

export interface ResumenGrupoDecisiones {
  cantidad: number;
  unidades: number;
  impacto: number;
}

export interface ResumenDecisionesPlaneacion {
  producir: ResumenGrupoDecisiones;
  comprar: ResumenGrupoDecisiones;
  liquidar: ResumenGrupoDecisiones;
  no_producir: ResumenGrupoDecisiones;
  riesgo_quiebre: ResumenGrupoDecisiones;
}

export interface DecisionesPlaneacion {
  disponible: boolean;
  motivo?: string;
  inventarioTotal?: number;
  inventarioVendible?: number;
  inventarioComprometido?: number;
  inventarioExceso?: number;
  inventarioRiesgo?: number;
  decisiones?: DecisionPlaneacion[];
  resumen?: ResumenDecisionesPlaneacion;
}

/** Centro de Decisiones — motor determinístico de recomendaciones accionables (producir/comprar/liquidar/no producir/riesgo de quiebre). */
export function useDecisionesPlaneacion() {
  const [decisiones, setDecisiones] = useState<DecisionesPlaneacion>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/inventario/decisiones");
      setDecisiones(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el Centro de Decisiones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { decisiones, loading, error, refresh };
}
