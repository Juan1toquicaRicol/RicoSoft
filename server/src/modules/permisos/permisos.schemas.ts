import { z } from "zod";

const textoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});

// "modulo.accion" (con subacciones opcionales), en minúsculas, sin espacios
// — misma convención que ya usa PERMISOS_SISTEMA (p. ej. "solicitudes.aprobar").
const CODIGO_REGEX = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

export const crearPermisoSchema = z.object({
  codigo: z
    .string(textoObligatorio("El código es obligatorio."))
    .trim()
    .min(1, "El código es obligatorio.")
    .regex(
      CODIGO_REGEX,
      'El código debe tener el formato "modulo.accion" en minúsculas, sin espacios (p. ej. "compras.aprobar_extra").',
    ),
  nombre: z
    .string(textoObligatorio("El nombre es obligatorio."))
    .trim()
    .min(1, "El nombre es obligatorio."),
  descripcion: z.string().nullish(),
  modulo: z
    .string(textoObligatorio("El módulo es obligatorio."))
    .trim()
    .min(1, "El módulo es obligatorio."),
});

export const actualizarPermisoSchema = z.object({
  nombre: z.string().nullish(),
  descripcion: z.string().nullish(),
  modulo: z.string().nullish(),
  activo: z.boolean().nullish(),
});
