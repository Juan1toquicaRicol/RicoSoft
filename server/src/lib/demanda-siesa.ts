import type { VentaMensualProductoSiesa } from "../modules/integraciones-siesa/siesa-ventas.service";

/**
 * Pronóstico de demanda — Bloque 2 del módulo Producción & Inventario.
 * Motor determinístico (sin IA) sobre los últimos 12 meses YA COMPLETADOS
 * de venta real por producto (nunca el mes actual, que está parcial).
 *
 * Deliberadamente NO incluye estacionalidad por mes calendario (ej. "este
 * producto siempre vende más en diciembre"): detectar eso de forma
 * confiable requiere varios años de historia comparable, y solo se
 * verificó que hay ~12 meses de datos de línea de venta reales
 * (v470_ventas) disponibles hoy. Tampoco incluye demanda por
 * empresa/cliente todavía — eso es una extensión natural de este mismo
 * archivo cuando se necesite.
 *
 * Señales calculadas, todas verificables y explicadas:
 * - ventaPromedioMensual: promedio sobre los 12 meses completos,
 *   INCLUYENDO los meses sin venta (no solo los meses activos) — así un
 *   producto estacional no aparenta una demanda constante que no tiene.
 * - tendenciaPct: variación % entre el promedio de los últimos 3 meses
 *   completos y el promedio de los 3 meses anteriores a esos.
 * - coeficienteVariacion: desviación estándar ÷ promedio, sobre los 12
 *   meses — mientras más alto, más irregular es la demanda mes a mes.
 *   demandaIrregular = coeficienteVariacion > 0.75 (umbral documentado, no
 *   un estándar universal — ajustable si el negocio lo pide).
 * - perdiendoRotacion: el promedio de los últimos 3 meses cayó a menos de
 *   la mitad del promedio de los 9 meses anteriores a esos (y esa base
 *   anterior era realmente >0 — un producto que nunca vendió antes no
 *   puede estar "perdiendo" algo que no tenía).
 */
const UMBRAL_VARIABILIDAD_ALTA = 0.75;
const UMBRAL_PERDIDA_ROTACION = 0.5;
const UMBRAL_TENDENCIA_FUERTE_PCT = 20;
const VENTANA_MESES = 12;

function mesesAtras(ahora: Date, n: number): { anio: number; mes: number } {
  const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - n, 1));
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

function claveMes(m: { anio: number; mes: number }): string {
  return `${m.anio}-${m.mes}`;
}

function promedio(valores: number[]): number {
  return valores.length > 0 ? valores.reduce((acc, v) => acc + v, 0) / valores.length : 0;
}

function desviacionEstandar(valores: number[], media: number): number {
  if (valores.length === 0) return 0;
  const varianza = valores.reduce((acc, v) => acc + (v - media) ** 2, 0) / valores.length;
  return Math.sqrt(varianza);
}

export interface PronosticoProductoSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  ventaPromedioMensual: number;
  /** Null cuando no hay base de comparación (3 meses previos en 0). */
  tendenciaPct: number | null;
  /** Null cuando el promedio de los 12 meses es 0 (no aplica variabilidad). */
  coeficienteVariacion: number | null;
  demandaIrregular: boolean;
  perdiendoRotacion: boolean;
  mesesConVenta: number;
}

export interface PronosticoDemandaSiesa {
  /** Top 15 productos por venta promedio mensual — el "core" de la demanda. */
  topDemanda: PronosticoProductoSiesa[];
  /** Productos con perdiendoRotacion=true, top 15 por venta promedio (los que más pesan si se pierden). */
  perdiendoRotacion: PronosticoProductoSiesa[];
  /** Productos con |tendenciaPct| >= 20%, top 15 por magnitud de la tendencia. */
  tendenciaFuerte: PronosticoProductoSiesa[];
  /** TODOS los productos con actividad en los 12 meses (sin recortar) — usado por producción recomendada, no expuesto en el dashboard de demanda. */
  todos: PronosticoProductoSiesa[];
}

/**
 * Calcula el pronóstico de demanda a partir de ventas mensuales reales por
 * producto. Función pura — sin I/O — probada con datos fabricados; la
 * consulta SQL ya se verificó en vivo (ver siesa-ventas.service.ts).
 */
