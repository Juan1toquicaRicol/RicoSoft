import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  codigoCreate: vi.fn(),
  codigoFindFirst: vi.fn(),
  codigoUpdateMany: vi.fn(),
  auditoriaCreate: vi.fn(),
  txCodigoUpdateMany: vi.fn(),
}));

vi.mock("../../config/prisma", () => {
  const tx = {
    codigoVerificacionCorreo: { updateMany: db.txCodigoUpdateMany },
    user: { update: db.userUpdate },
    auditoria: { create: db.auditoriaCreate },
  };
  return {
    prisma: {
      user: { findUnique: db.userFindUnique, update: db.userUpdate },
      codigoVerificacionCorreo: {
        create: db.codigoCreate,
        findFirst: db.codigoFindFirst,
        updateMany: db.codigoUpdateMany,
      },
      auditoria: { create: db.auditoriaCreate },
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

import { configurarProveedorCorreoSaliente, type CorreoSaliente } from "../../lib/correo-saliente";
import { AuthError } from "./auth.errors";
import {
  ESPERA_REENVIO_MS,
  MAX_INTENTOS_CODIGO,
  MENSAJE_CODIGO_INCORRECTO,
  MENSAJE_CODIGO_INVALIDO,
  MENSAJE_DEMASIADOS_INTENTOS,
  MENSAJE_REENVIO_PRONTO,
  MENSAJE_VERIFICACION_NO_DISPONIBLE,
  VIGENCIA_CODIGO_MS,
  crearYEnviarCodigo,
  hashCodigo,
  reenviarCodigoCorreoService,
  verificarCodigoCorreoService,
} from "./verificacion-correo.service";

const USUARIO_PENDIENTE = {
  id: "u1",
  email: "nuevo@ricol.com.co",
  tenantId: "t1",
  emailVerificacionPendiente: true,
};

const enviados: CorreoSaliente[] = [];
const proveedorOk = { enviar: vi.fn(async (c: CorreoSaliente) => void enviados.push(c)) };

function codigoGuardado(codigo: string, extra: Record<string, unknown> = {}) {
  return {
    id: "c1",
    userId: "u1",
    codigoHash: hashCodigo(codigo),
    expiraEn: new Date(Date.now() + VIGENCIA_CODIGO_MS),
    intentos: 0,
    usadoEn: null,
    createdAt: new Date(Date.now() - 2 * ESPERA_REENVIO_MS),
    ...extra,
  };
}

async function esperarAuthError(promesa: Promise<unknown>, mensaje: string, status?: number) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AuthError);
  expect((error as AuthError).message).toBe(mensaje);
  expect((error as AuthError).status).toBe(status);
}

beforeEach(() => {
  vi.clearAllMocks();
  enviados.length = 0;
  process.env.JWT_SECRET = "secreto-de-prueba";
  process.env.REGISTRO_VERIFICACION_CORREO_ENABLED = "true";
  configurarProveedorCorreoSaliente(proveedorOk);
  db.codigoCreate.mockResolvedValue({});
  db.codigoUpdateMany.mockResolvedValue({ count: 1 });
  db.txCodigoUpdateMany.mockResolvedValue({ count: 1 });
  db.userUpdate.mockResolvedValue({});
  db.auditoriaCreate.mockResolvedValue({});
});

afterEach(() => {
  configurarProveedorCorreoSaliente(null);
  delete process.env.REGISTRO_VERIFICACION_CORREO_ENABLED;
});

describe("crearYEnviarCodigo", () => {
  it("envía un código de 6 dígitos y guarda solo su hash, con vencimiento de 10 minutos", async () => {
    const antes = Date.now();
    const enviado = await crearYEnviarCodigo({ id: "u1", email: "nuevo@ricol.com.co" });

    expect(enviado).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].para).toBe("nuevo@ricol.com.co");
    const codigo = /(\d{6})/.exec(enviados[0].texto)?.[1];
    expect(codigo).toMatch(/^\d{6}$/);

    const data = db.codigoCreate.mock.calls[0][0].data;
    expect(data.userId).toBe("u1");
    expect(data.codigoHash).toBe(hashCodigo(codigo!));
    expect(JSON.stringify(data)).not.toContain(codigo);
    const vigencia = data.expiraEn.getTime() - antes;
    expect(vigencia).toBeGreaterThanOrEqual(VIGENCIA_CODIGO_MS - 1000);
    expect(vigencia).toBeLessThanOrEqual(VIGENCIA_CODIGO_MS + 1000);
  });

  it("devuelve false (sin lanzar) si el proveedor falla al enviar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    configurarProveedorCorreoSaliente({
      enviar: vi.fn().mockRejectedValue(new Error("smtp caído")),
    });
    await expect(crearYEnviarCodigo({ id: "u1", email: "x@ricol.com.co" })).resolves.toBe(false);
  });

  it("sin proveedor configurado falla cerrado (503) y no guarda código", async () => {
    configurarProveedorCorreoSaliente(null);
    await esperarAuthError(
      crearYEnviarCodigo({ id: "u1", email: "x@ricol.com.co" }),
      MENSAJE_VERIFICACION_NO_DISPONIBLE,
      503,
    );
    expect(db.codigoCreate).not.toHaveBeenCalled();
  });
});

