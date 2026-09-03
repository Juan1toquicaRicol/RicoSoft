import { z } from "zod";

const textoObligatorio = (mensaje: string) => ({ required_error: mensaje, invalid_type_error: mensaje });

export const crearClasificacionSchema = z.object({
  codigo: z.string(textoObligatorio("El código es obligatorio.")).trim().min(1).max(50),
  nombre: z.string(textoObligatorio("El nombre es obligatorio.")).trim().min(1).max(100),
  descripcion: z.string().trim().max(500).nullish(),
  orden: z.coerce.number().int().nullish(),
});

export const actualizarClasificacionSchema = z.object({
  nombre: z.string().trim().min(1).max(100).nullish(),
  descripcion: z.string().trim().max(500).nullish(),
  orden: z.coerce.number().int().nullish(),
});

export const cambiarActivoClasificacionSchema = z.object({
  activo: z.boolean({ required_error: "El campo activo es obligatorio." }),
});

export const actualizarClasificacionesItemSchema = z.object({
  clasificacionIds: z.array(z.string().uuid()),
});

export const asignacionMasivaSchema = z.object({
  itemRowIds: z.array(z.coerce.number().int()).min(1, "Selecciona al menos un ítem."),
  clasificacionId: z.string().uuid({ message: "Clasificación inválida." }),
  accion: z.enum(["asignar", "quitar"]),
});
