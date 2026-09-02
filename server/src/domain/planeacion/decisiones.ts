import type { ItemInventarioClasificado, ResumenInventarioSiesa } from "../../lib/inventario-siesa";
import type { PronosticoProductoSiesa } from "../../lib/demanda-siesa";
import type { RecomendacionProduccionSiesa } from "../../lib/produccion-siesa";
import type { NecesidadAbastecimientoSiesa } from "../../lib/abastecimiento-siesa";
import type { ItemCoberturaSiesa } from "../../lib/cobertura-siesa";
import { calcularCapacidadProductivaSiesa, type CapacidadProductivaSiesa } from "./capacidad-productiva";
import { calcularCandidatosLiquidacionSiesa, type CandidatoLiquidacionSiesa } from "./liquidacion";
import type { VentanasDemanda, CalidadDatos } from "./demanda";
import type { InventarioObjetivoItem } from "./inventario-objetivo";
import type { ComponenteBomSiesa } from "../../modules/integraciones-siesa/siesa-manufactura.service";
import type { ExistenciaItemSiesa } from "../../modules/integraciones-siesa/siesa-inventario.service";

/**
 * Centro de Decisiones — Fase F del Centro de Planeación. Capa de dominio,
 * SEPARADA de los controllers y del frontend: compone lo que ya calculan
 * lib/inventario-siesa.ts, lib/demanda-siesa.ts, lib/produccion-siesa.ts,
 * lib/abastecimiento-siesa.ts, lib/cobertura-siesa.ts y este mismo dominio
 * (capacidad-productiva.ts, liquidacion.ts) en una sola lista de
 * DecisionPlaneacion explicables: QUÉ, CUÁNTO, POR QUÉ, IMPACTO, CONFIANZA.
 *
 * NO recalcula nada que ya exista — solo interpreta y explica los
 * resultados de los módulos anteriores para Gerencia. Ningún dato se
 * inventa: cuando una señal no está disponible (ej. "CUÁNDO" necesitaría
 * una fecha de necesidad que Siesa no reporta, ver lib/produccion-siesa.ts),
 * el campo queda null en vez de simularse.
 */
export type TipoDecision =
  | "producir"
  | "comprar"
  | "liquidar"
  | "no_producir"
  | "riesgo_quiebre";

export type Prioridad = "alta" | "media" | "baja";
export type Confianza = "alta" | "media" | "baja";

/**
 * Datos estructurados de respaldo por tipo de decisión — el frontend los
 * lee directamente para mostrar "por qué" sin recalcular nada. Cada campo
 * viene de un cálculo que ya existía (produccion-siesa.ts,
 * capacidad-productiva.ts, abastecimiento-siesa.ts, liquidacion.ts,
 * cobertura-siesa.ts) — ninguno se inventa aquí. Opcional por tipo: solo
 * trae las claves relevantes para ese tipo de decisión.
 */
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
  // Fase 3/6: ventanas móviles de venta real y el inventario objetivo derivado
  // de ellas — presentes solo cuando el llamador pasó ventanasDemanda/
  // inventarioObjetivoPorItem a construirDecisionesPlaneacion (opcional,
  // ver Fase H). Ausentes = no se recalcularon con datos más finos que el
  // pronóstico mensual ya existente, nunca se inventan.
  ventas30d?: number;
  ventas90d?: number;
  ventas180d?: number;
  stockObjetivo?: number;
  excedenteSobreObjetivo?: number;
  calidadDatos?: CalidadDatos;
}

