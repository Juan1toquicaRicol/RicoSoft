import { z } from "zod";

export const resolverExcepcionSchema = z.object({
  accion: z.enum(["SELECCIONAR_PROVEEDOR", "SELECCIONAR_ORDEN", "DESCARTAR"]),
  proveedorId: z.string().uuid().nullish(),
  ordenCompraId: z.string().uuid().nullish(),
});

export const asignarProveedorCorreoSinTenantSchema = z.object({
  proveedorId: z.string().uuid({ message: "proveedorId debe ser un id válido." }),
});
