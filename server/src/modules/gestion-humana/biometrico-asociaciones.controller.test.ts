import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

const empleadoBiometricoFindManyMock = vi.fn();
const empleadoBiometricoCountMock = vi.fn();
const empleadoBiometricoCreateMock = vi.fn();
const empleadoBiometricoFindFirstMock = vi.fn();
const empleadoBiometricoUpdateMock = vi.fn();
const fuenteFindFirstMock = vi.fn();
const usuariosMock = vi.fn(async () => ({ mapa: new Map(), disponible: false, incompleto: false }));
const empleadoFindFirstMock = vi.fn();
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

vi.mock("./biometrico-usuarios.service", () => ({
  usuariosDelBiometrico: (...args: unknown[]) => usuariosMock(...args),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    empleadoBiometrico: {
      findMany: (...args: unknown[]) => empleadoBiometricoFindManyMock(...args),
      count: (...args: unknown[]) => empleadoBiometricoCountMock(...args),
      create: (...args: unknown[]) => empleadoBiometricoCreateMock(...args),
      findFirst: (...args: unknown[]) => empleadoBiometricoFindFirstMock(...args),
      update: (...args: unknown[]) => empleadoBiometricoUpdateMock(...args),
    },
    fuenteBiometrica: { findFirst: (...args: unknown[]) => fuenteFindFirstMock(...args) },
    empleado: { findFirst: (...args: unknown[]) => empleadoFindFirstMock(...args) },
    auditoria: { create: (...args: unknown[]) => auditoriaCreateMock(...args) },
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

const FUENTE_A = {
  id: "fuente-1",
  tenantId: "tenant-A",
  nombre: "sede-a",
  proveedor: "anviz",
  activa: true,
};
const EMPLEADO_A = {
  id: "empleado-1",
  tenantId: "tenant-A",
  nombres: "Juan",
  apellidos: "Pérez",
  eliminado: false,
};

describe("biometrico-asociaciones.controller", () => {
  beforeEach(() => {
    empleadoBiometricoFindManyMock.mockReset();
    empleadoBiometricoCountMock.mockReset();
    empleadoBiometricoCreateMock.mockReset();
    empleadoBiometricoFindFirstMock.mockReset();
    empleadoBiometricoUpdateMock.mockReset();
    fuenteFindFirstMock.mockReset();
    empleadoFindFirstMock.mockReset();
    auditoriaCreateMock.mockReset();
    auditoriaCreateMock.mockResolvedValue({});
    empleadoBiometricoFindManyMock.mockResolvedValue([]);
    empleadoBiometricoCountMock.mockResolvedValue(0);
  });

  describe("listarAsociacionesBiometricas", () => {
    it("siempre filtra por el tenant autenticado", async () => {
      const { listarAsociacionesBiometricas } =
        await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await listarAsociacionesBiometricas(fakeReq(), res);

      expect(empleadoBiometricoFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-A" }) }),
      );
    });

    it("aplica paginación por defecto y respeta límites", async () => {
      const { listarAsociacionesBiometricas } =
        await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await listarAsociacionesBiometricas(fakeReq({ query: { limit: "9999" } }), res);

      const args = empleadoBiometricoFindManyMock.mock.calls[0][0];
      expect(args.take).toBeLessThanOrEqual(100);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, items: [], total: 0 }),
      );
    });

    it("404 si fuenteId pertenece a otro tenant, sin llegar a listar", async () => {
      fuenteFindFirstMock.mockResolvedValue(null);
      const { listarAsociacionesBiometricas } =
        await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await listarAsociacionesBiometricas(
        fakeReq({ query: { fuenteId: "fuente-de-otro-tenant" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(empleadoBiometricoFindManyMock).not.toHaveBeenCalled();
    });

    it("filtra por fuenteId exacto (Fase 6.1: ya no por proveedor), aislando fuentes del mismo proveedor entre sí", async () => {
      fuenteFindFirstMock.mockResolvedValue(FUENTE_A);
      const { listarAsociacionesBiometricas } =
        await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await listarAsociacionesBiometricas(fakeReq({ query: { fuenteId: "fuente-1" } }), res);

      const where = empleadoBiometricoFindManyMock.mock.calls[0][0].where;
      expect(where.fuenteId).toBe("fuente-1");
      expect(where).not.toHaveProperty("proveedor");
    });
  });

  describe("crearAsociacionBiometrica", () => {
    it("crea la asociación con fuenteId y proveedor derivados de la fuente encontrada, nunca del body", async () => {
      fuenteFindFirstMock.mockResolvedValue(FUENTE_A);
      empleadoFindFirstMock.mockResolvedValue(EMPLEADO_A);
      empleadoBiometricoCreateMock.mockResolvedValue({
        id: "assoc-1",
        proveedor: "anviz",
        externalUserId: "33",
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        empleado: EMPLEADO_A,
      });

      const { crearAsociacionBiometrica } = await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await crearAsociacionBiometrica(
        fakeReq({
          body: {
            fuenteId: "fuente-1",
            externalUserId: "33",
            empleadoId: "empleado-1",
            proveedor: "otro-inyectado",
          },
        }),
        res,
      );

      expect(empleadoBiometricoCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            tenantId: "tenant-A",
            empleadoId: "empleado-1",
            fuenteId: "fuente-1",
            proveedor: "anviz",
            externalUserId: "33",
          },
        }),
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("rechaza si la fuente pertenece a otro tenant (404, no expone si existe)", async () => {
      fuenteFindFirstMock.mockResolvedValue(null);
      const { crearAsociacionBiometrica } = await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await crearAsociacionBiometrica(
        fakeReq({
          body: { fuenteId: "fuente-otro-tenant", externalUserId: "33", empleadoId: "empleado-1" },
        }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(empleadoBiometricoCreateMock).not.toHaveBeenCalled();
    });

    it("rechaza si el empleado pertenece a otro tenant", async () => {
      fuenteFindFirstMock.mockResolvedValue(FUENTE_A);
      empleadoFindFirstMock.mockResolvedValue(null); // findFirst ya filtra por tenantId, no aparece
      const { crearAsociacionBiometrica } = await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await crearAsociacionBiometrica(
        fakeReq({
          body: {
            fuenteId: "fuente-1",
            externalUserId: "33",
            empleadoId: "empleado-de-otro-tenant",
          },
        }),
        res,
      );

      expect(empleadoFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-A" }) }),
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(empleadoBiometricoCreateMock).not.toHaveBeenCalled();
    });

    it("duplicado con una asociación INACTIVA existente: el 409 indica que debe reactivarla", async () => {
      fuenteFindFirstMock.mockResolvedValue(FUENTE_A);
      empleadoFindFirstMock.mockResolvedValue(EMPLEADO_A);
      empleadoBiometricoCreateMock.mockRejectedValue(
        new PrismaClientKnownRequestErrorFake("Unique constraint", "P2002"),
      );
      empleadoBiometricoFindFirstMock.mockResolvedValue({ activo: false });

      const { crearAsociacionBiometrica } = await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await crearAsociacionBiometrica(
        fakeReq({ body: { fuenteId: "fuente-1", externalUserId: "33", empleadoId: "empleado-1" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);
      const mensaje = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].message as string;
      expect(mensaje).toContain("INACTIVA");
      expect(mensaje).toContain("Reactívala");
      expect(empleadoBiometricoFindFirstMock.mock.calls[0][0].where.tenantId).toBe("tenant-A");
    });

    it("duplicado (P2002) responde 409 controlado, no 500", async () => {
      fuenteFindFirstMock.mockResolvedValue(FUENTE_A);
      empleadoFindFirstMock.mockResolvedValue(EMPLEADO_A);
      empleadoBiometricoCreateMock.mockRejectedValue(
        new PrismaClientKnownRequestErrorFake("Unique constraint", "P2002"),
      );

      const { crearAsociacionBiometrica } = await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await crearAsociacionBiometrica(
        fakeReq({ body: { fuenteId: "fuente-1", externalUserId: "33", empleadoId: "empleado-1" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("valida campos obligatorios (fuenteId, externalUserId, empleadoId)", async () => {
      const { crearAsociacionBiometrica } = await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await crearAsociacionBiometrica(fakeReq({ body: {} }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(fuenteFindFirstMock).not.toHaveBeenCalled();
    });
  });

  describe("actualizarAsociacionBiometrica (activar/desactivar)", () => {
    it("404 si la asociación es de otro tenant", async () => {
      empleadoBiometricoFindFirstMock.mockResolvedValue(null);
      const { actualizarAsociacionBiometrica } =
        await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await actualizarAsociacionBiometrica(
        fakeReq({ params: { id: "x" }, body: { activo: false } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(empleadoBiometricoUpdateMock).not.toHaveBeenCalled();
    });

    it("solo permite tocar 'activo', nunca empleadoId/externalUserId/proveedor", async () => {
      empleadoBiometricoFindFirstMock.mockResolvedValue({
        id: "assoc-1",
        tenantId: "tenant-A",
        externalUserId: "33",
      });
      empleadoBiometricoUpdateMock.mockResolvedValue({
        id: "assoc-1",
        proveedor: "anviz",
        externalUserId: "33",
        activo: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        empleado: null,
      });

      const { actualizarAsociacionBiometrica } =
        await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await actualizarAsociacionBiometrica(
        fakeReq({
          params: { id: "assoc-1" },
          body: { activo: false, empleadoId: "otro-empleado", externalUserId: "otro-id" },
        }),
        res,
      );

      expect(empleadoBiometricoUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "assoc-1" }, data: { activo: false } }),
      );
    });
  });

  describe("eliminarAsociacionBiometrica", () => {
    it("desactiva en vez de borrar físicamente", async () => {
      empleadoBiometricoFindFirstMock.mockResolvedValue({
        id: "assoc-1",
        tenantId: "tenant-A",
        activo: true,
        externalUserId: "33",
      });
      empleadoBiometricoUpdateMock.mockResolvedValue({});

      const { eliminarAsociacionBiometrica } = await import("./biometrico-asociaciones.controller");
      const res = fakeRes();
      await eliminarAsociacionBiometrica(fakeReq({ params: { id: "assoc-1" } }), res);

      expect(empleadoBiometricoUpdateMock).toHaveBeenCalledWith({
        where: { id: "assoc-1" },
        data: { activo: false },
      });
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });
});
