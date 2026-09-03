import { z } from "zod";

const textoObligatorio = (mensaje: string) => ({ required_error: mensaje, invalid_type_error: mensaje });

export const crearProveedorSchema = z.object({
  nombre: z.string(textoObligatorio("El nombre del proveedor es obligatorio.")).trim().min(1, "El nombre del proveedor es obligatorio."),
  nit: z.string(textoObligatorio("El NIT es obligatorio.")).trim().min(1, "El NIT es obligatorio."),
  contacto: z.string().nullish(),
  telefono: z.string().nullish(),
  email: z.string().nullish(),
  condicionesPago: z.string().nullish(),
  datosPago: z.string().nullish(),
  // Departamento dueño del proveedor; ausente/null = proveedor general,
  // visible para cualquier departamento (ver comentario en schema.prisma).
  departamentoId: z.string().nullish(),
});

export const actualizarProveedorSchema = z.object({
  nombre: z.string().nullish(),
  nit: z.string().nullish(),
  contacto: z.string().nullish(),
  telefono: z.string().nullish(),
  email: z.string().nullish(),
  condicionesPago: z.string().nullish(),
  datosPago: z.string().nullish(),
  activo: z.boolean().nullish(),
  departamentoId: z.string().nullish(),
});
