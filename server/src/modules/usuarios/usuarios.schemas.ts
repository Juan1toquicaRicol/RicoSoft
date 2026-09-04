import { z } from "zod";

// required_error/invalid_type_error reemplazan los mensajes técnicos por
// defecto de zod ("Required", "Expected string, received number") por texto
// en español apto para mostrar al usuario.
const textoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});
const booleanoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});

export const crearUsuarioSchema = z.object({
  nombre: z
    .string(textoObligatorio("El nombre es obligatorio."))
    .trim()
    .min(1, "El nombre es obligatorio."),
  email: z
    .string(textoObligatorio("El correo es obligatorio."))
    .trim()
    .min(1, "El correo es obligatorio."),
  password: z
    .string(textoObligatorio("La contraseña es obligatoria."))
    .min(1, "La contraseña es obligatoria."),
  departamentoId: z.string().nullish(),
  rolId: z.string().nullish(),
});

export const actualizarPerfilPropioSchema = z.object({
  nombre: z
    .string(textoObligatorio("El nombre es obligatorio."))
    .trim()
    .min(1, "El nombre es obligatorio."),
  // El formato del teléfono (si viene) se valida en el controlador, no aquí.
  telefono: z.string().nullish(),
});

export const cambiarPasswordPropioSchema = z.object({
  passwordActual: z
    .string(textoObligatorio("La contraseña actual es obligatoria."))
    .min(1, "La contraseña actual es obligatoria."),
  passwordNueva: z
    .string(textoObligatorio("La nueva contraseña es obligatoria."))
    .min(1, "La nueva contraseña es obligatoria."),
  confirmarPassword: z
    .string(textoObligatorio("Debes confirmar la nueva contraseña."))
    .min(1, "Debes confirmar la nueva contraseña."),
});

export const cambiarEstadoSchema = z.object({
  activo: z.boolean(booleanoObligatorio("El campo 'activo' es requerido y debe ser booleano.")),
});

export const asignarRolSchema = z.object({
  rolId: z
    .string(textoObligatorio("El campo 'rolId' es requerido y debe ser un id de rol o null."))
    .nullable(),
});

export const asignarDepartamentoSchema = z.object({
  departamentoId: z
    .string(
      textoObligatorio(
        "El campo 'departamentoId' es requerido y debe ser un id de departamento o null.",
      ),
    )
    .nullable(),
});

export const cambiarEmailSchema = z.object({
  email: z
    .string(textoObligatorio("El correo es obligatorio."))
    .trim()
    .min(1, "El correo es obligatorio."),
});

export const resetPasswordSchema = z.object({
  passwordNueva: z
    .string(textoObligatorio("La nueva contraseña es obligatoria."))
    .min(1, "La nueva contraseña es obligatoria."),
});
