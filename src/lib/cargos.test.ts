import { describe, expect, it } from "vitest";
import { correoRequeridoParaCargo, validarCorreoColaborador, type CargoOpcion } from "./cargos";

const CARGOS: CargoOpcion[] = [
  { id: "a", nombre: "Analista", correoCorporativoRequerido: true },
  { id: "b", nombre: "Operario", correoCorporativoRequerido: false },
];

describe("correoRequeridoParaCargo", () => {
  it("usa la configuración del cargo elegido", () => {
    expect(correoRequeridoParaCargo(CARGOS, "a")).toBe(true);
    expect(correoRequeridoParaCargo(CARGOS, "b")).toBe(false);
  });

  it("sin cargo (o cargo desconocido) conserva la regla histórica: obligatorio", () => {
    expect(correoRequeridoParaCargo(CARGOS, "")).toBe(true);
    expect(correoRequeridoParaCargo(CARGOS, null)).toBe(true);
    expect(correoRequeridoParaCargo(CARGOS, "zzz")).toBe(true);
  });
});

describe("validarCorreoColaborador (frontend)", () => {
  it("vacío con correo requerido => error", () => {
    expect(validarCorreoColaborador("  ", true)).toEqual({
      ok: false,
      message: "El correo corporativo es obligatorio para este cargo.",
    });
  });

  it("vacío con correo opcional => ok y cadena vacía (el backend lo guarda como null)", () => {
    expect(validarCorreoColaborador("", false)).toEqual({ ok: true, correo: "" });
  });

  it("correo personal => error aunque sea opcional", () => {
    expect(validarCorreoColaborador("x@gmail.com", false).ok).toBe(false);
  });

  it("correo corporativo => normalizado", () => {
    expect(validarCorreoColaborador(" Ana@Ricol.com.co ", true)).toEqual({
      ok: true,
      correo: "ana@ricol.com.co",
    });
  });
});

describe("validarCorreoColaborador: dominio de la empresa seleccionada (frontend)", () => {
  it("solo acepta el dominio de la empresa elegida", () => {
    expect(validarCorreoColaborador("a@greensolutions.com.co", true, "GR").ok).toBe(true);
    expect(validarCorreoColaborador("a@ricol.com.co", true, "GR").ok).toBe(false);
    expect(validarCorreoColaborador("a@greesolutions.com.co", true, "GR").ok).toBe(false);
    expect(validarCorreoColaborador("a@flexipackdecolombia.com", false, "FL").ok).toBe(true);
  });
});
