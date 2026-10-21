import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Anti-escalación en resetPasswordUsuario (auditoría de seguridad 2026-10-20):
 * "usuarios.reset_password" por sí solo no debe permitir tomar la cuenta de un
 * superadministrador (del tenant o por membresía en otra empresa).
 */
const db = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  membresiaFindFirst: vi.fn(),
  auditoriaCreate: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: { findFirst: db.userFindFirst, update: db.userUpdate },
    membresia: { findFirst: db.membresiaFindFirst },
    auditoria: { create: db.auditoriaCreate },
  },
}));

import { resetPasswordUsuario } from "./usuarios.controller";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

const PASSWORD_VALIDA = "ClaveNueva2026Segura!";

function crearRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function crearReq(isSuperadmin: boolean): AuthenticatedRequest {
  return {
    params: { id: "objetivo-1" },
    body: { passwordNueva: PASSWORD_VALIDA },
    user: { id: "actor-1", tenantId: "t1", nombre: "Actor", isSuperadmin, permisos: [] },
  } as unknown as AuthenticatedRequest;
}

const objetivo = (isSuperadmin: boolean) => ({
  id: "objetivo-1",
  tenantId: "t1",
  isSuperadmin,
  email: "objetivo@ricol.com.co",
});

describe("resetPasswordUsuario — anti-escalación sobre superadministradores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.membresiaFindFirst.mockResolvedValue(null);
    db.userUpdate.mockResolvedValue({});
    db.auditoriaCreate.mockResolvedValue({});
  });

  it("busca al objetivo solo dentro del tenant del actor (404 si es de otro tenant)", async () => {
    db.userFindFirst.mockResolvedValue(null);
    const res = crearRes();
    await resetPasswordUsuario(crearReq(false), res as never);

    expect(db.userFindFirst).toHaveBeenCalledWith({ where: { id: "objetivo-1", tenantId: "t1" } });
    expect(res.statusCode).toBe(404);
    expect(db.userUpdate).not.toHaveBeenCalled();
  });

  it("rechaza (403) a quien no es superadmin si el objetivo es superadmin del tenant", async () => {
    db.userFindFirst.mockResolvedValue(objetivo(true));
    const res = crearRes();
    await resetPasswordUsuario(crearReq(false), res as never);

    expect(res.statusCode).toBe(403);
    expect(db.userUpdate).not.toHaveBeenCalled();
    expect(db.auditoriaCreate).not.toHaveBeenCalled();
  });

  it("rechaza (403) a quien no es superadmin si el objetivo es superadmin por membresía", async () => {
    db.userFindFirst.mockResolvedValue(objetivo(false));
    db.membresiaFindFirst.mockResolvedValue({ id: "m-1" });
    const res = crearRes();
    await resetPasswordUsuario(crearReq(false), res as never);

    expect(db.membresiaFindFirst).toHaveBeenCalledWith({
      where: { userId: "objetivo-1", isSuperadmin: true, activo: true },
      select: { id: true },
    });
    expect(res.statusCode).toBe(403);
    expect(db.userUpdate).not.toHaveBeenCalled();
  });

  it("permite restablecer a un usuario sin privilegios de superadmin e invalida sus sesiones", async () => {
    db.userFindFirst.mockResolvedValue(objetivo(false));
    const res = crearRes();
    await resetPasswordUsuario(crearReq(false), res as never);

    expect(res.statusCode).toBe(200);
    const llamada = db.userUpdate.mock.calls[0][0];
    expect(llamada.where).toEqual({ id: "objetivo-1" });
    expect(llamada.data.tokenVersion).toEqual({ increment: 1 });
    expect(llamada.data.passwordHash).not.toBe(PASSWORD_VALIDA);
    expect(db.auditoriaCreate).toHaveBeenCalledTimes(1);
  });

  it("permite a un superadministrador restablecer a otro superadministrador", async () => {
    db.userFindFirst.mockResolvedValue(objetivo(true));
    const res = crearRes();
    await resetPasswordUsuario(crearReq(true), res as never);

    expect(res.statusCode).toBe(200);
    expect(db.membresiaFindFirst).not.toHaveBeenCalled();
    expect(db.userUpdate).toHaveBeenCalledTimes(1);
  });
});
