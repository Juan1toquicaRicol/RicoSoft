import { z } from "zod";

const textoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});

export const crearMembresiaSchema = z.object({
  tenantId: z.string(textoObligatorio("Debes indicar a qué empresa dar acceso.")).min(1),
  rolId: z.string().min(1).nullable().optional(),
  departamentoId: z.string().min(1).nullable().optional(),
  isSuperadmin: z.boolean().optional().default(false),
});

export const actualizarMembresiaSchema = z.object({
  rolId: z.string().min(1).nullable().optional(),
  departamentoId: z.string().min(1).nullable().optional(),
  isSuperadmin: z.boolean().optional(),
  activo: z.boolean().optional(),
});
