import { describe, it, expect } from "vitest";
import { esTransicionValidaLiquidacion, esEstadoTerminalLiquidacion } from "./gestion-liquidacion";

describe("esTransicionValidaLiquidacion", () => {
  it("permite la secuencia normal: PENDIENTE -> EN_REVISION -> APROBADA -> EJECUTADA", () => {
    expect(esTransicionValidaLiquidacion("PENDIENTE", "EN_REVISION")).toBe(true);
    expect(esTransicionValidaLiquidacion("EN_REVISION", "APROBADA")).toBe(true);
    expect(esTransicionValidaLiquidacion("APROBADA", "EJECUTADA")).toBe(true);
  });

  it("permite rechazar desde PENDIENTE, EN_REVISION o APROBADA", () => {
    expect(esTransicionValidaLiquidacion("PENDIENTE", "RECHAZADA")).toBe(true);
    expect(esTransicionValidaLiquidacion("EN_REVISION", "RECHAZADA")).toBe(true);
    expect(esTransicionValidaLiquidacion("APROBADA", "RECHAZADA")).toBe(true);
  });

  it("rechaza saltar directo de PENDIENTE a EJECUTADA sin pasar por APROBADA", () => {
    expect(esTransicionValidaLiquidacion("PENDIENTE", "EJECUTADA")).toBe(false);
  });

  it("rechaza cualquier transición desde un estado terminal (RECHAZADA, EJECUTADA)", () => {
    expect(esTransicionValidaLiquidacion("RECHAZADA", "PENDIENTE")).toBe(false);
    expect(esTransicionValidaLiquidacion("EJECUTADA", "PENDIENTE")).toBe(false);
  });
});

describe("esEstadoTerminalLiquidacion", () => {
  it("RECHAZADA y EJECUTADA son terminales", () => {
    expect(esEstadoTerminalLiquidacion("RECHAZADA")).toBe(true);
    expect(esEstadoTerminalLiquidacion("EJECUTADA")).toBe(true);
  });

  it("los demás estados no son terminales", () => {
    expect(esEstadoTerminalLiquidacion("PENDIENTE")).toBe(false);
    expect(esEstadoTerminalLiquidacion("EN_REVISION")).toBe(false);
    expect(esEstadoTerminalLiquidacion("APROBADA")).toBe(false);
  });
});
