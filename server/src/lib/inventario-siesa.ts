import type {
  ExistenciaItemSiesa,
  NaturalezaInventario,
} from "../modules/integraciones-siesa/siesa-inventario.service";

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Clasificación de inventario — v1 (Bloque 1 del módulo Producción &
 * Planeación). Usa dos señales reales: la naturaleza del ítem
 * (t120_mc_items.f120_ind_tipo_item + f120_ind_venta — ver naturaleza en
 * siesa-inventario.service.ts) y, solo para mercancía ("producto"), días
 * desde la última venta registrada (t400_cm_existencia.f400_fecha_ult_venta).
 *
 * NO es todavía la clasificación completa de 7 categorías propuesta
 * (vendible/comprometido/reservado/exceso/obsoleto/liquidación/no
 * vendible por daño/vencimiento) — eso requiere reglas de negocio (qué es
 * "reservado para una empresa", qué hace algo "no vendible" por calidad)
 * que no están en los datos de Siesa y deben definirse con el equipo antes
 * de construirlas. Esta v1 es deliberadamente conservadora.
 *
 * - "servicio"/"repuesto"/"insumo": naturaleza distinta de "producto" —
 *   nunca entran en exceso/obsolescencia: nunca fueron mercancía para
 *   vender, así que "sin vender hace 200 días" no significa nada para
 *   ellos.
 * - "vendible": producto que vendió en los últimos `diasVendible` días.
 * - "exceso": producto sin vender entre `diasVendible` y `diasExceso` días.
 * - "obsolescencia": producto sin vender hace más de `diasExceso` días.
 * - "sin_movimiento": producto que nunca se ha vendido — puede ser un
 *   ítem nuevo o uno descontinuado; merece revisión aparte.
 */
export type ClasificacionInventario =
  "vendible" | "exceso" | "obsolescencia" | "sin_movimiento" | "servicio" | "repuesto" | "insumo";

/**
 * "liquidar" (obsolescencia) o "revisar" (exceso) — null para el resto. NO
 * incluye un "ahorro estimado" en pesos: eso requeriría asumir una tasa de
 * costo de capital o un % de descuento de liquidación que no viene de
 * ningún dato real de Siesa/RicoSoft — inventar esa tasa violaría la misma
 * regla que ya se ha seguido todo este módulo. `valorTotal` (capital que se
 * libera al liquidar) es la cifra real que sí se puede mostrar.
 */
export type AccionInventario = "liquidar" | "revisar" | null;

export interface ItemInventarioClasificado {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  naturaleza: NaturalezaInventario;
  cantidadExistente: number;
  cantidadComprometida: number;
  valorTotal: number;
  /** Null = nunca se ha vendido (sin fecha registrada en Siesa). */
  diasSinVenta: number | null;
  clasificacion: ClasificacionInventario;
  accionRecomendada: AccionInventario;
  /** t120_mc_items.f120_id_unidad_inventario — KG, UNID, M, GL, etc. No todo el catálogo es kilos. */
  unidadMedida: string | null;
}

export interface BucketInventario {
  valor: number;
  items: number;
}

export interface ResumenInventarioSiesa {
  /** Valor de TODO el inventario, incluidos servicios/repuestos/insumos no vendibles. */
  totalValor: number;
  /** Valor de solo la mercancía vendible (naturaleza="producto"). */
  totalValorVendible: number;
  /** Estimado: (cantidadComprometida / cantidadExistente) × valorTotal, por ítem, sumado. */
  totalComprometidoValor: number;
  buckets: Record<ClasificacionInventario, BucketInventario>;
  /** Productos en "exceso" u "obsolescencia", ordenados por valor descendente — candidatos a revisar/liquidar. */
  topRiesgo: ItemInventarioClasificado[];
}

/**
 * Umbrales de días para clasificar mercancía por antigüedad de venta —
 * centralizados aquí (Parte 16 del plan) en vez de números sueltos en la
 * lógica, para poder ajustarlos por tenant sin tocar el cálculo. El
 * llamador (controller) decide de dónde vienen: por ahora los valores por
 * defecto; cuando exista configuración por tenant, se pasan aquí.
 */
