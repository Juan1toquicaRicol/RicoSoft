import crypto from "crypto";
import { prisma } from "../../config/prisma";
import { obtenerProveedorCorreoSaliente } from "../../lib/correo-saliente";
import { AuthError } from "./auth.errors";

/**
 * Verificación del correo en el autoregistro: al registrarse se envía un código
 * de 6 dígitos al correo y la cuenta queda con emailVerificacionPendiente=true
 * hasta que lo escriba. La aprobación del administrador sigue siendo necesaria
 * (la cuenta nace inactiva igual que antes); mientras el correo no esté
 * verificado, el administrador no puede activarla (usuarios.controller).
 *
 * Desactivada por defecto (REGISTRO_VERIFICACION_CORREO_ENABLED): sin ella el
 * registro funciona exactamente como antes. No toca el login, el JWT, el
 * tokenVersion ni la selección de empresa.
 */

export const VIGENCIA_CODIGO_MS = 10 * 60_000;
export const MAX_INTENTOS_CODIGO = 5;
export const ESPERA_REENVIO_MS = 60_000;

export const MENSAJE_VERIFICACION_NO_DISPONIBLE =
  "La verificación de correo no está disponible en este momento. Contacta a un administrador.";
export const MENSAJE_CODIGO_INVALIDO = "El código no es válido o ya venció. Pide uno nuevo.";
export const MENSAJE_CODIGO_INCORRECTO = "El código es incorrecto.";
export const MENSAJE_DEMASIADOS_INTENTOS = "Demasiados intentos con este código. Pide uno nuevo.";
export const MENSAJE_REENVIO_PRONTO = "Espera un minuto antes de pedir otro código.";
export const MENSAJE_ENVIO_FALLIDO =
  "No se pudo enviar el código. Intenta de nuevo en unos minutos.";

export function verificacionCorreoHabilitada(): boolean {
  return process.env.REGISTRO_VERIFICACION_CORREO_ENABLED === "true";
}

/** Falla cerrado si la verificación está activa pero no hay forma de enviar correos:
 * se usa ANTES de crear la cuenta, para no dejar registros que nadie puede verificar. */
export function asegurarEnvioCorreoDisponible(): void {
  if (!obtenerProveedorCorreoSaliente()) {
    throw new AuthError(MENSAJE_VERIFICACION_NO_DISPONIBLE, 503);
  }
}

function secreto(): string {
  const valor = process.env.JWT_SECRET;
  if (!valor) throw new Error("JWT_SECRET no está configurado.");
  return valor;
}

/** HMAC con el secreto del servidor: aunque alguien leyera la tabla, no puede
 * probar los 10^6 códigos posibles sin el secreto. */
export function hashCodigo(codigo: string): string {
  return crypto.createHmac("sha256", secreto()).update(codigo).digest("hex");
}

