import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

const asociacionesFindManyMock = vi.fn();
const usuariosMock = vi.fn();

vi.mock("../../config/prisma", () => ({
  prisma: { empleadoBiometrico: { findMany: (...a: unknown[]) => asociacionesFindManyMock(...a) } },
}));
vi.mock("./biometrico-usuarios.service", () => ({
  usuariosDelBiometrico: (...a: unknown[]) => usuariosMock(...a),
}));

function fakeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}
const fakeReq = () =>
  ({
    user: { id: "u1", tenantId: "tenant-A", nombre: "Ana", isSuperadmin: false, permisos: [] },
    params: {},
    query: {},
    body: {},
  }) as unknown as AuthenticatedRequest;

beforeEach(() => {
  asociacionesFindManyMock.mockReset();
  usuariosMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("listarUsuariosBiometrico", () => {
  it("lista los usuarios del biométrico ordenados por nombre y marca cuáles ya están asociados (del tenant)", async () => {
    usuariosMock.mockResolvedValue({
      mapa: new Map([
        ["2", { userid: "2", codigo: null, nombre: "Zoe" }],
        ["10", { userid: "10", codigo: "C-10", nombre: "Ana" }],
        ["11", { userid: "11", codigo: null, nombre: null }],
      ]),
      disponible: true,
      incompleto: false,
    });
    asociacionesFindManyMock.mockResolvedValue([{ externalUserId: "10" }]);

    const { listarUsuariosBiometrico } = await import("./biometrico-usuarios.controller");
    const res = fakeRes();
    await listarUsuariosBiometrico(fakeReq(), res);

    expect(usuariosMock).toHaveBeenCalledWith("tenant-A");
    expect(asociacionesFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant-A" } }),
    );
    const body = res.json.mock.calls[0][0];
    expect(body.items.map((i: { userid: string }) => i.userid)).toEqual(["10", "2", "11"]);
    expect(body.items[0]).toEqual({ userid: "10", codigo: "C-10", nombre: "Ana", asociado: true });
    expect(body.items[1].asociado).toBe(false);
    expect(body.disponible).toBe(true);
  });

  it("si el biométrico no está disponible responde 200 con lista vacía y disponible=false", async () => {
    usuariosMock.mockResolvedValue({ mapa: new Map(), disponible: false, incompleto: false });
    asociacionesFindManyMock.mockResolvedValue([]);

    const { listarUsuariosBiometrico } = await import("./biometrico-usuarios.controller");
    const res = fakeRes();
    await listarUsuariosBiometrico(fakeReq(), res);

    expect(res.json.mock.calls[0][0]).toEqual({ items: [], disponible: false, incompleto: false });
  });

  it("un fallo inesperado responde 500 sin filtrar detalles", async () => {
    usuariosMock.mockRejectedValue(new Error("detalle interno"));

    const { listarUsuariosBiometrico } = await import("./biometrico-usuarios.controller");
    const res = fakeRes();
    await listarUsuariosBiometrico(fakeReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("detalle interno");
  });
});
