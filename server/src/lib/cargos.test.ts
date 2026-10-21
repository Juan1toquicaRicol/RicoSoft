import { describe, it, expect } from "vitest";
import { limpiarNombreCargo, normalizarNombreCargo, validarCorreoColaborador } from "./cargos";

describe("normalizarNombreCargo", () => {
  it("ignora mayúsculas, tildes y espacios repetidos", () => {
    expect(normalizarNombreCargo("  Analista   de Nómina ")).toBe("analista de nomina");
    expect(normalizarNombreCargo("ANALISTA DE NOMINA")).toBe(
      normalizarNombreCargo("analista de nómina"),
    );
  });

  it("distingue cargos realmente distintos", () => {
    expect(normalizarNombreCargo("Operario")).not.toBe(normalizarNombreCargo("Operaria"));
  });
});

describe("limpiarNombreCargo", () => {
  it("conserva tildes y mayúsculas pero colapsa espacios", () => {
    expect(limpiarNombreCargo("  Jefe   de Producción ")).toBe("Jefe de Producción");
  });
});

describe("validarCorreoColaborador", () => {
  it("cargo que exige correo: vacío es rechazado", () => {
    expect(validarCorreoColaborador("", true)).toEqual({
      ok: false,
      message: "El correo corporativo es obligatorio para este cargo.",
    });
    expect(validarCorreoColaborador(undefined, true).ok).toBe(false);
    expect(validarCorreoColaborador("   ", true).ok).toBe(false);
  });

  it("cargo con correo opcional: vacío se guarda como null", () => {
    expect(validarCorreoColaborador("", false)).toEqual({ ok: true, correo: null });
    expect(validarCorreoColaborador(undefined, false)).toEqual({ ok: true, correo: null });
    expect(validarCorreoColaborador(null, false)).toEqual({ ok: true, correo: null });
  });

  it("si se diligencia, siempre debe ser corporativo (también con correo opcional)", () => {
    expect(validarCorreoColaborador("alguien@gmail.com", false).ok).toBe(false);
    expect(validarCorreoColaborador("alguien@gmail.com", true).ok).toBe(false);
  });

  it("normaliza un correo corporativo válido", () => {
    expect(validarCorreoColaborador("  Ana@Ricol.com.co ", true)).toEqual({
      ok: true,
      correo: "ana@ricol.com.co",
    });
  });

  it("un valor no-string con correo opcional se trata como vacío", () => {
    expect(validarCorreoColaborador(123, false)).toEqual({ ok: true, correo: null });
  });
});

describe("validarCorreoColaborador: dominio de la empresa seleccionada", () => {
  it("cada empresa solo acepta su propio dominio", () => {
    expect(validarCorreoColaborador("a@ricol.com.co", true, "RC").ok).toBe(true);
    expect(validarCorreoColaborador("a@flexipackdecolombia.com", true, "FL").ok).toBe(true);
    expect(validarCorreoColaborador("a@greensolutions.com.co", true, "GR")).toEqual({
      ok: true,
      correo: "a@greensolutions.com.co",
    });
  });

  it("rechaza el dominio de OTRA empresa del grupo, aunque sea corporativo", () => {
    const r = validarCorreoColaborador("a@ricol.com.co", true, "GR");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("@greensolutions.com.co");
    expect(validarCorreoColaborador("a@greensolutions.com.co", false, "RC").ok).toBe(false);
  });

  it("el dominio anterior con el error de escritura ya no es válido", () => {
    expect(validarCorreoColaborador("a@greesolutions.com.co", true, "GR").ok).toBe(false);
    expect(validarCorreoColaborador("a@greesolutions.com.co", true).ok).toBe(false);
  });

  it("con cargo de correo opcional vacío sigue siendo null para cualquier empresa", () => {
    expect(validarCorreoColaborador("", false, "GR")).toEqual({ ok: true, correo: null });
  });

  it("empresa desconocida: se conserva la validación general de dominios corporativos", () => {
    expect(validarCorreoColaborador("a@ricol.com.co", true, "XX").ok).toBe(true);
    expect(validarCorreoColaborador("a@gmail.com", true, "XX").ok).toBe(false);
  });
});
