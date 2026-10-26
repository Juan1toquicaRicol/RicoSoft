import { describe, it, expect } from "vitest";
import { validarMontosLiquidacion } from "./liquidacion-entrada";

const base = {
  trmLiquidacion: 4000,
  valorCifTotalUsd: 1000,
  arancelTotalCop: 100000,
  ivaTotalCop: 190000,
};

describe("validarMontosLiquidacion", () => {
  it("acepta montos válidos y convierte textos numéricos; los opcionales omitidos valen 0", () => {
    const r = validarMontosLiquidacion({
      ...base,
      trmLiquidacion: "4000.50",
      fletesNacionalesCop: "250",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.montos.trmLiquidacion).toBe(4000.5);
    expect(r.montos.fletesNacionalesCop).toBe(250);
    expect(r.montos.ivaDescontableCop).toBe(0);
    expect(r.montos.otrosCostosCop).toBe(0);
  });

  it("acepta cero en arancel, IVA y gastos (ej. TLC sin arancel)", () => {
    const r = validarMontosLiquidacion({ ...base, arancelTotalCop: 0, ivaTotalCop: 0 });
    expect(r.ok).toBe(true);
  });

  it("rechaza texto no numérico y cadenas vacías (no las toma como 0 ni como NaN guardado)", () => {
    expect(validarMontosLiquidacion({ ...base, arancelTotalCop: "abc" }).ok).toBe(false);
    expect(validarMontosLiquidacion({ ...base, ivaTotalCop: "" }).ok).toBe(false);
  });

  it("rechaza TRM y CIF no positivos", () => {
    expect(validarMontosLiquidacion({ ...base, trmLiquidacion: 0 }).ok).toBe(false);
    expect(validarMontosLiquidacion({ ...base, valorCifTotalUsd: -1 }).ok).toBe(false);
    const r = validarMontosLiquidacion({ ...base, valorCifTotalUsd: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(/mayor a cero/);
  });

  it("rechaza montos negativos", () => {
    const r = validarMontosLiquidacion({ ...base, agenciamientoCop: -5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(/negativo/);
  });

  it("rechaza IVA descontable mayor al IVA total", () => {
    const r = validarMontosLiquidacion({ ...base, ivaDescontableCop: 190001 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(/IVA descontable/);
    expect(validarMontosLiquidacion({ ...base, ivaDescontableCop: 190000 }).ok).toBe(true);
  });

  it("rechaza Infinity", () => {
    expect(validarMontosLiquidacion({ ...base, otrosCostosCop: Number.POSITIVE_INFINITY }).ok).toBe(
      false,
    );
  });
});
