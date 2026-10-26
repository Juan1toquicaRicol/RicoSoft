import { z } from "zod";

const textoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});
const numero = z.union([z.number(), z.string()]);

export const buscarItemsOrdenSchema = z.object({
  search: z.string().min(2, "Escribe al menos 2 caracteres para buscar."),
});

export const itemOrdenSchema = z.object({
  descripcion: z.string(textoObligatorio("La descripción del ítem es obligatoria.")),
  referencia: z.string().nullish(),
  // Código con el que EL PROVEEDOR identifica el ítem en su cotización —
  // distinto de `referencia` (interna/Siesa). Uso futuro: Bandeja
  // Inteligente. Texto libre, nunca obligatorio.
  referenciaProveedor: z.string().nullish(),
  unidadMedida: z.string().nullish(),
  subpartidaArancelariaId: z.string().uuid().nullish(),
  cantidad: numero,
  pesoKg: numero.nullish(),
  volumenM3: numero.nullish(),
  valorUnitarioFob: numero.refine(
    (valor) => valor !== "" && Number.isFinite(Number(valor)) && Number(valor) >= 0,
    "El valor unitario FOB debe ser un número válido mayor o igual a cero.",
  ),
});

export const crearOrdenCompraIntlSchema = z.object({
  // Ignorado: el servidor asigna el número (codigo = numeroOrden = IMP-<año>-<n>).
  // Se acepta por compatibilidad con clientes anteriores, sin usarlo.
  numeroOrden: z.string().nullish(),
  // Fecha explícita de la orden (default "hoy" en el frontend) — distinta
  // de createdAt, que sigue siendo el timestamp de auditoría del registro.
  fechaOrden: z.string().nullish(),
  incoterm: z.string(textoObligatorio("El Incoterm es obligatorio.")),
  // Lugar pactado del Incoterm (ej. "Shanghai, China") — texto libre, nunca
  // se infiere de paisOrigen ni de ningún otro campo.
  lugarPactado: z.string().nullish(),
  proveedorId: z.string().uuid().nullish(),
  // Nullable a propósito: solo es obligatorio cuando NO se seleccionó
  // proveedorId — esa regla XOR se valida en el controlador (no aquí, para
  // dar un mensaje más específico que "campo obligatorio").
  proveedorExtranjero: z.string().nullish(),
  paisOrigen: z.string(textoObligatorio("El país de origen es obligatorio.")),
  moneda: z.string(textoObligatorio("La moneda es obligatoria.")),
  trmPactada: numero,
  // Fecha y fuente (Oficial/Pactada/Manual) de trmPactada — opcionales para
  // no romper integraciones/scripts que ya crean órdenes sin estos campos.
  tasaCambioFecha: z.string().nullish(),
  tasaCambioFuente: z.string().nullish(),
  formaPago: z.string().nullish(),
  condicionPago: z.string().nullish(),
  detallePago: z.string().nullish(),
  fechaRequeridaLlegada: z.string().nullish(),
  // Selector de "Responsable de la importación" — si no se envía, se sigue
  // asignando a quien crea la orden (mismo comportamiento de antes).
  responsableId: z.string().uuid().nullish(),
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
  // Tracking Marítimo V1 — opcionales al crear el lote (normalmente llegan
  // después, vía Bandeja Inteligente o edición manual).
  booking: z.string().nullish(),
  forwarder: z.string().nullish(),
  buqueNombre: z.string().nullish(),
  buqueImo: z.string().nullish(),
  buqueMmsi: z.string().nullish(),
});

export const actualizarEstadoLoteSchema = z.object({
  estado: z.string(textoObligatorio("El estado es obligatorio.")),
});

/** Edición de los datos de embarque/buque de un lote — todo opcional,
 * PATCH parcial (mismo criterio que actualizarProveedorSchema). */
export const actualizarEmbarqueLoteSchema = z.object({
  blAwb: z.string().nullish(),
  contenedor: z.string().nullish(),
  precinto: z.string().nullish(),
  puertoOrigen: z.string().nullish(),
  puertoDestino: z.string().nullish(),
  naviera: z.string().nullish(),
  booking: z.string().nullish(),
  forwarder: z.string().nullish(),
  buqueNombre: z.string().nullish(),
  buqueImo: z.string().nullish(),
  buqueMmsi: z.string().nullish(),
  fechaEmbarque: z.string().nullish(),
  fechaLlegadaEstimada: z.string().nullish(),
});

export const crearContenedorLoteSchema = z.object({
  numero: z.string(textoObligatorio("El número de contenedor es obligatorio.")).trim().min(1),
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
  // Método de prorrateo de fletes/agenciamiento/otros costos. Omitido = FOB
  // (comportamiento histórico). Arancel, IVA y CIF se reparten siempre por FOB.
  metodoProrrateoGastos: z
    .enum(["FOB", "PESO", "VOLUMEN"], {
      errorMap: () => ({ message: "Método de prorrateo inválido. Usa: FOB, PESO o VOLUMEN." }),
    })
    .nullish(),
});

/** Registro/corrección de un hito real del lote (la fecha es obligatoria). */
export const registrarHitoLoteSchema = z.object({
  fecha: z
    .string(textoObligatorio("La fecha del hito es obligatoria."))
    .min(1, "La fecha del hito es obligatoria."),
  nota: z.string().max(500, "La nota no puede superar 500 caracteres.").nullish(),
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

/** Fija el siguiente consecutivo del año actual (solo hacia arriba). */
export const fijarConsecutivoImportacionSchema = z.object({
  siguiente: z.coerce
    .number({ invalid_type_error: "El consecutivo debe ser un número entero." })
    .int("El consecutivo debe ser un número entero.")
    .min(1, "El consecutivo debe ser al menos 1.")
    .max(999999, "El consecutivo es demasiado grande."),
});
