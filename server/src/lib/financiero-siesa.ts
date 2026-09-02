import type { SaldoAbiertoSiesa } from "../modules/integraciones-siesa/siesa-financiero.service";

const DIA_MS = 24 * 60 * 60 * 1000;

export interface BucketsAntiguedadSiesa {
  vencido: number;
  dias0a30: number;
  dias31a60: number;
  dias61a90: number;
  mas90: number;
}

/**
 * Misma lógica de antigüedad que agruparPorAntiguedad en
 * analitica.controller.ts (cartera/CxP nativas de RicoSoft) — duplicada
 * intencionalmente en vez de importada del controller: es una función pura
 * de ~10 líneas y este archivo debe poder probarse sin ninguna dependencia
 * de Express/Prisma.
 */
function agruparPorAntiguedad(items: { vence: Date; saldo: number }[], ahora: Date): BucketsAntiguedadSiesa {
  const buckets: BucketsAntiguedadSiesa = { vencido: 0, dias0a30: 0, dias31a60: 0, dias61a90: 0, mas90: 0 };
  for (const item of items) {
    const dias = Math.floor((item.vence.getTime() - ahora.getTime()) / DIA_MS);
    if (dias < 0) buckets.vencido += item.saldo;
    else if (dias <= 30) buckets.dias0a30 += item.saldo;
    else if (dias <= 60) buckets.dias31a60 += item.saldo;
    else if (dias <= 90) buckets.dias61a90 += item.saldo;
    else buckets.mas90 += item.saldo;
  }
  return buckets;
}

export interface ResumenSaldosSiesa {
  total: number;
  buckets: BucketsAntiguedadSiesa;
  topTerceros: {
    terceroRowId: number | null;
    nombre: string;
    nit: string | null;
    saldo: number;
    porcentaje: number | null;
  }[];
  concentracionTopTercero: number | null;
}

function resumirPorTercero(items: SaldoAbiertoSiesa[], ahora: Date): ResumenSaldosSiesa {
  const total = items.reduce((acc, s) => acc + s.saldo, 0);
  const buckets = agruparPorAntiguedad(items, ahora);

  const porTercero = new Map<
    string,
    { terceroRowId: number | null; nombre: string; nit: string | null; saldo: number }
  >();
  for (const s of items) {
    const clave = String(s.terceroRowId ?? s.terceroNombre ?? "sin-tercero");
    const actual = porTercero.get(clave) ?? {
      terceroRowId: s.terceroRowId,
      nombre: s.terceroNombre ?? "Tercero sin nombre",
      nit: s.terceroNit,
      saldo: 0,
    };
    actual.saldo += s.saldo;
    porTercero.set(clave, actual);
  }

  const topTerceros = [...porTercero.values()]
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 5)
    .map((t) => ({
      ...t,
      porcentaje: total > 0 ? Math.round((t.saldo / total) * 1000) / 10 : null,
    }));

  return {
    total,
    buckets,
    topTerceros,
    concentracionTopTercero: topTerceros[0]?.porcentaje ?? null,
  };
}

export interface ResumenFinancieroSiesa {
  cartera: ResumenSaldosSiesa;
  cuentasPorPagar: ResumenSaldosSiesa;
}

/**
 * Separa los saldos abiertos (t353_co_saldo_abierto) en cartera (saldo
 * débito: el tercero nos debe) y CxP (saldo crédito: le debemos) y calcula
 * el mismo resumen (total/antigüedad/top 5/concentración) para cada lado.
 * Función pura — sin I/O — probada con datos fabricados; la consulta SQL ya
 * se verificó en vivo por separado (ver siesa-financiero.service.ts).
 */
export function calcularResumenFinancieroSiesa(
  saldos: SaldoAbiertoSiesa[],
  ahora: Date,
): ResumenFinancieroSiesa {
  const cartera = saldos.filter((s) => s.saldo > 0);
  const cxp = saldos.filter((s) => s.saldo < 0).map((s) => ({ ...s, saldo: -s.saldo }));
  return {
    cartera: resumirPorTercero(cartera, ahora),
    cuentasPorPagar: resumirPorTercero(cxp, ahora),
  };
}
