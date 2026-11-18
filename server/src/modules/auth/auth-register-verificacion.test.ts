import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Registro con verificación de correo (decisión 2026-11-18). Con el interruptor
 * apagado el registro debe quedar exactamente como antes.
 */
const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  departamentoFindFirst: vi.fn(),
  auditoriaCreate: vi.fn(),
  codigoCreate: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: { findUnique: db.userFindUnique, create: db.userCreate },
    departamento: { findFirst: db.departamentoFindFirst },
    auditoria: { create: db.auditoriaCreate },
    codigoVerificacionCorreo: { create: db.codigoCreate },
  },
}));

vi.mock("../../lib/dominios", () => ({
  esDominioCorporativoValido: () => true,
  obtenerTenantPorCorreo: vi.fn(async () => ({ id: "t1", nombre: "Ricol", activo: true })),
}));

import { configurarProveedorCorreoSaliente } from "../../lib/correo-saliente";
import { AuthError, registerUserService } from "./auth.service";
import { MENSAJE_VERIFICACION_NO_DISPONIBLE } from "./verificacion-correo.service";

const DATOS = {
  nombres: "Ana",
  apellidos: "Pérez",
  email: "Ana@Ricol.com.co",
  password: "ClaveSegura2026",
  departamentoId: "d1",
};

const enviar = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "secreto-de-prueba";
  db.userFindUnique.mockResolvedValue(null);
  db.departamentoFindFirst.mockResolvedValue({ id: "d1" });
  db.userCreate.mockImplementation(async ({ data }) => ({
    id: "u1",
    nombre: "Ana Pérez",
    email: data.email,
    tenantId: data.tenantId,
    createdAt: new Date(),
  }));
  db.auditoriaCreate.mockResolvedValue({});
  db.codigoCreate.mockResolvedValue({});
});

afterEach(() => {
  configurarProveedorCorreoSaliente(null);
  delete process.env.REGISTRO_VERIFICACION_CORREO_ENABLED;
});

describe("registerUserService — interruptor apagado (comportamiento anterior)", () => {
  it("crea la cuenta inactiva, sin verificación pendiente y sin enviar código", async () => {
    const resultado = await registerUserService(DATOS);

    expect(resultado.requiereVerificacion).toBe(false);
    expect(resultado.correoEnviado).toBe(false);
    expect(db.userCreate.mock.calls[0][0].data).toMatchObject({
      email: "ana@ricol.com.co",
      activo: false,
      emailVerificacionPendiente: false,
    });
    expect(db.codigoCreate).not.toHaveBeenCalled();
  });

  it("un correo ya registrado (aunque estuviera pendiente) mantiene el mensaje de siempre", async () => {
    db.userFindUnique.mockResolvedValue({
      id: "u0",
      activo: false,
      emailVerificacionPendiente: true,
    });
    const error = await registerUserService(DATOS).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).message).toBe("El correo electrónico ya se encuentra registrado.");
    expect((error as AuthError).status).toBeUndefined();
  });
});

describe("registerUserService — interruptor encendido", () => {
  beforeEach(() => {
    process.env.REGISTRO_VERIFICACION_CORREO_ENABLED = "true";
  });

  it("sin proveedor de correo rechaza (503) ANTES de crear la cuenta", async () => {
    const error = await registerUserService(DATOS).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).message).toBe(MENSAJE_VERIFICACION_NO_DISPONIBLE);
    expect((error as AuthError).status).toBe(503);
    expect(db.userCreate).not.toHaveBeenCalled();
  });

  it("crea la cuenta inactiva y pendiente de verificar, y envía el código al correo registrado", async () => {
    configurarProveedorCorreoSaliente({ enviar });
    const resultado = await registerUserService(DATOS);

    expect(resultado).toMatchObject({ requiereVerificacion: true, correoEnviado: true });
    expect(db.userCreate.mock.calls[0][0].data).toMatchObject({
      activo: false,
      emailVerificacionPendiente: true,
    });
    expect(db.codigoCreate.mock.calls[0][0].data.userId).toBe("u1");
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ para: "ana@ricol.com.co" }));
  });

  it("si el envío falla, la cuenta queda creada y correoEnviado=false", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    configurarProveedorCorreoSaliente({ enviar: vi.fn().mockRejectedValue(new Error("caído")) });
    const resultado = await registerUserService(DATOS);
    expect(resultado).toMatchObject({ requiereVerificacion: true, correoEnviado: false });
    expect(db.userCreate).toHaveBeenCalledTimes(1);
  });

  it("registro pendiente de verificar con el mismo correo: 409 para ofrecer reenvío, sin crear nada", async () => {
    configurarProveedorCorreoSaliente({ enviar });
    db.userFindUnique.mockResolvedValue({
      id: "u0",
      activo: false,
      emailVerificacionPendiente: true,
    });
    const error = await registerUserService(DATOS).catch((e: unknown) => e);
    expect((error as AuthError).status).toBe(409);
    expect(db.userCreate).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("correo ya registrado y verificado (o activo): mensaje de siempre, sin 409", async () => {
    configurarProveedorCorreoSaliente({ enviar });
    db.userFindUnique.mockResolvedValue({
      id: "u0",
      activo: true,
      emailVerificacionPendiente: false,
    });
    const error = await registerUserService(DATOS).catch((e: unknown) => e);
    expect((error as AuthError).message).toBe("El correo electrónico ya se encuentra registrado.");
    expect((error as AuthError).status).toBeUndefined();
  });
});
