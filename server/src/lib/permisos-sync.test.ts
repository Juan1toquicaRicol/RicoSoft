import { describe, expect, it } from "vitest";
import { PERMISOS_SISTEMA as PERMISOS_BACKEND } from "./permissions";
// El catálogo del frontend (src/lib/auth-permissions.ts) es un archivo sin
// dependencias externas (solo constantes), por lo que puede importarse
// directamente desde este test para comparar ambas copias. Backend y
// frontend son paquetes npm separados y no comparten build, así que el
// catálogo está intencionalmente duplicado en los dos lados; este test es lo
// que evita que diverjan en silencio.
import { PERMISOS_SISTEMA as PERMISOS_FRONTEND } from "../../../src/lib/auth-permissions";

describe("catálogo de permisos backend/frontend", () => {
  it("tiene exactamente las mismas claves y valores en ambos lados", () => {
    expect(PERMISOS_BACKEND).toEqual(PERMISOS_FRONTEND);
  });
});
