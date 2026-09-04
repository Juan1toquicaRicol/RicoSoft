/**
 * Centro Gerencial — DTO de indicador + composición pura. NO recalcula
 * ninguna fórmula: toma los resultados YA producidos por los módulos
 * existentes (analitica.controller.ts para finanzas/ventas,
 * domain/planeacion/decisiones.ts para inventario/producción/compras,
 * lib/toma-fisica.ts para riesgos operativos) y los traduce a una lista
 * homogénea de IndicadorGerencial — QUÉ, CUÁNTO, TENDENCIA, IMPACTO,
 * CONFIANZA/CALIDAD, FUENTE, ACCIÓN — para una sola pantalla ejecutiva.
 *
 * Principio "no inventar": cuando una entrada no trae suficiente evidencia
 * (ej. ventas del período anterior en 0, o ningún producto con ventana de
 * demanda), el indicador correspondiente se omite o marca
 * calidadDatos:"BAJA" — nunca se sintetiza un número.
 */
export type CategoriaIndicador =
  "finanzas" | "ventas" | "inventario" | "produccion" | "compras" | "riesgos";
export type NivelIndicador = "critico" | "alto" | "medio" | "bajo" | "informativo";
export type TendenciaIndicador = "subida" | "bajada" | "estable" | "sin_datos";
export type UnidadIndicador = "COP" | "unidades" | "dias" | "%" | "conteo";
export type CalidadDatosIndicador = "ALTA" | "MEDIA" | "BAJA";

export interface AccionIndicador {
  /** Etiqueta visible del botón, ej. "Ver facturas". */
  label: string;
  /** Ruta interna de RicoSoft a la que navega — nunca ejecuta la acción por sí sola. */
  ruta: string;
}

export interface IndicadorGerencial {
  id: string;
  categoria: CategoriaIndicador;
  titulo: string;
  valor: number;
  unidad: UnidadIndicador;
  tendencia: TendenciaIndicador;
  /** % de variación vs período anterior — null cuando no hay base de comparación real. */
  variacionPct: number | null;
  periodo: string;
  /** Impacto económico asociado, cuando es distinto del propio valor (ej. "20 productos" con impacto en $). Null si no aplica. */
  impacto: number | null;
  nivel: NivelIndicador;
  /** Null cuando el indicador no depende de historial de ventas (ej. un conteo de facturas). */
  calidadDatos: CalidadDatosIndicador | null;
  fuente: string;
  detalle: Record<string, unknown>;
  accion: AccionIndicador | null;
}

// ---- Entradas: exactamente lo que cada módulo existente ya devuelve ----

export interface EntradaFinanzas {
  totalCxP: number;
  valorVencido: number;
  valorProximoAVencer: number;
  concentracionTopProveedor: number | null;
  nombreTopProveedor: string | null;
}

export interface EntradaVentas {
  disponible: boolean;
  netoActual: number;
  netoAnterior: number;
  variacionNetaPct: number | null;
  documentos: number;
  productosTendenciaFuerte: number;
  productosPerdiendoRotacion: number;
  mesesHistoriaDisponibles: number;
}

export interface EntradaInventario {
  disponible: boolean;
  totalValor: number;
  totalValorVendible: number;
  totalComprometidoValor: number;
  valorExceso: number;
  valorObsolescencia: number;
}

export interface EntradaProduccion {
  disponible: boolean;
  resumenProducir: { cantidad: number; unidades: number; impacto: number };
  resumenNoProducir: { cantidad: number; unidades: number; impacto: number };
  planesPorEstado: Record<string, number>;
}

export interface EntradaCompras {
  disponible: boolean;
  resumenComprar: { cantidad: number; unidades: number; impacto: number };
  solicitudesPendientes: number;
  cotizacionesPendientes: number;
}

export interface EntradaRiesgos {
  disponible: boolean;
  resumenLiquidar: { cantidad: number; unidades: number; impacto: number };
  resumenRiesgoQuiebre: { cantidad: number; unidades: number; impacto: number };
  facturasVencidasCantidad: number;
  patronesRecurrentesCantidad: number;
}

export interface EntradasCentroGerencial {
  finanzas: EntradaFinanzas;
  ventas: EntradaVentas;
  inventario: EntradaInventario;
  produccion: EntradaProduccion;
  compras: EntradaCompras;
  riesgos: EntradaRiesgos;
}