describe("verificarCodigoCorreoService", () => {
  it("con el interruptor apagado responde 503", async () => {
    process.env.REGISTRO_VERIFICACION_CORREO_ENABLED = "false";
    await esperarAuthError(
      verificarCodigoCorreoService({ email: "nuevo@ricol.com.co", codigo: "123456" }),
      MENSAJE_VERIFICACION_NO_DISPONIBLE,
      503,
    );
  });

  it("correo inexistente o sin verificación pendiente: mismo mensaje genérico", async () => {
    db.userFindUnique.mockResolvedValueOnce(null);
    await esperarAuthError(
      verificarCodigoCorreoService({ email: "nadie@ricol.com.co", codigo: "123456" }),
      MENSAJE_CODIGO_INVALIDO,
    );
    db.userFindUnique.mockResolvedValueOnce({
      ...USUARIO_PENDIENTE,
      emailVerificacionPendiente: false,
    });
    await esperarAuthError(
      verificarCodigoCorreoService({ email: "nuevo@ricol.com.co", codigo: "123456" }),
      MENSAJE_CODIGO_INVALIDO,
    );
  });

  it("normaliza el correo (trim + minúsculas) al buscar", async () => {
    db.userFindUnique.mockResolvedValue(null);
    await verificarCodigoCorreoService({ email: "  Nuevo@Ricol.com.co ", codigo: "123456" }).catch(
      () => {},
    );
    expect(db.userFindUnique.mock.calls[0][0].where).toEqual({ email: "nuevo@ricol.com.co" });
  });

  it("código vencido o ya usado: inválido, sin contar intento", async () => {
    db.userFindUnique.mockResolvedValue(USUARIO_PENDIENTE);
    db.codigoFindFirst.mockResolvedValueOnce(
      codigoGuardado("123456", { expiraEn: new Date(Date.now() - 1) }),
    );
    await esperarAuthError(
      verificarCodigoCorreoService({ email: USUARIO_PENDIENTE.email, codigo: "123456" }),
      MENSAJE_CODIGO_INVALIDO,
    );
    db.codigoFindFirst.mockResolvedValueOnce(codigoGuardado("123456", { usadoEn: new Date() }));
    await esperarAuthError(
      verificarCodigoCorreoService({ email: USUARIO_PENDIENTE.email, codigo: "123456" }),
      MENSAJE_CODIGO_INVALIDO,
    );
    expect(db.codigoUpdateMany).not.toHaveBeenCalled();
    expect(db.userUpdate).not.toHaveBeenCalled();
  });

  it("valida solo el código más reciente del usuario", async () => {
    db.userFindUnique.mockResolvedValue(USUARIO_PENDIENTE);
    db.codigoFindFirst.mockResolvedValue(null);
    await verificarCodigoCorreoService({ email: USUARIO_PENDIENTE.email, codigo: "123456" }).catch(
      () => {},
    );
    expect(db.codigoFindFirst.mock.calls[0][0]).toMatchObject({
      where: { userId: "u1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("con los intentos agotados responde 429 aunque el código sea correcto", async () => {
    db.userFindUnique.mockResolvedValue(USUARIO_PENDIENTE);
    db.codigoFindFirst.mockResolvedValue(
      codigoGuardado("123456", { intentos: MAX_INTENTOS_CODIGO }),
    );
    db.codigoUpdateMany.mockResolvedValue({ count: 0 });
    await esperarAuthError(
      verificarCodigoCorreoService({ email: USUARIO_PENDIENTE.email, codigo: "123456" }),
      MENSAJE_DEMASIADOS_INTENTOS,
      429,
    );
    expect(db.codigoUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: "c1",
      usadoEn: null,
      intentos: { lt: MAX_INTENTOS_CODIGO },
    });
    expect(db.userUpdate).not.toHaveBeenCalled();
  });

  it("código incorrecto: cuenta el intento, audita el fallo y no verifica", async () => {
    db.userFindUnique.mockResolvedValue(USUARIO_PENDIENTE);
    db.codigoFindFirst.mockResolvedValue(codigoGuardado("123456"));
    await esperarAuthError(
      verificarCodigoCorreoService({ email: USUARIO_PENDIENTE.email, codigo: "654321" }),
      MENSAJE_CODIGO_INCORRECTO,
    );
    expect(db.codigoUpdateMany.mock.calls[0][0].data).toEqual({ intentos: { increment: 1 } });
    expect(db.auditoriaCreate.mock.calls[0][0].data).toMatchObject({
      tenantId: "t1",
      usuarioId: "u1",
      accion: "USUARIO_CORREO_VERIFICACION_FALLIDA",
    });
    expect(JSON.stringify(db.auditoriaCreate.mock.calls[0][0])).not.toContain("654321");
    expect(db.userUpdate).not.toHaveBeenCalled();
  });

  it("código correcto: lo marca usado, verifica el correo, ACTIVA la cuenta y audita ambos hechos, en una transacción", async () => {
    db.userFindUnique.mockResolvedValue(USUARIO_PENDIENTE);
    db.codigoFindFirst.mockResolvedValue(codigoGuardado("123456"));

    await verificarCodigoCorreoService({ email: USUARIO_PENDIENTE.email, codigo: "123456" });

    expect(db.txCodigoUpdateMany.mock.calls[0][0].where).toEqual({ id: "c1", usadoEn: null });
    const update = db.userUpdate.mock.calls[0][0];
    expect(update.where).toEqual({ id: "u1" });
    expect(update.data.emailVerificacionPendiente).toBe(false);
    expect(update.data.emailVerificadoAt).toBeInstanceOf(Date);
    expect(update.data.activo).toBe(true);
    // No toca rol ni permisos: la cuenta sigue sin acceso hasta que le asignen un rol.
    expect(Object.keys(update.data).sort()).toEqual([
      "activo",
      "emailVerificacionPendiente",
      "emailVerificadoAt",
    ]);

    const acciones = db.auditoriaCreate.mock.calls.map((c) => c[0].data);
    expect(acciones.map((a) => a.accion)).toEqual([
      "USUARIO_CORREO_VERIFICADO",
      "USUARIO_ACTIVADO",
    ]);
    expect(acciones[1]).toMatchObject({
      tenantId: "t1",
      usuarioId: "u1",
      datosAnteriores: JSON.stringify({ activo: false }),
      datosNuevos: JSON.stringify({ activo: true }),
    });
  });

  it("código incorrecto o vencido NO activa la cuenta", async () => {
    db.userFindUnique.mockResolvedValue(USUARIO_PENDIENTE);
    db.codigoFindFirst.mockResolvedValue(codigoGuardado("123456"));
    await verificarCodigoCorreoService({ email: USUARIO_PENDIENTE.email, codigo: "000000" }).catch(
      () => {},
    );
    db.codigoFindFirst.mockResolvedValue(
      codigoGuardado("123456", { expiraEn: new Date(Date.now() - 1) }),
    );
    await verificarCodigoCorreoService({ email: USUARIO_PENDIENTE.email, codigo: "123456" }).catch(
      () => {},
    );
    expect(db.userUpdate).not.toHaveBeenCalled();
  });

  it("si el código se usó en paralelo (carrera), no verifica dos veces", async () => {
    db.userFindUnique.mockResolvedValue(USUARIO_PENDIENTE);
    db.codigoFindFirst.mockResolvedValue(codigoGuardado("123456"));
    db.txCodigoUpdateMany.mockResolvedValue({ count: 0 });
    await esperarAuthError(
      verificarCodigoCorreoService({ email: USUARIO_PENDIENTE.email, codigo: "123456" }),
      MENSAJE_CODIGO_INVALIDO,
    );
    expect(db.userUpdate).not.toHaveBeenCalled();
  });
});

describe("reenviarCodigoCorreoService", () => {
  it("con el interruptor apagado o sin proveedor responde 503", async () => {
    process.env.REGISTRO_VERIFICACION_CORREO_ENABLED = "false";
    await esperarAuthError(
      reenviarCodigoCorreoService({ email: "x@ricol.com.co" }),
      MENSAJE_VERIFICACION_NO_DISPONIBLE,
      503,
    );
    process.env.REGISTRO_VERIFICACION_CORREO_ENABLED = "true";
    configurarProveedorCorreoSaliente(null);
    await esperarAuthError(
      reenviarCodigoCorreoService({ email: "x@ricol.com.co" }),
      MENSAJE_VERIFICACION_NO_DISPONIBLE,
      503,
    );
  });

  it("correo sin registro pendiente: no envía nada y no revela si existe", async () => {
    db.userFindUnique.mockResolvedValue(null);
    await expect(
      reenviarCodigoCorreoService({ email: "nadie@ricol.com.co" }),
    ).resolves.toBeUndefined();
    expect(db.codigoCreate).not.toHaveBeenCalled();
    expect(enviados).toHaveLength(0);
  });

  it("antes de un minuto desde el último código responde 429 sin enviar", async () => {
    db.userFindUnique.mockResolvedValue(USUARIO_PENDIENTE);
    db.codigoFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 10_000) });
    await esperarAuthError(
      reenviarCodigoCorreoService({ email: USUARIO_PENDIENTE.email }),
      MENSAJE_REENVIO_PRONTO,
      429,
    );
    expect(enviados).toHaveLength(0);
  });

  it("pasado el minuto crea y envía un código nuevo", async () => {
    db.userFindUnique.mockResolvedValue(USUARIO_PENDIENTE);
    db.codigoFindFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - ESPERA_REENVIO_MS - 1),
    });
    await reenviarCodigoCorreoService({ email: USUARIO_PENDIENTE.email });
    expect(db.codigoCreate).toHaveBeenCalledTimes(1);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].para).toBe(USUARIO_PENDIENTE.email);
  });

  it("si el envío falla responde 503", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    configurarProveedorCorreoSaliente({ enviar: vi.fn().mockRejectedValue(new Error("caído")) });
    db.userFindUnique.mockResolvedValue(USUARIO_PENDIENTE);
    db.codigoFindFirst.mockResolvedValue(null);
    const error = await reenviarCodigoCorreoService({ email: USUARIO_PENDIENTE.email }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).status).toBe(503);
  });
});
