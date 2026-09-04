import { z } from "zod";

const textoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});
const numero = z.union([z.number(), z.string()]);

export const itemOrdenSchema = z.object({
  descripcion: z.string(textoObligatorio("La descripción del ítem es obligatoria.")),
  subpartidaArancelariaId: z.string().uuid().nullish(),
  cantidad: numero,
  pesoKg: numero.nullish(),
  volumenM3: numero.nullish(),
  valorUnitarioFob: numero,
});

export const crearOrdenCompraIntlSchema = z.object({
  numeroOrden: z.string(textoObligatorio("El número de orden es obligatorio.")),
  incoterm: z.string(textoObligatorio("El Incoterm es obligatorio.")),
  proveedorExtranjero: z.string(textoObligatorio("El proveedor extranjero es obligatorio.")),
  paisOrigen: z.string(textoObligatorio("El país de origen es obligatorio.")),
  moneda: z.string(textoObligatorio("La moneda es obligatoria.")),
  trmPactada: numero,
  observaciones: z.string().nullish(),
  items: z.array(itemOrdenSchema).min(1, "La orden debe tener al menos un ítem."),
});

export const crearLoteImportacionSchema = z.object({
  blAwb: z.string(textoObligatorio("El BL/AWB es obligatorio.")),
  contenedor: z.string().nullish(),
  precinto: z.string().nullish(),
  puertoOrigen: z.string(textoObligatorio("El puerto de origen es obligatorio.")),
  puertoDestino: z.string(textoObligatorio("El puerto de destino es obligatorio.")),
  naviera: z.string().nullish(),
  fechaEmbarque: z.string().nullish(),
  fechaLlegadaEstimada: z.string().nullish(),
});

export const actualizarEstadoLoteSchema = z.object({
  estado: z.string(textoObligatorio("El estado es obligatorio.")),
});

export const liquidarCosteoImportacionSchema = z.object({
  trmLiquidacion: numero,
  valorCifTotalUsd: numero,
  arancelTotalCop: numero,
  ivaTotalCop: numero,
  ivaDescontableCop: numero.nullish(),
  fletesNacionalesCop: numero.nullish(),
  agenciamientoCop: numero.nullish(),
  otrosCostosCop: numero.nullish(),
});

// PUT (reemplazo completo de los campos editables), no PATCH: el frontend
// siempre envía el formulario completo del expediente.
export const actualizarExpedienteAduaneroSchema = z.object({
  numeroDIM: z.string().nullish(),
  fechaDIM: z.string().nullish(),
  certificadoOrigenTlc: z.string().nullish(),
  fechaLevante: z.string().nullish(),
  estado: z.string().nullish(),
});

export const crearVistoBuenoSchema = z.object({
  entidad: z.string(textoObligatorio("La entidad del visto bueno es obligatoria.")),
  numero: z.string().nullish(),
  fecha: z.string().nullish(),
});

export const actualizarVistoBuenoSchema = z.object({
  entidad: z.string().nullish(),
  numero: z.string().nullish(),
  estado: z.string().nullish(),
  fecha: z.string().nullish(),
});

// --- Expediente vivo: actividades / novedades / pagos / cierre ---

export const crearActividadImportacionSchema = z.object({
  nombre: z.string(textoObligatorio("El nombre de la actividad es obligatorio.")),
  etapa: z.string(textoObligatorio("La etapa es obligatoria.")),
  responsableTipo: z.string(textoObligatorio("El tipo de responsable es obligatorio.")),
  responsableNombre: z.string().nullish(),
  fechaPlanificada: z.string().nullish(),
  fechaLimite: z.string().nullish(),
  loteId: z.string().uuid().nullish(),
  dependeDeId: z.string().uuid().nullish(),
});

export const actualizarActividadImportacionSchema = z.object({
  estado: z.string().nullish(),
  observacion: z.string().nullish(),
  fechaReal: z.string().nullish(),
});

export const crearNovedadImportacionSchema = z.object({
  tipo: z.string(textoObligatorio("El tipo de novedad es obligatorio.")),
  descripcion: z.string(textoObligatorio("La descripción es obligatoria.")),
  origen: z.string().nullish(),
  responsable: z.string().nullish(),
  prioridad: z.string().nullish(),
  impacto: z.string().nullish(),
  fechaLimite: z.string().nullish(),
  accionRequerida: z.string().nullish(),
});

export const resolverNovedadImportacionSchema = z.object({
  comentario: z.string().nullish(),
});

export const crearPagoImportacionSchema = z.object({
  concepto: z.string(textoObligatorio("El concepto del pago es obligatorio.")),
  valor: numero,
  moneda: z.string().nullish(),
  fechaVencimiento: z.string().nullish(),
  observaciones: z.string().nullish(),
});

export const actualizarEstadoPagoImportacionSchema = z.object({
  estado: z.string(textoObligatorio("El estado es obligatorio.")),
});

export const cerrarOrdenCompraIntlSchema = z.object({
  forzar: z.boolean().nullish(),
  justificacion: z.string().nullish(),
});
