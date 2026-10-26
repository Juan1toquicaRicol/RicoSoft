import { describe, it, expect } from "vitest";
import {
  validarFormaDestinatario,
  tieneDestinatariosDuplicados,
  type DestinatarioLogico,
} from "./motor-destinatarios";

/**
 * Motor genérico de destinatarios (Fase 5.3) — pruebas puras (sin DB) para
 * validarFormaDestinatario/tieneDestinatariosDuplicados. Las pruebas con DB real
 * de resolverDestinatariosDesdeLista/resolverDestinatarios viven en
 * motor-destinatarios.integration.test.ts (suite de integración).
 */

describe("validarFormaDestinatario (pura, sin DB)", () => {
  it("USUARIO requiere usuarioId y nada más", () => {
    expect(validarFormaDestinatario({ tipo: "USUARIO" })).not.toBeNull();
    expect(validarFormaDestinatario({ tipo: "USUARIO", usuarioId: "u1" })).toBeNull();
    expect(
      validarFormaDestinatario({ tipo: "USUARIO", usuarioId: "u1", perfilId: "p1" }),
    ).not.toBeNull();
  });

  it("PERFIL requiere perfilId y nada más", () => {
    expect(validarFormaDestinatario({ tipo: "PERFIL" })).not.toBeNull();
    expect(validarFormaDestinatario({ tipo: "PERFIL", perfilId: "p1" })).toBeNull();
  });

  it("AREA requiere departamentoId y nada más", () => {
    expect(validarFormaDestinatario({ tipo: "AREA" })).not.toBeNull();
    expect(validarFormaDestinatario({ tipo: "AREA", departamentoId: "d1" })).toBeNull();
  });

  it("PERMISO requiere permisoClave y nada más", () => {
    expect(validarFormaDestinatario({ tipo: "PERMISO" })).not.toBeNull();
    expect(validarFormaDestinatario({ tipo: "PERMISO", permisoClave: "x.ver" })).toBeNull();
  });

  it("RESPONSABLE_REGISTRO no admite ningún id", () => {
    expect(validarFormaDestinatario({ tipo: "RESPONSABLE_REGISTRO" })).toBeNull();
    expect(
      validarFormaDestinatario({ tipo: "RESPONSABLE_REGISTRO", usuarioId: "u1" }),
    ).not.toBeNull();
  });

  it("JEFE_AREA admite departamentoId opcional, pero nada más", () => {
    expect(validarFormaDestinatario({ tipo: "JEFE_AREA" })).toBeNull();
    expect(validarFormaDestinatario({ tipo: "JEFE_AREA", departamentoId: "d1" })).toBeNull();
    expect(validarFormaDestinatario({ tipo: "JEFE_AREA", usuarioId: "u1" })).not.toBeNull();
  });

  it("rechaza un tipo desconocido", () => {
    expect(
      validarFormaDestinatario({ tipo: "NO_EXISTE" as DestinatarioLogico["tipo"] }),
    ).not.toBeNull();
  });
});

describe("tieneDestinatariosDuplicados (pura, sin DB)", () => {
  it("detecta el mismo PERFIL repetido", () => {
    expect(
      tieneDestinatariosDuplicados([
        { tipo: "PERFIL", perfilId: "p1" },
        { tipo: "PERFIL", perfilId: "p1" },
      ]),
    ).toBe(true);
  });

  it("no confunde el mismo id bajo tipos distintos", () => {
    expect(
      tieneDestinatariosDuplicados([
        { tipo: "PERFIL", perfilId: "x" },
        { tipo: "USUARIO", usuarioId: "x" },
      ]),
    ).toBe(false);
  });

  it("permite dos RESPONSABLE_REGISTRO como inválido (misma clave lógica)", () => {
    expect(
      tieneDestinatariosDuplicados([
        { tipo: "RESPONSABLE_REGISTRO" },
        { tipo: "RESPONSABLE_REGISTRO" },
      ]),
    ).toBe(true);
  });
});
