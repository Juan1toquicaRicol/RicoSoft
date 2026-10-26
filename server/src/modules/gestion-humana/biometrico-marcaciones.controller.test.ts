import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

const findManyMock = vi.fn();
const countMock = vi.fn();

vi.mock("../../config/prisma", () => ({
  prisma: {
    marcacionBiometrica: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      count: (...args: unknown[]) => countMock(...args),
    },
  },
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
});
