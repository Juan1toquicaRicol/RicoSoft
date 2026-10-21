import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

const findManyMock = vi.fn();
const findFirstMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const auditoriaCreateMock = vi.fn();

const { PrismaClientKnownRequestErrorFake } = vi.hoisted(() => {
  class PrismaClientKnownRequestErrorFake extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return { PrismaClientKnownRequestErrorFake };
});

vi.mock("@prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: PrismaClientKnownRequestErrorFake },
}));

vi.mock("../../config/prisma", () => {
  const modelos = {
    catalogoSeguridadSocial: {
      findMany: (...a: unknown[]) => findManyMock(...a),
      findFirst: (...a: unknown[]) => findFirstMock(...a),
      create: (...a: unknown[]) => createMock(...a),
      update: (...a: unknown[]) => updateMock(...a),
    },
    auditoria: { create: (...a: unknown[]) => auditoriaCreateMock(...a) },
  };
  return {
    prisma: { ...modelos, $transaction: (fn: (tx: typeof modelos) => unknown) => fn(modelos) },
  };
});

import {
  listarCatalogoSeguridadSocial,
  listarOpcionesSeguridadSocial,
  crearItemSeguridadSocial,
  actualizarItemSeguridadSocial,
} from "./catalogo-seguridad-social.controller";

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

const ITEM = {
  id: "i1",
  tenantId: "tenant-A",
  tipo: "EPS",
  nombre: "Sura",
  nombreNormalizado: "sura",
  activo: true,
};

