import { z } from "zod";

export const ACCIONES_CONTACTO = [
  "Llamada",
  "WhatsApp",
  "Correo",
  "Reunion",
  "Visita",
  "Cotizacion",
  "Seguimiento",
  "Otro",
] as const;

export const RESULTADOS_CONTACTO = [
  "Contactado",
  "SinRespuesta",
  "Interesado",
  "CotizacionSolicitada",
  "CotizacionEnviada",
  "EnNegociacion",
  "NoInteresado",
  "VentaRealizada",
] as const;

// Resultados que cierran el ciclo de seguimiento de una oportunidad — a
// partir de aquí ya no tiene sentido exigir "próxima acción" (no hay
// oportunidad activa que accionar).
export const RESULTADOS_TERMINALES = new Set(["NoInteresado", "VentaRealizada"]);

export const clienteParamsSchema = z.object({
  clienteRowId: z.coerce.number({ required_error: "clienteRowId es requerido." }).int(),
});

export const crearSeguimientoSchema = z
  .object({
    clienteNombre: z.string().trim().min(1, "El nombre del cliente es obligatorio."),
    itemRowId: z.coerce.number().int().nullish(),
    itemDescripcion: z.string().trim().nullish(),
    accion: z.enum(ACCIONES_CONTACTO, { required_error: "La acción de contacto es obligatoria." }),
    resultado: z.enum(RESULTADOS_CONTACTO, { required_error: "El resultado es obligatorio." }),
    comentario: z.string().trim().nullish(),
    proximaAccion: z.string().trim().nullish(),
    proximoSeguimientoFecha: z.coerce.date().nullish(),
  })
  .refine(
    (data) =>
      RESULTADOS_TERMINALES.has(data.resultado) ||
      (!!data.proximaAccion?.trim() && !!data.proximoSeguimientoFecha),
    {
      message:
        "Una oportunidad activa requiere próxima acción y fecha de próximo seguimiento (solo se omiten cuando el resultado es 'No interesado' o 'Venta realizada').",
      path: ["proximaAccion"],
    },
  );