function tendenciaDeVariacion(variacionPct: number | null): TendenciaIndicador {
  if (variacionPct === null) return "sin_datos";
  if (variacionPct > 1) return "subida";
  if (variacionPct < -1) return "bajada";
  return "estable";
}

function calidadPorMeses(meses: number): CalidadDatosIndicador {
  if (meses >= 9) return "ALTA";
  if (meses >= 3) return "MEDIA";
  return "BAJA";
}

function indicadoresFinanzas(e: EntradaFinanzas): IndicadorGerencial[] {
  const indicadores: IndicadorGerencial[] = [
    {
      id: "finanzas.cxp_total",
      categoria: "finanzas",
      titulo: "Cuentas por pagar",
      valor: e.totalCxP,
      unidad: "COP",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "Saldo actual",
      impacto: null,
      nivel: e.valorVencido > 0 ? "alto" : "informativo",
      calidadDatos: null,
      fuente: "RicoSoft / Factura + Pago",
      detalle: { valorVencido: e.valorVencido, valorProximoAVencer: e.valorProximoAVencer },
      accion: { label: "Ver cuentas por pagar", ruta: "/analitica" },
    },
  ];

  if (e.valorVencido > 0) {
    indicadores.push({
      id: "finanzas.cxp_vencida",
      categoria: "finanzas",
      titulo: "Facturas vencidas",
      valor: e.valorVencido,
      unidad: "COP",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "A la fecha",
      impacto: null,
      nivel: "critico",
      calidadDatos: null,
      fuente: "RicoSoft / Factura",
      detalle: {},
      accion: { label: "Ver facturas", ruta: "/facturas" },
    });
  }

  if (e.concentracionTopProveedor !== null && e.concentracionTopProveedor > 40) {
    indicadores.push({
      id: "finanzas.concentracion_proveedor",
      categoria: "finanzas",
      titulo: "Concentración de proveedores",
      valor: e.concentracionTopProveedor,
      unidad: "%",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "Saldo actual",
      impacto: e.totalCxP,
      nivel: e.concentracionTopProveedor > 60 ? "critico" : "alto",
      calidadDatos: null,
      fuente: "RicoSoft / Factura",
      detalle: { proveedor: e.nombreTopProveedor },
      accion: { label: "Ver proveedores", ruta: "/proveedores" },
    });
  }

  return indicadores;
}

function indicadoresVentas(e: EntradaVentas): IndicadorGerencial[] {
  if (!e.disponible) return [];
  const calidadDatos = calidadPorMeses(e.mesesHistoriaDisponibles);

  const indicadores: IndicadorGerencial[] = [
    {
      id: "ventas.neto_mes_actual",
      categoria: "ventas",
      titulo: "Ventas del mes",
      valor: e.netoActual,
      unidad: "COP",
      tendencia: tendenciaDeVariacion(e.variacionNetaPct),
      variacionPct: e.variacionNetaPct,
      periodo: "Mes actual vs mes anterior",
      impacto: null,
      nivel: "informativo",
      calidadDatos,
      fuente: "Siesa / v470_ventas + t461_cm_docto_factura_venta",
      detalle: { documentos: e.documentos, netoAnterior: e.netoAnterior },
      accion: { label: "Ver ventas", ruta: "/analitica" },
    },
  ];

  if (e.productosPerdiendoRotacion > 0) {
    indicadores.push({
      id: "ventas.perdiendo_rotacion",
      categoria: "ventas",
      titulo: "Productos perdiendo rotación",
      valor: e.productosPerdiendoRotacion,
      unidad: "conteo",
      tendencia: "bajada",
      variacionPct: null,
      periodo: "Últimos 3 meses vs 9 anteriores",
      impacto: null,
      nivel: e.productosPerdiendoRotacion >= 10 ? "alto" : "medio",
      calidadDatos,
      fuente: "Siesa / v470_ventas",
      detalle: {},
      accion: { label: "Ver demanda", ruta: "/inventario" },
    });
  }

  if (e.productosTendenciaFuerte > 0) {
    indicadores.push({
      id: "ventas.tendencia_fuerte",
      categoria: "ventas",
      titulo: "Productos con tendencia fuerte",
      valor: e.productosTendenciaFuerte,
      unidad: "conteo",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "Últimos 3 meses vs 3 anteriores",
      impacto: null,
      nivel: "informativo",
      calidadDatos,
      fuente: "Siesa / v470_ventas",
      detalle: {},
      accion: { label: "Ver demanda", ruta: "/inventario" },
    });
  }

  return indicadores;
}

