import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { loadSessionUser, listarTenantsAccesibles, TenantAccesible, SessionUser } from "../../lib/permissions";
import { esDominioCorporativoValido } from "../../lib/dominios";
import { validarPasswordSegura } from "../../lib/password";

const JWT_SECRET = process.env.JWT_SECRET as string;

type LoginResult =
  | { requiresTenantSelection: false; token: string; user: SessionUser }
  | { requiresTenantSelection: true; selectionToken: string; tenants: TenantAccesible[] };

interface SelectionTokenPayload {
  sub: string;
  purpose: "select-tenant";
}

// --- 1. REGISTRO DE USUARIO ---
export const registerUserService = async (data: {
  nombre: string;
  email: string;
  password: string;
  departamentoId: string;
}) => {
  const { nombre, email, password, departamentoId } = data;

  // Validar el dominio del correo
  const emailLimpio = email.trim().toLowerCase();

  if (!esDominioCorporativoValido(emailLimpio)) {
    throw new Error(
      "Solo se permiten registros con correos autorizados (@ricol.com.co, @flexipackdecolombia.com, @greesolutions.com.co).",
    );
  }

  if (!departamentoId || typeof departamentoId !== "string") {
    throw new Error("Debes indicar a qué departamento perteneces.");
  }

  const errorPassword = validarPasswordSegura(password);
  if (errorPassword) {
    throw new Error(errorPassword);
  }

  // Verificar si el usuario ya existe
  const usuarioExistente = await prisma.user.findUnique({
    where: { email: emailLimpio },
  });

  if (usuarioExistente) {
    throw new Error("El correo electrónico ya se encuentra registrado.");
  }

  // Encriptar la contraseña
  const hashedPassword = await bcrypt.hash(password, 10);

  // Buscar el Tenant por defecto
  const tenant = await prisma.tenant.findFirst();

  if (!tenant) {
    throw new Error("No existe ningún Tenant/Empresa registrado en la base de datos.");
  }

  // El departamento debe existir y pertenecer al mismo tenant y estar activo
  const departamento = await prisma.departamento.findFirst({
    where: { id: departamentoId, tenantId: tenant.id, activo: true },
  });
  if (!departamento) {
    throw new Error("El departamento seleccionado no es válido.");
  }

  // Crear el usuario en SQL Server
  const nuevoUsuario = await prisma.user.create({
    data: {
      nombre,
      email: emailLimpio,
      passwordHash: hashedPassword,
      tenantId: tenant.id,
      departamentoId: departamento.id,
      rol: "USER",
      activo: true,
    },
    select: {
      id: true,
      nombre: true,
      email: true,
      tenantId: true,
      createdAt: true,
    },
  });

  return nuevoUsuario;
};

/** Emite el JWT final de sesión, registra el LOGIN en auditoría y arma la respuesta. */
async function emitirSesion(userId: string, tokenVersion: number, tenantId: string): Promise<LoginResult> {
  const sessionUser = await loadSessionUser(userId, tenantId);
  if (!sessionUser) {
    throw new Error("No se pudo cargar la sesión para el tenant seleccionado.");
  }

  await prisma.auditoria.create({
    data: {
      tenantId,
      usuarioId: userId,
      accion: "LOGIN",
      detalle: `Inicio de sesión de ${sessionUser.email}`,
    },
  });

  const token = jwt.sign({ sub: userId, tv: tokenVersion, tenantId }, JWT_SECRET, { expiresIn: "8h" });
  return { requiresTenantSelection: false, token, user: sessionUser };
}

// --- 2. LOGIN DE USUARIO (paso 1: identidad) ---
export const loginUserService = async (data: { email: string; password: string }): Promise<LoginResult> => {
  const { email, password } = data;
  const emailLimpio = email.trim().toLowerCase();

  // Buscar al usuario por correo
  const usuario = await prisma.user.findUnique({
    where: { email: emailLimpio },
  });

  if (!usuario) {
    throw new Error("Credenciales inválidas. Correo o contraseña incorrectos.");
  }

  // Verificar estado de la cuenta
  if (!usuario.activo) {
    throw new Error("La cuenta se encuentra inactiva.");
  }

  // Comparar contraseñas
  const esPasswordValida = await bcrypt.compare(password, usuario.passwordHash);

  if (!esPasswordValida) {
    throw new Error("Credenciales inválidas. Correo o contraseña incorrectos.");
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
export const selectTenantService = async (data: { selectionToken: string; tenantId: string }): Promise<LoginResult> => {
  const { selectionToken, tenantId } = data;

  let payload: SelectionTokenPayload;
  try {
    payload = jwt.verify(selectionToken, JWT_SECRET) as SelectionTokenPayload;
  } catch {
    throw new Error("La selección de empresa expiró. Vuelve a iniciar sesión.");
  }
  if (payload.purpose !== "select-tenant") {
    throw new Error("Token de selección inválido.");
  }

  const usuario = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!usuario || !usuario.activo) {
    throw new Error("Cuenta inválida o inactiva.");
  }

  // Nunca confiar en la lista de tenants que mandó el cliente: se recalcula
  // server-side cuáles son realmente accesibles para este usuario, para que
  // nadie pueda "elegir" un tenant al que no tiene membresía.
  const tenantsAccesibles = await listarTenantsAccesibles(usuario.id);
  if (!tenantsAccesibles.some((t) => t.id === tenantId)) {
    throw new Error("No tienes acceso a esa empresa.");
  }

  return emitirSesion(usuario.id, usuario.tokenVersion, tenantId);
};
