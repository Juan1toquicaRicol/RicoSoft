import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasPermission,
  canAccessAdmin,
  getToken,
  setToken,
  clearSession,
  getCachedUser,
  setUltimaEmpresaPreferida,
  getUltimaEmpresaPreferida,
  type SessionUser,
} from "./session";

function usuario(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "1",
    tenantId: "t1",
    tenantNombre: "Tenant de Prueba",
    nombre: "Prueba",
    email: "prueba@ricol.com.co",
    telefono: null,
    rol: null,
    isSuperadmin: false,
    activo: true,
    permisos: [],
    ...overrides,
  };
}

describe("hasPermission", () => {
  it("devuelve false sin usuario", () => {
    expect(hasPermission(null, "facturas.ver")).toBe(false);
  });

  it("devuelve false si el usuario está inactivo, aunque tenga el permiso", () => {
    expect(
      hasPermission(usuario({ activo: false, permisos: ["facturas.ver"] }), "facturas.ver"),
    ).toBe(false);
  });

  it("un superadmin tiene cualquier permiso, esté o no en su lista", () => {
    expect(hasPermission(usuario({ isSuperadmin: true, permisos: [] }), "facturas.eliminar")).toBe(
      true,
    );
  });

  it("un usuario normal solo tiene los permisos que están en su lista", () => {
    const u = usuario({ permisos: ["facturas.ver"] });
    expect(hasPermission(u, "facturas.ver")).toBe(true);
    expect(hasPermission(u, "facturas.eliminar")).toBe(false);
  });
});

describe("canAccessAdmin", () => {
  it("un usuario sin permisos administrativos no puede entrar a Configuración", () => {
    expect(canAccessAdmin(usuario({ permisos: ["facturas.ver"] }))).toBe(false);
  });

  it("un usuario con configuracion.ver o usuarios.ver sí puede", () => {
    expect(canAccessAdmin(usuario({ permisos: ["configuracion.ver"] }))).toBe(true);
    expect(canAccessAdmin(usuario({ permisos: ["usuarios.ver"] }))).toBe(true);
  });
});

// TEST 10 del sistema multiempresa: el logout debe eliminar por completo la
// sesión guardada localmente (token + usuario cacheado). Este archivo corre
// bajo entorno "node" (sin DOM), así que se simula un `window`/`localStorage`
// mínimos para poder ejercitar el código real de session.ts tal cual corre
// en el navegador.
describe("logout / clearSession", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    const localStorageMock = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clearSession elimina el token y el usuario cacheado", () => {
    setToken("token-de-prueba");
    localStorage.setItem("user", JSON.stringify(usuario()));
    expect(getToken()).toBe("token-de-prueba");
    expect(getCachedUser()).not.toBeNull();

    clearSession();

    expect(getToken()).toBeNull();
    expect(getCachedUser()).toBeNull();
  });

  it("la preferencia de última empresa es solo UX: sobrevive al logout pero nunca autoriza nada por sí sola", () => {
    setUltimaEmpresaPreferida("tenant-ricol");
    setToken("token-de-prueba");
    clearSession();

    // clearSession no borra la preferencia (es solo un atajo de UX para el
    // selector de login, no un dato de sesión) — pero sin token, ninguna
    // llamada autenticada puede usarla para nada.
    expect(getUltimaEmpresaPreferida()).toBe("tenant-ricol");
    expect(getToken()).toBeNull();
  });
});