function indicadoresInventario(e: EntradaInventario): IndicadorGerencial[] {
  if (!e.disponible) return [];
  return [
    {
      id: "inventario.total",
      categoria: "inventario",
      titulo: "Inventario total",
      valor: e.totalValor,
      unidad: "COP",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "Valor actual",
      impacto: null,
      nivel: "informativo",
      calidadDatos: null,
      fuente: "Siesa / t400_cm_existencia",
      detalle: { vendible: e.totalValorVendible, comprometido: e.totalComprometidoValor },
      accion: { label: "Ver inventario", ruta: "/inventario" },
    },
    {
      id: "inventario.capital_inmovilizado",
      categoria: "inventario",
      titulo: "Capital inmovilizado (riesgo)",
      valor: e.valorExceso + e.valorObsolescencia,
      unidad: "COP",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "Valor actual",
      impacto: null,
      nivel: e.valorObsolescencia > 0 ? "critico" : e.valorExceso > 0 ? "alto" : "informativo",
      calidadDatos: null,
      fuente: "Siesa / t400_cm_existencia + v470_ventas",
      detalle: { exceso: e.valorExceso, obsolescencia: e.valorObsolescencia },
      accion: { label: "Gestionar liquidación", ruta: "/inventario" },
    },
  ];
}

function indicadoresProduccion(e: EntradaProduccion): IndicadorGerencial[] {
  if (!e.disponible) return [];
  const indicadores: IndicadorGerencial[] = [
    {
      id: "produccion.recomendada",
      categoria: "produccion",
      titulo: "Producción recomendada",
      valor: e.resumenProducir.cantidad,
      unidad: "conteo",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "Cálculo actual",
      impacto: e.resumenProducir.impacto,
      nivel: e.resumenProducir.cantidad > 0 ? "medio" : "informativo",
      calidadDatos: null,
      fuente: "RicoSoft / Centro de Decisiones",
      detalle: { unidades: e.resumenProducir.unidades },
      accion: { label: "Ver Centro de Decisiones", ruta: "/inventario" },
    },
  ];

  const planesActivos =
    (e.planesPorEstado["Aprobada"] ?? 0) + (e.planesPorEstado["En producción"] ?? 0);
  indicadores.push({
    id: "produccion.planes_activos",
    categoria: "produccion",
    titulo: "Planes de producción activos",
    valor: planesActivos,
    unidad: "conteo",
    tendencia: "sin_datos",
    variacionPct: null,
    periodo: "Estado actual",
    impacto: null,
    nivel: "informativo",
    calidadDatos: null,
    fuente: "RicoSoft / PlanProduccion",
    detalle: { porEstado: e.planesPorEstado },
    accion: { label: "Ver plan de producción", ruta: "/plan-produccion" },
  });

  return indicadores;
}

function indicadoresCompras(e: EntradaCompras): IndicadorGerencial[] {
  const indicadores: IndicadorGerencial[] = [];

  if (e.disponible && e.resumenComprar.cantidad > 0) {
    indicadores.push({
      id: "compras.necesidades",
      categoria: "compras",
      titulo: "Materiales a comprar",
      valor: e.resumenComprar.cantidad,
      unidad: "conteo",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "Cálculo actual",
      impacto: e.resumenComprar.impacto,
      nivel: "alto",
      calidadDatos: null,
      fuente: "RicoSoft / Centro de Decisiones (BOM + existencia)",
      detalle: {},
      accion: { label: "Ver Centro de Decisiones", ruta: "/inventario" },
    });
  }

  indicadores.push({
    id: "compras.solicitudes_pendientes",
    categoria: "compras",
    titulo: "Solicitudes de compra pendientes",
    valor: e.solicitudesPendientes,
    unidad: "conteo",
    tendencia: "sin_datos",
    variacionPct: null,
    periodo: "Estado actual",
    impacto: null,
    nivel: e.solicitudesPendientes > 0 ? "medio" : "informativo",
    calidadDatos: null,
    fuente: "RicoSoft / SolicitudCompra",
    detalle: { cotizacionesPendientes: e.cotizacionesPendientes },
    accion: { label: "Ver solicitudes de compra", ruta: "/solicitudes-compra" },
  });

  return indicadores;
}

