import { describe, it, expect } from "vitest";
import {
  puedeActivar,
  puedeAprobar,
  puedeConsultarGmail,
  puedeIngerir,
  puedePausar,
  validarDireccionBuzon,
  validarLimitesBuzon,
  type EstadoBuzon,
} from "./buzones-importaciones.reglas";

describe("direcciones de buzón", () => {
  it("acepta un buzón del dominio y normaliza mayúsculas y espacios", () => {
    expect(validarDireccionBuzon("  Logistica@Ricol.com.co ")).toEqual({
      ok: true,
      direccion: "logistica@ricol.com.co",
    });
  });

  it("rechaza otros dominios aunque se parezcan", () => {
    expect(validarDireccionBuzon("ventas@proveedor.test").ok).toBe(false);
    expect(validarDireccionBuzon("x@ricol.com.co.evil.test").ok).toBe(false);
    expect(validarDireccionBuzon("x@xricol.com.co").ok).toBe(false);
  });

  it("rechaza formatos inválidos", () => {
    expect(validarDireccionBuzon("no-es-correo").ok).toBe(false);
    expect(validarDireccionBuzon("").ok).toBe(false);
  });
});

describe("límites por buzón", () => {
  it("acepta los valores iniciales de 25 correos, 50 adjuntos y 120 segundos", () => {
    expect(validarLimitesBuzon({ correosPorCiclo: 25, adjuntosPorCiclo: 50, timeoutSegundos: 120 }).ok).toBe(true);
  });

  it("rechaza valores fuera de rango o no enteros", () => {
    expect(validarLimitesBuzon({ correosPorCiclo: 0, adjuntosPorCiclo: 50, timeoutSegundos: 120 }).ok).toBe(false);
    expect(validarLimitesBuzon({ correosPorCiclo: 25, adjuntosPorCiclo: 501, timeoutSegundos: 120 }).ok).toBe(false);
    expect(validarLimitesBuzon({ correosPorCiclo: 2.5, adjuntosPorCiclo: 50, timeoutSegundos: 120 }).ok).toBe(false);
    expect(validarLimitesBuzon({ correosPorCiclo: 25, adjuntosPorCiclo: 50, timeoutSegundos: 5 }).ok).toBe(false);
  });
});

describe("transiciones y acceso a Gmail", () => {
  const estados: EstadoBuzon[] = ["REGISTRADO", "APROBADO", "ACTIVO", "PAUSADO"];

  it("sin aprobación no se consulta Gmail", () => {
    expect(puedeConsultarGmail("REGISTRADO")).toBe(false);
    expect(puedeConsultarGmail("APROBADO")).toBe(true);
  });

  it("solo se aprueba un buzón registrado", () => {
    expect(estados.filter(puedeAprobar)).toEqual(["REGISTRADO"]);
  });

  it("solo se activa un buzón aprobado o pausado con etiqueta elegida", () => {
    expect(puedeActivar("APROBADO", null)).toBe(false);
    expect(puedeActivar("APROBADO", "Label_1")).toBe(true);
    expect(puedeActivar("PAUSADO", "Label_1")).toBe(true);
    expect(puedeActivar("REGISTRADO", "Label_1")).toBe(false);
    expect(puedeActivar("ACTIVO", "Label_1")).toBe(false);
  });

  it("solo se pausa un buzón activo", () => {
    expect(estados.filter(puedePausar)).toEqual(["ACTIVO"]);
  });

  it("solo entra al ciclo un buzón activo con etiqueta", () => {
    expect(puedeIngerir("ACTIVO", "Label_1")).toBe(true);
    expect(puedeIngerir("ACTIVO", null)).toBe(false);
    expect(puedeIngerir("PAUSADO", "Label_1")).toBe(false);
    expect(puedeIngerir("APROBADO", "Label_1")).toBe(false);
  });
});
