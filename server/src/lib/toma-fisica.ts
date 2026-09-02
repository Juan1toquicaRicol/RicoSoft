/**
 * Toma física mensual — Etapa I del módulo Producción & Planeación.
 * Modelo nativo de RicoSoft (TomaFisica/TomaFisicaLinea, ver
 * prisma/schema.prisma) — Siesa no tiene tablas de conteo físico/ajuste de
 * inventario (se buscaron y no existen). RicoSoft nunca escribe de vuelta a
 * Siesa: "cerrar" una toma física es un registro interno, no un ajuste
 * contable real — ese ajuste, si corresponde, lo hace un usuario en Siesa
 * manualmente.
 *
 * diferencia/diferenciaPct/valorDiferencia se calculan siempre aquí, nunca
 * se guardan en la base — así una corrección de conteo nunca deja un valor
 * desactualizado en otra parte.
 */
export interface LineaTomaFisicaEntrada {
  id: string;
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  stockSistema: number;
  conteoFisico: number | null;
  valorUnitario: number;
}

export interface LineaTomaFisicaCalculada extends LineaTomaFisicaEntrada {
  /** Null = todavía no se ha registrado el conteo físico de esta línea. */
  diferencia: number | null;
  diferenciaPct: number | null;
  valorDiferencia: number | null;
}

export function calcularLineasTomaFisica(
  lineas: LineaTomaFisicaEntrada[],
): LineaTomaFisicaCalculada[] {
  return lineas.map((l) => {
    if (l.conteoFisico === null) {
      return { ...l, diferencia: null, diferenciaPct: null, valorDiferencia: null };
    }
    const diferencia = l.conteoFisico - l.stockSistema;
    const diferenciaPct = l.stockSistema !== 0 ? Math.round((diferencia / l.stockSistema) * 1000) / 10 : null;
    const valorDiferencia = diferencia * l.valorUnitario;
    return { ...l, diferencia, diferenciaPct, valorDiferencia };
  });
}

export interface ResumenTomaFisica {
  totalLineas: number;
  lineasContadas: number;
  lineasPendientes: number;
  valorDiferenciaTotal: number;
}

export function calcularResumenTomaFisica(lineas: LineaTomaFisicaCalculada[]): ResumenTomaFisica {
  const lineasContadas = lineas.filter((l) => l.conteoFisico !== null).length;
  const valorDiferenciaTotal = lineas.reduce((acc, l) => acc + (l.valorDiferencia ?? 0), 0);
  return {
    totalLineas: lineas.length,
    lineasContadas,
    lineasPendientes: lineas.length - lineasContadas,
    valorDiferenciaTotal,
  };
}

/**
 * Detección de diferencias recurrentes: un ítem cuyas últimas N tomas
 * físicas CERRADAS (distintas, ordenadas por fecha) tuvieron diferencia del
 * mismo signo — señal de un problema operativo real (despacho, recepción,
 * unidad de medida, producción), no ruido de conteo.
 *
 * minOcurrencias=3 y umbralPct=1% son deliberadamente conservadores: menos
 * de 3 tomas no es un patrón, y diferencias menores a 1% son ruido normal
 * de conteo manual, no una señal real.
 */
export interface OcurrenciaDiferencia {
  tomaFisicaId: string;
  fecha: Date;
  itemRowId: number;
  descripcion: string | null;
  diferenciaPct: number;
}

export interface PatronDiferenciaRecurrente {
  itemRowId: number;
  descripcion: string | null;
  ocurrencias: number;
  diferenciaPromedioPct: number;
  signo: "faltante" | "sobrante";
}

const MIN_OCURRENCIAS_PATRON = 3;
const UMBRAL_PCT_PATRON = 1;

export function detectarPatronesRecurrentes(
  historico: OcurrenciaDiferencia[],
): PatronDiferenciaRecurrente[] {
  const porItem = new Map<number, OcurrenciaDiferencia[]>();
  for (const o of historico) {
    if (Math.abs(o.diferenciaPct) < UMBRAL_PCT_PATRON) continue;
    const arr = porItem.get(o.itemRowId) ?? [];
    arr.push(o);
    porItem.set(o.itemRowId, arr);
  }

  const patrones: PatronDiferenciaRecurrente[] = [];
  for (const [itemRowId, ocurrencias] of porItem) {
    const ordenadas = [...ocurrencias].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    // Toma las últimas MIN_OCURRENCIAS_PATRON — el patrón debe ser reciente,
    // no un problema puntual de hace años que ya se corrigió.
    const ultimas = ordenadas.slice(-MIN_OCURRENCIAS_PATRON);
    if (ultimas.length < MIN_OCURRENCIAS_PATRON) continue;

    const todasNegativas = ultimas.every((o) => o.diferenciaPct < 0);
    const todasPositivas = ultimas.every((o) => o.diferenciaPct > 0);
    if (!todasNegativas && !todasPositivas) continue;

    const diferenciaPromedioPct =
      Math.round((ultimas.reduce((acc, o) => acc + o.diferenciaPct, 0) / ultimas.length) * 10) / 10;

    patrones.push({
      itemRowId,
      descripcion: ultimas[0].descripcion,
      ocurrencias: ultimas.length,
      diferenciaPromedioPct,
      signo: todasNegativas ? "faltante" : "sobrante",
    });
  }

  return patrones.sort((a, b) => Math.abs(b.diferenciaPromedioPct) - Math.abs(a.diferenciaPromedioPct));
}
