import { z } from "zod";
import { parametrosNegocioShape } from "../../lib/parametros-negocio";

// Umbrales del módulo Producción & Planeación (Parte 16) — enteros positivos,
// con un techo razonable (10 años) para evitar valores absurdos que
// rompan los cálculos de antigüedad/cobertura sin ser técnicamente inválidos.
const diasPositivos = (mensaje: string) =>
  z
    .number({ required_error: mensaje, invalid_type_error: mensaje })
    .int(mensaje)
    .min(1, mensaje)
    .max(3650, mensaje);

export const actualizarConfiguracionInventarioSchema = z
  .object({
    diasVendible: diasPositivos("diasVendible debe ser un entero entre 1 y 3650."),
    diasExceso: diasPositivos("diasExceso debe ser un entero entre 1 y 3650."),
    diasRupturaCobertura: diasPositivos("diasRupturaCobertura debe ser un entero entre 1 y 3650."),
    diasSobreCobertura: diasPositivos("diasSobreCobertura debe ser un entero entre 1 y 3650."),
    // Fase 6 (Fase H) — inventario objetivo: días de cobertura deseados + factor de seguridad.
    coberturaObjetivoDias: diasPositivos(
      "coberturaObjetivoDias debe ser un entero entre 1 y 3650.",
    ),
    factorSeguridad: z
      .number({
        required_error: "factorSeguridad es requerido.",
        invalid_type_error: "factorSeguridad debe ser un número.",
      })
      .min(1, "factorSeguridad no puede ser menor a 1.")
      .max(5, "factorSeguridad no puede ser mayor a 5."),
    // Umbrales adicionales (auditoría de datos hardcodeados): opcionales para
    // no romper llamadores existentes que solo mandan los campos de arriba —
    // si se omiten, el upsert conserva el valor por defecto de la columna.
    umbralVariabilidadAltaDemanda: z
      .number()
      .min(0, "umbralVariabilidadAltaDemanda debe ser mayor o igual a 0.")
      .optional(),
    umbralPerdidaRotacionDemanda: z
      .number()
      .min(0, "umbralPerdidaRotacionDemanda debe ser mayor o igual a 0.")
      .max(1, "umbralPerdidaRotacionDemanda debe ser menor o igual a 1.")
      .optional(),
    umbralTendenciaFuertePctDemanda: z
      .number()
      .min(0, "umbralTendenciaFuertePctDemanda debe ser mayor o igual a 0.")
      .optional(),
    umbralAlertaTrmPct: z
      .number()
      .min(0, "umbralAlertaTrmPct debe ser mayor o igual a 0.")
      .optional(),
    plazoCreditoDiasDefecto: z
      .number()
      .int("plazoCreditoDiasDefecto debe ser un entero.")
      .min(1, "plazoCreditoDiasDefecto debe ser mayor o igual a 1.")
      .optional(),
    minimoCotizacionesSolicitud: z
      .number()
      .int("minimoCotizacionesSolicitud debe ser un entero.")
      .min(1, "minimoCotizacionesSolicitud debe ser mayor o igual a 1.")
      .optional(),
    // Parámetros de negocio (Ventas/Crédito/Inventario/Compras): solo se
    // almacenan; ver lib/parametros-negocio.ts.
    ...parametrosNegocioShape,
  })
  .refine((v) => v.diasVendible < v.diasExceso, {
    message: "diasVendible debe ser menor que diasExceso.",
    path: ["diasVendible"],
  });