export interface DecisionPlaneacion {
  tipo: TipoDecision;
  itemRowId: number;
  titulo: string;
  referencia: string | null;
  cantidad: number | null;
  unidadMedida: string | null;
  /** Null: Siesa no reporta una fecha de necesidad calculable con los datos actuales (documentado, no inventado). */
  cuando: null;
  motivo: string;
  impacto: number;
  prioridad: Prioridad;
  confianza: Confianza;
  /** Fase 12 — explicabilidad: de qué consulta/tabla real sale este número, y con qué calidad de historia. */
  fuente: string;
  detalle: DetalleDecision;
  accion: {
    tipo: "plan-produccion" | "solicitud-compra" | "gestion-liquidacion" | "detalle";
    itemRowId: number;
    descripcion: string | null;
    cantidad?: number;
  };
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

/** Confianza según cuántos meses de historia real de venta respaldan la señal — nunca inventada. */
function confianzaPorHistorial(mesesConVenta: number | undefined): Confianza {
  if (mesesConVenta === undefined) return "baja";
  if (mesesConVenta >= 6) return "alta";
  if (mesesConVenta >= 1) return "media";
  return "baja";
}

/**
 * Fase 12 — texto de trazabilidad de cada decisión: siempre nombra la
 * fuente real (nunca genérica tipo "sistema"), y si hay una ventana de
 * demanda disponible para el ítem, agrega su calidad de datos — así el
 * lector sabe si "confianza alta" está respaldada por 12 meses reales o
 * por apenas 1-2.
 */
function construirFuente(base: string, calidadDatos: CalidadDatos | undefined): string {
  return calidadDatos ? `${base}. Calidad de datos: ${calidadDatos}.` : base;
}

function decisionesProduccion(
  capacidades: CapacidadProductivaSiesa[],
  recomendacionPorItem: Map<number, RecomendacionProduccionSiesa>,
  costoUnitarioPorItem: Map<number, number>,
  mesesConVentaPorItem: Map<number, number>,
  ventanasPorItem: Map<number, VentanasDemanda>,
  inventarioObjetivoPorItem: Map<number, InventarioObjetivoItem>,
): DecisionPlaneacion[] {
  return capacidades.map((c) => {
    const costoUnitario = costoUnitarioPorItem.get(c.itemRowId) ?? 0;
    const r = recomendacionPorItem.get(c.itemRowId);
    const ventana = ventanasPorItem.get(c.itemRowId);
    const objetivo = inventarioObjetivoPorItem.get(c.itemRowId);
    const cantidadAProducir =
      c.capacidadMaxima !== null ? Math.min(c.produccionRecomendada, c.capacidadMaxima) : c.produccionRecomendada;

    const motivo =
      c.deficitProductivo > 0
        ? `La demanda esperada requiere producir ${Math.round(c.produccionRecomendada)}, pero la materia prima disponible (limitada por "${c.materialLimitante?.descripcion ?? "un componente"}") solo alcanza para ${Math.round(c.capacidadMaxima ?? 0)} — faltan materiales para completar el resto.`
        : `La demanda esperada supera el inventario disponible considerando compromisos y lo ya en camino.`;

    return {
      tipo: "producir" as const,
      itemRowId: c.itemRowId,
      titulo: c.descripcion ?? `Ítem ${c.itemRowId}`,
      referencia: c.referencia,
      cantidad: cantidadAProducir,
      unidadMedida: c.unidadMedida,
      cuando: null,
      motivo,
      impacto: cantidadAProducir * costoUnitario,
      prioridad: c.deficitProductivo > 0 ? "alta" : "media",
      confianza: confianzaPorHistorial(mesesConVentaPorItem.get(c.itemRowId)),
      fuente: construirFuente(
        "Siesa: t400_cm_existencia (inventario), v470_ventas (demanda), t820_mf_lista_material (BOM)",
        ventana?.calidadDatos,
      ),
      detalle: {
        demandaProyectada: r?.demandaProyectada,
        inventarioDisponible: r?.inventarioDisponible,
        pedidosComprometidos: r?.pedidosComprometidos,
        capacidadMaxima: c.capacidadMaxima,
        materialLimitante: c.materialLimitante?.descripcion ?? null,
        deficitProductivo: c.deficitProductivo,
        ventas30d: ventana?.ventas30d,
        ventas90d: ventana?.ventas90d,
        ventas180d: ventana?.ventas180d,
        stockObjetivo: objetivo?.stockObjetivo,
        calidadDatos: ventana?.calidadDatos,
      },
      accion: { tipo: "plan-produccion", itemRowId: c.itemRowId, descripcion: c.descripcion, cantidad: cantidadAProducir },
    };
  });
}

function decisionesCompra(
  necesidades: NecesidadAbastecimientoSiesa[],
  costoUnitarioPorItem: Map<number, number>,
): DecisionPlaneacion[] {
  return necesidades.map((n) => ({
    tipo: "comprar" as const,
    itemRowId: n.componenteRowId,
    titulo: n.descripcion ?? `Ítem ${n.componenteRowId}`,
    referencia: n.referencia,
    cantidad: n.deficit,
    unidadMedida: null,
    cuando: null,
    motivo: `Se necesitan ${Math.round(n.cantidadNecesaria)} para cubrir la producción recomendada; solo hay ${Math.round(n.cantidadDisponible)} disponibles.`,
    impacto: n.deficit * (costoUnitarioPorItem.get(n.componenteRowId) ?? 0),
    prioridad: n.deficit > n.cantidadDisponible ? "alta" : "media",
    // Sin historial de compras de materia prima disponible todavía (solo se lee existencia) — confianza media por defecto.
    confianza: "media" as const,
    fuente: "Siesa: t400_cm_existencia (existencia de materia prima) + t820_mf_lista_material (BOM) sobre la producción recomendada.",
    detalle: { cantidadNecesaria: n.cantidadNecesaria, cantidadDisponible: n.cantidadDisponible, deficit: n.deficit },
    accion: { tipo: "solicitud-compra", itemRowId: n.componenteRowId, descripcion: n.descripcion, cantidad: n.deficit },
  }));
}

function decisionesLiquidacion(
  candidatos: CandidatoLiquidacionSiesa[],
  ventanasPorItem: Map<number, VentanasDemanda>,
): DecisionPlaneacion[] {
  return candidatos.map((c) => {
    const ventana = ventanasPorItem.get(c.itemRowId);
    return {
      tipo: "liquidar" as const,
      itemRowId: c.itemRowId,
      titulo: c.descripcion ?? `Ítem ${c.itemRowId}`,
      referencia: c.referencia,
      cantidad: c.cantidadExistente,
      unidadMedida: c.unidadMedida,
      cuando: null,
      motivo:
        c.diasSinVenta === null
          ? `Nunca ha registrado una venta — ${(c.valorTotal / 1_000_000).toFixed(1)}M de capital inmovilizado.`
          : `Sin vender hace ${c.diasSinVenta} días, con ${c.ventaPromedioMensual > 0 ? `demanda reciente baja (${Math.round(c.ventaPromedioMensual)}/mes)` : "sin demanda reciente"} — ${(c.valorTotal / 1_000_000).toFixed(1)}M de capital inmovilizado.`,
      impacto: c.valorTotal,
      prioridad: c.prioridad === "CRITICA" || c.prioridad === "ALTA" ? "alta" : c.prioridad === "MEDIA" ? "media" : "baja",
      confianza: c.diasSinVenta !== null ? "alta" : "media",
      fuente: construirFuente(
        "Siesa: t400_cm_existencia (existencia/valor) + v470_ventas (última venta, demanda reciente)",
        ventana?.calidadDatos,
      ),
      detalle: {
        score: c.score,
        categoriaLiquidacion: c.prioridad,
        cantidadExistente: c.cantidadExistente,
        diasSinVenta: c.diasSinVenta,
        ventaPromedioMensual: c.ventaPromedioMensual,
        ventas30d: ventana?.ventas30d,
        ventas90d: ventana?.ventas90d,
        calidadDatos: ventana?.calidadDatos,
      },
      accion: { tipo: "gestion-liquidacion", itemRowId: c.itemRowId, descripcion: c.descripcion },
    };
  });
}

function decisionesNoProducir(
  topRiesgo: ItemInventarioClasificado[],
  ventaPromedioPorItem: Map<number, number>,
  ventanasPorItem: Map<number, VentanasDemanda>,
  inventarioObjetivoPorItem: Map<number, InventarioObjetivoItem>,
): DecisionPlaneacion[] {
  return topRiesgo
    .filter((it) => it.clasificacion === "exceso" || it.clasificacion === "obsolescencia")
    .map((it) => {
      const ventana = ventanasPorItem.get(it.itemRowId);
      const objetivo = inventarioObjetivoPorItem.get(it.itemRowId);
      return {
        tipo: "no_producir" as const,
        itemRowId: it.itemRowId,
        titulo: it.descripcion ?? `Ítem ${it.itemRowId}`,
        referencia: it.referencia,
        cantidad: it.cantidadExistente,
        unidadMedida: it.unidadMedida,
        cuando: null,
        motivo:
          objetivo && objetivo.excedente > 0
            ? `El inventario actual (${Math.round(it.cantidadExistente)}) supera el inventario objetivo en ${Math.round(objetivo.excedente)} unidades — producir más aumentaría el exceso.`
            : `Existe inventario suficiente (${Math.round(it.cantidadExistente)} unidades, sin vender hace ${it.diasSinVenta} días) para cubrir la demanda proyectada — producir más aumentaría el exceso.`,
        impacto: it.valorTotal,
        prioridad: "media" as const,
        confianza: "alta" as const,
        fuente: construirFuente(
          "Siesa: t400_cm_existencia (existencia) + v470_ventas (demanda reciente)",
          ventana?.calidadDatos,
        ),
        detalle: {
          cantidadExistente: it.cantidadExistente,
          diasSinVenta: it.diasSinVenta,
          ventaPromedioMensual: ventaPromedioPorItem.get(it.itemRowId) ?? 0,
          ventas30d: ventana?.ventas30d,
          ventas90d: ventana?.ventas90d,
          stockObjetivo: objetivo?.stockObjetivo,
          excedenteSobreObjetivo: objetivo?.excedente,
          calidadDatos: ventana?.calidadDatos,
        },
        accion: { tipo: "detalle", itemRowId: it.itemRowId, descripcion: it.descripcion },
      };
    });
}

function decisionesRiesgoQuiebre(riesgoRuptura: ItemCoberturaSiesa[]): DecisionPlaneacion[] {
  return riesgoRuptura.map((it) => ({
    tipo: "riesgo_quiebre" as const,
    itemRowId: it.itemRowId,
    titulo: it.descripcion ?? `Ítem ${it.itemRowId}`,
    referencia: it.referencia,
    cantidad: it.existenciaDisponible,
    unidadMedida: it.unidadMedida,
    cuando: null,
    motivo: `Solo quedan ${it.diasCobertura} días de cobertura al ritmo de venta actual (${Math.round(it.ventaPromedioMensual)}/mes).`,
    impacto: 0,
    prioridad: "alta" as const,
    confianza: "alta" as const,
    fuente: "Siesa: t400_cm_existencia (existencia) + v470_ventas (venta promedio mensual, 12 meses).",
    detalle: {
      cantidadExistente: it.existenciaDisponible,
      ventaPromedioMensual: it.ventaPromedioMensual,
      diasCobertura: it.diasCobertura,
    },
    // Lleva al mismo flujo de solicitud de compra que "comprar" — sin cantidad
    // sugerida porque no existe una fórmula real de déficit de PRODUCTO
    // TERMINADO (solo de materia prima, ver abastecimiento-siesa.ts):
    // inventarla sería un dato falso, se deja que el usuario decida cuánto pedir.
    accion: { tipo: "solicitud-compra", itemRowId: it.itemRowId, descripcion: it.descripcion },
  }));
}

/**
 * Orquesta el Centro de Decisiones completo. Recibe los resultados YA
 * calculados por los módulos existentes (el controller es quien decide de
 * dónde vienen — Siesa en vivo, con sus mismos umbrales configurables) y
 * los combina en una lista única, priorizada, explicable.
 */
export function construirDecisionesPlaneacion(params: {
  resumenInventario: ResumenInventarioSiesa;
  pronostico: PronosticoProductoSiesa[];
  produccionRecomendada: RecomendacionProduccionSiesa[];
  necesidadesAbastecimiento: NecesidadAbastecimientoSiesa[];
  riesgoRuptura: ItemCoberturaSiesa[];
  bom: ComponenteBomSiesa[];
  existencias: ExistenciaItemSiesa[];
  /** Fase 3 (opcional) — ventanas de 30/90/180 días por ítem; sin esto, las decisiones siguen funcionando igual que antes, solo sin ese detalle adicional. */
  ventanasDemanda?: VentanasDemanda[];
  /** Fase 6 (opcional) — inventario objetivo por ítem, calculado a partir de ventanasDemanda. */
  inventarioObjetivo?: InventarioObjetivoItem[];
}): { decisiones: DecisionPlaneacion[]; resumen: ResumenDecisionesPlaneacion } {
  const costoUnitarioPorItem = new Map(
    params.existencias
      .filter((e) => e.cantidadExistente > 0)
      .map((e) => [e.itemRowId, e.valorTotal / e.cantidadExistente]),
  );
  const mesesConVentaPorItem = new Map(params.pronostico.map((p) => [p.itemRowId, p.mesesConVenta]));
  const ventaPromedioPorItem = new Map(params.pronostico.map((p) => [p.itemRowId, p.ventaPromedioMensual]));
  const recomendacionPorItem = new Map(params.produccionRecomendada.map((r) => [r.itemRowId, r]));
  const ventanasPorItem = new Map((params.ventanasDemanda ?? []).map((v) => [v.itemRowId, v]));
  const inventarioObjetivoPorItem = new Map((params.inventarioObjetivo ?? []).map((o) => [o.itemRowId, o]));

  const capacidades = calcularCapacidadProductivaSiesa(
    params.produccionRecomendada,
    params.bom,
    params.existencias,
  );
  const candidatosLiquidacion = calcularCandidatosLiquidacionSiesa(
    params.resumenInventario.topRiesgo,
    ventaPromedioPorItem,
  );

  const decisiones: DecisionPlaneacion[] = [
    ...decisionesProduccion(
      capacidades,
      recomendacionPorItem,
      costoUnitarioPorItem,
      mesesConVentaPorItem,
      ventanasPorItem,
      inventarioObjetivoPorItem,
    ),
    ...decisionesCompra(params.necesidadesAbastecimiento, costoUnitarioPorItem),
    ...decisionesLiquidacion(candidatosLiquidacion, ventanasPorItem),
    ...decisionesNoProducir(params.resumenInventario.topRiesgo, ventaPromedioPorItem, ventanasPorItem, inventarioObjetivoPorItem),
    ...decisionesRiesgoQuiebre(params.riesgoRuptura),
  ];

  const resumen: ResumenDecisionesPlaneacion = {
    producir: reducirGrupo(decisiones, "producir"),
    comprar: reducirGrupo(decisiones, "comprar"),
    liquidar: reducirGrupo(decisiones, "liquidar"),
    no_producir: reducirGrupo(decisiones, "no_producir"),
    riesgo_quiebre: reducirGrupo(decisiones, "riesgo_quiebre"),
  };

  return { decisiones, resumen };
}

function reducirGrupo(decisiones: DecisionPlaneacion[], tipo: TipoDecision): ResumenGrupoDecisiones {
  const grupo = decisiones.filter((d) => d.tipo === tipo);
  return {
    cantidad: grupo.length,
    unidades: grupo.reduce((acc, d) => acc + (d.cantidad ?? 0), 0),
    impacto: grupo.reduce((acc, d) => acc + d.impacto, 0),
  };
}
