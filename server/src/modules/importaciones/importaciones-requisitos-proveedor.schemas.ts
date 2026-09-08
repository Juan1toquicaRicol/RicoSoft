import { z } from "zod";

const textoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});

export const crearRequisitoProveedorSchema = z.object({
  tipo: z.string(textoObligatorio("El tipo de requisito es obligatorio.")),
  nombre: z.string(textoObligatorio("El nombre del requisito es obligatorio.")),
  descripcion: z.string().nullish(),
  obligatorio: z.boolean().nullish(),
  orden: z.number().int().nullish(),
});

export const actualizarRequisitoProveedorSchema = z.object({
  tipo: z.string().nullish(),
  nombre: z.string().nullish(),
  descripcion: z.string().nullish(),
  obligatorio: z.boolean().nullish(),
  activo: z.boolean().nullish(),
  orden: z.number().int().nullish(),
});
