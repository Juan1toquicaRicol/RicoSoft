import { describe, expect, it } from "vitest";
import {
  calcularCumplimiento,
  calcularRangoComparativoAnual,
  calcularComparativoAnual,
  calcularRitmo,
} from "./objetivos-calculo";

function diaUTC(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia));
}

describe("calcularCumplimiento", () => {
  it("calcula % de cumplimiento y faltante de valor", () => {
    const r = calcularCumplimiento(5_000_000_000, 3_250_000_000, null, 0);
    expect(r.cumplimientoValorPct).toBe(65);
    expect(r.faltanteValor).toBe(1_750_000_000);
  });

  it("no divide por cero cuando la meta es null o 0", () => {
    expect(calcularCumplimiento(null, 100, null, 0).cumplimientoValorPct).toBeNull();
    expect(calcularCumplimiento(0, 100, null, 0).cumplimientoValorPct).toBeNull();
  });

  it("cuando la venta real supera la meta, el faltante es 0 y el % pasa de 100", () => {
    const r = calcularCumplimiento(100, 150, null, 0);
    expect(r.cumplimientoValorPct).toBe(150);
    expect(r.faltanteValor).toBe(0);
  });

  it("calcula valor y volumen de forma independiente", () => {
    const r = calcularCumplimiento(1000, 500, 200, 100);
    expect(r.cumplimientoValorPct).toBe(50);
    expect(r.cumplimientoVolumenPct).toBe(50);
  });

  it("deja metaVolumenKg en null cuando la meta no incluye volumen", () => {
    const r = calcularCumplimiento(1000, 500, null, 999);
    expect(r.cumplimientoVolumenPct).toBeNull();
    expect(r.volumenRealKg).toBeNull();
  });
});

describe("calcularRangoComparativoAnual", () => {
  it("calcula el rango exacto equivalente del año anterior a mitad de período", () => {
    const { rangoActual, rangoAnterior } = calcularRangoComparativoAnual(
      diaUTC(2026, 9, 1),
      diaUTC(2026, 9, 30),
      diaUTC(2026, 9, 15),
    );
    expect(rangoActual.desde).toEqual(diaUTC(2026, 9, 1));
    expect(rangoActual.hasta).toEqual(diaUTC(2026, 9, 16));
    expect(rangoAnterior.desde).toEqual(diaUTC(2025, 9, 1));
    expect(rangoAnterior.hasta).toEqual(diaUTC(2025, 9, 16));
  });

  it("usa el rango completo del objetivo cuando ya cerró (hoy > fechaFin)", () => {
    const { rangoActual, rangoAnterior } = calcularRangoComparativoAnual(
      diaUTC(2026, 9, 1),
      diaUTC(2026, 9, 30),
      diaUTC(2026, 10, 15),
    );
    expect(rangoActual.desde).toEqual(diaUTC(2026, 9, 1));
    expect(rangoActual.hasta).toEqual(diaUTC(2026, 10, 1));
    expect(rangoAnterior.desde).toEqual(diaUTC(2025, 9, 1));
    expect(rangoAnterior.hasta).toEqual(diaUTC(2025, 10, 1));
  });

  it("objetivo TRIMESTRAL en curso: el rango actual cubre los 3 meses transcurridos, no solo el mes en curso", () => {
    const { rangoActual, rangoAnterior } = calcularRangoComparativoAnual(
      diaUTC(2026, 7, 1),
      diaUTC(2026, 9, 30),
      diaUTC(2026, 9, 15),
    );
    // Debe arrancar en julio (inicio del trimestre), no en septiembre.
    expect(rangoActual.desde).toEqual(diaUTC(2026, 7, 1));
    expect(rangoActual.hasta).toEqual(diaUTC(2026, 9, 16));
    expect(rangoAnterior.desde).toEqual(diaUTC(2025, 7, 1));
    expect(rangoAnterior.hasta).toEqual(diaUTC(2025, 9, 16));
  });

  it("objetivo ANUAL en curso: el rango actual cubre desde enero, no solo el mes en curso", () => {
    const { rangoActual, rangoAnterior } = calcularRangoComparativoAnual(
      diaUTC(2026, 1, 1),
      diaUTC(2026, 12, 31),
      diaUTC(2026, 9, 15),
    );
    expect(rangoActual.desde).toEqual(diaUTC(2026, 1, 1));
    expect(rangoActual.hasta).toEqual(diaUTC(2026, 9, 16));
    expect(rangoAnterior.desde).toEqual(diaUTC(2025, 1, 1));
    expect(rangoAnterior.hasta).toEqual(diaUTC(2025, 9, 16));
  });

  it("objetivo ANUAL ya cerrado: usa el año calendario completo, no se corta en el mes en que se consultó", () => {
    const { rangoActual, rangoAnterior } = calcularRangoComparativoAnual(
      diaUTC(2026, 1, 1),
      diaUTC(2026, 12, 31),
      diaUTC(2027, 3, 1),
    );
    expect(rangoActual.desde).toEqual(diaUTC(2026, 1, 1));
    expect(rangoActual.hasta).toEqual(diaUTC(2027, 1, 1));
    expect(rangoAnterior.desde).toEqual(diaUTC(2025, 1, 1));
    expect(rangoAnterior.hasta).toEqual(diaUTC(2026, 1, 1));
  });

  it("rango PERSONALIZADO arbitrario (no calza con mes/trimestre/año): igual respeta exactamente fechaInicio/fechaFin", () => {
    const { rangoActual } = calcularRangoComparativoAnual(
      diaUTC(2026, 3, 10),
      diaUTC(2026, 5, 22),
      diaUTC(2026, 4, 1),
    );
    expect(rangoActual.desde).toEqual(diaUTC(2026, 3, 10));
    expect(rangoActual.hasta).toEqual(diaUTC(2026, 4, 2));
  });

  it("maneja correctamente un rango que cruza 29 de febrero (año bisiesto)", () => {
    const { rangoActual, rangoAnterior } = calcularRangoComparativoAnual(
      diaUTC(2024, 2, 20),
      diaUTC(2024, 3, 10),
      diaUTC(2024, 3, 1),
    );
    expect(rangoActual.desde).toEqual(diaUTC(2024, 2, 20));
    expect(rangoActual.hasta).toEqual(diaUTC(2024, 3, 2));
    // 2023 no es bisiesto: restar 1 año en UTC a 29-feb-2024 → 1-mar-2023
    // (comportamiento nativo de Date con overflow), documentado como
    // aceptable dado que es un caso extremo (1 día al año).
    expect(rangoAnterior.desde).toEqual(diaUTC(2023, 2, 20));
  });
});

