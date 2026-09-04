const DIA_MS = 24 * 60 * 60 * 1000;

export interface CumplimientoObjetivo {
  metaValor: number | null;
  ventaRealValor: number | null;
  cumplimientoValorPct: number | null;
  /** max(meta - real, 0) — nunca negativo; si ya se superó la meta, el
   * faltante se muestra como 0 y el % de cumplimiento puede pasar de 100. */
  faltanteValor: number | null;

  metaVolumenKg: number | null;
  volumenRealKg: number | null;
  cumplimientoVolumenPct: number | null;
  faltanteVolumenKg: number | null;
}

function calcularPct(meta: number | null, real: number | null): number | null {
  if (meta == null || meta <= 0 || real == null) return null;
  return Math.round((real / meta) * 1000) / 10;
}

function calcularFaltante(meta: number | null, real: number | null): number | null {
  if (meta == null || real == null) return null;
  return Math.max(meta - real, 0);
}

/**
 * Compara meta vs. real para valor y volumen de forma independiente — una
 * meta puede tener solo valor, solo volumen, o ambos (validado en el
 * controller, no acá: esta función es pura y no rechaza combinaciones).
 */
export function calcularCumplimiento(
  metaValor: number | null,
  ventaRealValor: number,
  metaVolumenKg: number | null,
  volumenRealKg: number,
): CumplimientoObjetivo {
  return {
    metaValor,
    ventaRealValor: metaValor != null ? ventaRealValor : null,
    cumplimientoValorPct: calcularPct(metaValor, ventaRealValor),
    faltanteValor: calcularFaltante(metaValor, ventaRealValor),

    metaVolumenKg,
    volumenRealKg: metaVolumenKg != null ? volumenRealKg : null,
    cumplimientoVolumenPct: calcularPct(metaVolumenKg, volumenRealKg),
    faltanteVolumenKg: calcularFaltante(metaVolumenKg, volumenRealKg),
  };
}

function inicioDiaUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function restarUnAnioUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate()));
}

export interface RangoFechas {
  desde: Date;
  /** Exclusivo, para usar directo como "< hasta" en las queries Siesa. */
  hasta: Date;
}

export interface RangoComparativoAnual {
  rangoActual: RangoFechas;
  rangoAnterior: RangoFechas;
}

/**
 * Rango transcurrido de un objetivo hasta `hoy` (o el rango completo si el
 * objetivo ya cerró) y el rango EXACTO equivalente un año antes — mismo
 * número de días de calendario, no meses completos. Ej.: objetivo
 * 01-30/sep/2026, hoy=15/sep/2026 → actual=[01/sep,16/sep)/2026,
 * anterior=[01/sep,16/sep)/2025. Todo en UTC (medianoche), mismo criterio
 * que Siesa guarda f461_id_fecha.
 */
export function calcularRangoComparativoAnual(
  fechaInicio: Date,
  fechaFin: Date,
  hoy: Date,
): RangoComparativoAnual {
  const inicio = inicioDiaUTC(fechaInicio);
  const finInclusive = inicioDiaUTC(fechaFin);
  const finExclusivo = new Date(finInclusive.getTime() + DIA_MS);
  const hoyDia = inicioDiaUTC(hoy);

  const hastaActual =
    hoyDia.getTime() < finExclusivo.getTime() ? new Date(hoyDia.getTime() + DIA_MS) : finExclusivo;

  const rangoActual: RangoFechas = { desde: inicio, hasta: hastaActual };
  const rangoAnterior: RangoFechas = {
    desde: restarUnAnioUTC(rangoActual.desde),
    hasta: restarUnAnioUTC(rangoActual.hasta),
  };

  return { rangoActual, rangoAnterior };
}

export interface ComparativoAnual {
  ventaActual: number;
  ventaAnterior: number;
  variacionAbsoluta: number;
  /** null cuando no hay venta el año anterior (no se divide por cero). */
  variacionPct: number | null;
}

export function calcularComparativoAnual(
  ventaActual: number,
  ventaAnterior: number,
): ComparativoAnual {
  return {
    ventaActual,
    ventaAnterior,
    variacionAbsoluta: ventaActual - ventaAnterior,
    variacionPct:
      ventaAnterior > 0
        ? Math.round(((ventaActual - ventaAnterior) / ventaAnterior) * 1000) / 10
        : null,
  };
}

export type Ritmo = "ADELANTADO" | "ATRASADO";

export interface RitmoObjetivo {
  pctTiempoTranscurrido: number;
  pctMetaCumplida: number;
  ritmo: Ritmo;
  /** Proyección lineal simple: venta_actual / días_transcurridos ×
   * días_totales. NO es forecasting/IA — solo una extrapolación ingenua
   * del ritmo actual, documentada así explícitamente por decisión de
   * producto (spec del módulo Objetivos, sección 7). */
  proyeccionLineal: number;
}

/**
 * Calcula ritmo (¿vamos adelantados o atrasados frente al tiempo
 * transcurrido del período?) y una proyección lineal de cierre. Días
 * transcurridos cuenta el día de hoy como transcurrido (día 1 de un
 * objetivo que inicia hoy = 1 día transcurrido, no 0), evitando división
 * por cero el primer día del período.
 */
export function calcularRitmo(
  fechaInicio: Date,
  fechaFin: Date,
  hoy: Date,
  ventaAcumulada: number,
  meta: number,
): RitmoObjetivo {
  const inicio = inicioDiaUTC(fechaInicio);
  const fin = inicioDiaUTC(fechaFin);
  const hoyDia = inicioDiaUTC(hoy);

  const diasTotales = Math.round((fin.getTime() - inicio.getTime()) / DIA_MS) + 1;
  const diasTranscurridosCrudos = Math.round((hoyDia.getTime() - inicio.getTime()) / DIA_MS) + 1;
  const diasTranscurridos = Math.min(Math.max(diasTranscurridosCrudos, 1), diasTotales);

  const pctTiempoTranscurrido = Math.round((diasTranscurridos / diasTotales) * 1000) / 10;
  const pctMetaCumplida = meta > 0 ? Math.round((ventaAcumulada / meta) * 1000) / 10 : 0;
  const proyeccionLineal = Math.round((ventaAcumulada / diasTranscurridos) * diasTotales);

  return {
    pctTiempoTranscurrido,
    pctMetaCumplida,
    ritmo: pctMetaCumplida >= pctTiempoTranscurrido ? "ADELANTADO" : "ATRASADO",
    proyeccionLineal,
  };
}
