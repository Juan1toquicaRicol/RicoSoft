import { describe, it, expect } from "vitest";
import {
  mapearTipoMarcacion,
  normalizarBit,
  parsearCheckTime,
  soloFecha,
} from "./crosschex.mapper";

describe("mapearTipoMarcacion", () => {
  it("mapea los CheckType confirmados contra CrossChex", () => {
    expect(mapearTipoMarcacion(0)).toBe("ENTRADA");
    expect(mapearTipoMarcacion(2)).toBe("BREAK");
    expect(mapearTipoMarcacion(3)).toBe("FUERATIEMPO");
  });

  it("conserva CheckType = 1 como OTRO, sin inventar significado", () => {
    expect(mapearTipoMarcacion(1)).toBe("OTRO");
  });

  it("cualquier CheckType no reconocido cae en OTRO, nunca lanza", () => {
    expect(mapearTipoMarcacion(99)).toBe("OTRO");
    expect(mapearTipoMarcacion(-1)).toBe("OTRO");
  });
});

describe("normalizarBit", () => {
  it("normaliza boolean, string y number a boolean", () => {
    expect(normalizarBit(true)).toBe(true);
    expect(normalizarBit(false)).toBe(false);
    expect(normalizarBit("1")).toBe(true);
    expect(normalizarBit("0")).toBe(false);
    expect(normalizarBit(1)).toBe(true);
    expect(normalizarBit(0)).toBe(false);
  });

  it("preserva null/undefined como null en vez de asumir false", () => {
    expect(normalizarBit(null)).toBeNull();
    expect(normalizarBit(undefined)).toBeNull();
  });
});

describe("parsearCheckTime", () => {
  it("preserva los componentes literales de un string 'YYYY-MM-DD HH:mm:ss' sin desplazamiento de zona horaria", () => {
    const resultado = parsearCheckTime("2026-09-06 07:59:00");
    expect(resultado.getUTCFullYear()).toBe(2026);
    expect(resultado.getUTCMonth()).toBe(8); // septiembre, 0-indexado
    expect(resultado.getUTCDate()).toBe(6);
    expect(resultado.getUTCHours()).toBe(7);
    expect(resultado.getUTCMinutes()).toBe(59);
    expect(resultado.getUTCSeconds()).toBe(0);
  });

  it("acepta el separador 'T' además del espacio", () => {
    const resultado = parsearCheckTime("2026-09-06T17:05:30");
    expect(resultado.getUTCHours()).toBe(17);
    expect(resultado.getUTCMinutes()).toBe(5);
  });

  it("preserva los componentes literales de un objeto Date (según su hora local, no UTC)", () => {
    const fechaLocal = new Date(2026, 8, 6, 7, 59, 0); // 6 sep 2026, 07:59:00 hora local del proceso
    const resultado = parsearCheckTime(fechaLocal);
    expect(resultado.getUTCFullYear()).toBe(2026);
    expect(resultado.getUTCMonth()).toBe(8);
    expect(resultado.getUTCDate()).toBe(6);
    expect(resultado.getUTCHours()).toBe(7);
    expect(resultado.getUTCMinutes()).toBe(59);
  });

  it("lanza un error explícito ante un formato irreconocible en vez de devolver una fecha inválida silenciosa", () => {
    expect(() => parsearCheckTime("no-es-una-fecha")).toThrow(/formato inesperado/);
  });
});

describe("soloFecha", () => {
  it("trunca CheckTime al día, en medianoche UTC, sin tocar la hora original de horaMarcacion", () => {
    const resultado = soloFecha("2026-09-06 23:45:00");
    expect(resultado.toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });
});
