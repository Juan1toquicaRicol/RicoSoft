import { describe, it, expect } from "vitest";
import {
  diferenciaDias,
  agregarDias,
  factorIncrementoLogistico,
  calcularTendencia,
} from "./importaciones-analitica.calculos";

describe("diferenciaDias", () => {
  it("calcula la diferencia real en días entre dos fechas", () => {
    const inicio = new Date("2026-01-01T00:00:00Z");
    const fin = new Date("2026-01-11T00:00:00Z");
    expect(diferenciaDias(inicio, fin)).toBe(10);
  });

  it("devuelve null si falta cualquiera de las dos fechas", () => {
    expect(diferenciaDias(null, new Date())).toBeNull();
    expect(diferenciaDias(new Date(), null)).toBeNull();
    expect(diferenciaDias(undefined, undefined)).toBeNull();
  });

  it("devuelve null (nunca negativo) si fin es anterior a inicio", () => {
    const inicio = new Date("2026-02-01T00:00:00Z");
    const fin = new Date("2026-01-01T00:00:00Z");
    expect(diferenciaDias(inicio, fin)).toBeNull();
  });
});

describe("agregarDias", () => {
  it("calcula promedio/min/max solo sobre valores válidos", () => {
    const resultado = agregarDias([10, 20, 30, null, null]);
    expect(resultado.promedio).toBe(20);
    expect(resultado.minimo).toBe(10);
    expect(resultado.maximo).toBe(30);
    expect(resultado.cantidadAnalizada).toBe(3);
    expect(resultado.cantidadExcluida).toBe(2);
  });

  it("devuelve todo null si no hay ningún valor válido (datos insuficientes)", () => {
    const resultado = agregarDias([null, null]);
    expect(resultado.promedio).toBeNull();
    expect(resultado.minimo).toBeNull();
    expect(resultado.maximo).toBeNull();
    expect(resultado.cantidadAnalizada).toBe(0);
    expect(resultado.cantidadExcluida).toBe(2);
  });

  it("maneja arreglo vacío sin fallar", () => {
    const resultado = agregarDias([]);
    expect(resultado.cantidadAnalizada).toBe(0);
    expect(resultado.cantidadExcluida).toBe(0);
  });
});

describe("factorIncrementoLogistico", () => {
  it("calcula el porcentaje de incremento sobre el FOB real", () => {
    // FOB 100, landed final 130 → 30% de incremento
    expect(factorIncrementoLogistico(130, 100)).toBeCloseTo(30, 6);
  });

  it("protege contra división por cero: FOB = 0 devuelve null", () => {
    expect(factorIncrementoLogistico(130, 0)).toBeNull();
  });

  it("protege contra FOB negativo (dato anómalo) devolviendo null", () => {
    expect(factorIncrementoLogistico(130, -50)).toBeNull();
  });

  it("devuelve null si falta cualquiera de los dos valores", () => {
    expect(factorIncrementoLogistico(null, 100)).toBeNull();
    expect(factorIncrementoLogistico(130, null)).toBeNull();
    expect(factorIncrementoLogistico(undefined, undefined)).toBeNull();
  });

  it("permite un factor negativo real (landed menor al FOB, caso raro pero válido)", () => {
    expect(factorIncrementoLogistico(80, 100)).toBeCloseTo(-20, 6);
  });
});

describe("calcularTendencia", () => {
  it("calcula variación absoluta y porcentual contra el período de referencia", () => {
    const t = calcularTendencia(120, 100);
    expect(t.variacionAbsoluta).toBe(20);
    expect(t.variacionPorcentual).toBeCloseTo(20, 6);
  });

  it("devuelve null en variaciones si falta el actual o la referencia", () => {
    expect(calcularTendencia(null, 100).variacionPorcentual).toBeNull();
    expect(calcularTendencia(120, null).variacionPorcentual).toBeNull();
  });

  it("protege contra división por cero cuando la referencia es 0", () => {
    const t = calcularTendencia(50, 0);
    expect(t.variacionAbsoluta).toBe(50);
    expect(t.variacionPorcentual).toBeNull();
  });
});
