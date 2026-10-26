import { describe, expect, it } from "vitest";
import { PERMISOS_SISTEMA as PERMISOS_BACKEND } from "./permissions";
import { permisosRequeridos, resolverPermiso } from "./catalogo-permisos";
// El catálogo del frontend (src/lib/auth-permissions.ts) es un archivo sin
// dependencias externas (solo constantes), por lo que puede importarse
// directamente desde este test para comparar ambas copias. Backend y
// frontend son paquetes npm separados y no comparten build, así que el
// catálogo está intencionalmente duplicado en los dos lados; este test es lo
// que evita que diverjan en silencio.
import {
  PERMISOS_SISTEMA as PERMISOS_FRONTEND,
  LISTA_PERMISOS_DEFINICION,
} from "../../../src/lib/auth-permissions";

describe("catálogo de permisos backend/frontend", () => {
  it("tiene exactamente las mismas claves y valores en ambos lados", () => {
    expect(PERMISOS_BACKEND).toEqual(PERMISOS_FRONTEND);
  });
});

describe("permiso comercial.proformas.aceptar (3 segmentos)", () => {
  it("existe con el mismo código en backend y frontend", () => {
    expect(PERMISOS_BACKEND.PROFORMAS_ACEPTAR).toBe("comercial.proformas.aceptar");
    expect(PERMISOS_FRONTEND.PROFORMAS_ACEPTAR).toBe("comercial.proformas.aceptar");
  });

  it("está en el catálogo de permisos, en la sección de aceptación de Comercial, y exige proformas.ver", () => {
    const resuelto = resolverPermiso("comercial.proformas.aceptar");
    expect(resuelto).not.toBeNull();
    expect(resuelto).toMatchObject({
      tipo: "especial",
      moduloClave: "comercial",
      seccionClave: "proformas_aceptacion",
      dependeDe: "proformas.ver",
    });
    // requirePermission lo expande: aceptar implica poder ver proformas.
    expect(permisosRequeridos("comercial.proformas.aceptar")).toEqual([
      "comercial.proformas.aceptar",
      "proformas.ver",
    ]);
  });

  it("tiene descriptor visible para la pantalla de Roles del frontend", () => {
    const descriptor = LISTA_PERMISOS_DEFINICION.find(
      (p) => p.id === "comercial.proformas.aceptar",
    );
    expect(descriptor).toBeDefined();
    expect(descriptor?.modulo).toBe("Comercial");
  });
});
