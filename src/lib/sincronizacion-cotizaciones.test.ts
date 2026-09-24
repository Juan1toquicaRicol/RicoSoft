import { describe, expect, it } from "vitest";
import {
  fechaDesdePorDefecto,
  resumenSincronizacion,
  type ResultadoSincronizacionCotizaciones,
} from "./sincronizacion-cotizaciones";

const base: ResultadoSincronizacionCotizaciones = {
  modo: "GUARDADO",
  total: 10,
  nuevas: 6,
  yaVinculadas: 4,
  creadas: 6,
  actualizadas: 3,
  omitidas: 1,
  errores: [],
  advertencias: [],
};

describe("resumenSincronizacion", () => {
  it("guardado: 'Nuevas creadas' y 'Ya vinculadas' (+ actualizadas y omitidas)", () => {
    const lineas = resumenSincronizacion(base);
    expect(lineas.map((l) => [l.etiqueta, l.valor])).toEqual([
      ["Nuevas creadas", 6],
      ["Ya vinculadas", 4],
      ["Actualizadas (borrador)", 3],
      ["Omitidas (ya no son borrador)", 1],
    ]);
  });

  it("simulación: muestra lo que se haría ('Nuevas por crear'), sin actualizadas/omitidas", () => {
    const lineas = resumenSincronizacion({
      ...base,
      modo: "SIMULACION",
      creadas: 0,
      actualizadas: 0,
      omitidas: 0,
    });
    expect(lineas.map((l) => [l.etiqueta, l.valor])).toEqual([
      ["Nuevas por crear", 6],
      ["Ya vinculadas", 4],
    ]);
  });

  it("con errores agrega la línea 'Con error' en tono danger", () => {
    const lineas = resumenSincronizacion({
      ...base,
      omitidas: 0,
      errores: [{ erpRowId: 1, consecutivo: "COT-1", motivo: "x" }],
    });
    expect(lineas.at(-1)).toEqual({ etiqueta: "Con error", valor: 1, tono: "danger" });
  });
});

describe("fechaDesdePorDefecto", () => {
  it("hoy menos 30 días en formato YYYY-MM-DD", () => {
    expect(fechaDesdePorDefecto(new Date("2026-09-24T12:00:00Z"))).toBe("2026-08-25");
    expect(fechaDesdePorDefecto(new Date("2026-09-24T12:00:00Z"), 7)).toBe("2026-09-17");
  });
});