function indicadoresRiesgos(e: EntradaRiesgos): IndicadorGerencial[] {
  const indicadores: IndicadorGerencial[] = [];

  if (e.disponible && e.resumenRiesgoQuiebre.cantidad > 0) {
    indicadores.push({
      id: "riesgos.quiebre",
      categoria: "riesgos",
      titulo: "Riesgo de quiebre de stock",
      valor: e.resumenRiesgoQuiebre.cantidad,
      unidad: "conteo",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "Cálculo actual",
      impacto: e.resumenRiesgoQuiebre.impacto,
      nivel: "critico",
      calidadDatos: null,
      fuente: "Siesa / t400_cm_existencia + v470_ventas",
      detalle: {},
      accion: { label: "Ver Centro de Decisiones", ruta: "/inventario" },
    });
  }

  if (e.disponible && e.resumenLiquidar.cantidad > 0) {
    indicadores.push({
      id: "riesgos.liquidacion",
      categoria: "riesgos",
      titulo: "Candidatos a liquidación",
      valor: e.resumenLiquidar.cantidad,
      unidad: "conteo",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "Cálculo actual",
      impacto: e.resumenLiquidar.impacto,
      nivel: e.resumenLiquidar.impacto > 100_000_000 ? "critico" : "alto",
      calidadDatos: null,
      fuente: "RicoSoft / domain/planeacion/liquidacion.ts",
      detalle: {},
      accion: { label: "Gestionar liquidación", ruta: "/inventario" },
    });
  }

  if (e.facturasVencidasCantidad > 0) {
    indicadores.push({
      id: "riesgos.facturas_vencidas",
      categoria: "riesgos",
      titulo: "Facturas vencidas sin pagar",
      valor: e.facturasVencidasCantidad,
      unidad: "conteo",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "A la fecha",
      impacto: null,
      nivel: "critico",
      calidadDatos: null,
      fuente: "RicoSoft / Factura",
      detalle: {},
      accion: { label: "Ver facturas", ruta: "/facturas" },
    });
  }

  if (e.patronesRecurrentesCantidad > 0) {
    indicadores.push({
      id: "riesgos.diferencias_recurrentes",
      categoria: "riesgos",
      titulo: "Diferencias recurrentes en toma física",
      valor: e.patronesRecurrentesCantidad,
      unidad: "conteo",
      tendencia: "sin_datos",
      variacionPct: null,
      periodo: "Histórico de tomas cerradas",
      impacto: null,
      nivel: "medio",
      calidadDatos: null,
      fuente: "RicoSoft / TomaFisica",
      detalle: {},
      accion: { label: "Ver toma física", ruta: "/toma-fisica" },
    });
  }

  return indicadores;
}

/**
 * Compone todos los indicadores del Centro Gerencial a partir de entradas
 * ya calculadas por los módulos existentes. Función pura — sin I/O — para
 * poder probarla con datos fabricados.
 */
export function construirIndicadoresGerenciales(
  entradas: EntradasCentroGerencial,
): IndicadorGerencial[] {
  return [
    ...indicadoresFinanzas(entradas.finanzas),
    ...indicadoresVentas(entradas.ventas),
    ...indicadoresInventario(entradas.inventario),
    ...indicadoresProduccion(entradas.produccion),
    ...indicadoresCompras(entradas.compras),
    ...indicadoresRiesgos(entradas.riesgos),
  ];
}

export interface ResumenPorCategoria {
  categoria: CategoriaIndicador;
  cantidad: number;
  criticos: number;
  altos: number;
}

export function resumirPorCategoria(indicadores: IndicadorGerencial[]): ResumenPorCategoria[] {
  const categorias: CategoriaIndicador[] = [
    "finanzas",
    "ventas",
    "inventario",
    "produccion",
    "compras",
    "riesgos",
  ];
  return categorias.map((categoria) => {
    const grupo = indicadores.filter((i) => i.categoria === categoria);
    return {
      categoria,
      cantidad: grupo.length,
      criticos: grupo.filter((i) => i.nivel === "critico").length,
      altos: grupo.filter((i) => i.nivel === "alto").length,
    };
  });
}
