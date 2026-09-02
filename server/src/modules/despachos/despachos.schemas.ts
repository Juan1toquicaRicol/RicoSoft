import { z } from "zod";

export const crearDespachoSchema = z.object({
  siesaDocRowId: z.number({ required_error: "siesaDocRowId es requerido." }).int(),
  direccionEntrega: z.string().max(500).nullable().optional(),
  contactoEntrega: z.string().max(255).nullable().optional(),
  telefonoContacto: z.string().max(50).nullable().optional(),
  bodegaRowId: z.number().int().nullable().optional(),
  bodegaNombre: z.string().max(255).nullable().optional(),
  fechaEntregaEstimada: z.coerce.date().nullable().optional(),
});

export const ESTADOS_DESPACHO = [
  "RECIBIDO",
  "PREPARANDO",
  "PREPARADO",
  "PENDIENTE_CARGUE",
  "CARGANDO",
  "CARGADO",
  "DESPACHADO",
  "EN_TRANSITO",
  "ENTREGADO",
  "ENTREGA_PARCIAL",
  "DEVUELTO",
  "CANCELADO",
] as const;

export const actualizarEstadoDespachoSchema = z.object({
  estado: z.enum(ESTADOS_DESPACHO, { required_error: "estado es requerido." }),
  observacion: z.string().max(500).nullable().optional(),
  vehiculoPlaca: z.string().max(20).nullable().optional(),
  vehiculoTipo: z.string().max(50).nullable().optional(),
  conductorNombre: z.string().max(255).nullable().optional(),
  conductorTelefono: z.string().max(50).nullable().optional(),
  recibidoPor: z.string().max(255).nullable().optional(),
});

export const actualizarLineaDespachoSchema = z.object({
  cantidadPreparada: z.number().min(0).nullable().optional(),
  cantidadDespachada: z.number().min(0).nullable().optional(),
  cantidadEntregada: z.number().min(0).nullable().optional(),
  observacion: z.string().max(500).nullable().optional(),
});

export const TIPOS_NOVEDAD = [
  "PRODUCTO_FALTANTE",
  "DIRECCION_INCORRECTA",
  "CLIENTE_AUSENTE",
  "VEHICULO_NO_DISPONIBLE",
  "MERCANCIA_AVERIADA",
  "ENTREGA_PARCIAL",
  "RECHAZO_CLIENTE",
  "DEVOLUCION",
  "OTRA",
] as const;

export const crearNovedadSchema = z.object({
  tipo: z.enum(TIPOS_NOVEDAD, { required_error: "tipo es requerido." }),
  descripcion: z.string().min(1, "descripcion es requerida.").max(500),
});

export const resolverNovedadSchema = z.object({
  observacionResolucion: z.string().max(500).nullable().optional(),
});

export const listarDespachosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  estado: z.enum(ESTADOS_DESPACHO).optional(),
  clienteSearch: z.string().optional(),
  bodegaRowId: z.coerce.number().int().optional(),
  conductorSearch: z.string().optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

export const documentosVentaParaDespachoSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
