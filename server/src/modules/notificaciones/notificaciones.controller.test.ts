import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    notificacion: {
      updateMany: mocks.updateMany,
      update: mocks.update,
      findFirst: mocks.findFirst,
    },
  },
}));

import { marcarLeida } from "./notificaciones.controller";

function crearRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    send() {
      return res;
    },
  };
  return res;
}

const req = { params: { id: "n1" }, user: { id: "u1", tenantId: "t1" } } as never;

describe("marcarLeida — actualización ATÓMICA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("una sola mutación con where { id, usuarioId, tenantId }: sin lectura previa ni update por { id }", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const res = crearRes();

    await marcarLeida(req, res as never);

    expect(res.statusCode).toBe(204);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "n1", usuarioId: "u1", tenantId: "t1" },
      data: { leida: true },
    });
    expect(mocks.update).not.toHaveBeenCalled(); // nunca update({ where: { id } })
    expect(mocks.findFirst).not.toHaveBeenCalled(); // sin ventana verificar→mutar
  });

  it("notificación ajena / de otro tenant / inexistente (count 0) -> 404 sin revelar existencia", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const res = crearRes();

    await marcarLeida(req, res as never);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: "Notificación no encontrada." });
  });

  it("los identificadores de propiedad salen de la sesión, no de params/body", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const reqHostil = {
      params: { id: "n1" },
      body: { usuarioId: "otro", tenantId: "otro-tenant" },
      query: { tenantId: "otro-tenant" },
      user: { id: "u1", tenantId: "t1" },
    } as never;

    await marcarLeida(reqHostil, crearRes() as never);

    expect(mocks.updateMany.mock.calls[0][0].where).toEqual({
      id: "n1",
      usuarioId: "u1",
      tenantId: "t1",
    });
  });

  it("error de BD -> 500 genérico (sin filtrar el error)", async () => {
    mocks.updateMany.mockRejectedValue(new Error("Can't reach database server at 192.168.0.100"));
    const res = crearRes();

    await marcarLeida(req, res as never);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/192\.168|database/i);
  });
});