export function calcularPronosticoDemandaSiesa(
  ventasMensuales: VentaMensualProductoSiesa[],
  ahora: Date,
): PronosticoDemandaSiesa {
  const meses = Array.from({ length: VENTANA_MESES }, (_, i) => mesesAtras(ahora, i + 1));
  const ultimos3 = meses.slice(0, 3);
  const anteriores3 = meses.slice(3, 6);
  const nueveAnteriores = meses.slice(3, 12);

  const porProducto = new Map<
    number,
    { descripcion: string | null; referencia: string | null; unidadMedida: string | null; porMes: Map<string, number> }
  >();
  for (const v of ventasMensuales) {
    let p = porProducto.get(v.itemRowId);
    if (!p) {
      p = { descripcion: v.descripcion, referencia: v.referencia, unidadMedida: v.unidadMedida, porMes: new Map() };
      porProducto.set(v.itemRowId, p);
    }
    const clave = `${v.anio}-${v.mes}`;
    p.porMes.set(clave, (p.porMes.get(clave) ?? 0) + v.cantidad);
  }

  const productos: PronosticoProductoSiesa[] = [];
  for (const [itemRowId, p] of porProducto) {
    const serie12 = meses.map((m) => p.porMes.get(claveMes(m)) ?? 0);
    // Sin ninguna venta dentro de los 12 meses completos (ej. su única venta
    // cae en el mes actual, parcial, y no cuenta todavía) — no aporta nada
    // al pronóstico, se omite en vez de mostrar un producto en ceros.
    if (serie12.every((c) => c === 0)) continue;

    const ventaPromedioMensual = promedio(serie12);
    const mesesConVenta = serie12.filter((c) => c > 0).length;

    const avgUltimos3 = promedio(ultimos3.map((m) => p.porMes.get(claveMes(m)) ?? 0));
    const avgAnteriores3 = promedio(anteriores3.map((m) => p.porMes.get(claveMes(m)) ?? 0));
    // Base mínima para que el % de tendencia sea un dato útil: si el
    // promedio anterior es "ruido" frente al volumen típico del producto
    // (ej. pasó de 1 a 300 unidades), el % se dispara a miles y deja de
    // decir nada — se reporta null en vez de un número técnicamente
    // correcto pero inútil. Verificado en vivo: sin este umbral aparecían
    // tendencias de +14.175% en productos reales.
    const baseMinima = Math.max(1, ventaPromedioMensual * 0.05);
    const tendenciaPct =
      avgAnteriores3 >= baseMinima
        ? Math.round(((avgUltimos3 - avgAnteriores3) / avgAnteriores3) * 1000) / 10
        : null;

    const avgBaseAnterior = promedio(nueveAnteriores.map((m) => p.porMes.get(claveMes(m)) ?? 0));
    const perdiendoRotacion = avgBaseAnterior > 0 && avgUltimos3 < avgBaseAnterior * UMBRAL_PERDIDA_ROTACION;

    const desviacion = desviacionEstandar(serie12, ventaPromedioMensual);
    const coeficienteVariacion = ventaPromedioMensual > 0 ? desviacion / ventaPromedioMensual : null;
    const demandaIrregular = coeficienteVariacion !== null && coeficienteVariacion > UMBRAL_VARIABILIDAD_ALTA;

    productos.push({
      itemRowId,
      descripcion: p.descripcion,
      referencia: p.referencia,
      unidadMedida: p.unidadMedida,
      ventaPromedioMensual,
      tendenciaPct,
      coeficienteVariacion,
      demandaIrregular,
      perdiendoRotacion,
      mesesConVenta,
    });
  }

  const topDemanda = [...productos]
    .sort((a, b) => b.ventaPromedioMensual - a.ventaPromedioMensual)
    .slice(0, 15);

  const perdiendoRotacionLista = productos
    .filter((p) => p.perdiendoRotacion)
    .sort((a, b) => b.ventaPromedioMensual - a.ventaPromedioMensual)
    .slice(0, 15);

  const tendenciaFuerte = productos
    .filter((p) => p.tendenciaPct !== null && Math.abs(p.tendenciaPct) >= UMBRAL_TENDENCIA_FUERTE_PCT)
    .sort((a, b) => Math.abs(b.tendenciaPct!) - Math.abs(a.tendenciaPct!))
    .slice(0, 15);

  return { topDemanda, perdiendoRotacion: perdiendoRotacionLista, tendenciaFuerte, todos: productos };
}
