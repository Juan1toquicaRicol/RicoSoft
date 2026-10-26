import { describe, expect, it } from "vitest";
import { pickErrorVariant } from "./error-page";
import { ApiError } from "@/config/api";

describe("pickErrorVariant", () => {
  it("mapea ApiError kind=network a NETWORK", () => {
    expect(pickErrorVariant(new ApiError("x", "network"))).toBe("NETWORK");
  });

  it("mapea ApiError kind=timeout a TIMEOUT", () => {
    expect(pickErrorVariant(new ApiError("x", "timeout"))).toBe("TIMEOUT");
  });

  it("mapea status 401/403/404 a sus variantes", () => {
    expect(pickErrorVariant(new ApiError("x", "http", 401))).toBe("401");
    expect(pickErrorVariant(new ApiError("x", "http", 403))).toBe("403");
    expect(pickErrorVariant(new ApiError("x", "http", 404))).toBe("404");
  });

  it("mapea status >= 500 a 500", () => {
    expect(pickErrorVariant(new ApiError("x", "http", 500))).toBe("500");
    expect(pickErrorVariant(new ApiError("x", "http", 503))).toBe("500");
  });

  it("un 409/422 de negocio (http, sin variante global) cae en UNKNOWN, no en 500", () => {
    // Los módulos siguen mostrando estos errores como mensaje contextual en
    // el formulario (no se enrutan a la pantalla global); esta prueba
    // documenta que la clasificación no los confunde con un 500.
    expect(pickErrorVariant(new ApiError("Ya existe la proforma N.º 3899", "http", 409))).toBe(
      "UNKNOWN",
    );
    expect(pickErrorVariant(new ApiError("Datos inválidos", "http", 422))).toBe("UNKNOWN");
  });

  it("un Error genérico (no ApiError), como de un Error Boundary de React, cae en UNKNOWN", () => {
    expect(pickErrorVariant(new Error("boom"))).toBe("UNKNOWN");
  });
});
