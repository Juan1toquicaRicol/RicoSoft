import { z } from "zod";

export const crearPlanProduccionSchema = z.object({
  itemRowId: z.number({ required_error: "itemRowId es requerido." }).int(),
  descripcion: z.string().max(255).nullable().optional(),
  referencia: z.string().max(255).nullable().optional(),
  unidadMedida: z.string().max(50).nullable().optional(),
  cantidadPlaneada: z
    .number({ required_error: "cantidadPlaneada es requerida." })
    .positive("cantidadPlaneada debe ser mayor a 0."),
  fechaPlaneada: z.coerce.date({ required_error: "fechaPlaneada es requerida." }),
  notas: z.string().max(500).nullable().optional(),
});

export const ESTADOS_PLAN_PRODUCCION = [
  "Planificada",
  "Aprobada",
  "En producción",
  "Parcial",
  "Terminada",
  "Cancelada",
] as const;

export const actualizarEstadoPlanProduccionSchema = z.object({
  estado: z.enum(ESTADOS_PLAN_PRODUCCION, { required_error: "estado es requerido." }),
});
