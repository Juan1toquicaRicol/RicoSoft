import { describe, it, expect } from "vitest";
import { esTipoHitoManual, validarHito, type HitosExistentes } from "./hitos-lote";

const AHORA = new Date("2026-10-26T12:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("esTipoHitoManual", () => {
  it("permite registrar a mano embarque, puerto e inspección, pero NO la recepción en planta", () => {
    expect(esTipoHitoManual("EMBARQUE_REAL")).toBe(true);
    expect(esTipoHitoManual("LLEGADA_PUERTO")).toBe(true);
    expect(esTipoHitoManual("INSPECCION_ADUANERA")).toBe(true);
    expect(esTipoHitoManual("RECEPCION_PLANTA")).toBe(false);
    expect(esTipoHitoManual("LEVANTE")).toBe(false);
    expect(esTipoHitoManual(undefined)).toBe(false);
  });
});

describe("validarHito", () => {
  it("acepta un hito sin hitos previos", () => {
    expect(validarHito("LLEGADA_PUERTO", d("2026-10-20"), {}, AHORA)).toBeNull();
  });

  it("rechaza fechas inválidas", () => {
    expect(validarHito("LLEGADA_PUERTO", new Date("x"), {}, AHORA)).toMatch(/no es válida/);
  });

  it("rechaza fechas futuras (más allá de la tolerancia de un día)", () => {
    expect(validarHito("LLEGADA_PUERTO", d("2026-10-30"), {}, AHORA)).toMatch(/futuro/);
    // Un hito de solo-día de "hoy" (medianoche UTC) o de mañana por zona horaria sí pasa.
    expect(validarHito("LLEGADA_PUERTO", d("2026-10-27"), {}, AHORA)).toBeNull();
  });

  it("la llegada a puerto no puede ser anterior al embarque", () => {
    const existentes: HitosExistentes = { EMBARQUE_REAL: d("2026-09-10") };
    expect(validarHito("LLEGADA_PUERTO", d("2026-09-09"), existentes, AHORA)).toMatch(/anterior/);
    expect(validarHito("LLEGADA_PUERTO", d("2026-09-10"), existentes, AHORA)).toBeNull();
  });

  it("corregir el embarque no puede dejarlo después de la llegada a puerto", () => {
    const existentes: HitosExistentes = { LLEGADA_PUERTO: d("2026-10-01") };
    expect(validarHito("EMBARQUE_REAL", d("2026-10-02"), existentes, AHORA)).toMatch(/posterior/);
  });

  it("la inspección y la recepción en planta no pueden ser anteriores a la llegada a puerto", () => {
    const existentes: HitosExistentes = { LLEGADA_PUERTO: d("2026-10-10") };
    expect(validarHito("INSPECCION_ADUANERA", d("2026-10-09"), existentes, AHORA)).toMatch(
      /anterior/,
    );
    expect(validarHito("RECEPCION_PLANTA", d("2026-10-09"), existentes, AHORA)).toMatch(/anterior/);
    expect(validarHito("INSPECCION_ADUANERA", d("2026-10-12"), existentes, AHORA)).toBeNull();
  });

  it("la inspección no impone orden respecto de la recepción en planta (puede recibirse antes del levante)", () => {
    const existentes: HitosExistentes = {
      LLEGADA_PUERTO: d("2026-10-01"),
      RECEPCION_PLANTA: d("2026-10-05"),
    };
    expect(validarHito("INSPECCION_ADUANERA", d("2026-10-08"), existentes, AHORA)).toBeNull();
  });
});
