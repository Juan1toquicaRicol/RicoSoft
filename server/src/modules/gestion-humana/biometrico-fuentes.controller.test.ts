import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

/**
 * Los controllers de gestion-humana no tienen precedente de tests HTTP con
 * supertest+JWT real en este proyecto (ninguno de los controllers
 * existentes lo tiene). Se prueban invocando el handler exportado
 * directamente con un AuthenticatedRequest/Response fabricados y Prisma
 * mockeado — mismo espíritu que biometrico-import.service.test.ts.
 */

const findManyMock = vi.fn();
const findFirstMock = vi.fn();
const createMock = vi.fn();
const countMock = vi.fn();
const logCountMock = vi.fn();
const updateMock = vi.fn();
const auditoriaCreateMock = vi.fn();

class PrismaClientKnownRequestErrorFake extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

vi.mock("@prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: PrismaClientKnownRequestErrorFake },
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    fuenteBiometrica: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      count: (...args: unknown[]) => countMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
    auditoria: { create: (...args: unknown[]) => auditoriaCreateMock(...args) },
    sincronizacionBiometricoLog: { count: (...args: unknown[]) => logCountMock(...args) },
  },
}));

function fakeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
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

const FUENTE_TENANT_A = {
  id: "fuente-1",
  tenantId: "tenant-A",
  nombre: "crosschex-flexipack",
  proveedor: "anviz",
  activa: true,
  lastProcessedLogId: 100,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
  sincronizaciones: [],
};

