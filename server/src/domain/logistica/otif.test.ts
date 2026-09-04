import { describe, it, expect } from "vitest";
import { calcularOtif, type DespachoParaOtif } from "./otif";

describe("calcularOtif", () => {
  const despacho = (overrides: Partial<DespachoParaOtif> = {}): DespachoParaOtif => ({
    id: "d1",
    estado: "ENTREGADO",
    fechaEntregaEstimada: new Date("2026-09-01T00:00:00Z"),
    fechaEntregaReal: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  });

  it("con todos los despachos a tiempo, otifPct es 100", () => {
    const r = calcularOtif([
      despacho({ id: "1" }),
      despacho({ id: "2", fechaEntregaReal: new Date("2026-08-31T00:00:00Z") }), // antes de tiempo también cuenta
    ]);
    expect(r.totalEvaluable).toBe(2);
    expect(r.aTiempo).toBe(2);
    expect(r.otifPct).toBe(100);
  });

  it("con un despacho tarde, se excluye del conteo de a tiempo pero cuenta en el total", () => {
    const r = calcularOtif([
      despacho({ id: "1" }),
      despacho({ id: "2", fechaEntregaReal: new Date("2026-09-02T00:00:00Z") }), // 1 día tarde
    ]);
    expect(r.totalEvaluable).toBe(2);
    expect(r.aTiempo).toBe(1);
    expect(r.otifPct).toBe(50);
  });

  it("ignora despachos que no están ENTREGADO ni ENTREGA_PARCIAL", () => {
    const r = calcularOtif([
      despacho({ estado: "EN_TRANSITO" }),
      despacho({ estado: "CANCELADO" }),
    ]);
    expect(r.totalEvaluable).toBe(0);
    expect(r.otifPct).toBeNull();
  });

  it("ENTREGA_PARCIAL también se evalúa, igual que ENTREGADO", () => {
    const r = calcularOtif([despacho({ estado: "ENTREGA_PARCIAL" })]);
    expect(r.totalEvaluable).toBe(1);
    expect(r.aTiempo).toBe(1);
  });

  it("sin fechaEntregaEstimada, el despacho se excluye del total evaluable y se reporta aparte", () => {
    const r = calcularOtif([despacho({ fechaEntregaEstimada: null })]);
    expect(r.totalEvaluable).toBe(0);
    expect(r.sinFechaEstimada).toBe(1);
    expect(r.otifPct).toBeNull();
  });

  it("sin fechaEntregaReal (dato inconsistente), también se excluye del total evaluable", () => {
    const r = calcularOtif([despacho({ fechaEntregaReal: null })]);
    expect(r.totalEvaluable).toBe(0);
    expect(r.sinFechaEstimada).toBe(1);
  });

  it("con una lista vacía, devuelve otifPct null, nunca 0 (no confunde 'sin datos' con '0% de cumplimiento')", () => {
    const r = calcularOtif([]);
    expect(r.otifPct).toBeNull();
    expect(r.totalEvaluable).toBe(0);
  });

  it("redondea el porcentaje a 1 decimal", () => {
    const r = calcularOtif([
      despacho({ id: "1" }),
      despacho({ id: "2" }),
      despacho({ id: "3", fechaEntregaReal: new Date("2026-09-05T00:00:00Z") }),
    ]);
    // 2 de 3 a tiempo = 66.666...% -> 66.7
    expect(r.otifPct).toBe(66.7);
  });
});
