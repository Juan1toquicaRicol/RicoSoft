import { describe, it, expect } from "vitest";
import { calcularInventarioObjetivo } from "./inventario-objetivo";
import type { VentanasDemanda } from "./demanda";

function ventana(itemRowId: number, overrides: Partial<VentanasDemanda> = {}): VentanasDemanda {
  return {
    itemRowId,
    ventas30d: 300,
    ventas90d: 900,
    ventas180d: 1800,
    promedioDiario30d: 10,
    promedioSemanal30d: 70,
    promedioMensual30d: 300,
    mesesConVenta: 12,
    calidadDatos: "ALTA",
    ...overrides,
  };
}

describe("calcularInventarioObjetivo", () => {
  it("ejemplo del spec: PET JADE CZ-302, stock 67.467, venta mensual 15.000, objetivo 2 meses -> excedente 37.467", () => {
    // promedioMensual30d=15000 -> promedioDiario30d=500; coberturaObjetivoDias=60 (2 meses) -> stockObjetivo=30000
    const [r] = calcularInventarioObjetivo(
      [ventana(1, { promedioDiario30d: 500, promedioMensual30d: 15000 })],
      new Map([[1, 67467]]),
      { coberturaObjetivoDias: 60, factorSeguridad: 1 },
    );
    expect(r.stockObjetivo).toBe(30000);
    expect(r.excedente).toBe(37467);
    expect(r.deficit).toBe(0);
    expect(r.coberturaMeses).toBeCloseTo(67467 / 15000, 5);
  });

  it("calcula déficit cuando el stock actual está por debajo del objetivo", () => {
    const [r] = calcularInventarioObjetivo(
      [ventana(1, { promedioDiario30d: 100, promedioMensual30d: 3000 })],
      new Map([[1, 1000]]),
      { coberturaObjetivoDias: 45, factorSeguridad: 1 },
    );
    // stockObjetivo = 100 * 45 = 4500
    expect(r.stockObjetivo).toBe(4500);
    expect(r.deficit).toBe(3500);
    expect(r.excedente).toBe(0);
  });

  it("el factor de seguridad amplifica el stock objetivo", () => {
    const [sinFactor] = calcularInventarioObjetivo(
      [ventana(1, { promedioDiario30d: 10 })],
      new Map([[1, 0]]),
      { coberturaObjetivoDias: 45, factorSeguridad: 1 },
    );
    const [conFactor] = calcularInventarioObjetivo(
      [ventana(1, { promedioDiario30d: 10 })],
      new Map([[1, 0]]),
      { coberturaObjetivoDias: 45, factorSeguridad: 1.2 },
    );
    expect(conFactor.stockObjetivo).toBeCloseTo(sinFactor.stockObjetivo * 1.2, 5);
  });

  it("coberturaMeses es null cuando no hay venta reciente (evita dividir por cero)", () => {
    const [r] = calcularInventarioObjetivo(
      [ventana(1, { promedioMensual30d: 0 })],
      new Map([[1, 500]]),
    );
    expect(r.coberturaMeses).toBeNull();
  });

  it("un ítem sin stock registrado se trata como 0 (déficit total), no se omite", () => {
    const [r] = calcularInventarioObjetivo([ventana(1)], new Map());
    expect(r.stockActual).toBe(0);
    expect(r.deficit).toBe(r.stockObjetivo);
  });

  it("conserva la calidadDatos de la ventana original, sin reinterpretarla", () => {
    const [r] = calcularInventarioObjetivo([ventana(1, { calidadDatos: "BAJA" })], new Map());
    expect(r.calidadDatos).toBe("BAJA");
  });
});
