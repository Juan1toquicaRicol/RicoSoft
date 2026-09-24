import { z } from "zod";

const itemComercialSchema = z.object({
  itemRowId: z.number().int().nullable().optional(),
  referencia: z.string().trim().max(100).nullable().optional(),
  descripcion: z.string().trim().min(1, "La descripción del ítem es requerida.").max(500),
  bodegaRowId: z.number().int().positive().nullable().optional(),
  bodega: z.string().trim().max(20).nullable().optional(),
  unidadMedida: z.string().trim().max(20).nullable().optional(),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0."),
  precioUnitario: z.number().nonnegative("El precio unitario no puede ser negativo."),
  descuentoPct: z.number().min(0).max(100).optional().default(0),
  ivaPct: z.number().min(0).max(100).optional().default(19),
});

export const crearCotizacionSchema = z.object({
  numero: z.number().int().positive().optional(),
  clienteRowId: z.number({ required_error: "clienteRowId es requerido." }).int(),
  clienteNombre: z.string().trim().min(1, "El nombre del cliente es requerido.").max(255),
  clienteNit: z.string().trim().max(50).nullable().optional(),
  contacto: z.string().trim().max(255).nullable().optional(),
  direccion: z.string().trim().max(500).nullable().optional(),
  ciudad: z.string().trim().max(255).nullable().optional(),
  telefono: z.string().trim().max(50).nullable().optional(),
  vendedorNombre: z.string().trim().max(255).nullable().optional(),
  fechaVencimiento: z.coerce.date().nullable().optional(),
  moneda: z.string().trim().max(20).optional().default("PESOS"),
  observaciones: z.string().trim().max(4000).nullable().optional(),
  items: z.array(itemComercialSchema).min(1, "Agrega al menos un ítem."),
});

export const actualizarCotizacionSchema = crearCotizacionSchema;

export const listarCotizacionesSchema = z.object({
  clienteRowId: z.coerce.number().int().optional(),
  estado: z.string().trim().max(20).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});

export const idParamSchema = z.object({
  id: z.string().uuid("id inválido."),
});

export const accionConObservacionSchema = z.object({
  observacion: z.string().trim().max(1000).nullable().optional(),
});

export const crearPedidoDesdeProformaSchema = z.object({
  observaciones: z.string().trim().max(4000).nullable().optional(),
});

export const actualizarPedidoSchema = z.object({
  observaciones: z.string().trim().max(4000).nullable().optional(),
  vendedorNombre: z.string().trim().max(255).nullable().optional(),
  items: z.array(itemComercialSchema).min(1, "Agrega al menos un ítem.").optional(),
});

export const listarPedidosSchema = z.object({
  clienteRowId: z.coerce.number().int().optional(),
  estado: z.string().trim().max(20).optional(),
  search: z.string().trim().max(100).optional(),
  // Enriquecer cada pedido de la página con su compromiso de inventario en
  // Siesa (una sola consulta en lote). NUNCA acepta ciaId/tenantId: la
  // compañía se deriva del tenant autenticado.
  incluirCompromiso: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});

/** Vincular/corregir a mano el documento Siesa (CDV) de una Cotización
 * interna, para cuando todavía no existe adaptador automático de
 * sincronización (fase futura) — mismo criterio que
 * asignarDocumentoErpProformaSchema en proformas.schemas.ts. */
export const asignarErpCotizacionSchema = z.object({
  erpRowId: z.coerce.number().int().positive("erpRowId debe ser un entero positivo."),
});

/** Vincular a mano el PDV real de Siesa (t430, f430_id_tipo_docto='PDV') de
 * un PedidoComercial — mismo schema que asignarErpCotizacionSchema, tipo
 * de documento distinto (ver asignarErpPedido en pedidos.controller.ts). */
export const asignarErpPedidoSchema = z.object({
  erpRowId: z.coerce.number().int().positive("erpRowId debe ser un entero positivo."),
});

export const listarDocumentosSchema = z.object({
  tipo: z.enum(["todos", "cotizacion", "proforma", "pedido"]).optional().default("todos"),
  estado: z.string().trim().max(20).optional(),
  clienteRowId: z.coerce.number().int().optional(),
  vendedorNombre: z.string().trim().max(255).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  search: z.string().trim().max(100).optional(),
  // Solo aplica a pedidos: enriquece cada pedido de la página con su estado
  // en Siesa (UNA consulta en lote). Nunca acepta ciaId/tenantId.
  incluirCompromiso: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});
