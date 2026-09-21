import { z } from "zod";

export const buscarClientesProformaSchema = z.object({
  search: z.string().min(2, "Escribe al menos 2 caracteres para buscar."),
});

export const datosFacturacionClienteSchema = z.object({
  clienteRowId: z.coerce.number({ required_error: "clienteRowId es requerido." }).int(),
});

const itemProformaSchema = z.object({
  itemRowId: z.number().int().nullable().optional(),
  referencia: z.string().trim().max(100).nullable().optional(),
  descripcion: z.string().trim().min(1, "La descripción del ítem es requerida.").max(500),
  /** t150_mc_bodegas.f150_rowid (leerBodegasSiesa) — se valida contra la cia
   * Siesa del tenant antes de guardar, ver validarBodegasDelTenant. */
  bodegaRowId: z.number().int().positive().nullable().optional(),
  bodega: z.string().trim().max(20).nullable().optional(),
  unidadMedida: z.string().trim().max(20).nullable().optional(),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0."),
  precioUnitario: z.number().nonnegative("El precio unitario no puede ser negativo."),
  descuentoPct: z.number().min(0).max(100).optional().default(0),
  ivaPct: z.number().min(0).max(100).optional().default(19),
});

export const buscarCotizacionesSchema = z.object({
  q: z.string().min(1, "Escribe un número de cotización para buscar."),
});

export const obtenerCotizacionSchema = z.object({
  id: z.string().min(1, "id inválido."),
});

export const crearProformaSchema = z.object({
  /** Consecutivo sugerido/editable (ver GET /proformas/siguiente-numero) —
   * si se omite, el backend conserva el cálculo automático de siempre. */
  numero: z.number().int().positive().optional(),
  /** Cotización de origen (opcional) — si viene, el backend SIEMPRE la
   * revalida contra Siesa antes de guardar (ver crearProforma), nunca
   * confía en cotizacionNumero/erpDocumentoNumero que mande el frontend. */
  cotizacionIdExterno: z.string().trim().min(1).max(50).nullable().optional(),
  /** Cotización INTERNA de RicoSoft (módulo Comercial → Gestión Comercial),
   * independiente de cotizacionIdExterno (Siesa) — ver crearProforma. */
  cotizacionId: z.string().uuid().nullable().optional(),
  clienteRowId: z.number({ required_error: "clienteRowId es requerido." }).int(),
  clienteNombre: z.string().trim().min(1, "El nombre del cliente es requerido.").max(255),
  clienteNit: z.string().trim().max(50).nullable().optional(),
  contacto: z.string().trim().max(255).nullable().optional(),
  direccion: z.string().trim().max(500).nullable().optional(),
  ciudad: z.string().trim().max(255).nullable().optional(),
  telefono: z.string().trim().max(50).nullable().optional(),
  formaPago: z.string().trim().max(100).nullable().optional(),
  fechaVencimiento: z.coerce.date().nullable().optional(),
  vendedorNombre: z.string().trim().max(255).nullable().optional(),
  ocNumero: z.string().trim().max(100).nullable().optional(),
  documentoAlterno: z.string().trim().max(100).nullable().optional(),
  remisiones: z.string().trim().max(100).nullable().optional(),
  moneda: z.string().trim().max(20).optional().default("PESOS"),
  observaciones: z.string().trim().max(4000).nullable().optional(),
  aplicaRetencion: z.boolean().optional().default(false),
  retencionPct: z.number().min(0).max(100).optional().default(2.5),
  aplicaRetencionIva: z.boolean().optional().default(false),
  retencionIvaPct: z.number().min(0).max(100).optional().default(15),
  aplicaIca: z.boolean().optional().default(false),
  icaPct: z.number().min(0).max(100).optional().default(0.7),
  items: z.array(itemProformaSchema).min(1, "Agrega al menos un ítem."),
});

// numero también editable al actualizar (una proforma en borrador puede
// corregirse antes de imprimirla) — misma validación de unicidad que crear.
export const actualizarProformaSchema = crearProformaSchema;

export const actualizarConfiguracionComercialSchema = z.object({
  retencionFuentePct: z.number().min(0).max(100),
  retencionIvaPct: z.number().min(0).max(100),
  retencionIcaPct: z.number().min(0).max(100),
});

export const listarProformasSchema = z.object({
  clienteRowId: z.coerce.number().int().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});

export const obtenerProformaSchema = z.object({
  id: z.string().uuid("id inválido."),
});

/** PATCH /proformas/:id/documento-erp — vincular/corregir a mano el
 * documento Siesa (CDV) cuando el buscador automático no lo encontró. El
 * identificador técnico SIEMPRE se revalida contra Siesa antes de guardar
 * (ver asignarDocumentoErpProforma), igual que en crearProforma. */
export const asignarDocumentoErpProformaSchema = z.object({
  cotizacionIdExterno: z.string().trim().min(1).max(50),
});
