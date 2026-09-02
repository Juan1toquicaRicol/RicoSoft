import { z } from "zod";

export const consultarDisponibilidadSchema = z.object({
  itemRowId: z.coerce.number({ required_error: "itemRowId es requerido." }).int(),
  cantidad: z.coerce
    .number({ required_error: "cantidad es requerida." })
    .positive("cantidad debe ser mayor a 0."),
});

export const buscarProductosSchema = z.object({
  search: z.string().min(2, "Escribe al menos 2 caracteres para buscar."),
});

export const contextoProductoSchema = z.object({
  itemRowId: z.coerce.number({ required_error: "itemRowId es requerido." }).int(),
});
