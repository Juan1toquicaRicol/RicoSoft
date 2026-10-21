import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import {
  loadSessionUser,
  listarTenantsAccesibles,
  TenantAccesible,
  SessionUser,
} from "../../lib/permissions";
import { esDominioCorporativoValido, obtenerTenantPorCorreo } from "../../lib/dominios";
import { validarPasswordSegura } from "../../lib/password";
import { whereAlcance } from "../../lib/alcance";

const JWT_SECRET = process.env.JWT_SECRET as string;

type LoginResult =
  | { requiresTenantSelection: false; token: string; user: SessionUser }
  | { requiresTenantSelection: true; selectionToken: string; tenants: TenantAccesible[] };

interface SelectionTokenPayload {
  sub: string;
  purpose: "select-tenant";
}

// --- 1. REGISTRO DE USUARIO ---
/**
 * Error CONTROLADO de autenticación: su mensaje está pensado para el usuario
 * (credenciales inválidas, cuenta inactiva, dominio no autorizado...) y el
 * controller puede devolverlo tal cual. Cualquier OTRO error (Prisma, red, base
 * de datos, bugs) es inesperado: el controller lo registra en el log interno y
 * responde un mensaje genérico, sin filtrar detalles de infraestructura.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export const registerUserService = async (data: {
  nombre: string;
  email: string;
  password: string;
  departamentoId: string;
}) => {
  const { nombre, email, password, departamentoId } = data;

  // Validar el dominio del correo. esDominioCorporativoValido es solo un
  // filtro rápido de formato ("¿es un dominio corporativo reconocido en
  // general?"); a qué EMPRESA pertenece ese dominio se resuelve después,
  // contra Tenant.dominioCorporativo en la base de datos — nunca con
  // tenant.findFirst() ni ningún otro criterio arbitrario.
  const emailLimpio = email.trim().toLowerCase();

  if (!esDominioCorporativoValido(emailLimpio)) {
    throw new AuthError(
      "Solo se permiten registros con correos autorizados (@ricol.com.co, @flexipackdecolombia.com, @greensolutions.com.co).",
    );
  }

  if (!departamentoId || typeof departamentoId !== "string") {
    throw new AuthError("Debes indicar a qué departamento perteneces.");
  }

  const errorPassword = validarPasswordSegura(password);
  if (errorPassword) {
    throw new AuthError(errorPassword);
  }

  // Verificar si el usuario ya existe
  const usuarioExistente = await prisma.user.findUnique({
    where: { email: emailLimpio },
  });

  if (usuarioExistente) {
    throw new AuthError("El correo electrónico ya se encuentra registrado.");
  }

  // Encriptar la contraseña
  const hashedPassword = await bcrypt.hash(password, 10);

  // El tenant SIEMPRE sale del dominio del correo, resuelto en la base de
  // datos (Tenant.dominioCorporativo). Si el dominio pasó el filtro de
  // formato de arriba pero ningún tenant lo tiene configurado todavía (o el
  // tenant está desactivado), se rechaza el registro explícitamente — nunca
  // se cae a "el primer tenant que exista" ni a un tenant por defecto.
  const tenant = await obtenerTenantPorCorreo(emailLimpio);
  if (!tenant) {
    throw new AuthError(
      "Tu dominio de correo no tiene una empresa asociada en el sistema todavía. Contacta al administrador.",
    );
  }
  if (!tenant.activo) {
    throw new AuthError(
      "La empresa asociada a tu correo no está activa actualmente. Contacta al administrador.",
    );
  }

  // El departamento debe existir, ser accesible para ese tenant (propio o
  // GENERAL — mismo criterio que GET /departamentos/publico, que es lo que
  // llena el select del formulario) y estar activo. esSistemas=true se
  // excluye explícitamente: calcularPermisosEfectivos (lib/permissions.ts)
  // le da a cualquier usuario de un departamento así TODOS los permisos del
  // sistema, igual que un superadmin — un autoregistro público jamás puede
  // aterrizar ahí, sin importar qué tan "correcto" luzca el dominio de correo.
  const departamento = await prisma.departamento.findFirst({
    where: { id: departamentoId, ...whereAlcance(tenant.id), activo: true, esSistemas: false },
  });
  if (!departamento) {
    throw new AuthError("El departamento seleccionado no es válido.");
  }

  // Crear el usuario en SQL Server. rol/isSuperadmin/rolId NUNCA se toman del
  // body de la petición (ni siquiera están en la firma de esta función): un
  // autoregistro siempre entra como colaborador sin rol asignado, con cero
  // permisos.
  const nuevoUsuario = await prisma.user.create({
    data: {
      nombre,
      email: emailLimpio,
      passwordHash: hashedPassword,
      tenantId: tenant.id,
      departamentoId: departamento.id,
      rol: "USER",
      // La cuenta nace INACTIVA: queda pendiente de aprobación explícita de un
      // administrador (no hay verificación de correo). Alineado con el mensaje
      // del registro y con loginUserService, que rechaza cuentas inactivas.
      activo: false,
    },
    select: {
      id: true,
      nombre: true,
      email: true,
      tenantId: true,
      createdAt: true,
    },
  });

  await prisma.auditoria.create({
    data: {
      tenantId: tenant.id,
      usuarioId: nuevoUsuario.id,
      usuarioAfectado: nuevoUsuario.email,
      accion: "USUARIO_AUTOREGISTRADO",
      detalle: `${nuevoUsuario.nombre} se autoregistró en ${tenant.nombre} (dominio de correo).`,
      entidadTipo: "User",
      entidadId: nuevoUsuario.id,
    },
  });

  return nuevoUsuario;
};

/**
 * Emite el JWT final de sesión y registra en auditoría. `accion`/`detalle`
 * distinguen un login normal de un cambio de empresa dentro de la app (mismo
 * mecanismo de emisión de token, pero es un evento distinto a efectos de
 * trazabilidad — ver switchTenantService).
 */
