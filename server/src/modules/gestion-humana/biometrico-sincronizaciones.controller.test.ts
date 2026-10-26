import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

const logFindManyMock = vi.fn();
const logCountMock = vi.fn();
const logFindFirstMock = vi.fn();
const fuenteFindFirstMock = vi.fn();
const fuenteCountMock = vi.fn();
const auditoriaCreateMock = vi.fn();
const sincronizarFuenteBiometricaMock = vi.fn();
const leerConfigSchedulerCrossChexMock = vi.fn();

class SincronizacionEnCursoErrorFake extends Error {}
class FuenteBiometricaNoEncontradaErrorFake extends Error {}

vi.mock("../../config/prisma", () => ({
  prisma: {
    sincronizacionBiometricoLog: {
      findMany: (...args: unknown[]) => logFindManyMock(...args),
      count: (...args: unknown[]) => logCountMock(...args),
      findFirst: (...args: unknown[]) => logFindFirstMock(...args),
    },
    fuenteBiometrica: {
      findFirst: (...args: unknown[]) => fuenteFindFirstMock(...args),
      count: (...args: unknown[]) => fuenteCountMock(...args),
    },
    auditoria: { create: (...args: unknown[]) => auditoriaCreateMock(...args) },
  },
}));

vi.mock("./biometrico-import.service", () => ({
  sincronizarFuenteBiometrica: (...args: unknown[]) => sincronizarFuenteBiometricaMock(...args),
  SincronizacionEnCursoError: SincronizacionEnCursoErrorFake,
  FuenteBiometricaNoEncontradaError: FuenteBiometricaNoEncontradaErrorFake,
}));