beforeEach(() => {
  [findManyMock, findFirstMock, createMock, updateMock, auditoriaCreateMock].forEach((m) =>
    m.mockReset(),
  );
  auditoriaCreateMock.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("listar", () => {
  it("siempre acotado al tenant autenticado y filtrable por tipo", async () => {
    findManyMock.mockResolvedValue([]);
    await listarCatalogoSeguridadSocial(
      fakeReq({ query: { tipo: "ARL", tenantId: "tenant-B" } as never }),
      fakeRes(),
    );
    expect(findManyMock.mock.calls[0][0].where).toEqual({ tenantId: "tenant-A", tipo: "ARL" });
  });

  it("tipo desconocido => 400", async () => {
    const res = fakeRes();
    await listarCatalogoSeguridadSocial(fakeReq({ query: { tipo: "OTRO" } as never }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("opciones: solo activos del tenant, agrupados por tipo", async () => {
    findManyMock.mockResolvedValue([
      { tipo: "EPS", nombre: "Sura" },
      { tipo: "ARL", nombre: "Positiva" },
      { tipo: "FONDO_PENSIONES", nombre: "Porvenir" },
      { tipo: "TIPO_CONTRATO", nombre: "Término indefinido" },
    ]);
    const res = fakeRes();
    await listarOpcionesSeguridadSocial(fakeReq(), res);
    expect(findManyMock.mock.calls[0][0].where).toEqual({ tenantId: "tenant-A", activo: true });
    expect(res.json).toHaveBeenCalledWith({
      eps: ["Sura"],
      arl: ["Positiva"],
      fondosPensiones: ["Porvenir"],
      tiposContrato: ["Término indefinido"],
    });
  });
});

describe("crear", () => {
  it("crea con tenant de la sesión, nombre normalizado y auditoría", async () => {
    findFirstMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ ...ITEM, nombre: "Sanitas EPS" });
    const res = fakeRes();
    await crearItemSeguridadSocial(
      fakeReq({ body: { tipo: "EPS", nombre: "  Sanitas   EPS ", tenantId: "tenant-B" } }),
      res,
    );
    expect(createMock.mock.calls[0][0].data).toEqual({
      tenantId: "tenant-A",
      tipo: "EPS",
      nombre: "Sanitas EPS",
      nombreNormalizado: "sanitas eps",
    });
    expect(auditoriaCreateMock.mock.calls[0][0].data.accion).toBe(
      "CATALOGO_SEGURIDAD_SOCIAL_CREADO",
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("duplicado en el mismo tenant y tipo => 409; el mismo nombre en OTRO tipo es válido", async () => {
    findFirstMock.mockImplementation(async ({ where }: { where: { tipo: string } }) =>
      where.tipo === "EPS" ? { id: "x" } : null,
    );
    const dup = fakeRes();
    await crearItemSeguridadSocial(fakeReq({ body: { tipo: "EPS", nombre: "SURA" } }), dup);
    expect(dup.status).toHaveBeenCalledWith(409);

    createMock.mockResolvedValue({ ...ITEM, tipo: "ARL" });
    const otroTipo = fakeRes();
    await crearItemSeguridadSocial(fakeReq({ body: { tipo: "ARL", nombre: "SURA" } }), otroTipo);
    expect(otroTipo.status).toHaveBeenCalledWith(201);
  });

  it("carrera concurrente (P2002) => 409", async () => {
    findFirstMock.mockResolvedValue(null);
    createMock.mockRejectedValue(new PrismaClientKnownRequestErrorFake("dup", "P2002"));
    const res = fakeRes();
    await crearItemSeguridadSocial(fakeReq({ body: { tipo: "EPS", nombre: "Sura" } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("valida tipo y nombre", async () => {
    for (const body of [
      { nombre: "X" },
      { tipo: "OTRO", nombre: "X" },
      { tipo: "EPS" },
      { tipo: "EPS", nombre: "  " },
      { tipo: "EPS", nombre: "x".repeat(151) },
    ]) {
      const res = fakeRes();
      await crearItemSeguridadSocial(fakeReq({ body }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("si la auditoría falla responde 500 (misma transacción)", async () => {
    findFirstMock.mockResolvedValue(null);
    createMock.mockResolvedValue(ITEM);
    auditoriaCreateMock.mockRejectedValue(new Error("caída"));
    const res = fakeRes();
    await crearItemSeguridadSocial(fakeReq({ body: { tipo: "EPS", nombre: "Sura" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("actualizar", () => {
  it("una entrada de otro tenant => 404 (IDOR)", async () => {
    findFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await actualizarItemSeguridadSocial(
      fakeReq({ params: { id: "de-B" }, body: { activo: false } }),
      res,
    );
    expect(findFirstMock.mock.calls[0][0].where).toEqual({ id: "de-B", tenantId: "tenant-A" });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("desactiva (sin borrado físico) y audita", async () => {
    findFirstMock.mockResolvedValue(ITEM);
    updateMock.mockResolvedValue({ ...ITEM, activo: false });
    await actualizarItemSeguridadSocial(
      fakeReq({ params: { id: "i1" }, body: { activo: false } }),
      fakeRes(),
    );
    expect(updateMock.mock.calls[0][0].data).toEqual({ activo: false });
    expect(auditoriaCreateMock.mock.calls[0][0].data.accion).toBe(
      "CATALOGO_SEGURIDAD_SOCIAL_EDITADO",
    );
  });

  it("renombrar a un nombre ya usado en el mismo tipo => 409", async () => {
    findFirstMock.mockResolvedValueOnce(ITEM).mockResolvedValueOnce({ id: "otro" });
    const res = fakeRes();
    await actualizarItemSeguridadSocial(
      fakeReq({ params: { id: "i1" }, body: { nombre: "Sanitas" } }),
      res,
    );
    expect(findFirstMock.mock.calls[1][0].where).toEqual({
      tenantId: "tenant-A",
      tipo: "EPS",
      nombreNormalizado: "sanitas",
      id: { not: "i1" },
    });
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("sin cambios no escribe ni audita", async () => {
    findFirstMock.mockResolvedValue(ITEM);
    await actualizarItemSeguridadSocial(
      fakeReq({ params: { id: "i1" }, body: { activo: true } }),
      fakeRes(),
    );
    expect(updateMock).not.toHaveBeenCalled();
    expect(auditoriaCreateMock).not.toHaveBeenCalled();
  });
});

describe("tipo de contrato como catálogo", () => {
  it("se puede crear una entrada TIPO_CONTRATO y duplicarla en el mismo tenant da 409", async () => {
    findFirstMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ ...ITEM, tipo: "TIPO_CONTRATO", nombre: "Obra o labor" });
    const ok = fakeRes();
    await crearItemSeguridadSocial(
      fakeReq({ body: { tipo: "TIPO_CONTRATO", nombre: "Obra o labor" } }),
      ok,
    );
    expect(createMock.mock.calls[0][0].data).toMatchObject({
      tenantId: "tenant-A",
      tipo: "TIPO_CONTRATO",
      nombreNormalizado: "obra o labor",
    });
    expect(ok.status).toHaveBeenCalledWith(201);

    findFirstMock.mockResolvedValue({ id: "x" });
    const dup = fakeRes();
    await crearItemSeguridadSocial(
      fakeReq({ body: { tipo: "TIPO_CONTRATO", nombre: "OBRA O LABOR" } }),
      dup,
    );
    expect(dup.status).toHaveBeenCalledWith(409);
  });
});
