import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * crearRol (auditoría de seguridad 2026-10-20): definir los permisos de un rol
 * exige "roles.asignar_permisos" también al CREAR, igual que al editar
 * (actualizarRol); "roles.crear" solo permite crear el rol.
 */
const db = vi.hoisted(() => ({
  rolCreate: vi.fn(),
  auditoriaCreate: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    rol: { create: db.rolCreate },
    auditoria: { create: db.auditoriaCreate },
  },
}));
vi.mock("../permisos/permisos.service", () => ({
  obtenerCodigosPermisosAsignables: vi.fn(
    async () => new Set(["facturas.ver", "usuarios.eliminar"]),
  ),
}));

import { crearRol } from "./roles.controller";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function crearRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function crearReq(
  permisosActor: string[],
  body: Record<string, unknown>,
  isSuperadmin = false,
): AuthenticatedRequest {
  return {
    body,
    user: { id: "actor-1", tenantId: "t1", nombre: "Actor", isSuperadmin, permisos: permisosActor },
  } as unknown as AuthenticatedRequest;
}

describe("crearRol — permisos del rol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.rolCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "rol-1",
      descripcion: null,
      esSistema: false,
      activo: true,
      ...data,
    }));
    db.auditoriaCreate.mockResolvedValue({});
  });

  it("rechaza (403) a quien solo tiene roles.crear si incluye permisos", async () => {
    const res = crearRes();
    await crearRol(
      crearReq(["roles.crear"], { nombre: "Nuevo", permisos: ["usuarios.eliminar"] }),
      res as never,
    );

    expect(res.statusCode).toBe(403);
    expect(db.rolCreate).not.toHaveBeenCalled();
    expect(db.auditoriaCreate).not.toHaveBeenCalled();
  });

  it("permite crear un rol sin permisos con solo roles.crear", async () => {
    const res = crearRes();
    await crearRol(crearReq(["roles.crear"], { nombre: "Vacío", permisos: [] }), res as never);

    expect(res.statusCode).toBe(201);
    expect(db.rolCreate.mock.calls[0][0].data.permisos).toBe("[]");
  });

  it("ignora códigos fuera del catálogo: con solo roles.crear no cuenta como definir permisos", async () => {
    const res = crearRes();
    await crearRol(
      crearReq(["roles.crear"], { nombre: "Inválidos", permisos: ["no.existe"] }),
      res as never,
    );

    expect(res.statusCode).toBe(201);
    expect(db.rolCreate.mock.calls[0][0].data.permisos).toBe("[]");
  });

  it("permite incluir permisos a quien tiene roles.crear y roles.asignar_permisos", async () => {
    const res = crearRes();
    await crearRol(
      crearReq(["roles.crear", "roles.asignar_permisos"], {
        nombre: "Con permisos",
        permisos: ["facturas.ver"],
      }),
      res as never,
    );

    expect(res.statusCode).toBe(201);
    expect(db.rolCreate.mock.calls[0][0].data.permisos).toBe(JSON.stringify(["facturas.ver"]));
    expect(db.rolCreate.mock.calls[0][0].data.tenantId).toBe("t1");
  });

  it("permite a un superadministrador definir permisos", async () => {
    const res = crearRes();
    await crearRol(
      crearReq([], { nombre: "Super", permisos: ["facturas.ver"] }, true),
      res as never,
    );

    expect(res.statusCode).toBe(201);
  });
});