async function emitirSesion(
  userId: string,
  tokenVersion: number,
  tenantId: string,
  accion: string = "LOGIN",
  detalle?: string,
): Promise<LoginResult> {
  const sessionUser = await loadSessionUser(userId, tenantId);
  if (!sessionUser) {
    throw new AuthError("No se pudo cargar la sesión para el tenant seleccionado.");
  }

  await prisma.auditoria.create({
    data: {
      tenantId,
      usuarioId: userId,
      accion,
      detalle: detalle ?? `Inicio de sesión de ${sessionUser.email}`,
    },
  });

  const token = jwt.sign({ sub: userId, tv: tokenVersion, tenantId }, JWT_SECRET, {
    expiresIn: "8h",
  });
  return { requiresTenantSelection: false, token, user: sessionUser };
}

// Hash bcrypt (mismo costo que los reales) de un valor aleatorio descartado,
// solo para igualar el tiempo de respuesta cuando el correo no existe.
let hashFalso: Promise<string> | undefined;
function obtenerHashFalso(): Promise<string> {
  hashFalso ??= bcrypt.hash(crypto.randomUUID(), 10);
  return hashFalso;
}

// --- 2. LOGIN DE USUARIO (paso 1: identidad) ---
export const loginUserService = async (data: {
  email: string;
  password: string;
}): Promise<LoginResult> => {
  const { email, password } = data;
  const emailLimpio = email.trim().toLowerCase();

  // Buscar al usuario por correo
  const usuario = await prisma.user.findUnique({
    where: { email: emailLimpio },
  });

  const MENSAJE_CREDENCIALES_INVALIDAS = "Credenciales inválidas. Correo o contraseña incorrectos.";

  if (!usuario) {
    // Mismo costo de bcrypt que un correo existente: sin esto, la respuesta
    // inmediata de un correo inexistente (vs. ~decenas de ms de un existente)
    // permitiría enumerar cuentas midiendo el tiempo de respuesta.
    await bcrypt.compare(password, await obtenerHashFalso());
    throw new AuthError(MENSAJE_CREDENCIALES_INVALIDAS);
  }

  // Comparar contraseñas ANTES de revelar el estado de la cuenta: si el
  // estado (activa/inactiva) se comprobara primero, un correo existente pero
  // desactivado respondería distinto a uno inexistente, permitiendo
  // enumerar qué cuentas existen (y cuáles fueron desactivadas) sin conocer
  // ninguna contraseña. Solo después de confirmar la contraseña correcta se
  // revela el motivo específico (cuenta inactiva) — en ese punto quien
  // pregunta ya demostró conocer la credencial real.
  const esPasswordValida = await bcrypt.compare(password, usuario.passwordHash);

  if (!esPasswordValida) {
    // Solo se audita el intento fallido cuando ya sabemos a qué usuario/
    // tenant reales corresponde (Auditoria exige usuarioId y tenantId no
    // nulos) — un intento contra un correo que no existe no puede auditarse
    // en esta tabla; ver nota en el reporte de seguridad sobre esa limitación.
    await prisma.auditoria.create({
      data: {
        tenantId: usuario.tenantId,
        usuarioId: usuario.id,
        usuarioAfectado: usuario.email,
        accion: "LOGIN_FALLIDO",
        detalle: `Intento de inicio de sesión con contraseña incorrecta para ${usuario.email}.`,
      },
    });
    throw new AuthError(MENSAJE_CREDENCIALES_INVALIDAS);
  }

  // Recién aquí, con la contraseña ya confirmada, es seguro revelar el
  // estado de la cuenta.
  if (!usuario.activo) {
    throw new AuthError("La cuenta se encuentra inactiva.");
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { lastLoginAt: new Date() },
  });

  const tenants = await listarTenantsAccesibles(usuario.id);

  // Varias empresas accesibles (tenant hogar + membresías activas): no se
  // emite el JWT final todavía, se pide elegir primero con un token corto de
  // solo-identidad (no sirve para llamar a ningún endpoint protegido).
  if (tenants.length > 1) {
    const selectionToken = jwt.sign(
      { sub: usuario.id, purpose: "select-tenant" } satisfies SelectionTokenPayload,
      JWT_SECRET,
      { expiresIn: "5m" },
    );
    return { requiresTenantSelection: true, selectionToken, tenants };
  }

  // Un solo tenant accesible: se entra directo, como antes.
  return emitirSesion(usuario.id, usuario.tokenVersion, usuario.tenantId);
};

