import { describe, expect, it } from "vitest";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { accesoConfigNegocio, PERMISOS_ENTRADA_CONFIG_NEGOCIO } from "./config-negocio-permisos";

const con =
  (...permisos: string[]) =>
  (p: string) =>
    permisos.includes(p);

describe("acceso a Configuración de negocio (guard = acción de edición)", () => {
  it("sin ninguno de los permisos de edición no entra", () => {
    expect(
      accesoConfigNegocio(con(PERMISOS_SISTEMA.ANALITICA_VER, PERMISOS_SISTEMA.PROFORMAS_VER)),
    ).toEqual({
      puedeEntrar: false,
      puedeEditarInventario: false,
      puedeEditarComercial: false,
    });
  });

  it("inventario.configurar: entra y edita SOLO umbrales de inventario", () => {
    expect(accesoConfigNegocio(con(PERMISOS_SISTEMA.INVENTARIO_CONFIGURAR))).toEqual({
      puedeEntrar: true,
      puedeEditarInventario: true,
      puedeEditarComercial: false,
    });
  });

  it("configuracion.editar: entra (antes no podía) y edita SOLO la sección comercial", () => {
    expect(accesoConfigNegocio(con(PERMISOS_SISTEMA.CONFIGURACION_EDITAR))).toEqual({
      puedeEntrar: true,
      puedeEditarInventario: false,
      puedeEditarComercial: true,
    });
  });

  it("la lista de entrada coincide con los permisos de edición (una sola definición)", () => {
    expect([...PERMISOS_ENTRADA_CONFIG_NEGOCIO].sort()).toEqual(
      ["configuracion.editar", "inventario.configurar"].sort(),
    );
  });
});
