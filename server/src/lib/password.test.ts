import { describe, expect, it } from "vitest";
import { validarPasswordSegura } from "./password";

describe("validarPasswordSegura", () => {
  it("acepta una contraseña con mayúscula, minúscula, número y 8+ caracteres", () => {
    expect(validarPasswordSegura("Segura123")).toBeNull();
  });

  it("rechaza contraseñas cortas", () => {
    expect(validarPasswordSegura("Ab1")).toMatch(/al menos 8 caracteres/);
  });

  it("rechaza contraseñas sin minúscula", () => {
    expect(validarPasswordSegura("SEGURA123")).toMatch(/minúscula/);
  });

  it("rechaza contraseñas sin mayúscula", () => {
    expect(validarPasswordSegura("segura123")).toMatch(/mayúscula/);
  });

  it("rechaza contraseñas sin número", () => {
    expect(validarPasswordSegura("SeguraSinNumero")).toMatch(/número/);
  });

  it("rechaza valores que no son string", () => {
    expect(validarPasswordSegura(undefined)).not.toBeNull();
    expect(validarPasswordSegura(12345678)).not.toBeNull();
  });
});
