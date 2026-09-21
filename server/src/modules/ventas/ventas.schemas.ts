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

export const historicoClienteSchema = z.object({
  clienteRowId: z.coerce.number({ required_error: "clienteRowId es requerido." }).int(),
});

const paginacionClienteSchema = {
  clienteRowId: z.coerce.number({ required_error: "clienteRowId es requerido." }).int(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
};

export const listarPedidosClienteSchema = z.object(paginacionClienteSchema);
export const listarRemisionesClienteSchema = z.object(paginacionClienteSchema);
export const listarFacturasClienteSchema = z.object({
  ...paginacionClienteSchema,
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

export const trazabilidadPedidoSchema = z.object({
  clienteRowId: z.coerce.number({ required_error: "clienteRowId es requerido." }).int(),
  pedidoRowId: z.coerce.number({ required_error: "pedidoRowId es requerido." }).int(),
});

export const detalleRemisionSchema = z.object({
  clienteRowId: z.coerce.number({ required_error: "clienteRowId es requerido." }).int(),
  remisionRowId: z.coerce.number({ required_error: "remisionRowId es requerido." }).int(),
});

export const clienteResumenSchema = z.object({
  clienteRowId: z.coerce.number({ required_error: "clienteRowId es requerido." }).int(),
});
