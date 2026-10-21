import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

const cargoFindManyMock = vi.fn();
const cargoFindFirstMock = vi.fn();
const cargoCreateMock = vi.fn();
const cargoUpdateMock = vi.fn();
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

vi.mock("../../config/prisma", () => {
  const modelos = {
    cargoColaborador: {
      findMany: (...a: unknown[]) => cargoFindManyMock(...a),
      findFirst: (...a: unknown[]) => cargoFindFirstMock(...a),
      create: (...a: unknown[]) => cargoCreateMock(...a),
      update: (...a: unknown[]) => cargoUpdateMock(...a),
    },
    auditoria: { create: (...a: unknown[]) => auditoriaCreateMock(...a) },
  };
  return {
    prisma: { ...modelos, $transaction: (fn: (tx: typeof modelos) => unknown) => fn(modelos) },
  };
});

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

const CARGO_A = {
  id: "cargo-1",
  tenantId: "tenant-A",
  nombre: "Analista",
  nombreNormalizado: "analista",
  activo: true,
  correoCorporativoRequerido: true,
  _count: { empleados: 2 },
};

describe("cargos.controller", () => {
  beforeEach(() => {
    [
      cargoFindManyMock,
      cargoFindFirstMock,
      cargoCreateMock,
      cargoUpdateMock,
      auditoriaCreateMock,
    ].forEach((m) => m.mockReset());
    auditoriaCreateMock.mockResolvedValue({});
  });

  describe("listar", () => {
    it("lista solo los cargos del tenant autenticado (activos e inactivos)", async () => {
      const { listarCargos } = await import("./cargos.controller");
      cargoFindManyMock.mockResolvedValue([CARGO_A]);
      const res = fakeRes();
      await listarCargos(fakeReq(), res);
      expect(cargoFindManyMock.mock.calls[0][0].where).toEqual({ tenantId: "tenant-A" });
      // El conteo excluye los colaboradores eliminados (soft-delete).
      expect(cargoFindManyMock.mock.calls[0][0].include).toEqual({
        _count: { select: { empleados: { where: { eliminado: false } } } },
      });
      expect(res.json).toHaveBeenCalledWith([
        {
          id: "cargo-1",
          nombre: "Analista",
          activo: true,
          correoCorporativoRequerido: true,
          colaboradoresAsignados: 2,
        },
      ]);
    });

    it("las opciones del selector son solo los ACTIVOS del tenant autenticado", async () => {
      const { listarCargosOpciones } = await import("./cargos.controller");
      cargoFindManyMock.mockResolvedValue([]);
      await listarCargosOpciones(fakeReq(), fakeRes());
      expect(cargoFindManyMock.mock.calls[0][0].where).toEqual({
        tenantId: "tenant-A",
        activo: true,
      });
    });

    it("el tenant sale de la sesión, no de query/body", async () => {
      const { listarCargos } = await import("./cargos.controller");
      cargoFindManyMock.mockResolvedValue([]);
      await listarCargos(
        fakeReq({ query: { tenantId: "tenant-B" }, body: { tenantId: "tenant-B" } }),
        fakeRes(),
      );
      expect(cargoFindManyMock.mock.calls[0][0].where.tenantId).toBe("tenant-A");
    });
  });

  describe("crear", () => {
    it("crea el cargo con tenant de la sesión, nombre normalizado, correo requerido por defecto y auditoría", async () => {
      const { crearCargo } = await import("./cargos.controller");
      cargoFindFirstMock.mockResolvedValue(null);
      cargoCreateMock.mockResolvedValue({ ...CARGO_A, nombre: "Jefe de Nómina" });
      const res = fakeRes();
      await crearCargo(
        fakeReq({ body: { nombre: "  Jefe  de Nómina ", tenantId: "tenant-B" } }),
        res,
      );
      expect(cargoCreateMock.mock.calls[0][0].data).toEqual({
        tenantId: "tenant-A",
        nombre: "Jefe de Nómina",
        nombreNormalizado: "jefe de nomina",
        correoCorporativoRequerido: true,
      });
      expect(auditoriaCreateMock).toHaveBeenCalledTimes(1);
      expect(auditoriaCreateMock.mock.calls[0][0].data).toMatchObject({
        tenantId: "tenant-A",
        usuarioId: "user-1",
        accion: "CARGO_CREADO",
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("permite crear un cargo con correo corporativo opcional", async () => {
      const { crearCargo } = await import("./cargos.controller");
      cargoFindFirstMock.mockResolvedValue(null);
      cargoCreateMock.mockResolvedValue({ ...CARGO_A, correoCorporativoRequerido: false });
      await crearCargo(
        fakeReq({ body: { nombre: "Operario", correoCorporativoRequerido: false } }),
        fakeRes(),
      );
      expect(cargoCreateMock.mock.calls[0][0].data.correoCorporativoRequerido).toBe(false);
    });

    it("rechaza duplicados dentro del mismo tenant (409) comparando el nombre normalizado", async () => {
      const { crearCargo } = await import("./cargos.controller");
      cargoFindFirstMock.mockResolvedValue({ id: "cargo-1" });
      const res = fakeRes();
      await crearCargo(fakeReq({ body: { nombre: "ANALISTA" } }), res);
      expect(cargoFindFirstMock.mock.calls[0][0].where).toEqual({
        tenantId: "tenant-A",
        nombreNormalizado: "analista",
      });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(cargoCreateMock).not.toHaveBeenCalled();
    });

    it("el mismo nombre en otro tenant NO es duplicado (la búsqueda va acotada al tenant)", async () => {
      const { crearCargo } = await import("./cargos.controller");
      // El cargo "analista" existe en tenant-B; la consulta acotada a tenant-A no lo ve.
      cargoFindFirstMock.mockImplementation(async ({ where }: { where: { tenantId: string } }) =>
        where.tenantId === "tenant-B" ? { id: "cargo-b" } : null,
      );
      cargoCreateMock.mockResolvedValue(CARGO_A);
      const res = fakeRes();
      await crearCargo(fakeReq({ body: { nombre: "Analista" } }), res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("una carrera concurrente (P2002 del índice único) responde 409, no 500", async () => {
      const { crearCargo } = await import("./cargos.controller");
      cargoFindFirstMock.mockResolvedValue(null);
      cargoCreateMock.mockRejectedValue(new PrismaClientKnownRequestErrorFake("dup", "P2002"));
      const res = fakeRes();
      await crearCargo(fakeReq({ body: { nombre: "Analista" } }), res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("valida nombre vacío, demasiado largo y flag no booleano", async () => {
      const { crearCargo } = await import("./cargos.controller");
      for (const body of [
        {},
        { nombre: "   " },
        { nombre: "x".repeat(256) },
        { nombre: "Ok", correoCorporativoRequerido: "si" },
      ]) {
        const res = fakeRes();
        await crearCargo(fakeReq({ body }), res);
        expect(res.status).toHaveBeenCalledWith(400);
      }
      expect(cargoCreateMock).not.toHaveBeenCalled();
    });

    it("si la auditoría falla, la operación falla (misma transacción) y responde 500", async () => {
      const { crearCargo } = await import("./cargos.controller");
      vi.spyOn(console, "error").mockImplementation(() => {});
      cargoFindFirstMock.mockResolvedValue(null);
      cargoCreateMock.mockResolvedValue(CARGO_A);
      auditoriaCreateMock.mockRejectedValue(new Error("auditoria caída"));
      const res = fakeRes();
      await crearCargo(fakeReq({ body: { nombre: "Analista" } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("actualizar / desactivar", () => {
    it("busca el cargo por id + tenant autenticado; uno de otro tenant da 404 (IDOR)", async () => {
      const { actualizarCargo } = await import("./cargos.controller");
      cargoFindFirstMock.mockResolvedValue(null);
      const res = fakeRes();
      await actualizarCargo(
        fakeReq({ params: { id: "cargo-de-B" }, body: { activo: false } }),
        res,
      );
      expect(cargoFindFirstMock.mock.calls[0][0].where).toEqual({
        id: "cargo-de-B",
        tenantId: "tenant-A",
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(cargoUpdateMock).not.toHaveBeenCalled();
    });

    it("desactiva un cargo (no hay borrado físico) y audita", async () => {
      const { actualizarCargo } = await import("./cargos.controller");
      cargoFindFirstMock.mockResolvedValue(CARGO_A);
      cargoUpdateMock.mockResolvedValue({ ...CARGO_A, activo: false });
      const res = fakeRes();
      await actualizarCargo(fakeReq({ params: { id: "cargo-1" }, body: { activo: false } }), res);
      expect(cargoUpdateMock.mock.calls[0][0].data).toEqual({ activo: false });
      expect(auditoriaCreateMock.mock.calls[0][0].data).toMatchObject({ accion: "CARGO_EDITADO" });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ activo: false }));
    });

    it("cambia el flag de correo corporativo requerido", async () => {
      const { actualizarCargo } = await import("./cargos.controller");
      cargoFindFirstMock.mockResolvedValue(CARGO_A);
      cargoUpdateMock.mockResolvedValue({ ...CARGO_A, correoCorporativoRequerido: false });
      await actualizarCargo(
        fakeReq({ params: { id: "cargo-1" }, body: { correoCorporativoRequerido: false } }),
        fakeRes(),
      );
      expect(cargoUpdateMock.mock.calls[0][0].data).toEqual({ correoCorporativoRequerido: false });
    });

    it("renombrar a un nombre ya usado por OTRO cargo del tenant da 409", async () => {
      const { actualizarCargo } = await import("./cargos.controller");
      cargoFindFirstMock
        .mockResolvedValueOnce(CARGO_A) // el cargo a editar
        .mockResolvedValueOnce({ id: "cargo-2" }); // duplicado
      const res = fakeRes();
      await actualizarCargo(
        fakeReq({ params: { id: "cargo-1" }, body: { nombre: "Coordinador" } }),
        res,
      );
      expect(cargoFindFirstMock.mock.calls[1][0].where).toEqual({
        tenantId: "tenant-A",
        nombreNormalizado: "coordinador",
        id: { not: "cargo-1" },
      });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(cargoUpdateMock).not.toHaveBeenCalled();
    });

    it("sin cambios reales no escribe ni audita", async () => {
      const { actualizarCargo } = await import("./cargos.controller");
      cargoFindFirstMock.mockResolvedValue(CARGO_A);
      await actualizarCargo(
        fakeReq({ params: { id: "cargo-1" }, body: { activo: true } }),
        fakeRes(),
      );
      expect(cargoUpdateMock).not.toHaveBeenCalled();
      expect(auditoriaCreateMock).not.toHaveBeenCalled();
    });

    it("valida tipos de campos", async () => {
      const { actualizarCargo } = await import("./cargos.controller");
      cargoFindFirstMock.mockResolvedValue(CARGO_A);
      for (const body of [{ activo: "no" }, { correoCorporativoRequerido: 1 }, { nombre: "  " }]) {
        const res = fakeRes();
        await actualizarCargo(fakeReq({ params: { id: "cargo-1" }, body }), res);
        expect(res.status).toHaveBeenCalledWith(400);
      }
    });
  });
});
