import { describe, expect, it } from "vitest";
import { hasPermission, canAccessAdmin, type SessionUser } from "./session";

function usuario(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "1",
    tenantId: "t1",
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
    expect(hasPermission(usuario({ activo: false, permisos: ["facturas.ver"] }), "facturas.ver")).toBe(
      false,
    );
  });

  it("un superadmin tiene cualquier permiso, esté o no en su lista", () => {
    expect(hasPermission(usuario({ isSuperadmin: true, permisos: [] }), "facturas.eliminar")).toBe(true);
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
