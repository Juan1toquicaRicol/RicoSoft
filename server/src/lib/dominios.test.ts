import { describe, expect, it } from "vitest";
import { esDominioCorporativoValido, DOMINIOS_PERMITIDOS } from "./dominios";

describe("esDominioCorporativoValido", () => {
  it("acepta correos de los dominios corporativos autorizados", () => {
    for (const dominio of DOMINIOS_PERMITIDOS) {
      expect(esDominioCorporativoValido(`usuario@${dominio}`)).toBe(true);
    }
  });

  it("rechaza correos personales comunes", () => {
    expect(esDominioCorporativoValido("usuario@gmail.com")).toBe(false);
    expect(esDominioCorporativoValido("usuario@hotmail.com")).toBe(false);
    expect(esDominioCorporativoValido("usuario@outlook.com")).toBe(false);
  });

  it("es insensible a mayúsculas y espacios", () => {
    const dominio = DOMINIOS_PERMITIDOS[0];
    expect(esDominioCorporativoValido(`  Usuario@${dominio.toUpperCase()}  `)).toBe(true);
  });

  it("rechaza entradas sin arroba o vacías", () => {
    expect(esDominioCorporativoValido("no-es-un-correo")).toBe(false);
    expect(esDominioCorporativoValido("")).toBe(false);
  });
});
