import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { loadSessionUser } from "../../lib/permissions";

const JWT_SECRET = process.env.JWT_SECRET as string;

// Dominios autorizados por la organización
const DOMINIOS_PERMITIDOS = ["ricol.com.co", "flexipackdecolombia.com", "greesolutions.com.co"];

// --- 1. REGISTRO DE USUARIO ---
export const registerUserService = async (data: {
  nombre: string;
  email: string;
  password: string;
  departamentoId: string;
}) => {
  const { nombre, email, password, departamentoId } = data;

  // Extraer y validar el dominio del correo
  const emailLimpio = email.trim().toLowerCase();
  const dominio = emailLimpio.split("@")[1];

  if (!dominio || !DOMINIOS_PERMITIDOS.includes(dominio)) {
    throw new Error(
      "Solo se permiten registros con correos autorizados (@ricol.com.co, @flexipackdecolombia.com, @greesolutions.com.co).",
    );
  }

  if (!departamentoId || typeof departamentoId !== "string") {
    throw new Error("Debes indicar a qué departamento perteneces.");
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

// --- 2. LOGIN DE USUARIO ---
export const loginUserService = async (data: { email: string; password: string }) => {
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

  await prisma.auditoria.create({
    data: {
      tenantId: usuario.tenantId,
      usuarioId: usuario.id,
      accion: "LOGIN",
      detalle: `Inicio de sesión de ${usuario.email}`,
    },
  });

  const token = jwt.sign({ sub: usuario.id }, JWT_SECRET, { expiresIn: "8h" });
  const sessionUser = await loadSessionUser(usuario.id);

  return { token, user: sessionUser };
};