// --- 2b. LOGIN DE USUARIO (paso 2: elegir empresa, solo si hay más de una) ---
export const selectTenantService = async (data: {
  selectionToken: string;
  tenantId: string;
}): Promise<LoginResult> => {
  const { selectionToken, tenantId } = data;

  let payload: SelectionTokenPayload;
  try {
    payload = jwt.verify(selectionToken, JWT_SECRET) as SelectionTokenPayload;
  } catch {
    throw new AuthError("La selección de empresa expiró. Vuelve a iniciar sesión.");
  }
  if (payload.purpose !== "select-tenant") {
    throw new AuthError("Token de selección inválido.");
  }

  const usuario = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!usuario || !usuario.activo) {
    throw new AuthError("Cuenta inválida o inactiva.");
  }

  // Nunca confiar en la lista de tenants que mandó el cliente: se recalcula
  // server-side cuáles son realmente accesibles para este usuario, para que
  // nadie pueda "elegir" un tenant al que no tiene membresía.
  const tenantsAccesibles = await listarTenantsAccesibles(usuario.id);
  if (!tenantsAccesibles.some((t) => t.id === tenantId)) {
    throw new AuthError("No tienes acceso a esa empresa.");
  }

  return emitirSesion(usuario.id, usuario.tokenVersion, tenantId);
};

/**
 * Cambio de empresa DENTRO de la app, ya con sesión activa (a diferencia de
 * selectTenantService, que es el paso 2 del login antes de tener un JWT
 * completo). El usuario debe llegar autenticado (requireAuth en la ruta); el
 * único dato que manda es a qué tenant quiere cambiar, y el backend siempre
 * recalcula server-side si ese tenant es realmente accesible — nunca se
 * confía en localStorage/estado del frontend para decidir el tenant.
 */
export const switchTenantService = async (data: {
  userId: string;
  tenantId: string;
}): Promise<LoginResult> => {
  const { userId, tenantId } = data;

  const usuario = await prisma.user.findUnique({ where: { id: userId } });
  if (!usuario || !usuario.activo) {
    throw new AuthError("Cuenta inválida o inactiva.");
  }

  const tenantsAccesibles = await listarTenantsAccesibles(userId);
  const tenantDestino = tenantsAccesibles.find((t) => t.id === tenantId);
  if (!tenantDestino) {
    throw new AuthError("No tienes acceso a esa empresa.");
  }

  return emitirSesion(
    usuario.id,
    usuario.tokenVersion,
    tenantId,
    "CAMBIO_EMPRESA",
    `${usuario.email} cambió de empresa activa a "${tenantDestino.nombre}".`,
  );
};