vi.mock("../../jobs/crosschex-sync.job", () => ({
  leerConfigSchedulerCrossChex: (...args: unknown[]) => leerConfigSchedulerCrossChexMock(...args),
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

const LOG_FAKE = {
  id: "log-1",
  fuente: { id: "fuente-1", nombre: "sede-a" },
  estado: "COMPLETADO",
  iniciadoEn: new Date("2026-09-07T08:00:00Z"),
  finalizadoEn: new Date("2026-09-07T08:00:05Z"),
  logIdDesde: 100,
  logIdHasta: 150,
  leidos: 50,
  insertados: 45,
  duplicados: 5,
  sinEmpleado: 2,
  erroresCount: 0,
  mensajeError: null,
};

const FUENTE_A = {
  id: "fuente-1",
  tenantId: "tenant-A",
  nombre: "sede-a",
  proveedor: "anviz",
  activa: true,
};

describe("biometrico-sincronizaciones.controller", () => {
  beforeEach(() => {
    logFindManyMock.mockReset();
    logCountMock.mockReset();
    logFindFirstMock.mockReset();
    fuenteFindFirstMock.mockReset();
    fuenteCountMock.mockReset();
    fuenteCountMock.mockResolvedValue(1);
    auditoriaCreateMock.mockReset();
    sincronizarFuenteBiometricaMock.mockReset();
    leerConfigSchedulerCrossChexMock.mockReset();

    logFindManyMock.mockResolvedValue([LOG_FAKE]);
    logCountMock.mockResolvedValue(1);
    auditoriaCreateMock.mockResolvedValue({});
    leerConfigSchedulerCrossChexMock.mockReturnValue({
      habilitado: true,
      expresionCron: "* * * * *",
      tamanoLote: 1000,
    });
  });

  describe("listarSincronizacionesBiometricas", () => {
    it("solo lista del tenant autenticado, con paginación", async () => {
      const { listarSincronizacionesBiometricas } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await listarSincronizacionesBiometricas(fakeReq(), res);

      expect(logFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-A" }) }),
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ page: 1, total: 1 }));
    });

    it("calcula duracionMs a partir de iniciadoEn/finalizadoEn", async () => {
      const { listarSincronizacionesBiometricas } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await listarSincronizacionesBiometricas(fakeReq(), res);

      expect(res.json.mock.calls[0][0].items[0].duracionMs).toBe(5000);
    });

    it("rechaza un estado inválido con 400", async () => {
      const { listarSincronizacionesBiometricas } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await listarSincronizacionesBiometricas(fakeReq({ query: { estado: "INVENTADO" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(logFindManyMock).not.toHaveBeenCalled();
    });

    it("filtra por fuenteId y estado válidos", async () => {
      const { listarSincronizacionesBiometricas } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await listarSincronizacionesBiometricas(
        fakeReq({ query: { fuenteId: "fuente-1", estado: "FALLIDO" } }),
        res,
      );

      expect(logFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ fuenteId: "fuente-1", estado: "FALLIDO" }),
        }),
      );
    });
  });

  describe("obtenerSincronizacionBiometrica", () => {
    it("404 si el log es de otro tenant", async () => {
      logFindFirstMock.mockResolvedValue(null);
      const { obtenerSincronizacionBiometrica } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await obtenerSincronizacionBiometrica(fakeReq({ params: { id: "log-de-otro-tenant" } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("sincronizarFuenteBiometricaManual", () => {
    it("404 si la fuente pertenece a otro tenant, no llama al service", async () => {
      fuenteFindFirstMock.mockResolvedValue(null);
      const { sincronizarFuenteBiometricaManual } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await sincronizarFuenteBiometricaManual(
        fakeReq({ params: { id: "fuente-otro-tenant" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(sincronizarFuenteBiometricaMock).not.toHaveBeenCalled();
    });

    it("409 si la fuente está desactivada", async () => {
      fuenteFindFirstMock.mockResolvedValue({ ...FUENTE_A, activa: false });
      const { sincronizarFuenteBiometricaManual } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await sincronizarFuenteBiometricaManual(fakeReq({ params: { id: "fuente-1" } }), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(sincronizarFuenteBiometricaMock).not.toHaveBeenCalled();
    });

    it("409 si hay más de una fuente activa en la instalación: no sincroniza y no revela de quién son", async () => {
      fuenteFindFirstMock.mockResolvedValue(FUENTE_A);
      fuenteCountMock.mockResolvedValue(2);
      const { sincronizarFuenteBiometricaManual } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await sincronizarFuenteBiometricaManual(fakeReq({ params: { id: "fuente-1" } }), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(fuenteCountMock).toHaveBeenCalledWith({ where: { activa: true } });
      expect(sincronizarFuenteBiometricaMock).not.toHaveBeenCalled();
      expect(auditoriaCreateMock).not.toHaveBeenCalled();
      const mensaje = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].message as string;
      expect(mensaje).toContain("2 fuentes biométricas activas");
      expect(mensaje).not.toContain(FUENTE_A.nombre);
    });

    it("ejecuta el service existente con el nombre de la fuente y el tamaño de lote configurado (mismo que el scheduler)", async () => {
      fuenteFindFirstMock.mockResolvedValue(FUENTE_A);
      sincronizarFuenteBiometricaMock.mockResolvedValue({
        fuenteNombre: "sede-a",
        estado: "COMPLETADO",
        leidos: 10,
        insertados: 10,
        duplicados: 0,
        sinEmpleado: 0,
        erroresCount: 0,
        logIdDesde: 0,
        logIdHasta: 10,
      });

      const { sincronizarFuenteBiometricaManual } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await sincronizarFuenteBiometricaManual(fakeReq({ params: { id: "fuente-1" } }), res);

      expect(sincronizarFuenteBiometricaMock).toHaveBeenCalledWith("sede-a", { tamanoLote: 1000 });
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ estado: "COMPLETADO" }));
    });

    it("lock ocupado (SincronizacionEnCursoError) produce 409 controlado, no 500", async () => {
      fuenteFindFirstMock.mockResolvedValue(FUENTE_A);
      sincronizarFuenteBiometricaMock.mockRejectedValue(
        new SincronizacionEnCursoErrorFake("ya en curso"),
      );

      const { sincronizarFuenteBiometricaManual } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await sincronizarFuenteBiometricaManual(fakeReq({ params: { id: "fuente-1" } }), res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("un fallo inesperado del service responde 500 de forma consistente con el resto del proyecto", async () => {
      fuenteFindFirstMock.mockResolvedValue(FUENTE_A);
      sincronizarFuenteBiometricaMock.mockRejectedValue(new Error("boom"));

      const { sincronizarFuenteBiometricaManual } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await sincronizarFuenteBiometricaManual(fakeReq({ params: { id: "fuente-1" } }), res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("una corrida FALLIDA (reporte resuelto, no excepción) igual responde 200 con el reporte", async () => {
      fuenteFindFirstMock.mockResolvedValue(FUENTE_A);
      sincronizarFuenteBiometricaMock.mockResolvedValue({
        fuenteNombre: "sede-a",
        estado: "FALLIDO",
        mensajeError: "columna inválida",
        leidos: 0,
        insertados: 0,
        duplicados: 0,
        sinEmpleado: 0,
        erroresCount: 1,
        logIdDesde: 0,
        logIdHasta: null,
      });

      const { sincronizarFuenteBiometricaManual } =
        await import("./biometrico-sincronizaciones.controller");
      const res = fakeRes();
      await sincronizarFuenteBiometricaManual(fakeReq({ params: { id: "fuente-1" } }), res);

      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ estado: "FALLIDO" }));
    });
  });
});
