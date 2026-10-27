import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

const findManyMock = vi.fn();
const countMock = vi.fn();
const findFirstMock = vi.fn();
const usuariosMock = vi.fn();

vi.mock("../../config/prisma", () => ({
  prisma: {
    marcacionBiometrica: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      count: (...args: unknown[]) => countMock(...args),
      findFirst: (...args: unknown[]) => findFirstMock(...args),
    },
  },
}));

vi.mock("./biometrico-usuarios.service", () => ({
  usuariosDelBiometrico: (...args: unknown[]) => usuariosMock(...args),
}));

function fakeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

function fakeReq(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
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
    body: {},
    ...overrides,
  } as AuthenticatedRequest;
}

const MARCACION_FAKE = {
  id: "m1",
  fecha: new Date("2026-09-07"),
  horaMarcacion: new Date("2026-09-07T08:00:00Z"),
  externalUserId: "33",
  externalLogId: "12345",
  checkType: 0,
  tipoMarcacion: "ENTRADA",
  dispositivoId: "2",
  fuente: { id: "fuente-1", nombre: "sede-a" },
  empleado: { id: "empleado-1", nombres: "Juan", apellidos: "Pérez" },
  // Campos internos que NUNCA deben llegar al serializador de la API.
  workType: 0,
  attFlag: 0,
  checked: false,
  exported: false,
  openDoorFlag: false,
  temperature: 36.5,
  whynoopen: null,
  mask: null,
};

describe("biometrico-marcaciones.controller", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    countMock.mockReset();
    findManyMock.mockResolvedValue([MARCACION_FAKE]);
    countMock.mockResolvedValue(1);
    findFirstMock.mockReset();
    findFirstMock.mockResolvedValue({ horaMarcacion: new Date("2026-09-07T08:00:00Z") });
    usuariosMock.mockReset();
    usuariosMock.mockResolvedValue({ mapa: new Map(), disponible: false, incompleto: false });
  });

  it("siempre filtra por el tenant autenticado", async () => {
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(fakeReq(), res);

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-A" }) }),
    );
  });

  it("nunca expone Pwd ni campos internos de Checkinout (workType, attFlag, checked, exported, openDoorFlag, temperature, whynoopen, mask)", async () => {
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(fakeReq(), res);

    const body = res.json.mock.calls[0][0];
    const item = body.items[0];
    const serializado = JSON.stringify(item).toLowerCase();
    expect(serializado).not.toContain("pwd");
    for (const campo of [
      "worktype",
      "attflag",
      "checked",
      "exported",
      "opendoorflag",
      "temperature",
      "whynoopen",
      "mask",
    ]) {
      expect(Object.keys(item).map((k) => k.toLowerCase())).not.toContain(campo);
    }
    expect(item).toMatchObject({
      id: "m1",
      externalUserId: "33",
      externalLogId: "12345",
      checkType: 0,
      fuente: { id: "fuente-1", nombre: "sede-a" },
      empleado: { id: "empleado-1", nombres: "Juan", apellidos: "Pérez" },
    });
  });

  it("conserva checkType=1 (OTRO) sin reinterpretar", async () => {
    findManyMock.mockResolvedValue([{ ...MARCACION_FAKE, checkType: 1, tipoMarcacion: "OTRO" }]);
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(fakeReq(), res);

    const item = res.json.mock.calls[0][0].items[0];
    expect(item.checkType).toBe(1);
    expect(item.tipoMarcacion).toBe("OTRO");
  });

  it("marcaciones sin empleado asociado muestran empleado: null, nunca se ocultan", async () => {
    findManyMock.mockResolvedValue([{ ...MARCACION_FAKE, empleado: null }]);
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(fakeReq({ query: { soloNoAsociados: "true" } }), res);

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empleadoId: null }) }),
    );
    expect(res.json.mock.calls[0][0].items[0].empleado).toBeNull();
  });

  it("aplica paginación por defecto y acota el límite máximo a 100", async () => {
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(fakeReq({ query: { limit: "99999", page: "2" } }), res);

    const args = findManyMock.mock.calls[0][0];
    expect(args.take).toBe(100);
    expect(args.skip).toBe(100); // (page 2 - 1) * limit 100
  });

  it("filtra por fuenteId, empleadoId, externalUserId y checkType", async () => {
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(
      fakeReq({
        query: {
          fuenteId: "fuente-1",
          empleadoId: "empleado-1",
          externalUserId: "33",
          checkType: "2",
        },
      }),
      res,
    );

    const where = findManyMock.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: "tenant-A",
      fuenteId: "fuente-1",
      empleadoId: "empleado-1",
      externalUserId: "33",
      checkType: 2,
    });
  });

  it("rechaza checkType no numérico con 400", async () => {
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(fakeReq({ query: { checkType: "no-es-numero" } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("rechaza fechaDesde/fechaHasta inválidas con 400", async () => {
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(fakeReq({ query: { fechaDesde: "no-es-una-fecha" } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("filtra por rango de fechas cuando son válidas", async () => {
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(
      fakeReq({ query: { fechaDesde: "2026-09-01", fechaHasta: "2026-09-07" } }),
      res,
    );

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.fecha.gte).toBeInstanceOf(Date);
    expect(where.fecha.lte).toBeInstanceOf(Date);
  });

  it("incluye el usuario registrado en el biométrico (nombre en CrossChex), distinto del empleado de RicoSoft", async () => {
    usuariosMock.mockResolvedValue({
      mapa: new Map([["33", { userid: "33", codigo: "A-33", nombre: "Juan P. (biométrico)" }]]),
      disponible: true,
      incompleto: false,
    });
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(fakeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.items[0].usuarioBiometrico).toEqual({
      nombre: "Juan P. (biométrico)",
      codigo: "A-33",
    });
    expect(body.items[0].empleado).toEqual({
      id: "empleado-1",
      nombres: "Juan",
      apellidos: "Pérez",
    });
    expect(body.nombresDisponibles).toBe(true);
    expect(usuariosMock).toHaveBeenCalledWith("tenant-A");
  });

  it("si el biométrico no está disponible, la marcación se muestra igual con usuarioBiometrico null", async () => {
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(fakeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(1);
    expect(body.items[0].usuarioBiometrico).toBeNull();
    expect(body.nombresDisponibles).toBe(false);
  });

  it("devuelve la última marcación guardada del tenant SIN aplicar los filtros del listado", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(
      fakeReq({ query: { fechaDesde: "2026-10-27", fechaHasta: "2026-10-27" } }),
      res,
    );

    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-A" },
        orderBy: { horaMarcacion: "desc" },
      }),
    );
    expect(res.json.mock.calls[0][0].ultimaMarcacion).toEqual(new Date("2026-09-07T08:00:00Z"));
  });

  it("un filtro de un solo día usa gte y lte sobre la misma medianoche UTC (incluye el día completo)", async () => {
    const { listarMarcacionesBiometricas } = await import("./biometrico-marcaciones.controller");
    const res = fakeRes();
    await listarMarcacionesBiometricas(
      fakeReq({ query: { fechaDesde: "2026-10-27", fechaHasta: "2026-10-27" } }),
      res,
    );

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.fecha.gte.toISOString()).toBe("2026-10-27T00:00:00.000Z");
    expect(where.fecha.lte.toISOString()).toBe("2026-10-27T00:00:00.000Z");
    expect(where.tenantId).toBe("tenant-A");
  });
});