export interface UmbralesInventario {
  /** <= este valor de días sin venta: "vendible". */
  diasVendible: number;
  /** <= este valor (y > diasVendible): "exceso"; > este valor: "obsolescencia". */
  diasExceso: number;
}

export const UMBRALES_INVENTARIO_DEFECTO: UmbralesInventario = {
  diasVendible: 60,
  diasExceso: 180,
};

function clasificar(
  naturaleza: NaturalezaInventario,
  diasSinVenta: number | null,
  umbrales: UmbralesInventario,
): ClasificacionInventario {
  if (naturaleza !== "producto") return naturaleza;
  if (diasSinVenta === null) return "sin_movimiento";
  if (diasSinVenta <= umbrales.diasVendible) return "vendible";
  if (diasSinVenta <= umbrales.diasExceso) return "exceso";
  return "obsolescencia";
}

function accionRecomendada(clasificacion: ClasificacionInventario): AccionInventario {
  if (clasificacion === "obsolescencia") return "liquidar";
  if (clasificacion === "exceso") return "revisar";
  return null;
}

/**
 * Resume el inventario real (existencias) en un panorama gerencial: valor
 * total, valor comprometido, y una clasificación conservadora que separa
 * mercancía de servicios/repuestos/insumos, y luego clasifica la mercancía
 * por antigüedad de venta. Función pura — sin I/O — probada con datos
 * fabricados; la consulta SQL ya se verificó en vivo (ver
 * siesa-inventario.service.ts).
 */
export function calcularResumenInventarioSiesa(
  existencias: ExistenciaItemSiesa[],
  ahora: Date,
  umbrales: UmbralesInventario = UMBRALES_INVENTARIO_DEFECTO,
): ResumenInventarioSiesa {
  const buckets: Record<ClasificacionInventario, BucketInventario> = {
    vendible: { valor: 0, items: 0 },
    exceso: { valor: 0, items: 0 },
    obsolescencia: { valor: 0, items: 0 },
    sin_movimiento: { valor: 0, items: 0 },
    servicio: { valor: 0, items: 0 },
    repuesto: { valor: 0, items: 0 },
    insumo: { valor: 0, items: 0 },
  };

  let totalValor = 0;
  let totalValorVendible = 0;
  let totalComprometidoValor = 0;
  const clasificados: ItemInventarioClasificado[] = [];

  for (const e of existencias) {
    const diasSinVenta = e.fechaUltimaVenta
      ? Math.floor((ahora.getTime() - new Date(e.fechaUltimaVenta).getTime()) / DIA_MS)
      : null;
    const clasificacion = clasificar(e.naturaleza, diasSinVenta, umbrales);

    totalValor += e.valorTotal;
    if (e.naturaleza === "producto") totalValorVendible += e.valorTotal;
    // Costo unitario derivado del total de Siesa (no viene un campo de valor
    // comprometido directo) — si no hay existencia, no hay base para
    // estimar el valor de lo comprometido.
    if (e.cantidadExistente > 0) {
      const costoUnitario = e.valorTotal / e.cantidadExistente;
      totalComprometidoValor += costoUnitario * e.cantidadComprometida;
    }

    buckets[clasificacion].valor += e.valorTotal;
    buckets[clasificacion].items += 1;

    clasificados.push({
      itemRowId: e.itemRowId,
      descripcion: e.descripcion,
      referencia: e.referencia,
      naturaleza: e.naturaleza,
      cantidadExistente: e.cantidadExistente,
      cantidadComprometida: e.cantidadComprometida,
      valorTotal: e.valorTotal,
      diasSinVenta,
      clasificacion,
      accionRecomendada: accionRecomendada(clasificacion),
      unidadMedida: e.unidadMedida,
    });
  }

  const topRiesgo = clasificados
    .filter((c) => c.clasificacion === "exceso" || c.clasificacion === "obsolescencia")
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, 15);

  return { totalValor, totalValorVendible, totalComprometidoValor, buckets, topRiesgo };
}