function codigoCoincide(codigo: string, hashGuardado: string): boolean {
  const a = Buffer.from(hashCodigo(codigo), "hex");
  const b = Buffer.from(hashGuardado, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function generarCodigo(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Crea un código nuevo (solo el más reciente de cada usuario es válido) y lo
 * envía. Devuelve false si el envío falló: el código queda guardado pero la
 * persona puede pedir otro con "Reenviar código". Nunca registra el código en logs.
 */
export async function crearYEnviarCodigo(usuario: { id: string; email: string }): Promise<boolean> {
  const proveedor = obtenerProveedorCorreoSaliente();
  if (!proveedor) throw new AuthError(MENSAJE_VERIFICACION_NO_DISPONIBLE, 503);

  const codigo = generarCodigo();
  const ahora = new Date();
  await prisma.codigoVerificacionCorreo.create({
    data: {
      userId: usuario.id,
      codigoHash: hashCodigo(codigo),
      expiraEn: new Date(ahora.getTime() + VIGENCIA_CODIGO_MS),
      createdAt: ahora,
    },
  });

  try {
    await proveedor.enviar({
      para: usuario.email,
      asunto: "Código de verificación de RicoSoft",
      texto:
        `Tu código de verificación de RicoSoft es: ${codigo}\n\n` +
        `Vence en ${VIGENCIA_CODIGO_MS / 60_000} minutos y solo se puede usar una vez.\n\n` +
        "Si no te registraste en RicoSoft, ignora este correo.",
    });
    return true;
  } catch (error) {
    console.error(
      "[verificacion-correo] No se pudo enviar el código de verificación:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

async function buscarPendiente(email: string) {
  const usuario = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, tenantId: true, emailVerificacionPendiente: true },
  });
  return usuario?.emailVerificacionPendiente ? usuario : null;
}

/**
 * Verifica el código. Mensajes genéricos (no revela si el correo existe). El
 * intento se cuenta de forma atómica ANTES de comparar, para que peticiones en
 * paralelo no puedan superar MAX_INTENTOS_CODIGO.
 */
export async function verificarCodigoCorreoService(data: {
  email: string;
  codigo: string;
}): Promise<void> {
  if (!verificacionCorreoHabilitada()) {
    throw new AuthError(MENSAJE_VERIFICACION_NO_DISPONIBLE, 503);
  }

  const usuario = await buscarPendiente(data.email);
  if (!usuario) throw new AuthError(MENSAJE_CODIGO_INVALIDO);

  const ultimo = await prisma.codigoVerificacionCorreo.findFirst({
    where: { userId: usuario.id },
    orderBy: { createdAt: "desc" },
  });
  if (!ultimo || ultimo.usadoEn || ultimo.expiraEn.getTime() <= Date.now()) {
    throw new AuthError(MENSAJE_CODIGO_INVALIDO);
  }

  const { count: intentoContado } = await prisma.codigoVerificacionCorreo.updateMany({
    where: { id: ultimo.id, usadoEn: null, intentos: { lt: MAX_INTENTOS_CODIGO } },
    data: { intentos: { increment: 1 } },
  });
  if (intentoContado === 0) throw new AuthError(MENSAJE_DEMASIADOS_INTENTOS, 429);

  if (!codigoCoincide(data.codigo, ultimo.codigoHash)) {
    await prisma.auditoria.create({
      data: {
        tenantId: usuario.tenantId,
        usuarioId: usuario.id,
        usuarioAfectado: usuario.email,
        accion: "USUARIO_CORREO_VERIFICACION_FALLIDA",
        detalle: `Código de verificación incorrecto para ${usuario.email}.`,
        entidadTipo: "User",
        entidadId: usuario.id,
      },
    });
    throw new AuthError(MENSAJE_CODIGO_INCORRECTO);
  }

  // Marcar el código como usado, el correo como verificado y auditar: todo o nada.
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.codigoVerificacionCorreo.updateMany({
      where: { id: ultimo.id, usadoEn: null },
      data: { usadoEn: new Date() },
    });
    if (count === 0) throw new AuthError(MENSAJE_CODIGO_INVALIDO);

    await tx.user.update({
      where: { id: usuario.id },
      data: { emailVerificacionPendiente: false, emailVerificadoAt: new Date() },
    });
    await tx.auditoria.create({
      data: {
        tenantId: usuario.tenantId,
        usuarioId: usuario.id,
        usuarioAfectado: usuario.email,
        accion: "USUARIO_CORREO_VERIFICADO",
        detalle: `${usuario.email} verificó su correo con el código enviado al registrarse.`,
        entidadTipo: "User",
        entidadId: usuario.id,
      },
    });
  });
}

/**
 * Reenvía un código. Si el correo no tiene un registro pendiente de verificar
 * no hace nada y responde igual que si lo hubiera enviado (no revela cuentas).
 */
export async function reenviarCodigoCorreoService(data: { email: string }): Promise<void> {
  if (!verificacionCorreoHabilitada()) {
    throw new AuthError(MENSAJE_VERIFICACION_NO_DISPONIBLE, 503);
  }
  asegurarEnvioCorreoDisponible();

  const usuario = await buscarPendiente(data.email);
  if (!usuario) return;

  const ultimo = await prisma.codigoVerificacionCorreo.findFirst({
    where: { userId: usuario.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (ultimo && Date.now() - ultimo.createdAt.getTime() < ESPERA_REENVIO_MS) {
    throw new AuthError(MENSAJE_REENVIO_PRONTO, 429);
  }

  const enviado = await crearYEnviarCodigo(usuario);
  if (!enviado) throw new AuthError(MENSAJE_ENVIO_FALLIDO, 503);
}
