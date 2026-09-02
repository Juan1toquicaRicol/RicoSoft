import { z } from "zod";

/**
 * El frontend NO recalcula el score/categoría/motivo — los recibe del
 * endpoint GET /inventario/decisiones (domain/planeacion/decisiones.ts) y
 * los reenvía tal cual al crear la gestión. Este schema solo valida forma,
 * nunca vuelve a calcular nada.
 */
export const crearGestionLiquidacionSchema = z.object({
  itemRowId: z.number({ required_error: "itemRowId es requerido." }).int(),
  descripcion: z.string().max(255).nullable().optional(),
  referencia: z.string().max(255).nullable().optional(),
  cantidadExistente: z.number({ required_error: "cantidadExistente es requerida." }).min(0),
  valorTotal: z.number({ required_error: "valorTotal es requerido." }).min(0),
  score: z.number({ required_error: "score es requerido." }).int().min(0).max(100),
  categoria: z.enum(["CRITICA", "ALTA", "MEDIA", "BAJA"], { required_error: "categoria es requerida." }),
  motivo: z.string().min(1).max(500),
});

export const ESTADOS_GESTION_LIQUIDACION = [
  "PENDIENTE",
  "EN_REVISION",
  "APROBADA",
  "RECHAZADA",
  "EJECUTADA",
] as const;

export const actualizarEstadoGestionLiquidacionSchema = z.object({
  estado: z.enum(ESTADOS_GESTION_LIQUIDACION, { required_error: "estado es requerido." }),
});
