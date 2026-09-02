import { z } from "zod";

const textoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});

const alcance = z.enum(["GENERAL", "TENANT"]).nullish();

export const crearRolSchema = z.object({
  nombre: z
    .string(textoObligatorio("El nombre del rol es obligatorio."))
    .trim()
    .min(1, "El nombre del rol es obligatorio."),
  descripcion: z.string().nullish(),
  permisos: z.array(z.unknown()).nullish(),
  alcance,
});

export const actualizarRolSchema = z.object({
  nombre: z.string().nullish(),
  descripcion: z.string().nullish(),
  permisos: z.array(z.unknown()).nullish(),
  activo: z.boolean().nullish(),
  alcance,
});
