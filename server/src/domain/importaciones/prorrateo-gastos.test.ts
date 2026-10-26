import { describe, it, expect } from "vitest";
import {
  calcularParticipaciones,
  esMetodoAprobado,
  esMetodoProrrateo,
  METODOS_PRORRATEO_APROBADOS,
  type ItemParaProrrateo,
} from "./prorrateo-gastos";

const item = (
  itemId: string,
  fobUsd: number,
  pesoKg: number | null,
  volumenM3: number | null,
): ItemParaProrrateo => ({ itemId, descripcion: `Ítem ${itemId}`, fobUsd, pesoKg, volumenM3 });

const suma = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("calcularParticipaciones — FOB (comportamiento histórico)", () => {
  it("reparte por valor FOB y las fracciones suman 1", () => {
    const r = calcularParticipaciones([item("a", 750, 10, 1), item("b", 250, 90, 3)], "FOB");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.participaciones.get("a")).toBeCloseTo(0.75, 10);
    expect(r.participaciones.get("b")).toBeCloseTo(0.25, 10);
    expect(suma(r.participaciones)).toBeCloseTo(1, 10);
  });

  it("acepta un ítem con FOB 0 (muestra) si la suma es positiva: participación 0", () => {
    const r = calcularParticipaciones(
      [item("a", 0, null, null), item("b", 100, null, null)],
      "FOB",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.participaciones.get("a")).toBe(0);
    expect(r.participaciones.get("b")).toBe(1);
  });

  it("rechaza cuando el FOB total es 0 (no divide por cero)", () => {
    const r = calcularParticipaciones([item("a", 0, 5, 1), item("b", 0, 5, 1)], "FOB");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.mensaje).toMatch(/FOB total/);
  });
});

describe("calcularParticipaciones — PESO / VOLUMEN", () => {
  it("reparte por peso", () => {
    const r = calcularParticipaciones([item("a", 999, 300, null), item("b", 1, 100, null)], "PESO");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.participaciones.get("a")).toBeCloseTo(0.75, 10);
    expect(r.participaciones.get("b")).toBeCloseTo(0.25, 10);
  });

  it("reparte por volumen", () => {
    const r = calcularParticipaciones([item("a", 1, 1, 2), item("b", 1, 1, 6)], "VOLUMEN");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.participaciones.get("a")).toBeCloseTo(0.25, 10);
    expect(r.participaciones.get("b")).toBeCloseTo(0.75, 10);
  });

  it("rechaza por peso si un ítem no tiene peso, SIN caer a FOB", () => {
    const r = calcularParticipaciones(
      [item("a", 500, 10, null), item("b", 500, null, null)],
      "PESO",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.itemsSinDato).toEqual(["Ítem b"]);
    expect(r.mensaje).toMatch(/peso/);
  });

  it("rechaza por volumen si algún ítem tiene volumen 0", () => {
    const r = calcularParticipaciones([item("a", 1, 1, 0), item("b", 1, 1, 4)], "VOLUMEN");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.itemsSinDato).toEqual(["Ítem a"]);
    expect(r.mensaje).toMatch(/volumen/);
  });

  it("rechaza valores no finitos o negativos", () => {
    expect(calcularParticipaciones([item("a", 1, Number.NaN, 1)], "PESO").ok).toBe(false);
    expect(calcularParticipaciones([item("a", 1, -3, 1)], "PESO").ok).toBe(false);
    expect(calcularParticipaciones([item("a", 1, 1, Number.POSITIVE_INFINITY)], "VOLUMEN").ok).toBe(
      false,
    );
  });

  it("rechaza una lista vacía de ítems", () => {
    expect(calcularParticipaciones([], "FOB").ok).toBe(false);
  });
});

describe("esMetodoProrrateo", () => {
  it("solo acepta FOB, PESO o VOLUMEN", () => {
    expect(esMetodoProrrateo("FOB")).toBe(true);
    expect(esMetodoProrrateo("PESO")).toBe(true);
    expect(esMetodoProrrateo("VOLUMEN")).toBe(true);
    expect(esMetodoProrrateo("peso")).toBe(false);
    expect(esMetodoProrrateo("VALOR")).toBe(false);
    expect(esMetodoProrrateo(undefined)).toBe(false);
  });
});

describe("métodos aprobados", () => {
  it("hoy solo FOB está aprobado; PESO y VOLUMEN existen como cálculo pero no se pueden usar", () => {
    expect(METODOS_PRORRATEO_APROBADOS).toEqual(["FOB"]);
    expect(esMetodoAprobado("FOB")).toBe(true);
    expect(esMetodoAprobado("PESO")).toBe(false);
    expect(esMetodoAprobado("VOLUMEN")).toBe(false);
  });
});
