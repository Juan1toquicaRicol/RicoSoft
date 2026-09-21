import { describe, expect, it } from "vitest";
import { ApiError, classifyFetchError } from "./api";

describe("classifyFetchError", () => {
  it("clasifica un timeout (AbortController) como kind=timeout", () => {
    const err = classifyFetchError(new DOMException("aborted", "AbortError"), true);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("timeout");
  });

  it("clasifica 'Failed to fetch' como error de red", () => {
    const err = classifyFetchError(new Error("Failed to fetch"), false);
    expect(err.kind).toBe("network");
    expect(err.message).toMatch(/No se pudo conectar/);
  });

  it("clasifica un AbortError sin timeout explícito igual como red", () => {
    const err = classifyFetchError(new DOMException("aborted", "AbortError"), false);
    expect(err.kind).toBe("network");
  });

  it("conserva un ApiError ya clasificado (ej. 409 de negocio) sin modificarlo", () => {
    const original = new ApiError("Ya existe la proforma N.º 3899", "http", 409);
    const result = classifyFetchError(original, false);
    expect(result).toBe(original);
    expect(result.status).toBe(409);
    expect(result.message).toBe("Ya existe la proforma N.º 3899");
  });

  it("cualquier otro Error genérico cae en kind=network por defecto", () => {
    const err = classifyFetchError(new Error("algo raro"), false);
    expect(err.kind).toBe("network");
    expect(err.message).toBe("algo raro");
  });
});
