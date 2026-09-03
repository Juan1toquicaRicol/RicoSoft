import { describe, it, expect } from "vitest";
import { evaluarCondicionesCierre } from "./condiciones-cierre";

describe("evaluarCondicionesCierre", () => {
  const lotesOk = [{ id: "l1", estado: "Nacionalizado" }];
  const itemsOk = [{ itemId: "i1", tieneCosteoDefinitivo: true }];
  const sinNovedades: { id: string; prioridad: string; estado: string }[] = [];

  it("puede cerrarse cuando todas las condiciones default se cumplen", () => {
    const r = evaluarCondicionesCierre(lotesOk, itemsOk, sinNovedades);
    expect(r.puedeCerrarse).toBe(true);
    expect(r.faltantes).toEqual([]);
  });

  it("no puede cerrarse si algún lote no está Nacionalizado", () => {
    const r = evaluarCondicionesCierre(
      [{ id: "l1", estado: "En tránsito" }],
      itemsOk,
      sinNovedades,
    );
    expect(r.puedeCerrarse).toBe(false);
    expect(r.condiciones.todosLotesNacionalizados).toBe(false);
  });

  it("no puede cerrarse sin ningún lote registrado", () => {
    const r = evaluarCondicionesCierre([], itemsOk, sinNovedades);
    expect(r.puedeCerrarse).toBe(false);
    expect(r.faltantes).toContain("No hay lotes/embarques registrados.");
  });

  it("no puede cerrarse si algún ítem no tiene costeo definitivo", () => {
    const r = evaluarCondicionesCierre(
      lotesOk,
      [{ itemId: "i1", tieneCosteoDefinitivo: false }],
      sinNovedades,
    );
    expect(r.puedeCerrarse).toBe(false);
    expect(r.condiciones.todosItemsConCosteoDefinitivo).toBe(false);
  });

  it("no puede cerrarse con una novedad de prioridad Alta todavía abierta", () => {
    const r = evaluarCondicionesCierre(lotesOk, itemsOk, [
      { id: "n1", prioridad: "Alta", estado: "Abierta" },
    ]);
    expect(r.puedeCerrarse).toBe(false);
    expect(r.faltantes).toContain("Hay novedades de prioridad Alta todavía sin resolver.");
  });

  it("SÍ puede cerrarse con una novedad de prioridad Alta ya Resuelta", () => {
    const r = evaluarCondicionesCierre(lotesOk, itemsOk, [
      { id: "n1", prioridad: "Alta", estado: "Resuelta" },
    ]);
    expect(r.puedeCerrarse).toBe(true);
  });

  it("SÍ puede cerrarse con novedades abiertas de prioridad Media/Baja (no bloquean el cierre)", () => {
    const r = evaluarCondicionesCierre(lotesOk, itemsOk, [
      { id: "n1", prioridad: "Media", estado: "Abierta" },
      { id: "n2", prioridad: "Baja", estado: "EnGestion" },
    ]);
    expect(r.puedeCerrarse).toBe(true);
  });

  it("los overrides permiten relajar una condición puntual sin tocar la función", () => {
    const r = evaluarCondicionesCierre([], itemsOk, sinNovedades, {
      ignorarLotesNacionalizados: true,
    });
    expect(r.puedeCerrarse).toBe(true);
    expect(r.condiciones.todosLotesNacionalizados).toBe(true);
  });
});
