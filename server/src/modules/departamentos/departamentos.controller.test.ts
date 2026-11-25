import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

/**
 * Departamentos con cargos de Gestión Humana asociados (CargoColaborador.departamentoId,
 * FK NoAction): eliminar debe bloquearse con 409 (no 500) y convertir un GENERAL en
 * exclusivo no puede dejar cargos de otras empresas apuntando a él.
 */

const departamentoFindFirstMock = vi.fn();
const departamentoUpdateMock = vi.fn();
const departamentoDeleteMock = vi.fn();
const userCountMock = vi.fn();
const membresiaCountMock = vi.fn();
const colaboradorCountMock = vi.fn();
const moduloCountMock = vi.fn();
const proveedorCountMock = vi.fn();
const perfilCountMock = vi.fn();
const cargoCountMock = vi.fn();
const auditoriaCreateMock = vi.fn();

vi.mock("../../config/prisma", () => ({
  prisma: {
    departamento: {
      findFirst: (...a: unknown[]) => departamentoFindFirstMock(...a),
      update: (...a: unknown[]) => departamentoUpdateMock(...a),
      delete: (...a: unknown[]) => departamentoDeleteMock(...a),
    },
    user: { count: (...a: unknown[]) => userCountMock(...a) },
    membresia: { count: (...a: unknown[]) => membresiaCountMock(...a) },
    colaborador: { count: (...a: unknown[]) => colaboradorCountMock(...a) },
    modulo: { count: (...a: unknown[]) => moduloCountMock(...a) },
    proveedor: { count: (...a: unknown[]) => proveedorCountMock(...a) },
    perfilFuncional: { count: (...a: unknown[]) => perfilCountMock(...a) },
    cargoColaborador: { count: (...a: unknown[]) => cargoCountMock(...a) },
    auditoria: { create: (...a: unknown[]) => auditoriaCreateMock(...a) },
  },
}));

function fakeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

function fakeReq(overrides: Partial<AuthenticatedRequest> = {}, isSuperadmin = false) {
  return {
    user: {
      id: "user-1",
      tenantId: "tenant-A",
      nombre: "Ana Admin",
      isSuperadmin,
      permisos: [],
    } as never,
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as AuthenticatedRequest;
}

const SIN_USO = {
  usuarios: 0,
  membresias: 0,
  colaboradores: 0,
  modulos: 0,
  proveedores: 0,
  perfilesFuncionales: 0,
  cargosColaborador: 0,
};

beforeEach(() => {
  [
    departamentoFindFirstMock,
    departamentoUpdateMock,
    departamentoDeleteMock,
    userCountMock,
    membresiaCountMock,
    colaboradorCountMock,
    moduloCountMock,
    proveedorCountMock,
    perfilCountMock,
    cargoCountMock,
    auditoriaCreateMock,
  ].forEach((m) => m.mockReset());
  for (const m of [
    userCountMock,
    membresiaCountMock,
    colaboradorCountMock,
    moduloCountMock,
    proveedorCountMock,
    perfilCountMock,
    cargoCountMock,
  ]) {
    m.mockResolvedValue(0);
  }
  auditoriaCreateMock.mockResolvedValue({});
});

describe("eliminarDepartamento con cargos de Gestión Humana", () => {
  it("departamento del tenant con cargos asociados → 409 con el motivo, sin intentar borrar", async () => {
    const { eliminarDepartamento } = await import("./departamentos.controller");
    departamentoFindFirstMock.mockResolvedValue({
      id: "dep-1",
      tenantId: "tenant-A",
      nombre: "Producción",
      esSistemas: false,
      _count: { ...SIN_USO, cargosColaborador: 2 },
    });
    const res = fakeRes();
    await eliminarDepartamento(fakeReq({ params: { id: "dep-1" } }), res);
    expect(departamentoFindFirstMock.mock.calls[0][0].include._count.select).toMatchObject({
      cargosColaborador: true,
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(String(res.json.mock.calls[0][0].message)).toContain("2 cargo(s) de Gestión Humana");
    expect(departamentoDeleteMock).not.toHaveBeenCalled();
  });

  it("departamento GENERAL sin uso en este tenant pero con cargos de otra empresa → 409", async () => {
    const { eliminarDepartamento } = await import("./departamentos.controller");
    departamentoFindFirstMock.mockResolvedValue({
      id: "dep-g",
      tenantId: null,
      nombre: "Calidad",
      esSistemas: false,
      _count: { ...SIN_USO },
    });
    cargoCountMock.mockResolvedValue(1);
    const res = fakeRes();
    await eliminarDepartamento(fakeReq({ params: { id: "dep-g" } }, true), res);
    expect(cargoCountMock).toHaveBeenCalledWith({ where: { departamentoId: "dep-g" } });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(departamentoDeleteMock).not.toHaveBeenCalled();
  });

  it("sin nada asociado, elimina", async () => {
    const { eliminarDepartamento } = await import("./departamentos.controller");
    departamentoFindFirstMock.mockResolvedValue({
      id: "dep-1",
      tenantId: "tenant-A",
      nombre: "Producción",
      esSistemas: false,
      _count: { ...SIN_USO },
    });
    const res = fakeRes();
    await eliminarDepartamento(fakeReq({ params: { id: "dep-1" } }), res);
    expect(departamentoDeleteMock).toHaveBeenCalledWith({ where: { id: "dep-1" } });
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe("actualizarDepartamento GENERAL → TENANT con cargos de otros tenants", () => {
  it("si hay cargos de OTRA empresa asociados, 409 y no cambia el alcance", async () => {
    const { actualizarDepartamento } = await import("./departamentos.controller");
    departamentoFindFirstMock.mockResolvedValue({
      id: "dep-g",
      tenantId: null,
      nombre: "Calidad",
      esSistemas: false,
      _count: { usuarios: 0, membresias: 0 },
    });
    cargoCountMock.mockResolvedValue(3);
    const res = fakeRes();
    await actualizarDepartamento(
      fakeReq({ params: { id: "dep-g" }, body: { alcance: "TENANT" } }, true),
      res,
    );
    expect(cargoCountMock).toHaveBeenCalledWith({
      where: { departamentoId: "dep-g", tenantId: { not: "tenant-A" } },
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(departamentoUpdateMock).not.toHaveBeenCalled();
  });

  it("si solo hay cargos del propio tenant, permite convertirlo", async () => {
    const { actualizarDepartamento } = await import("./departamentos.controller");
    departamentoFindFirstMock.mockResolvedValue({
      id: "dep-g",
      tenantId: null,
      nombre: "Calidad",
      esSistemas: false,
      _count: { usuarios: 0, membresias: 0 },
    });
    departamentoUpdateMock.mockResolvedValue({
      id: "dep-g",
      tenantId: "tenant-A",
      nombre: "Calidad",
      esSistemas: false,
      activo: true,
      _count: { usuarios: 0 },
    });
    const res = fakeRes();
    await actualizarDepartamento(
      fakeReq({ params: { id: "dep-g" }, body: { alcance: "TENANT" } }, true),
      res,
    );
    expect(departamentoUpdateMock.mock.calls[0][0].data.tenantId).toBe("tenant-A");
    expect(res.status).not.toHaveBeenCalledWith(409);
  });
});