describe("calcularComparativoAnual", () => {
  it("calcula variación absoluta y porcentual", () => {
    const r = calcularComparativoAnual(3_800_000_000, 3_200_000_000);
    expect(r.variacionAbsoluta).toBe(600_000_000);
    expect(r.variacionPct).toBe(18.8);
  });

  it("no divide por cero cuando el año anterior no tuvo ventas", () => {
    const r = calcularComparativoAnual(100, 0);
    expect(r.variacionPct).toBeNull();
  });
});

describe("calcularRitmo", () => {
  it("calcula tiempo transcurrido, cumplimiento y proyección lineal a mitad de un mes de 30 días", () => {
    const r = calcularRitmo(
      diaUTC(2026, 9, 1),
      diaUTC(2026, 9, 30),
      diaUTC(2026, 9, 15),
      3_250_000_000,
      5_000_000_000,
    );
    expect(r.pctTiempoTranscurrido).toBe(50);
    expect(r.pctMetaCumplida).toBe(65);
    expect(r.ritmo).toBe("ADELANTADO");
    // 3.250M / 15 días × 30 días = 6.500M
    expect(r.proyeccionLineal).toBe(6_500_000_000);
  });

  it("marca ATRASADO cuando el % de meta cumplida va por debajo del tiempo transcurrido", () => {
    const r = calcularRitmo(
      diaUTC(2026, 9, 1),
      diaUTC(2026, 9, 30),
      diaUTC(2026, 9, 15),
      1_000_000_000,
      5_000_000_000,
    );
    expect(r.ritmo).toBe("ATRASADO");
  });

  it("objetivo ANUAL: tiempo transcurrido se calcula sobre los 365 días del año, no sobre el mes en curso", () => {
    const r = calcularRitmo(
      diaUTC(2026, 1, 1),
      diaUTC(2026, 12, 31),
      diaUTC(2026, 7, 2), // día 183 de 365
      1_800_000_000,
      3_650_000_000,
    );
    expect(r.pctTiempoTranscurrido).toBeCloseTo(50.1, 0);
    expect(r.pctMetaCumplida).toBeCloseTo(49.3, 0);
  });

  it("no divide por cero el primer día del período", () => {
    const r = calcularRitmo(
      diaUTC(2026, 9, 1),
      diaUTC(2026, 9, 30),
      diaUTC(2026, 9, 1),
      100_000_000,
      5_000_000_000,
    );
    expect(r.pctTiempoTranscurrido).toBeCloseTo((1 / 30) * 100, 1);
    expect(Number.isFinite(r.proyeccionLineal)).toBe(true);
  });
});
