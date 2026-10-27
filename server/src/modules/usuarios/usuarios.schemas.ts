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

/**
 * Nombre de la cuenta: `nombres` + `apellidos` (columnas independientes) o,
 * por compatibilidad con clientes antiguos, solo `nombre` (nombre completo).
 * Si llega uno de los dos del par, deben venir ambos.
 */
export const camposNombreUsuario = {
  nombre: z.string(textoObligatorio("El nombre es obligatorio.")).trim().optional(),
  nombres: z
    .string(textoObligatorio("Los nombres son obligatorios."))
    .trim()
    .max(120, "Los nombres no pueden superar 120 caracteres.")
    .optional(),
  apellidos: z
    .string(textoObligatorio("Los apellidos son obligatorios."))
    .trim()
    .max(120, "Los apellidos no pueden superar 120 caracteres.")
    .optional(),
};

export function validarNombreUsuario(
  datos: { nombre?: string; nombres?: string; apellidos?: string },
  ctx: z.RefinementCtx,
) {
  const nombres = datos.nombres?.trim() ?? "";
  const apellidos = datos.apellidos?.trim() ?? "";
  if (nombres || apellidos) {
    if (!nombres) {
      ctx.addIssue({ code: "custom", path: ["nombres"], message: "Los nombres son obligatorios." });
    } else if (!apellidos) {
      ctx.addIssue({
        code: "custom",
        path: ["apellidos"],
        message: "Los apellidos son obligatorios.",
      });
    }
    return;
  }
  if (!datos.nombre?.trim()) {
    ctx.addIssue({ code: "custom", path: ["nombres"], message: "El nombre es obligatorio." });
  }
}

export const crearUsuarioSchema = z
  .object({
    ...camposNombreUsuario,
    email: z
      .string(textoObligatorio("El correo es obligatorio."))
      .trim()
      .min(1, "El correo es obligatorio."),
    password: z
      .string(textoObligatorio("La contraseña es obligatoria."))
      .min(1, "La contraseña es obligatoria."),
    departamentoId: z.string().nullish(),
    rolId: z.string().nullish(),
  })
  .superRefine(validarNombreUsuario);

export const actualizarPerfilPropioSchema = z
  .object({
    ...camposNombreUsuario,
    // El formato del teléfono (si viene) se valida en el controlador, no aquí.
    telefono: z.string().nullish(),
  })
  .superRefine(validarNombreUsuario);

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

export const cambiarSuperadminSchema = z.object({
  isSuperadmin: z.boolean(
    booleanoObligatorio("El campo 'isSuperadmin' es requerido y debe ser booleano."),
  ),
});
