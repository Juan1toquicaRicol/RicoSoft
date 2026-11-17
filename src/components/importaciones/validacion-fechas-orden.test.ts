import { describe, expect, it } from "vitest";

import {
  erroresFechaRequerida,
  fechaRequeridaAnteriorAOrden,
  ID_CAMPO_FECHA_REQUERIDA,
  TEXTO_ERROR_FECHA_REQUERIDA,
} from "./validacion-fechas-orden";

describe("fechaRequeridaAnteriorAOrden (regla real, igual que HEAD)", () => {
  it("inválida solo si la requerida es anterior a la de la orden", () => {
    expect(fechaRequeridaAnteriorAOrden("2026-01-01", "2026-01-02")).toBe(true);
  });

  it("válida: igual, posterior o campos vacíos", () => {
    expect(fechaRequeridaAnteriorAOrden("2026-01-02", "2026-01-02")).toBe(false);
    expect(fechaRequeridaAnteriorAOrden("2026-02-01", "2026-01-02")).toBe(false);
    expect(fechaRequeridaAnteriorAOrden("", "2026-01-02")).toBe(false);
    expect(fechaRequeridaAnteriorAOrden("2026-01-01", "")).toBe(false);
    expect(fechaRequeridaAnteriorAOrden("", "")).toBe(false);
  });
});

describe("erroresFechaRequerida", () => {
  it("el error de fecha tiene etapa 3, texto de HEAD y destino de foco, sin ser de precisión", () => {
    const [e] = erroresFechaRequerida("2026-01-01", "2026-01-02");
    expect(e).toEqual({
      texto: TEXTO_ERROR_FECHA_REQUERIDA,
      etapa: 3,
      focoId: ID_CAMPO_FECHA_REQUERIDA,
    });
    expect("campoId" in e).toBe(false);
    expect(erroresFechaRequerida("2026-01-02", "2026-01-02")).toEqual([]);
  });
});
