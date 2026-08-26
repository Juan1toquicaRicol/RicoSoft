import { describe, expect, it } from "vitest";
import { parseRolPermisos, PERMISOS_SISTEMA } from "./permissions";

describe("parseRolPermisos", () => {
  it("parsea un array JSON válido de permisos", () => {
    const json = JSON.stringify([PERMISOS_SISTEMA.FACTURAS_VER, PERMISOS_SISTEMA.FACTURAS_CREAR]);
    expect(parseRolPermisos(json)).toEqual([
      PERMISOS_SISTEMA.FACTURAS_VER,
      PERMISOS_SISTEMA.FACTURAS_CREAR,
    ]);
  });

  it("devuelve un array vacío para null, undefined o cadena vacía", () => {
    expect(parseRolPermisos(null)).toEqual([]);
    expect(parseRolPermisos(undefined)).toEqual([]);
    expect(parseRolPermisos("")).toEqual([]);
  });

  it("devuelve un array vacío ante JSON inválido, en vez de lanzar", () => {
    expect(parseRolPermisos("{esto no es json válido")).toEqual([]);
  });

  it("filtra elementos que no sean strings", () => {
    expect(parseRolPermisos(JSON.stringify(["ok.permiso", 42, null, {}]))).toEqual(["ok.permiso"]);
  });

  it("devuelve un array vacío si el JSON es válido pero no es un array", () => {
    expect(parseRolPermisos(JSON.stringify({ no: "es un array" }))).toEqual([]);
  });
});
