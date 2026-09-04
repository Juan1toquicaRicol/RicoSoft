import { z } from "zod";

export const crearTomaFisicaSchema = z.object({
  bodegaRowId: z
    .number({
      required_error: "bodegaRowId es requerido.",
      invalid_type_error: "bodegaRowId debe ser un número.",
    })
    .int(),
});

export const registrarConteoSchema = z.object({
  conteoFisico: z
    .number({
      required_error: "conteoFisico es requerido.",
      invalid_type_error: "conteoFisico debe ser un número.",
    })
    .min(0, "conteoFisico no puede ser negativo."),
});
