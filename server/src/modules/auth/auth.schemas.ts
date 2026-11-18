import { z } from "zod";

import { camposNombreUsuario, validarNombreUsuario } from "../usuarios/usuarios.schemas";

// required_error/invalid_type_error reemplazan los mensajes técnicos por
// defecto de zod ("Required", "Expected string, received number") por texto
// en español apto para mostrar al usuario, consistente con el resto de la
// validación del sistema.
const textoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});

export const registerSchema = z
  .object({
    // nombres + apellidos, o solo `nombre` (clientes antiguos): ver lib/nombre-persona.ts.
    ...camposNombreUsuario,
    email: z
      .string(textoObligatorio("El correo es obligatorio."))
      .trim()
      .min(1, "El correo es obligatorio."),
    password: z
      .string(textoObligatorio("La contraseña es obligatoria."))
      .min(1, "La contraseña es obligatoria."),
    departamentoId: z
      .string(textoObligatorio("Debes indicar a qué departamento perteneces."))
      .min(1, "Debes indicar a qué departamento perteneces."),
  })
  .superRefine(validarNombreUsuario);

export const loginSchema = z.object({
  email: z
    .string(textoObligatorio("El correo es obligatorio."))
    .trim()
    .min(1, "El correo es obligatorio."),
  password: z
    .string(textoObligatorio("La contraseña es obligatoria."))
    .min(1, "La contraseña es obligatoria."),
});

export const verificarCorreoSchema = z.object({
  email: z
    .string(textoObligatorio("El correo es obligatorio."))
    .trim()
    .min(1, "El correo es obligatorio."),
  codigo: z
    .string(textoObligatorio("Escribe el código de 6 dígitos."))
    .trim()
    .regex(/^\d{6}$/, "El código debe tener 6 dígitos."),
});

export const reenviarCodigoSchema = z.object({
  email: z
    .string(textoObligatorio("El correo es obligatorio."))
    .trim()
    .min(1, "El correo es obligatorio."),
});

export const selectTenantSchema = z.object({
  selectionToken: z
    .string(textoObligatorio("Falta el token de selección."))
    .min(1, "Falta el token de selección."),
  tenantId: z
    .string(textoObligatorio("Debes indicar a qué empresa quieres entrar."))
    .min(1, "Debes indicar a qué empresa quieres entrar."),
});

export const switchTenantSchema = z.object({
  tenantId: z
    .string(textoObligatorio("Debes indicar a qué empresa quieres cambiar."))
    .min(1, "Debes indicar a qué empresa quieres cambiar."),
});
