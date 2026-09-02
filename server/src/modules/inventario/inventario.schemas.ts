import { z } from "zod";

// Umbrales del módulo Producción & Planeación (Parte 16) — enteros positivos,
// con un techo razonable (10 años) para evitar valores absurdos que
// rompan los cálculos de antigüedad/cobertura sin ser técnicamente inválidos.
const diasPositivos = (mensaje: string) =>
  z.number({ required_error: mensaje, invalid_type_error: mensaje }).int(mensaje).min(1, mensaje).max(3650, mensaje);

export const actualizarConfiguracionInventarioSchema = z
  .object({
    diasVendible: diasPositivos("diasVendible debe ser un entero entre 1 y 3650."),
    diasExceso: diasPositivos("diasExceso debe ser un entero entre 1 y 3650."),
    diasRupturaCobertura: diasPositivos("diasRupturaCobertura debe ser un entero entre 1 y 3650."),
    diasSobreCobertura: diasPositivos("diasSobreCobertura debe ser un entero entre 1 y 3650."),
    // Fase 6 (Fase H) — inventario objetivo: días de cobertura deseados + factor de seguridad.
    coberturaObjetivoDias: diasPositivos("coberturaObjetivoDias debe ser un entero entre 1 y 3650."),
    factorSeguridad: z
      .number({ required_error: "factorSeguridad es requerido.", invalid_type_error: "factorSeguridad debe ser un número." })
      .min(1, "factorSeguridad no puede ser menor a 1.")
      .max(5, "factorSeguridad no puede ser mayor a 5."),
  })
  .refine((v) => v.diasVendible < v.diasExceso, {
    message: "diasVendible debe ser menor que diasExceso.",
    path: ["diasVendible"],
  });
