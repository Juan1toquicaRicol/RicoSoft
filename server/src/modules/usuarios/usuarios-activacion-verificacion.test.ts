import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Decisión 2026-11-18: con la verificación de correo del autoregistro activa,
 * un administrador no puede activar una cuenta cuyo correo aún no se verificó.
 */
const db = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  userCount: vi.fn(),
  auditoriaCreate: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: { findFirst: db.userFindFirst, update: db.userUpdate, count: db.userCount },
    auditoria: { create: db.auditoriaCreate },
  },
}));

import { cambiarEstadoUsuario } from "./usuarios.controller";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

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

function crearReq(activo: boolean): AuthenticatedRequest {
  return {
    params: { id: "u1" },
    body: { activo },
    user: { id: "admin-1", tenantId: "t1", nombre: "Admin", isSuperadmin: false, permisos: [] },
  } as unknown as AuthenticatedRequest;
}

const usuario = (emailVerificacionPendiente: boolean) => ({
  id: "u1",
  tenantId: "t1",
  email: "nuevo@ricol.com.co",
  activo: false,
  isSuperadmin: false,
  emailVerificacionPendiente,
});

describe("cambiarEstadoUsuario — verificación de correo pendiente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.userUpdate.mockImplementation(async ({ data }) => ({
      id: "u1",
      nombre: "Nuevo",
      email: "nuevo@ricol.com.co",
      activo: data.activo,
    }));
    db.auditoriaCreate.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.REGISTRO_VERIFICACION_CORREO_ENABLED;
  });

  it("con la verificación activa, no permite activar un correo sin verificar (409)", async () => {
    process.env.REGISTRO_VERIFICACION_CORREO_ENABLED = "true";
    db.userFindFirst.mockResolvedValue(usuario(true));
    const res = crearRes();
    await cambiarEstadoUsuario(crearReq(true), res as never);
    expect(res.statusCode).toBe(409);
    expect(db.userUpdate).not.toHaveBeenCalled();
    expect(db.auditoriaCreate).not.toHaveBeenCalled();
  });

  it("con la verificación activa, sí permite activar un correo ya verificado", async () => {
    process.env.REGISTRO_VERIFICACION_CORREO_ENABLED = "true";
    db.userFindFirst.mockResolvedValue(usuario(false));
    const res = crearRes();
    await cambiarEstadoUsuario(crearReq(true), res as never);
    expect(res.statusCode).toBe(200);
    expect(db.userUpdate).toHaveBeenCalledTimes(1);
  });

  it("desactivar no se bloquea aunque el correo esté pendiente", async () => {
    process.env.REGISTRO_VERIFICACION_CORREO_ENABLED = "true";
    db.userFindFirst.mockResolvedValue(usuario(true));
    const res = crearRes();
    await cambiarEstadoUsuario(crearReq(false), res as never);
    expect(res.statusCode).toBe(200);
  });

  it("con el interruptor apagado no bloquea (comportamiento anterior)", async () => {
    db.userFindFirst.mockResolvedValue(usuario(true));
    const res = crearRes();
    await cambiarEstadoUsuario(crearReq(true), res as never);
    expect(res.statusCode).toBe(200);
    expect(db.userUpdate).toHaveBeenCalledTimes(1);
  });

  it("sigue aislando por tenant: busca el usuario dentro del tenant del actor", async () => {
    db.userFindFirst.mockResolvedValue(null);
    const res = crearRes();
    await cambiarEstadoUsuario(crearReq(true), res as never);
    expect(db.userFindFirst.mock.calls[0][0].where).toEqual({ id: "u1", tenantId: "t1" });
    expect(res.statusCode).toBe(404);
  });
});