describe("biometrico-fuentes.controller", () => {
  beforeEach(() => {
    countMock.mockReset();
    countMock.mockResolvedValue(0);
    logCountMock.mockReset();
    logCountMock.mockResolvedValue(0);
    findManyMock.mockReset();
    findFirstMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    auditoriaCreateMock.mockReset();
    auditoriaCreateMock.mockResolvedValue({});
  });

  describe("listarFuentesBiometricas", () => {
    it("solo lista fuentes del tenant del usuario autenticado", async () => {
      findManyMock.mockResolvedValue([FUENTE_TENANT_A]);
      const { listarFuentesBiometricas } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await listarFuentesBiometricas(fakeReq(), res);

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "tenant-A" } }),
      );
      expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ id: "fuente-1" })]);
    });
  });

  describe("obtenerFuenteBiometrica", () => {
    it("404 si la fuente no existe o pertenece a otro tenant (no se distingue, para no filtrar existencia)", async () => {
      findFirstMock.mockResolvedValue(null);
      const { obtenerFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await obtenerFuenteBiometrica(fakeReq({ params: { id: "fuente-de-otro-tenant" } }), res);

      expect(findFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "fuente-de-otro-tenant", tenantId: "tenant-A" } }),
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("200 con la fuente cuando pertenece al tenant", async () => {
      findFirstMock.mockResolvedValue(FUENTE_TENANT_A);
      const { obtenerFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await obtenerFuenteBiometrica(fakeReq({ params: { id: "fuente-1" } }), res);

      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "fuente-1" }));
    });
  });

  describe("crearFuenteBiometrica", () => {
    it("crea la fuente con el tenantId del usuario autenticado, nunca del body", async () => {
      createMock.mockResolvedValue({ ...FUENTE_TENANT_A, sincronizaciones: undefined });
      const { crearFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await crearFuenteBiometrica(
        fakeReq({
          body: {
            nombre: "crosschex-flexipack",
            proveedor: "anviz",
            tenantId: "tenant-B-inyectado",
          },
        }),
        res,
      );

      expect(createMock).toHaveBeenCalledWith({
        data: { tenantId: "tenant-A", nombre: "crosschex-flexipack", proveedor: "anviz" },
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("rechaza un proveedor no soportado", async () => {
      const { crearFuenteBiometrica } = await import("./biometrico-fuentes.controller");
      const res = fakeRes();
      await crearFuenteBiometrica(
        fakeReq({ body: { nombre: "sede-b", proveedor: "hikvision" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(createMock).not.toHaveBeenCalled();
    });

    it("rechaza un nombre vacío o demasiado corto", async () => {
      const { crearFuenteBiometrica } = await import("./biometrico-fuentes.controller");
      const res = fakeRes();
      await crearFuenteBiometrica(fakeReq({ body: { nombre: "ab" } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(createMock).not.toHaveBeenCalled();
    });

    it("nombre duplicado (P2002) responde 409, no 500", async () => {
      createMock.mockRejectedValue(
        new PrismaClientKnownRequestErrorFake("Unique constraint", "P2002"),
      );
      const { crearFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await crearFuenteBiometrica(fakeReq({ body: { nombre: "ya-existe" } }), res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("no expone ni acepta ninguna ruta de archivo/mdb en el body", async () => {
      createMock.mockResolvedValue({ ...FUENTE_TENANT_A, sincronizaciones: undefined });
      const { crearFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await crearFuenteBiometrica(
        fakeReq({ body: { nombre: "sede-c", mdbPath: "C:\\ruta\\inyectada.mdb" } }),
        res,
      );

      const dataEnviada = createMock.mock.calls[0][0].data;
      expect(dataEnviada).not.toHaveProperty("mdbPath");
      expect(Object.keys(dataEnviada).sort()).toEqual(["nombre", "proveedor", "tenantId"]);
    });
  });

  describe("una sola fuente activa por instalación", () => {
    it("crear: si ya hay una fuente activa (de cualquier tenant) responde 409 sin crear y sin revelar de quién es", async () => {
      countMock.mockResolvedValue(1);
      const { crearFuenteBiometrica } = await import("./biometrico-fuentes.controller");
      const res = fakeRes();
      await crearFuenteBiometrica(fakeReq({ body: { nombre: "crosschex-otra" } }), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(createMock).not.toHaveBeenCalled();
      expect(countMock).toHaveBeenCalledWith({ where: { activa: true } });
      const mensaje = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].message as string;
      expect(mensaje).toContain("Ya hay una fuente biométrica activa");
      expect(mensaje).not.toContain("tenant");
    });

    it("activar una fuente inactiva con otra activa responde 409 y no actualiza", async () => {
      findFirstMock.mockResolvedValue({ ...FUENTE_TENANT_A, activa: false });
      countMock.mockResolvedValue(1);
      const { actualizarFuenteBiometrica } = await import("./biometrico-fuentes.controller");
      const res = fakeRes();
      await actualizarFuenteBiometrica(
        fakeReq({ params: { id: "fuente-1" }, body: { activa: true } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);
      expect(updateMock).not.toHaveBeenCalled();
      expect(countMock).toHaveBeenCalledWith({
        where: { activa: true, id: { not: "fuente-1" } },
      });
    });

    it("crear: con una sincronización EN_CURSO responde 409 y no crea", async () => {
      logCountMock.mockResolvedValue(1);
      const { crearFuenteBiometrica } = await import("./biometrico-fuentes.controller");
      const res = fakeRes();
      await crearFuenteBiometrica(fakeReq({ body: { nombre: "crosschex-otra" } }), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(createMock).not.toHaveBeenCalled();
      expect(logCountMock).toHaveBeenCalledWith({ where: { estado: "EN_CURSO" } });
    });

    it("activar una fuente con una sincronización EN_CURSO (de cualquier fuente) responde 409 y no actualiza", async () => {
      findFirstMock.mockResolvedValue({ ...FUENTE_TENANT_A, activa: false });
      countMock.mockResolvedValue(0);
      logCountMock.mockResolvedValue(1);
      const { actualizarFuenteBiometrica } = await import("./biometrico-fuentes.controller");
      const res = fakeRes();
      await actualizarFuenteBiometrica(
        fakeReq({ params: { id: "fuente-1" }, body: { activa: true } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("activar una fuente inactiva sin otras activas sí se permite", async () => {
      findFirstMock.mockResolvedValue({ ...FUENTE_TENANT_A, activa: false });
      updateMock.mockResolvedValue({ ...FUENTE_TENANT_A, activa: true });
      const { actualizarFuenteBiometrica } = await import("./biometrico-fuentes.controller");
      const res = fakeRes();
      await actualizarFuenteBiometrica(
        fakeReq({ params: { id: "fuente-1" }, body: { activa: true } }),
        res,
      );

      expect(updateMock).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(409);
    });

    it("desactivar o renombrar no consulta el límite", async () => {
      findFirstMock.mockResolvedValue(FUENTE_TENANT_A);
      updateMock.mockResolvedValue({ ...FUENTE_TENANT_A, activa: false });
      const { actualizarFuenteBiometrica } = await import("./biometrico-fuentes.controller");
      const res = fakeRes();
      await actualizarFuenteBiometrica(
        fakeReq({ params: { id: "fuente-1" }, body: { activa: false } }),
        res,
      );
      expect(countMock).not.toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalled();
    });
  });

  describe("actualizarFuenteBiometrica", () => {
    it("404 si la fuente es de otro tenant", async () => {
      findFirstMock.mockResolvedValue(null);
      const { actualizarFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await actualizarFuenteBiometrica(
        fakeReq({ params: { id: "x" }, body: { nombre: "nuevo" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("actualiza nombre y activa, nada más", async () => {
      findFirstMock.mockResolvedValue(FUENTE_TENANT_A);
      updateMock.mockResolvedValue({ ...FUENTE_TENANT_A, nombre: "nuevo-nombre", activa: false });
      const { actualizarFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await actualizarFuenteBiometrica(
        fakeReq({ params: { id: "fuente-1" }, body: { nombre: "nuevo-nombre", activa: false } }),
        res,
      );

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "fuente-1" },
        data: { nombre: "nuevo-nombre", activa: false },
      });
    });

    it("ignora intentos de tocar tenantId, proveedor o lastProcessedLogId en el body", async () => {
      findFirstMock.mockResolvedValue(FUENTE_TENANT_A);
      updateMock.mockResolvedValue(FUENTE_TENANT_A);
      const { actualizarFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await actualizarFuenteBiometrica(
        fakeReq({
          params: { id: "fuente-1" },
          body: {
            nombre: "x-nombre",
            tenantId: "tenant-B",
            proveedor: "otro",
            lastProcessedLogId: 999999,
          },
        }),
        res,
      );

      const dataEnviada = updateMock.mock.calls[0][0].data;
      expect(dataEnviada).not.toHaveProperty("tenantId");
      expect(dataEnviada).not.toHaveProperty("proveedor");
      expect(dataEnviada).not.toHaveProperty("lastProcessedLogId");
    });

    it("400 si no se envía ningún campo editable", async () => {
      findFirstMock.mockResolvedValue(FUENTE_TENANT_A);
      const { actualizarFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await actualizarFuenteBiometrica(fakeReq({ params: { id: "fuente-1" }, body: {} }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  describe("desactivarFuenteBiometrica", () => {
    it("desactiva (activa=false) en vez de borrar físicamente", async () => {
      findFirstMock.mockResolvedValue(FUENTE_TENANT_A);
      updateMock.mockResolvedValue({ ...FUENTE_TENANT_A, activa: false });
      const { desactivarFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await desactivarFuenteBiometrica(fakeReq({ params: { id: "fuente-1" } }), res);

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "fuente-1" },
        data: { activa: false },
      });
    });

    it("404 si la fuente es de otro tenant", async () => {
      findFirstMock.mockResolvedValue(null);
      const { desactivarFuenteBiometrica } = await import("./biometrico-fuentes.controller");

      const res = fakeRes();
      await desactivarFuenteBiometrica(fakeReq({ params: { id: "x" } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });
});
