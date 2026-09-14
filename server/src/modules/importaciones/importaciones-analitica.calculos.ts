/**
 * Funciones puras de cálculo para Analítica de Importaciones V1. Sin acceso
 * a base de datos a propósito — reciben ya las fechas/valores extraídos por
 * importaciones-analitica.service.ts, para poder testear la aritmética de
 * cada KPI de forma aislada, rápida y sin BD real (ver plan de tests).
 *
 * REGLA DURA: nunca se sustituye una fecha faltante por otra (ej. updatedAt)
 * — un dato faltante se refleja como `null` en el resultado individual y esa
 * operación queda excluida de los agregados (ver `agregarDias`).
 */

/** Diferencia en días (float, puede tener fracción) entre dos fechas reales.
 * Devuelve null si cualquiera de las dos falta, y también si el resultado es
 * negativo (anomalía de datos: la fecha de fin es anterior a la de inicio —
 * nunca se reporta un KPI negativo, se excluye y se cuenta como excluida). */
export function diferenciaDias(
  inicio: Date | null | undefined,
  fin: Date | null | undefined,
): number | null {
  if (!inicio || !fin) return null;
  const ms = fin.getTime() - inicio.getTime();
  if (ms < 0) return null;
  return ms / (1000 * 60 * 60 * 24);
}

export interface AgregadoDias {
  promedio: number | null;
  minimo: number | null;
  maximo: number | null;
  cantidadAnalizada: number;
  cantidadExcluida: number;
}

/** Agrega un arreglo de valores en días (algunos pueden ser null → excluidos
 * del promedio/min/max, pero SÍ se cuentan en cantidadExcluida). */
export function agregarDias(valores: Array<number | null>): AgregadoDias {
  const validos = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  const cantidadExcluida = valores.length - validos.length;
  if (validos.length === 0) {
    return { promedio: null, minimo: null, maximo: null, cantidadAnalizada: 0, cantidadExcluida };
  }
  const suma = validos.reduce((acc, v) => acc + v, 0);
  return {
    promedio: suma / validos.length,
    minimo: Math.min(...validos),
    maximo: Math.max(...validos),
    cantidadAnalizada: validos.length,
    cantidadExcluida,
  };
}

/**
 * Factor de incremento logístico: ((costoLandedFinal - valorFobTotal) /
 * valorFobTotal) × 100. Ambos valores DEBEN venir ya en la misma moneda
 * (COP) — el llamador es responsable de convertir el FOB con la TRM de
 * liquidación real (nunca se reinventa esa conversión aquí, ver servicio).
 * Protegido contra división por cero: si valorFobTotalCop es 0 o negativo,
 * devuelve null (dato insuficiente), nunca Infinity/NaN.
 */
export function factorIncrementoLogistico(
  costoLandedFinalCop: number | null | undefined,
  valorFobTotalCop: number | null | undefined,
): number | null {
  if (costoLandedFinalCop == null || valorFobTotalCop == null) return null;
  if (!Number.isFinite(costoLandedFinalCop) || !Number.isFinite(valorFobTotalCop)) return null;
  if (valorFobTotalCop <= 0) return null;
  return ((costoLandedFinalCop - valorFobTotalCop) / valorFobTotalCop) * 100;
}

export interface Tendencia {
  actual: number | null;
  referencia: number | null;
  variacionPorcentual: number | null;
  variacionAbsoluta: number | null;
}

/** Compara el promedio del período actual contra el del período de
 * referencia inmediatamente anterior (mismo tamaño de ventana). Ninguno de
 * los dos lados se infiere: ambos ya llegan calculados por el llamador
 * (agregarDias sobre cada sub-conjunto de operaciones). */
export function calcularTendencia(actual: number | null, referencia: number | null): Tendencia {
  if (actual == null || referencia == null) {
    return { actual, referencia, variacionPorcentual: null, variacionAbsoluta: null };
  }
  const variacionAbsoluta = actual - referencia;
  const variacionPorcentual = referencia !== 0 ? (variacionAbsoluta / referencia) * 100 : null;
  return { actual, referencia, variacionPorcentual, variacionAbsoluta };
}
