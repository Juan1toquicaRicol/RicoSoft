import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

/**
 * Permisos laborales y faltas: tenant de la sesión y colaborador vigente
 * (D-04: un colaborador eliminado o liquidado no recibe registros nuevos).
 */

const empleadoFindFirstMock = vi.fn();
const permisoCreateMock = vi.fn();
const permisoFindFirstMock = vi.fn();
const permisoFindManyMock = vi.fn();
const permisoUpdateMock = vi.fn();
const faltaCreateMock = vi.fn();
const auditoriaCreateMock = vi.fn();

vi.mock("../../config/prisma", () => ({
  prisma: {
    empleado: { findFirst: (...a: unknown[]) => empleadoFindFirstMock(...a) },
    permisoLaboral: {
      create: (...a: unknown[]) => permisoCreateMock(...a),
      findFirst: (...a: unknown[]) => permisoFindFirstMock(...a),
      findMany: (...a: unknown[]) => permisoFindManyMock(...a),
      update: (...a: unknown[]) => permisoUpdateMock(...a),
    },
    faltaStrike: { create: (...a: unknown[]) => faltaCreateMock(...a) },
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

function fakeReq(body: Record<string, unknown>): AuthenticatedRequest {
  return {
    user: {
      id: "user-1",
      tenantId: "tenant-A",
      nombre: "Ana Admin",
      isSuperadmin: false,
      permisos: [],
    } as never,
    params: {},
    query: {},
    body,
  } as AuthenticatedRequest;
}

const EMP_ACTIVO = {
  id: "emp-1",
  tenantId: "tenant-A",
  empresaId: "RC",
  nombres: "Juan",
  apellidos: "Pérez",
  estado: "Activo",
};

const BODY_PERMISO = {
  empleadoId: "emp-1",
  tipoPermiso: "Vacaciones",
  fechaInicio: "2026-12-01",
  fechaFin: "2026-12-03",
  dias: 3,
  tenantId: "tenant-B",
};

const BODY_FALTA = {
  empleadoId: "emp-1",
  gravedad: "Leve",
  motivo: "Llegada tarde",
  tenantId: "tenant-B",
};

beforeEach(() => {
  [
    empleadoFindFirstMock,
    permisoCreateMock,
    permisoFindFirstMock,
    permisoFindManyMock,
    permisoUpdateMock,
    faltaCreateMock,
    auditoriaCreateMock,
  ].forEach((m) => m.mockReset());
  permisoUpdateMock.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
  auditoriaCreateMock.mockResolvedValue({});
  permisoCreateMock.mockImplementation(async ({ data }) => ({ id: "perm-1", ...data }));
  faltaCreateMock.mockImplementation(async ({ data }) => ({ id: "falta-1", ...data }));
});

describe("crearPermisoLaboral", () => {
  it("busca el colaborador en el tenant de la sesión y excluye eliminados; crea con la empresa del colaborador", async () => {
    const { crearPermisoLaboral } = await import("./permisos-laborales.controller");
    empleadoFindFirstMock.mockResolvedValue(EMP_ACTIVO);
    const res = fakeRes();
    await crearPermisoLaboral(fakeReq(BODY_PERMISO), res);
    expect(empleadoFindFirstMock.mock.calls[0][0].where).toEqual({
      id: "emp-1",
      tenantId: "tenant-A",
      eliminado: false,
    });
    expect(permisoCreateMock.mock.calls[0][0].data).toMatchObject({
      tenantId: "tenant-A",
      empresaId: "RC",
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("colaborador eliminado o de otro tenant (no encontrado) → 404 sin crear", async () => {
    const { crearPermisoLaboral } = await import("./permisos-laborales.controller");
    empleadoFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await crearPermisoLaboral(fakeReq(BODY_PERMISO), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(permisoCreateMock).not.toHaveBeenCalled();
    expect(auditoriaCreateMock).not.toHaveBeenCalled();
  });

  it("colaborador liquidado → 409 sin crear", async () => {
    const { crearPermisoLaboral } = await import("./permisos-laborales.controller");
    const { MENSAJE_COLABORADOR_LIQUIDADO } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue({ ...EMP_ACTIVO, estado: "Liquidado" });
    const res = fakeRes();
    await crearPermisoLaboral(fakeReq(BODY_PERMISO), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: MENSAJE_COLABORADOR_LIQUIDADO });
    expect(permisoCreateMock).not.toHaveBeenCalled();
  });
});

describe("listarPermisosLaborales (D-04: colaboradorVigente)", () => {
  const fila = (empleado: Record<string, unknown>) => ({
    id: "perm-1",
    tenantId: "tenant-A",
    empleadoId: "emp-1",
    estado: "Pendiente",
    empleado: {
      nombres: "Juan",
      apellidos: "Pérez",
      estado: "Activo",
      eliminado: false,
      ...empleado,
    },
  });

  it("filtra por el tenant de la sesión e informa si el colaborador sigue vigente", async () => {
    const { listarPermisosLaborales } = await import("./permisos-laborales.controller");
    permisoFindManyMock.mockResolvedValue([
      fila({}),
      fila({ estado: "Liquidado" }),
      fila({ eliminado: true }),
    ]);
    const res = fakeRes();
    await listarPermisosLaborales(fakeReq({}), res);
    expect(permisoFindManyMock.mock.calls[0][0].where).toEqual({ tenantId: "tenant-A" });
    const filas = res.json.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(filas.map((f) => f.colaboradorVigente)).toEqual([true, false, false]);
    expect(filas[0].nombreEmpleado).toBe("Juan Pérez");
  });

  it("no expone en la respuesta el estado ni la marca de eliminado del colaborador", async () => {
    const { listarPermisosLaborales } = await import("./permisos-laborales.controller");
    permisoFindManyMock.mockResolvedValue([fila({ estado: "Liquidado" })]);
    const res = fakeRes();
    await listarPermisosLaborales(fakeReq({}), res);
    const [f] = res.json.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(f.empleado).toEqual({ nombres: "Juan", apellidos: "Pérez" });
  });
});

describe("actualizarEstadoPermisoLaboral (D-04)", () => {
  const PERMISO = (empleado: Record<string, unknown>) => ({
    id: "perm-1",
    tenantId: "tenant-A",
    estado: "Pendiente",
    empleado: {
      nombres: "Juan",
      apellidos: "Pérez",
      estado: "Activo",
      eliminado: false,
      ...empleado,
    },
  });
  const req = (estado: string) =>
    ({ ...fakeReq({ estado }), params: { id: "perm-1" } }) as AuthenticatedRequest;

  it("busca el permiso en el tenant de la sesión; de otro tenant => 404", async () => {
    const { actualizarEstadoPermisoLaboral } = await import("./permisos-laborales.controller");
    permisoFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await actualizarEstadoPermisoLaboral(req("Aprobado"), res);
    expect(permisoFindFirstMock.mock.calls[0][0].where).toEqual({
      id: "perm-1",
      tenantId: "tenant-A",
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(permisoUpdateMock).not.toHaveBeenCalled();
  });

  it("colaborador vigente: se puede aprobar", async () => {
    const { actualizarEstadoPermisoLaboral } = await import("./permisos-laborales.controller");
    permisoFindFirstMock.mockResolvedValue(PERMISO({}));
    const res = fakeRes();
    await actualizarEstadoPermisoLaboral(req("Aprobado"), res);
    expect(permisoUpdateMock).toHaveBeenCalledWith({
      where: { id: "perm-1" },
      data: { estado: "Aprobado" },
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    ["liquidado", { estado: "Liquidado" }, "Aprobado"],
    ["liquidado", { estado: "Liquidado" }, "Pendiente"],
    ["eliminado", { eliminado: true }, "Aprobado"],
    ["eliminado", { eliminado: true }, "Pendiente"],
  ])("colaborador %s: pasar a %s => 409 sin cambiar ni auditar", async (_c, empleado, estado) => {
    const { actualizarEstadoPermisoLaboral, MENSAJE_PERMISO_COLABORADOR_NO_VIGENTE } =
      await import("./permisos-laborales.controller");
    permisoFindFirstMock.mockResolvedValue(PERMISO(empleado));
    const res = fakeRes();
    await actualizarEstadoPermisoLaboral(req(estado), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: MENSAJE_PERMISO_COLABORADOR_NO_VIGENTE });
    expect(permisoUpdateMock).not.toHaveBeenCalled();
    expect(auditoriaCreateMock).not.toHaveBeenCalled();
  });

  it("colaborador liquidado o eliminado: sí se puede marcar Rechazado (cerrar pendientes antiguos) y se audita", async () => {
    const { actualizarEstadoPermisoLaboral } = await import("./permisos-laborales.controller");
    for (const empleado of [{ estado: "Liquidado" }, { eliminado: true }]) {
      permisoFindFirstMock.mockResolvedValue(PERMISO(empleado));
      const res = fakeRes();
      await actualizarEstadoPermisoLaboral(req("Rechazado"), res);
      expect(res.status).not.toHaveBeenCalled();
    }
    expect(permisoUpdateMock).toHaveBeenCalledTimes(2);
    expect(auditoriaCreateMock.mock.calls[0][0].data.accion).toBe("PERMISO_LABORAL_ACTUALIZADO");
  });
});

describe("crearFalta", () => {
  it("busca el colaborador en el tenant de la sesión y excluye eliminados", async () => {
    const { crearFalta } = await import("./faltas.controller");
    empleadoFindFirstMock.mockResolvedValue(EMP_ACTIVO);
    const res = fakeRes();
    await crearFalta(fakeReq(BODY_FALTA), res);
    expect(empleadoFindFirstMock.mock.calls[0][0].where).toEqual({
      id: "emp-1",
      tenantId: "tenant-A",
      eliminado: false,
    });
    expect(faltaCreateMock.mock.calls[0][0].data.tenantId).toBe("tenant-A");
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("colaborador eliminado o de otro tenant → 404 sin crear", async () => {
    const { crearFalta } = await import("./faltas.controller");
    empleadoFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await crearFalta(fakeReq(BODY_FALTA), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(faltaCreateMock).not.toHaveBeenCalled();
  });

  it("colaborador liquidado → 409 sin crear", async () => {
    const { crearFalta } = await import("./faltas.controller");
    empleadoFindFirstMock.mockResolvedValue({ ...EMP_ACTIVO, estado: "Liquidado" });
    const res = fakeRes();
    await crearFalta(fakeReq(BODY_FALTA), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(faltaCreateMock).not.toHaveBeenCalled();
  });
});
