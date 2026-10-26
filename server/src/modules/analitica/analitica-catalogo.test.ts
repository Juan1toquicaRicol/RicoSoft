import { describe, it, expect } from "vitest";
import {
  METRICAS,
  DIMENSIONES,
  visualizacionesPermitidas,
  validarConfiguracionAnalisis,
  type ConfiguracionAnalisis,
} from "./analitica-catalogo";

/**
 * Catálogo cerrado de métricas/dimensiones del constructor de análisis —
 * funciones puras, sin I/O. Cubre exactamente lo que pide la tarea: métrica
 * margen, ventas por día, margen por vendedor, clientes, validación de
 * métricas permitidas, validación de dimensiones permitidas (rechazo de
 * combinación inválida) y combinaciones inválidas.
 */

const base: ConfiguracionAnalisis = {
  metrica: "margen",
  dimensionPrincipal: "cliente",
  fechaInicio: "2026-01-01",
  fechaFin: "2026-02-01",
};

describe("catálogo de métricas/dimensiones", () => {
  it("expone exactamente margen, ventas y clientes", () => {
    expect(METRICAS.map((m) => m.key).sort()).toEqual(["clientes", "margen", "ventas"]);
  });

  it("expone exactamente cliente, vendedor y fecha", () => {
    expect(DIMENSIONES.map((d) => d.key).sort()).toEqual(["cliente", "fecha", "vendedor"]);
  });

  it("margen admite cliente y vendedor, no fecha", () => {
    const margen = METRICAS.find((m) => m.key === "margen")!;
    expect(margen.allowedDimensions).toEqual(["cliente", "vendedor"]);
  });

  it("ventas admite fecha, vendedor y cliente", () => {
    const ventas = METRICAS.find((m) => m.key === "ventas")!;
    expect(ventas.allowedDimensions).toEqual(["fecha", "vendedor", "cliente"]);
  });

  it("clientes solo admite dimensión cliente", () => {
    const clientes = METRICAS.find((m) => m.key === "clientes")!;
    expect(clientes.allowedDimensions).toEqual(["cliente"]);
  });

  it("solo la dimensión fecha permite línea/área", () => {
    expect(visualizacionesPermitidas("fecha")).toEqual(expect.arrayContaining(["linea", "area"]));
    expect(visualizacionesPermitidas("cliente")).not.toContain("linea");
    expect(visualizacionesPermitidas("vendedor")).not.toContain("area");
  });
});

describe("validarConfiguracionAnalisis", () => {
  it("acepta margen agrupado por cliente (válida)", () => {
    expect(validarConfiguracionAnalisis(base).ok).toBe(true);
  });

  it("acepta margen agrupado por vendedor (válida)", () => {
    expect(validarConfiguracionAnalisis({ ...base, dimensionPrincipal: "vendedor" }).ok).toBe(true);
  });

  it("acepta ventas agrupado por fecha (ventas por día, válida)", () => {
    expect(
      validarConfiguracionAnalisis({ ...base, metrica: "ventas", dimensionPrincipal: "fecha" }).ok,
    ).toBe(true);
  });

  it("acepta clientes agrupado por cliente (análisis de clientes, válida)", () => {
    expect(
      validarConfiguracionAnalisis({ ...base, metrica: "clientes", dimensionPrincipal: "cliente" })
        .ok,
    ).toBe(true);
  });

  it("rechaza una métrica desconocida", () => {
    const r = validarConfiguracionAnalisis({
      ...base,
      metrica: "inventado" as ConfiguracionAnalisis["metrica"],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/desconocida/i);
  });

  it("rechaza una dimensión desconocida", () => {
    const r = validarConfiguracionAnalisis({
      ...base,
      dimensionPrincipal: "producto" as ConfiguracionAnalisis["dimensionPrincipal"],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/desconocida/i);
  });

  it("rechaza clientes agrupado por vendedor (combinación no permitida por el catálogo)", () => {
    const r = validarConfiguracionAnalisis({
      ...base,
      metrica: "clientes",
      dimensionPrincipal: "vendedor",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no admite agrupar/i);
  });

  it("rechaza margen agrupado por fecha (combinación no permitida por el catálogo)", () => {
    const r = validarConfiguracionAnalisis({ ...base, dimensionPrincipal: "fecha" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no admite agrupar/i);
  });

  it("rechaza fechaInicio posterior o igual a fechaFin", () => {
    const r = validarConfiguracionAnalisis({
      ...base,
      fechaInicio: "2026-02-01",
      fechaFin: "2026-02-01",
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza fechas inválidas", () => {
    const r = validarConfiguracionAnalisis({ ...base, fechaInicio: "no-es-una-fecha" });
    expect(r.ok).toBe(false);
  });

  it("rechaza una visualización que no aplica a la dimensión (línea sin fecha)", () => {
    const r = validarConfiguracionAnalisis({ ...base, visualizacion: "linea" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no aplica/i);
  });

  it("acepta línea cuando la dimensión es fecha", () => {
    const r = validarConfiguracionAnalisis({
      ...base,
      metrica: "ventas",
      dimensionPrincipal: "fecha",
      visualizacion: "linea",
    });
    expect(r.ok).toBe(true);
  });

  it("rechaza un ordenarPor que no es un campo ordenable de la métrica", () => {
    const r = validarConfiguracionAnalisis({ ...base, ordenarPor: "kilos" });
    expect(r.ok).toBe(false);
  });

  it("rechaza un límite no positivo", () => {
    expect(validarConfiguracionAnalisis({ ...base, limite: 0 }).ok).toBe(false);
    expect(validarConfiguracionAnalisis({ ...base, limite: -5 }).ok).toBe(false);
  });

  it("rechaza dimensión secundaria igual a la principal", () => {
    const r = validarConfiguracionAnalisis({
      ...base,
      dimensionPrincipal: "cliente",
      dimensionSecundaria: "cliente",
    });
    expect(r.ok).toBe(false);
  });
});
