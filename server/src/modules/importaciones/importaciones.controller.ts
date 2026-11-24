import {
  avisarCorreosDesvinculados,
  ConflictoVinculoCorreo,
  desvincularCorreosDeOrden,
  vincularOrdenCorreo,
} from "./importaciones-bandeja-vinculo";
import fs from "fs";
import path from "path";
import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  UPLOADS_DIR_EXPEDIENTES,
  UPLOADS_DIR_VISTOS_BUENOS,
  UPLOADS_DIR_ORDENES_COMPRA_INTL,
  UPLOADS_DIR_LOTES_IMPORTACION,
  moverArchivoDefinitivo,
} from "../../middleware/upload.middleware";
import {
  calcularActividadesVencidas,
  generarNovedadesSugeridas,
  calcularSituacionActual,
  type ActividadSeguimiento,
} from "../../domain/importaciones/motor-seguimiento";
import { evaluarCondicionesCierre } from "../../domain/importaciones/condiciones-cierre";
import {
  calcularParticipaciones,
  esMetodoAprobado,
  esMetodoProrrateo,
  type MetodoProrrateo,
} from "../../domain/importaciones/prorrateo-gastos";
import { validarMontosLiquidacion } from "../../domain/importaciones/liquidacion-entrada";
import { TIPOS_DOCUMENTO_LOTE } from "../../domain/importaciones/documentos-lote";
import {
  ETIQUETA_HITO,
  TIPOS_HITO_LOTE,
  esTipoHitoManual,
  validarHito,
  type HitosExistentes,
  type TipoHitoLote,
} from "../../domain/importaciones/hitos-lote";
import { obtenerTrmOficial } from "../../integrations/trm/trm.service";
import { buscarItemsSiesa, listarItemsMaestroSiesa } from "../integraciones-siesa/siesa-inventario.service";
import { obtenerClavesActivasCatalogo } from "../catalogos/catalogos.controller";
import { buscarItemsOrdenSchema } from "./importaciones.schemas";
import { aplicarNovedadAutomatica } from "./importaciones-novedades-automaticas";
import {
  anioActualImportaciones,
  esConflictoReintentableConsecutivo,
  reservarConsecutivo,
} from "./importaciones-consecutivo";
import { permisosRequeridos } from "../../lib/catalogo-permisos";
import { listarUsuariosConAlgunConjuntoDePermisos } from "../../lib/permissions";
import { getTenantPrisma } from "../../lib/tenant-prisma";
import { resolverDestinatarios } from "../../lib/motor-destinatarios";
import { crearNotificacion } from "../../lib/notificaciones";
import { crearItemDeTrabajo } from "../../lib/inbox";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import type { z } from "zod";
import type { itemOrdenSchema } from "./importaciones.schemas";

type ItemOrdenBody = z.infer<typeof itemOrdenSchema>;

// Incoterm/Moneda/País de origen/Forma de pago/Unidad de medida: antes
// arrays hardcodeados aquí (y duplicados en el frontend) — ahora viven en
// CatalogoValor (auditoría de datos hardcodeados) y se consultan vía
// obtenerClavesActivasCatalogo (caché corta, ver módulo catalogos). El
// GET /api/catalogos?tipo=... es la fuente que consume el frontend.
const ESTADOS_ORDEN_VALIDOS = ["Borrador", "Confirmada", "Cerrada", "Anulada"];
// Validación de forma en el controlador, mismo patrón que ESTADOS_ORDEN_VALIDOS
// arriba — no una máquina de estados con transiciones: la regla de negocio de
// cuándo debe cambiar cada uno no está definida todavía (ver
// ARCHITECTURAL_DECISIONS_PENDING.md, decisión #10).
const ESTADOS_EXPEDIENTE_VALIDOS = ["En trámite", "Levantado"];
const ESTADOS_VISTO_BUENO_VALIDOS = ["Pendiente", "Aprobado", "Rechazado"];

type TipoDocumentoExpediente = "dim" | "factura-comercial" | "certificado-origen";

interface CamposDocumentoExpediente {
  nombre: "dimNombre" | "facturaComercialNombre" | "certificadoOrigenNombre";
  ruta: "dimRuta" | "facturaComercialRuta" | "certificadoOrigenRuta";
  mime: "dimMime" | "facturaComercialMime" | "certificadoOrigenMime";
  tamano: "dimTamano" | "facturaComercialTamano" | "certificadoOrigenTamano";
  etiqueta: string;
}

const TIPOS_DOCUMENTO_EXPEDIENTE: Record<TipoDocumentoExpediente, CamposDocumentoExpediente> = {
  dim: {
    nombre: "dimNombre",
    ruta: "dimRuta",
    mime: "dimMime",
    tamano: "dimTamano",
    etiqueta: "DIM",
  },
  "factura-comercial": {
    nombre: "facturaComercialNombre",
    ruta: "facturaComercialRuta",
    mime: "facturaComercialMime",
    tamano: "facturaComercialTamano",
    etiqueta: "factura comercial",
  },
  "certificado-origen": {
    nombre: "certificadoOrigenNombre",
    ruta: "certificadoOrigenRuta",
    mime: "certificadoOrigenMime",
    tamano: "certificadoOrigenTamano",
    etiqueta: "certificado de origen",
  },
};
// Documentos iniciales de la orden (Cotización/Proforma Invoice/Oferta
// comercial/Otros) — slug de URL validado en código, mismo patrón que
// TIPOS_DOCUMENTO_EXPEDIENTE arriba, pero SIN campos fijos: puede haber
// varios documentos del mismo tipo (ver OrdenCompraIntlDocumento).
const TIPOS_DOCUMENTO_ORDEN: Record<string, string> = {
  cotizacion: "Cotización",
  proforma: "Proforma Invoice",
  "oferta-comercial": "Oferta comercial",
  otros: "Otros",
};

// Documentos del LOTE sin columna fija en ExpedienteAduanero: ver
// domain/importaciones/documentos-lote.ts (TIPOS_DOCUMENTO_LOTE).

// Solo los estados previos a la llegada física se cambian a mano desde
// actualizarEstadoLote. "Liberado pre-compra" lo asigna recibirPreCompraPlanta
// y "Nacionalizado" lo asigna liquidarCosteoImportacion: ninguno de los dos
// se puede saltar a mano, porque cada uno dispara su propio efecto de negocio
// (crear costeo provisional / costeo definitivo).
const ESTADOS_TRANSITO_MANUAL = ["En tránsito", "En puerto", "En inspección"];
const ESTADOS_LOTE_LIQUIDABLES = ["En puerto", "En inspección", "Liberado pre-compra"];

// --- Notificaciones del ciclo de vida (Fase 11) ---
// Eventos configurables vía ReglaDestinatarios (módulo reglas-destinatarios,
// texto libre — no requieren catálogo previo). Se eligieron los que
// realmente representan un hito del proceso de negocio (nunca cada mutación
// menor): anulación/cierre de la orden, nacionalización de un lote, y
// novedad crítica (prioridad Alta) — mismo criterio que
// embarques-tracking.job.ts (EVENTO_ALERTA_EMBARQUE), reutilizando el mismo
// mecanismo (crearItemDeTrabajo + resolverDestinatarios + crearNotificacion),
// sin inventar un sistema de notificaciones paralelo.
const EVENTO_ORDEN_ANULADA = "IMPORTACION_ORDEN_ANULADA";
const EVENTO_ORDEN_CERRADA = "IMPORTACION_ORDEN_CERRADA";
const EVENTO_LOTE_NACIONALIZADO = "IMPORTACION_LOTE_NACIONALIZADO";
const EVENTO_NOVEDAD_ALTA = "IMPORTACION_NOVEDAD_ALTA";

/**
 * Notifica un hito del ciclo de vida de una importación. Siempre llega al
 * responsable de la orden (si tiene uno asignado) SIN necesitar que el
 * tenant configure una ReglaDestinatarios primero (mismo espíritu que
 * `asignadoPermiso` en InboxItem: un piso garantizado) — y adicionalmente a
 * quien resuelva `resolverDestinatarios` para ese evento, si el tenant
 * configuró una regla. Nunca lanza: una notificación es una conveniencia,
 * jamás debe tumbar la operación de negocio que la origina (mismo principio
 * que crearNotificacion/crearItemDeTrabajo).
 */
async function notificarEventoImportacion(params: {
  tenantId: string;
  evento: string;
  categoria: "ACCION" | "APROBACION" | "REVISION" | "INCIDENCIA" | "ALERTA" | "SEGUIMIENTO";
  prioridadInbox: "CRITICA" | "ALTA" | "MEDIA" | "BAJA";
  entidadTipo: string;
  entidadId: string;
  ordenCompraId: string;
  responsableId?: string | null;
  actorId?: string | null;
  titulo: string;
  mensaje: string;
  permisoFallback: string;
}): Promise<void> {
  try {
    const {
      tenantId,
      evento,
      categoria,
      prioridadInbox,
      entidadTipo,
      entidadId,
      ordenCompraId,
      responsableId,
      actorId,
      titulo,
      mensaje,
      permisoFallback,
    } = params;
    const tenantPrisma = getTenantPrisma(tenantId);
    const enlace = `/importaciones/${ordenCompraId}`;

    await crearItemDeTrabajo(tenantPrisma, {
      tenantId,
      tipo: evento,
      categoria,
      sourceModule: "importaciones",
      sourceEntityTipo: entidadTipo,
      sourceEntityId: entidadId,
      titulo,
      descripcion: mensaje,
      prioridad: prioridadInbox,
      asignadoPermiso: permisoFallback,
      enlace,
    });

    const destinatarios = await resolverDestinatarios(tenantPrisma, tenantId, evento, {
      responsableId: responsableId ?? null,
    });
    if (responsableId) destinatarios.add(responsableId);
    if (actorId) destinatarios.delete(actorId);

    for (const usuarioId of destinatarios) {
      await crearNotificacion({
        tenantId,
        usuarioId,
        tipo: evento,
        titulo,
        mensaje,
        enlace,
        entidadTipo,
        entidadId,
      });
    }
  } catch (error) {
    console.error(`Error al notificar evento de importación "${params.evento}":`, error);
  }
}

// --- Expediente vivo: actividades / eventos / novedades / pagos / cierre ---
const ETAPAS_VALIDAS = [
  "Orden",
  "Documentación",
  "Embarque",
  "Tránsito",
  "Aduana",
  "Nacionalización",
  "Pagos",
  "Recepción",
  "Cierre",
];
const RESPONSABLE_TIPOS_VALIDOS = [
  "Interno",
  "Proveedor",
  "AgenciaAduana",
  "Transportador",
  "Naviera",
  "Otro",
];
const ESTADOS_ACTIVIDAD_VALIDOS = ["Pendiente", "EnCurso", "Completada", "Bloqueada", "Omitida"];
// TIPOS_NOVEDAD_VALIDOS: ahora en CatalogoValor (tipo="MOTIVO_NOVEDAD_IMPORTACION").
const ORIGENES_NOVEDAD_VALIDOS = ["Interno", "Externo", "PorDeterminar"];
const PRIORIDADES_NOVEDAD_VALIDAS = ["Alta", "Media", "Baja"];
const ESTADOS_NOVEDAD_VALIDOS = ["Abierta", "EnGestion", "Resuelta"];
const ESTADOS_PAGO_VALIDOS = ["Pendiente", "Pagado", "Anulado"];

/** Tope de reintentos de la creación ante carreras sobre el consecutivo. */
const MAX_INTENTOS_CONSECUTIVO = 10;

/** Permisos que habilitan a un usuario como "Responsable de la importación":
 * crear o gestionar importaciones (cada uno con sus prerrequisitos, p. ej.
 * importaciones.ver, como los exige requirePermission). */
const PERMISOS_RESPONSABLE_IMPORTACION = [
  PERMISOS_SISTEMA.IMPORTACIONES_CREAR,
  PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO,
];

/** Usuarios activos del tenant con permiso EFECTIVO para crear o gestionar
 * importaciones — misma fuente de verdad que la sesión (rol, permisos directos
 * y revocaciones, membresías, superadmin). Usada por el listado del selector y
 * por la validación de responsableId al crear. */
function listarResponsablesElegibles(tenantId: string) {
  return listarUsuariosConAlgunConjuntoDePermisos(
    tenantId,
    PERMISOS_RESPONSABLE_IMPORTACION.map((p) => permisosRequeridos(p)),
  );
}

type ItemConSubpartida = Prisma.ItemOrdenCompraIntlGetPayload<{
  include: { subpartida: true };
}>;
type CosteoDetalle = Prisma.CosteoImportacionDetalleGetPayload<Record<string, never>>;
type VistoBueno = Prisma.VistoBuenoAduaneroGetPayload<Record<string, never>>;
type ExpedienteConVistosBuenos = Prisma.ExpedienteAduaneroGetPayload<Record<string, never>> & {
  vistosBuenos?: VistoBueno[];
};
type ContenedorLote = Prisma.ContenedorLoteGetPayload<Record<string, never>>;
type HitoLote = Prisma.LoteImportacionHitoGetPayload<Record<string, never>>;
type DocumentoLote = Prisma.LoteImportacionDocumentoGetPayload<Record<string, never>>;
type LoteConDetalle = Prisma.LoteImportacionGetPayload<Record<string, never>> & {
  asignacionesEmbarque?: Prisma.ImportacionAsignacionEmbarqueGetPayload<Record<string, never>>[];
  expediente?: ExpedienteConVistosBuenos | null;
  costeos?: CosteoDetalle[];
  contenedores?: ContenedorLote[];
  hitos?: HitoLote[];
  documentos?: DocumentoLote[];
};
type HistorialConEvidencia = Prisma.ImportacionHistorialGetPayload<Record<string, never>>;
type Actividad = Prisma.ImportacionActividadGetPayload<Record<string, never>>;
type Novedad = Prisma.ImportacionNovedadGetPayload<Record<string, never>>;
type Pago = Prisma.ImportacionPagoGetPayload<Record<string, never>>;
type DocumentoOrden = Prisma.OrdenCompraIntlDocumentoGetPayload<Record<string, never>>;
type RequisitoProveedor = Prisma.RequisitoProveedorImportacionGetPayload<Record<string, never>>;
type OrdenParaSerializar = Prisma.OrdenCompraIntlGetPayload<Record<string, never>> & {
  responsableUsuario?: { id: string; nombre: string } | null;
  // Requisitos incluidos vía la relación de Proveedor (referencia VIVA:
  // siempre los vigentes al momento de leer la orden, nunca un snapshot —
  // decisión explícita de esta fase, ver comentario en schema.prisma).
  proveedor?: {
    id: string;
    nombre: string;
    nit: string;
    requisitosImportacion: RequisitoProveedor[];
  } | null;
  items?: ItemConSubpartida[];
  lotes?: LoteConDetalle[];
  historial?: HistorialConEvidencia[];
  actividades?: Actividad[];
  novedades?: Novedad[];
  pagos?: Pago[];
  documentos?: DocumentoOrden[];
};

const serializarActividad = (a: Actividad) => ({
  id: a.id,
  ordenCompraId: a.ordenCompraId,
  loteId: a.loteId,
  nombre: a.nombre,
  etapa: a.etapa,
  responsableTipo: a.responsableTipo,
  responsableNombre: a.responsableNombre,
  fechaPlanificada: a.fechaPlanificada,
  fechaLimite: a.fechaLimite,
  fechaReal: a.fechaReal,
  estado: a.estado,
  dependeDeId: a.dependeDeId,
  observacion: a.observacion,
});

const serializarNovedad = (n: Novedad) => ({
  id: n.id,
  ordenCompraId: n.ordenCompraId,
  tipo: n.tipo,
  descripcion: n.descripcion,
  origen: n.origen,
  responsable: n.responsable,
  prioridad: n.prioridad,
  impacto: n.impacto,
  fechaDeteccion: n.fechaDeteccion,
  fechaLimite: n.fechaLimite,
  estado: n.estado,
  accionRequerida: n.accionRequerida,
  responsableResolucion: n.responsableResolucionNombre,
  fechaResolucion: n.fechaResolucion,
  automatica: n.automatica,
  creadoPor: n.creadoPorNombre,
  createdAt: n.createdAt,
});

const serializarPago = (p: Pago) => ({
  id: p.id,
  ordenCompraId: p.ordenCompraId,
  concepto: p.concepto,
  valor: numero(p.valor),
  moneda: p.moneda,
  fechaVencimiento: p.fechaVencimiento,
  estado: p.estado,
  fechaPago: p.fechaPago,
  responsable: p.responsableNombre,
  comprobante: p.comprobanteNombre
    ? { nombre: p.comprobanteNombre, mime: p.comprobanteMime, tamano: p.comprobanteTamano }
    : null,
  observaciones: p.observaciones,
  createdAt: p.createdAt,
});

const numero = (valor: unknown): number => Number(valor ?? 0);

function calcularCantidadValida(cantidad: number, contexto: string) {
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error(`La cantidad del ítem "${contexto}" debe ser un número mayor a cero.`);
  }
}

const serializarItem = (item: ItemConSubpartida) => ({
  id: item.id,
  descripcion: item.descripcion,
  subpartidaArancelariaId: item.subpartidaArancelariaId,
  subpartida: item.subpartida
    ? {
        id: item.subpartida.id,
        subpartida: item.subpartida.subpartida,
        descripcion: item.subpartida.descripcion,
      }
    : null,
  referencia: item.referencia,
  itemRowId: item.itemRowId,
  referenciaProveedor: item.referenciaProveedor,
  unidadMedida: item.unidadMedida,
  cantidad: numero(item.cantidad),
  pesoKg: item.pesoKg !== null && item.pesoKg !== undefined ? numero(item.pesoKg) : null,
  volumenM3:
    item.volumenM3 !== null && item.volumenM3 !== undefined ? numero(item.volumenM3) : null,
  valorUnitarioFob: numero(item.valorUnitarioFob),
});

const serializarCosteo = (c: CosteoDetalle) => ({
  id: c.id,
  itemId: c.itemId,
  valorCifUsd: numero(c.valorCifUsd),
  trmLiquidacion: numero(c.trmLiquidacion),
  valorCifCop: numero(c.valorCifCop),
  arancelCop: numero(c.arancelCop),
  ivaTotalCop: numero(c.ivaTotalCop),
  ivaDescontableCop: numero(c.ivaDescontableCop),
  ivaCapitalizableCop: numero(c.ivaCapitalizableCop),
  fletesNacionalesCop: numero(c.fletesNacionalesCop),
  agenciamientoCop: numero(c.agenciamientoCop),
  otrosCostosCop: numero(c.otrosCostosCop),
  diferenciaCambioCop: numero(c.diferenciaCambioCop),
  cantidad: numero(c.cantidad),
  costoTotalCop: numero(c.costoTotalCop),
  costoUnitarioCop: numero(c.costoUnitarioCop),
  esProvisional: c.esProvisional,
  metodoProrrateoGastos: c.metodoProrrateoGastos,
  fechaLiquidacion: c.fechaLiquidacion,
});

const serializarVistoBueno = (v: VistoBueno) => ({
  id: v.id,
  entidad: v.entidad,
  numero: v.numero,
  estado: v.estado,
  fecha: v.fecha,
  archivo: v.archivoNombre
    ? { nombre: v.archivoNombre, mime: v.archivoMime, tamano: v.archivoTamano }
    : null,
});

const serializarExpediente = (e: ExpedienteConVistosBuenos) => ({
  id: e.id,
  numeroDIM: e.numeroDIM,
  fechaDIM: e.fechaDIM,
  certificadoOrigenTlc: e.certificadoOrigenTlc,
  fechaLevante: e.fechaLevante,
  estado: e.estado,
  documentos: {
    dim: e.dimNombre ? { nombre: e.dimNombre, mime: e.dimMime, tamano: e.dimTamano } : null,
    facturaComercial: e.facturaComercialNombre
      ? {
          nombre: e.facturaComercialNombre,
          mime: e.facturaComercialMime,
          tamano: e.facturaComercialTamano,
        }
      : null,
    certificadoOrigen: e.certificadoOrigenNombre
      ? {
          nombre: e.certificadoOrigenNombre,
          mime: e.certificadoOrigenMime,
          tamano: e.certificadoOrigenTamano,
        }
      : null,
  },
  vistosBuenos: (e.vistosBuenos ?? []).map(serializarVistoBueno),
});

const serializarContenedor = (c: ContenedorLote) => ({
  id: c.id,
  numero: c.numero,
  ultimoEvento: c.ultimoEvento,
  ultimoEventoFecha: c.ultimoEventoFecha,
  eventos: (() => {
    if (!c.eventosJson) return [];
    try {
      const valor = JSON.parse(c.eventosJson);
      return Array.isArray(valor) ? valor : [];
    } catch {
      return [];
    }
  })(),
});

const serializarDocumentoLote = (d: DocumentoLote) => ({
  id: d.id,
  tipo: d.tipo,
  nombreOriginal: d.nombreOriginal,
  mime: d.mime,
  tamano: d.tamano,
  subidoPorNombre: d.subidoPorNombre,
  createdAt: d.createdAt,
});

/**
 * Hitos del lote en orden cronológico esperado, cada uno con su ORIGEN y su
 * FUENTE. Un hito sin fecha se devuelve con fecha null (no se completa con una
 * fecha estimada ni calculada). Solo hay dos derivaciones, ambas de un dato
 * real ya existente y nunca de una estimación:
 *  - LEVANTE: ExpedienteAduanero.fechaLevante (única fuente del levante).
 *  - RECEPCION_PLANTA de lotes recibidos antes de existir esta tabla:
 *    LoteImportacion.fechaLlegadaReal, que solo escribe recibirPreCompraPlanta.
 */
const serializarHitosLote = (l: LoteConDetalle) => {
  const filas = new Map((l.hitos ?? []).map((h) => [h.tipo, h]));
  const desdeFila = (tipo: TipoHitoLote) => {
    const fila = filas.get(tipo);
    return {
      tipo,
      etiqueta: ETIQUETA_HITO[tipo],
      fecha: fila?.fecha ?? null,
      origen: fila?.origen ?? null,
      fuente: fila ? "LoteImportacionHito" : null,
      registradoPor: fila?.registradoPorNombre ?? null,
      nota: fila?.nota ?? null,
    };
  };

  const recepcion = desdeFila("RECEPCION_PLANTA");
  if (!recepcion.fecha && l.fechaLlegadaReal) {
    recepcion.fecha = l.fechaLlegadaReal;
    recepcion.origen = "Sistema";
    recepcion.fuente = "LoteImportacion.fechaLlegadaReal";
  }

  const levanteFecha = l.expediente?.fechaLevante ?? null;
  return [
    desdeFila("EMBARQUE_REAL"),
    desdeFila("LLEGADA_PUERTO"),
    desdeFila("INSPECCION_ADUANERA"),
    {
      tipo: "LEVANTE",
      etiqueta: "Levante aduanero",
      fecha: levanteFecha,
      origen: levanteFecha ? "Manual" : null,
      fuente: levanteFecha ? "ExpedienteAduanero.fechaLevante" : null,
      registradoPor: null,
      nota: null,
    },
    recepcion,
  ];
};

const serializarLote = (l: LoteConDetalle) => {
  // Variación de ETA (§5): diferencia entre lo que informó el proveedor
  // (fechaLlegadaEstimada) y lo que calcula el tracking marítimo en vivo
  // (etaTrackingActual) — puramente informativo, nunca se persiste como
  // "la" fecha oficial (esa sigue siendo fechaLlegadaEstimada).
  const variacionEtaDias =
    l.fechaLlegadaEstimada && l.etaTrackingActual
      ? Math.round(
          (l.etaTrackingActual.getTime() - l.fechaLlegadaEstimada.getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : null;

  return {
    asignacionesEmbarque: l.asignacionesEmbarque?.map((a) => ({
      ...a, cantidad: Number(a.cantidad), recibida: Number(a.recibida), conciliada: Number(a.conciliada),
    })) ?? [],
    id: l.id,
    ordenCompraId: l.ordenCompraId,
    blAwb: l.blAwb,
    contenedor: l.contenedor,
    precinto: l.precinto,
    puertoOrigen: l.puertoOrigen,
    puertoDestino: l.puertoDestino,
    naviera: l.naviera,
    forwarder: l.forwarder,
    booking: l.booking,
    fechaEmbarque: l.fechaEmbarque,
    fechaLlegadaEstimada: l.fechaLlegadaEstimada,
    fechaLlegadaReal: l.fechaLlegadaReal,
    estado: l.estado,
    buque:
      l.buqueNombre || l.buqueImo || l.buqueMmsi
        ? { nombre: l.buqueNombre, imo: l.buqueImo, mmsi: l.buqueMmsi }
        : null,
    tracking: {
      estado: l.estadoTracking,
      proveedor: l.proveedorTracking,
      ultimoError: l.ultimoErrorTracking,
      ultimaSincronizacion: l.ultimaSincronizacionTracking,
      etaActual: l.etaTrackingActual,
      variacionEtaDias,
      posicion:
        l.ultimaPosicionLat != null && l.ultimaPosicionLon != null
          ? {
              lat: l.ultimaPosicionLat,
              lon: l.ultimaPosicionLon,
              fecha: l.ultimaPosicionFecha,
              velocidadNudos: l.velocidadNudos,
              rumboGrados: l.rumboGrados,
            }
          : null,
    },
    contenedores: (l.contenedores ?? []).map(serializarContenedor),
    // Solo se emiten cuando la consulta incluyó la relación: una respuesta
    // parcial (p. ej. tras editar el embarque) no debe mostrar "sin hitos".
    hitos: l.hitos ? serializarHitosLote(l) : undefined,
    documentos: l.documentos ? l.documentos.map(serializarDocumentoLote) : undefined,
    expediente: l.expediente ? serializarExpediente(l.expediente) : null,
    costeos: (l.costeos ?? []).map(serializarCosteo),
  };
};

const serializarOrden = (o: OrdenParaSerializar) => ({
  id: o.id,
  codigo: o.codigo ?? `IMP-${o.id.slice(0, 8)}`, // fallback legible para órdenes anteriores a esta migración
  numeroOrden: o.numeroOrden,
  fechaOrden: o.fechaOrden,
  incoterm: o.incoterm,
  lugarPactado: o.lugarPactado,
  proveedorId: o.proveedorId,
  proveedorExtranjero: o.proveedorExtranjero,
  proveedor: o.proveedor
    ? {
        id: o.proveedor.id,
        nombre: o.proveedor.nombre,
        nit: o.proveedor.nit,
        // Solo activos y ordenados — mismo filtro que la pantalla de
        // administración por defecto (?incluirInactivos=true la cambia ahí).
        requisitos: o.proveedor.requisitosImportacion,
      }
    : null,
  paisOrigen: o.paisOrigen,
  moneda: o.moneda,
  formaPago: o.formaPago,
  condicionPago: o.condicionPago,
  detallePago: o.detallePago,
  trmPactada: numero(o.trmPactada),
  tasaCambioFecha: o.tasaCambioFecha,
  tasaCambioFuente: o.tasaCambioFuente,
  fechaRequeridaLlegada: o.fechaRequeridaLlegada,
  valorEstimadoTotal: numero(o.valorEstimadoTotal),
  estado: o.estado,
  fechaEstimadaCierre: o.fechaEstimadaCierre,
  fechaCierre: o.fechaCierre,
  observaciones: o.observaciones,
  responsable: o.responsableUsuario
    ? { id: o.responsableUsuario.id, nombre: o.responsableUsuario.nombre }
    : null,
  createdAt: o.createdAt,
  items: (o.items ?? []).map(serializarItem),
  lotes: (o.lotes ?? []).map(serializarLote),
  historial: (o.historial ?? []).map((h: HistorialConEvidencia) => ({
    fecha: h.createdAt,
    actor: h.actor,
    accion: h.accion,
    detalle: h.detalle,
    origen: h.origen,
    responsable: h.responsable,
    etapa: h.etapa,
    evidencia: h.evidenciaNombre
      ? { nombre: h.evidenciaNombre, mime: h.evidenciaMime, tamano: h.evidenciaTamano }
      : null,
  })),
  actividades: (o.actividades ?? []).map(serializarActividad),
  novedades: (o.novedades ?? []).map(serializarNovedad),
  pagos: (o.pagos ?? []).map(serializarPago),
  documentos: (o.documentos ?? []).map((d: DocumentoOrden) => ({
    id: d.id,
    tipo: d.tipo,
    nombreOriginal: d.nombreOriginal,
    mime: d.mime,
    tamano: d.tamano,
    subidoPorNombre: d.subidoPorNombre,
    createdAt: d.createdAt,
  })),
  // "Situación actual" en lenguaje de negocio — ver domain/importaciones/motor-seguimiento.ts.
  // Se calcula siempre en el servidor, nunca en frontend.
  situacionActual: calcularSituacionActual((o.actividades ?? []).map(aParaSeguimiento), new Date()),
});

function aParaSeguimiento(a: Actividad): ActividadSeguimiento {
  return {
    id: a.id,
    ordenCompraId: a.ordenCompraId,
    nombre: a.nombre,
    etapa: a.etapa,
    responsableTipo: a.responsableTipo,
    responsableNombre: a.responsableNombre,
    fechaLimite: a.fechaLimite,
    fechaReal: a.fechaReal,
    estado: a.estado,
    dependeDeId: a.dependeDeId,
  };
}

const INCLUDE_ORDEN_DETALLE = {
  responsableUsuario: { select: { id: true, nombre: true } },
  proveedor: {
    select: {
      id: true,
      nombre: true,
      nit: true,
      requisitosImportacion: {
        where: { activo: true },
        orderBy: { orden: "asc" as const },
      },
    },
  },
  items: { include: { subpartida: true } },
  lotes: {
    include: {
      asignacionesEmbarque: true,
      expediente: { include: { vistosBuenos: true } },
      costeos: { orderBy: { fechaLiquidacion: "desc" as const } },
      contenedores: { orderBy: { numero: "asc" as const } },
      hitos: true,
      documentos: { orderBy: { createdAt: "desc" as const } },
    },
  },
  historial: { orderBy: { createdAt: "asc" as const } },
  actividades: { orderBy: { fechaLimite: "asc" as const } },
  novedades: { orderBy: { createdAt: "desc" as const } },
  pagos: { orderBy: { fechaVencimiento: "asc" as const } },
  documentos: { orderBy: { createdAt: "desc" as const } },
};

async function resolverCiaSiesa(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });
  return tenant?.siesaCiaId ?? null;
}

/**
 * Autocompletado de ítem para la tabla de "Ítems de la Orden" del modal de
 * creación — mismo patrón ya probado en Ventas (buscarProductosVenta):
 * búsqueda directa contra el maestro de ítems de Siesa (t120_mc_items), sin
 * catálogo propio en RicoSoft. Un tenant sin `siesaCiaId` configurado (o si
 * Siesa no responde) recibe `disponible:false` — el formulario simplemente
 * cae a captura 100% manual, nunca rompe la creación de la orden.
 */
export const buscarItemsOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = buscarItemsOrdenSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      items: [],
    });
  }

  try {
    const items = await buscarItemsSiesa(siesaCiaId, parseo.data.search, 10);
    return res.json({ disponible: true, items });
  } catch (error) {
    console.error("Error al buscar ítems en Siesa para Importaciones:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      items: [],
    });
  }
};

/**
 * TRM oficial del día (Banco de la República, vía datos.gov.co) — solo
 * informativa, para que el usuario compare contra la TRM pactada con el
 * proveedor antes de guardar la orden. Nunca sobrescribe nada por sí sola.
 * 502 (no 500) si el servicio externo falla: es una integración de terceros
 * fuera de nuestro control, no un error de la aplicación.
 */
export const obtenerTrmOficialController = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const trm = await obtenerTrmOficial();
    return res.json(trm);
  } catch (error) {
    console.error("Error al obtener la TRM oficial:", error);
    return res.status(502).json({
      message: error instanceof Error ? error.message : "No fue posible obtener la TRM oficial.",
    });
  }
};

/**
 * Usuarios para el selector "Responsable de la importación" del formulario
 * de creación: SOLO activos con permiso efectivo para crear o gestionar
 * importaciones en el tenant activo. No exige el permiso administrativo
 * "usuarios.ver", basta con poder crear órdenes.
 * NO reemplaza al creador de la orden (req.user, capturado en el
 * historial/auditoría) ni a ningún otro campo de auditoría existente.
 */
export const listarResponsablesImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    return res.json(await listarResponsablesElegibles(tenantId));
  } catch (error) {
    console.error("Error al listar responsables de importación:", error);
    return res.status(500).json({ message: "Error al obtener los responsables disponibles." });
  }
};

export const listarOrdenesCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { estado, search } = req.query;

    const where: Prisma.OrdenCompraIntlWhereInput = { tenantId, eliminado: false };
    if (typeof estado === "string" && ESTADOS_ORDEN_VALIDOS.includes(estado)) where.estado = estado;
    if (typeof search === "string" && search.trim()) {
      const term = search.trim();
      where.OR = [{ numeroOrden: { contains: term } }, { proveedorExtranjero: { contains: term } }];
    }

    const ordenes = await prisma.ordenCompraIntl.findMany({
      where,
      include: {
        responsableUsuario: { select: { id: true, nombre: true } },
        lotes: { include: { expediente: true } },
        // Solo lo necesario para "situación actual" + alertas de la lista
        // (nunca el timeline/costeo completo aquí, eso es del detalle).
        actividades: true,
        novedades: { where: { estado: { not: "Resuelta" } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(ordenes.map(serializarOrden));
  } catch (error) {
    console.error("Error al listar órdenes de compra internacionales:", error);
    return res
      .status(500)
      .json({ message: "Error al obtener las órdenes de compra internacionales." });
  }
};

/**
 * Sincroniza las novedades automáticas de una orden contra su situación
 * real de actividades — idempotente vía el índice único
 * (ordenCompraId, reglaOrigen): si la novedad ya existe, no la duplica; si
 * la condición que la generó ya no aplica, la resuelve automáticamente
 * (nunca borra el registro, queda como historial). Se corre en cada
 * consulta de detalle en vez de un cron/job — el volumen (una orden a la
 * vez, pocas actividades) lo permite sin necesitar infraestructura nueva.
 * Una novedad ya Resuelta nunca se vuelve a crear: se reabre mientras la
 * condición siga vigente — ver importaciones-novedades-automaticas.ts.
 */
async function sincronizarNovedadesAutomaticas(tenantId: string, ordenCompraId: string) {
  const [actividades, novedadesAutomaticasAbiertas] = await Promise.all([
    prisma.importacionActividad.findMany({ where: { ordenCompraId, tenantId } }),
    prisma.importacionNovedad.findMany({
      where: { ordenCompraId, tenantId, automatica: true, estado: { not: "Resuelta" } },
    }),
  ]);

  const sugeridas = generarNovedadesSugeridas(actividades.map(aParaSeguimiento), new Date());
  const reglasSugeridas = new Set(sugeridas.map((s) => s.reglaOrigen));

  // Solo las sugeridas NUEVAS o REABIERTAS (no las que ya estaban abiertas)
  // de prioridad Alta disparan notificación — evita re-notificar en cada GET
  // del detalle (esta función corre en cada consulta, ver comentario de arriba).
  const nuevasAlta: typeof sugeridas = [];

  // aplicarNovedadAutomatica es idempotente y tolera consultas concurrentes y
  // novedades ya resueltas (ver importaciones-novedades-automaticas.ts).
  for (const s of sugeridas) {
    const resultado = await aplicarNovedadAutomatica({
      tenantId,
      ordenCompraId,
      reglaOrigen: s.reglaOrigen,
      condicionVigente: true,
      datos: {
        tipo: s.tipo,
        descripcion: s.descripcion,
        prioridad: s.prioridad,
        responsable: s.responsable,
        fechaLimite: s.fechaLimite,
        accionRequerida: s.accionRequerida,
      },
    });
    if ((resultado === "creada" || resultado === "reabierta") && s.prioridad === "Alta") {
      nuevasAlta.push(s);
    }
  }

  for (const n of novedadesAutomaticasAbiertas) {
    if (n.reglaOrigen && !reglasSugeridas.has(n.reglaOrigen)) {
      await aplicarNovedadAutomatica({
        tenantId,
        ordenCompraId,
        reglaOrigen: n.reglaOrigen,
        condicionVigente: false,
        datos: { tipo: n.tipo, descripcion: n.descripcion, prioridad: n.prioridad },
      });
    }
  }

  if (nuevasAlta.length > 0) {
    const orden = await prisma.ordenCompraIntl.findUnique({
      where: { id: ordenCompraId },
      select: { numeroOrden: true, responsableId: true },
    });
    if (orden) {
      for (const s of nuevasAlta) {
        await notificarEventoImportacion({
          tenantId,
          evento: EVENTO_NOVEDAD_ALTA,
          categoria: "INCIDENCIA",
          prioridadInbox: "ALTA",
          entidadTipo: "ImportacionNovedad",
          entidadId: `${ordenCompraId}:${s.reglaOrigen}`,
          ordenCompraId,
          responsableId: orden.responsableId,
          titulo: `Novedad crítica: ${orden.numeroOrden}`,
          mensaje: s.descripcion,
          permisoFallback: PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO,
        });
      }
    }
  }
}

export const obtenerOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const existe = await prisma.ordenCompraIntl.findFirst({
      where: { id: req.params.id, tenantId, eliminado: false },
      select: { id: true },
    });
    if (!existe)
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });

    await sincronizarNovedadesAutomaticas(tenantId, existe.id);

    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { id: existe.id, tenantId, eliminado: false },
      include: INCLUDE_ORDEN_DETALLE,
    });
    if (!orden)
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });
    return res.json(serializarOrden(orden));
  } catch (error) {
    console.error("Error al obtener orden de compra internacional:", error);
    return res.status(500).json({ message: "Error al obtener la orden de compra internacional." });
  }
};

/**
 * Registra la orden con un estimado de landed cost calculado solo con datos
 * ya conocidos al momento de comprar (FOB + arancel base de la subpartida,
 * si el ítem la tiene asignada). Flete nacional y agenciamiento no se
 * incluyen aquí porque no se conocen hasta la liquidación definitiva.
 */
export const crearOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    // numeroOrden NO se lee del cliente: el servidor asigna codigo y
    // numeroOrden (mismo valor IMP-<año>-<n>) dentro de la transacción de creación.
    const {
      correoOrigenId,
      fechaOrden,
      incoterm,
      lugarPactado,
      proveedorId,
      proveedorExtranjero,
      paisOrigen,
      moneda,
      trmPactada,
      tasaCambioFecha,
      tasaCambioFuente,
      formaPago,
      condicionPago,
      detallePago,
      fechaRequeridaLlegada,
      responsableId,
      observaciones,
      items,
    } = req.body;

    // Proveedor catalogado (proveedorId) O nombre no catalogado
    // (proveedorExtranjero) — nunca ambos vacíos, nunca los dos usados como
    // fuentes de verdad simultáneas (si hay proveedorId, el nombre real
    // SIEMPRE se deriva de él más abajo, ignorando lo que venga en
    // proveedorExtranjero).
    if (!proveedorId && !String(proveedorExtranjero ?? "").trim()) {
      return res.status(400).json({
        message:
          'Selecciona un proveedor catalogado o marca "No catalogado / proveedor externo" y escribe su nombre.',
      });
    }

    let fechaOrdenParseada = new Date();
    if (fechaOrden != null) {
      const parsed = new Date(fechaOrden);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: "La fecha de la orden no es válida." });
      }
      fechaOrdenParseada = parsed;
    }

    let fechaRequeridaLlegadaParseada: Date | null = null;
    if (fechaRequeridaLlegada != null && fechaRequeridaLlegada !== "") {
      const parsed = new Date(fechaRequeridaLlegada);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: "La fecha requerida de llegada no es válida." });
      }
      if (parsed.getTime() < fechaOrdenParseada.getTime()) {
        return res.status(400).json({
          message: "La fecha requerida de llegada no puede ser anterior a la fecha de la orden.",
        });
      }
      const diezAniosMs = 10 * 365 * 24 * 60 * 60 * 1000;
      if (parsed.getTime() - fechaOrdenParseada.getTime() > diezAniosMs) {
        return res.status(400).json({
          message: "La fecha requerida de llegada parece incorrecta (más de 10 años en el futuro).",
        });
      }
      fechaRequeridaLlegadaParseada = parsed;
    }

    let tasaCambioFechaParseada: Date | null = null;
    if (tasaCambioFecha != null && tasaCambioFecha !== "") {
      const parsed = new Date(tasaCambioFecha);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: "La fecha de la tasa de cambio no es válida." });
      }
      tasaCambioFechaParseada = parsed;
    }
    const TASA_CAMBIO_FUENTES_VALIDAS = ["Oficial", "Pactada", "Manual"];
    if (tasaCambioFuente != null && !TASA_CAMBIO_FUENTES_VALIDAS.includes(tasaCambioFuente)) {
      return res.status(400).json({
        message: `Fuente de tasa de cambio inválida. Valores permitidos: ${TASA_CAMBIO_FUENTES_VALIDAS.join(", ")}.`,
      });
    }

    let responsableSeleccionado: { id: string } | null = null;
    if (responsableId) {
      // Mismo cálculo de permisos efectivos que la sesión (rol, permisos
      // directos y revocaciones, membresías): solo puede ser responsable quien
      // pueda crear o gestionar importaciones en ESTE tenant.
      const elegibles = await listarResponsablesElegibles(tenantId);
      if (elegibles.some((u) => u.id === responsableId)) {
        responsableSeleccionado = { id: responsableId };
      } else {
        const existe = await prisma.user.findFirst({
          where: { id: responsableId, tenantId, activo: true },
          select: { id: true },
        });
        if (!existe) {
          return res
            .status(404)
            .json({ message: "El responsable de la importación seleccionado no existe." });
        }
        return res.status(400).json({
          message:
            "El responsable seleccionado no tiene permiso para crear o gestionar importaciones.",
        });
      }
    }

    const [
      incotermsValidos,
      paisesOrigenValidos,
      paisesIsoValidos,
      monedasValidas,
      formasPagoValidas,
    ] = await Promise.all([
      obtenerClavesActivasCatalogo(tenantId, "INCOTERM"),
      obtenerClavesActivasCatalogo(tenantId, "PAIS_ORIGEN"),
      obtenerClavesActivasCatalogo(tenantId, "PAIS"),
      obtenerClavesActivasCatalogo(tenantId, "MONEDA"),
      obtenerClavesActivasCatalogo(tenantId, "FORMA_PAGO"),
    ]);
    // País: las órdenes guardan hoy el NOMBRE (catálogo heredado PAIS_ORIGEN),
    // pero también se acepta el código ISO/alias del catálogo canónico PAIS,
    // para que ambos convivan mientras se migran los datos guardados.
    const paisesValidos = new Set([...paisesOrigenValidos, ...paisesIsoValidos]);
    if (!incotermsValidos.has(incoterm)) {
      return res.status(400).json({
        message: `Incoterm inválido. Valores permitidos: ${[...incotermsValidos].join(", ")}.`,
      });
    }
    if (!paisesValidos.has(paisOrigen)) {
      return res.status(400).json({ message: "El país de origen seleccionado no es válido." });
    }
    if (!monedasValidas.has(moneda)) {
      return res.status(400).json({
        message: `Moneda inválida. Valores permitidos: ${[...monedasValidas].join(", ")}.`,
      });
    }
    if (formaPago != null && !formasPagoValidas.has(formaPago)) {
      return res.status(400).json({
        message: `Forma de pago inválida. Valores permitidos: ${[...formasPagoValidas].join(", ")}.`,
      });
    }
    // Sin catálogo local de proveedores extranjeros duplicado: si viene
    // proveedorId, DEBE ser un Proveedor real del propio tenant (nunca de
    // otro — IDOR) y su nombre se vuelve la fuente de verdad de
    // proveedorExtranjero, aunque el cliente mande otra cosa.
    let proveedorSeleccionado: { id: string; nombre: string } | null = null;
    if (proveedorId) {
      proveedorSeleccionado = await prisma.proveedor.findFirst({
        where: { id: proveedorId, tenantId, activo: true },
        select: { id: true, nombre: true },
      });
      if (!proveedorSeleccionado) {
        return res.status(404).json({ message: "El proveedor seleccionado no existe." });
      }
    }
    const trm = numero(trmPactada);
    if (!Number.isFinite(trm) || trm <= 0) {
      return res.status(400).json({ message: "La TRM pactada debe ser un número mayor a cero." });
    }
    const unidadesMedidaValidas = await obtenerClavesActivasCatalogo(tenantId, "UNIDAD_MEDIDA");
    for (const item of items as ItemOrdenBody[]) {
      if (item.unidadMedida != null && !unidadesMedidaValidas.has(item.unidadMedida)) {
        return res.status(400).json({
          message: `Unidad de medida inválida en "${item.descripcion}". Valores permitidos: ${[...unidadesMedidaValidas].join(", ")}.`,
        });
      }
    }

    for (const item of items) {
      calcularCantidadValida(numero(item.cantidad), item.descripcion);
    }

    const itemsVinculados = (items as ItemOrdenBody[]).filter((item) => item.itemRowId != null);
    let companiaItems: number | null = null;
    if (itemsVinculados.length) {
      companiaItems = await resolverCiaSiesa(tenantId);
      if (!companiaItems) return res.status(409).json({ message: "Configura la compañía de Siesa." });
      const ids = [...new Set(itemsVinculados.map((item) => item.itemRowId!))];
      try {
        const { items: maestro } = await listarItemsMaestroSiesa(companiaItems, {
          page: 1, pageSize: ids.length, itemRowIdsFiltro: { modo: "incluir", ids },
        });
        const porId = new Map(maestro.map((item) => [item.itemRowId, item]));
        for (const item of itemsVinculados) {
          const siesa = porId.get(item.itemRowId!);
          if (!siesa || siesa.unidadMedida?.toUpperCase() !== item.unidadMedida?.toUpperCase()) {
            return res.status(400).json({
              message: `Verifica el ítem Siesa y su unidad de inventario para "${item.descripcion}".`,
            });
          }
          item.referencia = siesa.referencia;
        }
      } catch (error) {
        console.error("Error al verificar ítems de la orden en Siesa:", error);
        return res.status(503).json({ message: "No se pudieron verificar los ítems en Siesa." });
      }
    }

    const subpartidaIds = [
      ...new Set(items.map((i: ItemOrdenBody) => i.subpartidaArancelariaId).filter(Boolean)),
    ] as string[];
    const subpartidas = subpartidaIds.length
      ? await prisma.clasificacionArancelariaMatriz.findMany({
          where: { id: { in: subpartidaIds }, activo: true },
        })
      : [];
    const tarifaPorSubpartida = new Map(
      subpartidas.map((s) => [s.id, numero(s.tarifaArancelariaBase)]),
    );

    let valorEstimadoTotal = 0;
    for (const item of items) {
      const fobCop = numero(item.cantidad) * numero(item.valorUnitarioFob) * trm;
      const tarifa = item.subpartidaArancelariaId
        ? (tarifaPorSubpartida.get(item.subpartidaArancelariaId) ?? 0)
        : 0;
      valorEstimadoTotal += fobCop + fobCop * (tarifa / 100);
    }

    if (correoOrigenId) {
      const correo = await prisma.importacionCorreo.findFirst({
        where: { id: correoOrigenId, tenantId },
        select: { proveedorId: true, ordenCompraId: true, estadoProcesamiento: true },
      });
      if (!correo) return res.status(404).json({ message: "Correo no encontrado." });
      if (
        !proveedorSeleccionado ||
        correo.proveedorId !== proveedorSeleccionado.id ||
        correo.ordenCompraId ||
        correo.estadoProcesamiento !== "REQUIERE_REVISION"
      ) {
        return res.status(409).json({
          message:
            "El correo debe estar en revisión, sin orden vinculada y con el mismo proveedor confirmado.",
        });
      }
    }

    const anioSerie = anioActualImportaciones();
    const crearOrdenConConsecutivo = () =>
      prisma.$transaction(
        async (tx) => {
          const { codigo } = await reservarConsecutivo(tx, tenantId, anioSerie);
          const creada = await tx.ordenCompraIntl.create({
            data: {
              tenantId,
              codigo,
              numeroOrden: codigo,
              fechaOrden: fechaOrdenParseada,
              incoterm,
              lugarPactado: lugarPactado?.trim() || null,
              proveedorId: proveedorSeleccionado?.id ?? null,
              proveedorExtranjero:
                proveedorSeleccionado?.nombre ?? String(proveedorExtranjero).trim(),
              paisOrigen,
              moneda,
              trmPactada: trm,
              tasaCambioFecha: tasaCambioFechaParseada,
              tasaCambioFuente: tasaCambioFuente ?? null,
              valorEstimadoTotal,
              formaPago: formaPago ?? null,
              condicionPago: condicionPago?.trim() || null,
              detallePago: detallePago?.trim() || null,
              fechaRequeridaLlegada: fechaRequeridaLlegadaParseada,
              observaciones: observaciones ?? null,
              responsableId: responsableSeleccionado?.id ?? req.user!.id,
              items: {
                create: items.map((item: ItemOrdenBody) => ({
                  descripcion: item.descripcion,
                  referencia: item.referencia ?? null,
                  itemRowId: item.itemRowId ?? null,
                  siesaCiaId: item.itemRowId ? companiaItems : null,
                  referenciaProveedor: item.referenciaProveedor ?? null,
                  unidadMedida: item.unidadMedida ?? null,
                  subpartidaArancelariaId: item.subpartidaArancelariaId ?? null,
                  cantidad: numero(item.cantidad),
                  pesoKg: item.pesoKg != null ? numero(item.pesoKg) : null,
                  volumenM3: item.volumenM3 != null ? numero(item.volumenM3) : null,
                  valorUnitarioFob: numero(item.valorUnitarioFob),
                })),
              },
              // Actividad sembrada por defecto al nacer la orden — el resto de
              // actividades (documentos, booking, pagos...) se siembran cuando
              // corresponde en cada paso posterior (crearLoteImportacion,
              // liquidarCosteoImportacion), no todas de una vez aquí: muchas
              // dependen de datos que todavía no existen (BL, fechas de embarque).
              actividades: {
                create: [
                  {
                    tenantId,
                    nombre: "Confirmar orden con el proveedor",
                    etapa: "Orden",
                    responsableTipo: "Proveedor",
                  },
                ],
              },
              historial: {
                create: [
                  {
                    actor: req.user!.nombre,
                    accion: "Orden creada",
                    detalle: `Landed cost estimado: $${valorEstimadoTotal.toLocaleString("es-CO")}`,
                    etapa: "Orden",
                  },
                ],
              },
            },
            include: INCLUDE_ORDEN_DETALLE,
          });
          if (correoOrigenId && proveedorSeleccionado) {
            await vincularOrdenCorreo(tx, {
              correoId: correoOrigenId,
              tenantId,
              proveedorId: proveedorSeleccionado.id,
              ordenId: creada.id,
              usuarioId: req.user!.id,
            });
          }
          return creada;
        },
        { maxWait: 10000, timeout: 20000 },
      );

    // Número asignado en el servidor, dentro de la MISMA transacción que crea la
    // orden: si la creación falla, la reserva se revierte. Un valor enviado por
    // el cliente en numeroOrden/codigo se ignora. Carreras (otra creación
    // simultánea avanzó el contador) → se reintenta la transacción completa.
    let orden: Awaited<ReturnType<typeof crearOrdenConConsecutivo>> | undefined;
    for (let intento = 1; ; intento++) {
      try {
        orden = await crearOrdenConConsecutivo();
        break;
      } catch (error) {
        if (!esConflictoReintentableConsecutivo(error)) throw error;
        if (intento >= MAX_INTENTOS_CONSECUTIVO) {
          return res.status(409).json({
            message:
              "No fue posible asignar el número de la orden por concurrencia. Intenta de nuevo.",
          });
        }
      }
    }

    return res.status(201).json(serializarOrden(orden!));
  } catch (error) {
    if (error instanceof ConflictoVinculoCorreo)
      return res.status(409).json({ message: error.message });
    console.error("Error al crear orden de compra internacional:", error);
    const message =
      error instanceof Error ? error.message : "Error al crear la orden de compra internacional.";
    return res.status(400).json({ message });
  }
};

export const crearLoteImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { id: req.params.id, tenantId, eliminado: false },
    });
    if (!orden)
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });
    if (orden.estado === "Anulada" || orden.estado === "Cerrada") {
      return res.status(400).json({
        message: `No se pueden registrar lotes en una orden en estado "${orden.estado}".`,
      });
    }

    const {
      blAwb,
      contenedor,
      precinto,
      puertoOrigen,
      puertoDestino,
      naviera,
      fechaEmbarque,
      fechaLlegadaEstimada,
      booking,
      forwarder,
      buqueNombre,
      buqueImo,
      buqueMmsi,
    } = req.body;

    // Lote + historial + actividades sembradas (+ confirmación de la orden) en
    // UNA transacción: nunca queda un lote sin su rastro ni sus actividades.
    const lote = await prisma.$transaction(async (tx) => {
      const creado = await tx.loteImportacion.create({
        data: {
          tenantId,
          ordenCompraId: orden.id,
          blAwb,
          contenedor: contenedor ?? null,
          precinto: precinto ?? null,
          puertoOrigen,
          puertoDestino,
          naviera: naviera ?? null,
          fechaEmbarque: fechaEmbarque ? new Date(fechaEmbarque) : null,
          fechaLlegadaEstimada: fechaLlegadaEstimada ? new Date(fechaLlegadaEstimada) : null,
          booking: booking ?? null,
          forwarder: forwarder ?? null,
          buqueNombre: buqueNombre ?? null,
          buqueImo: buqueImo ?? null,
          buqueMmsi: buqueMmsi ?? null,
        },
      });

      await tx.importacionHistorial.create({
        data: {
          ordenCompraId: orden.id,
          actor: req.user!.nombre,
          accion: "Lote registrado",
          detalle: `BL/AWB ${blAwb}`,
          etapa: "Embarque",
        },
      });
      // Actividades sembradas por defecto al nacer el lote — plantilla
      // mínima del proceso de embarque; el usuario puede agregar más a
      // mano si el caso lo requiere (ver crearActividad).
      await tx.importacionActividad.createMany({
        data: [
          {
            tenantId,
            ordenCompraId: orden.id,
            loteId: creado.id,
            nombre: "Enviar documentos de embarque",
            etapa: "Documentación",
            responsableTipo: "Proveedor",
            fechaLimite: fechaEmbarque ? new Date(fechaEmbarque) : null,
          },
          {
            tenantId,
            ordenCompraId: orden.id,
            loteId: creado.id,
            nombre: "Confirmar arribo del embarque",
            etapa: "Tránsito",
            responsableTipo: "Naviera",
            fechaLimite: fechaLlegadaEstimada ? new Date(fechaLlegadaEstimada) : null,
          },
        ],
      });
      if (orden.estado === "Borrador") {
        await tx.ordenCompraIntl.update({
          where: { id: orden.id },
          data: { estado: "Confirmada" },
        });
      }
      return creado;
    });

    return res.status(201).json(serializarLote(lote));
  } catch (error) {
    console.error("Error al crear lote de importación:", error);
    return res.status(500).json({ message: "Error al registrar el lote de importación." });
  }
};

/**
 * Solo mueve estados previos a la llegada física (En tránsito/En
 * puerto/En inspección). "Liberado pre-compra" y "Nacionalizado" tienen
 * endpoints dedicados porque cada uno crea el costeo correspondiente.
 */
export const actualizarEstadoLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { estado } = req.body;

    if (!ESTADOS_TRANSITO_MANUAL.includes(estado)) {
      return res.status(400).json({
        message: `Estado inválido para cambio manual. Usa: ${ESTADOS_TRANSITO_MANUAL.join(", ")}. Los estados "Liberado pre-compra" y "Nacionalizado" se asignan desde sus propios endpoints.`,
      });
    }

    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res.status(400).json({ message: ORDEN_ANULADA_MSG("cambiar el estado del lote") });
    }
    if (!ESTADOS_TRANSITO_MANUAL.includes(lote.estado)) {
      return res.status(400).json({
        message: `El lote ya está en estado "${lote.estado}" y no puede volver a tránsito manual.`,
      });
    }

    const [actualizado] = await prisma.$transaction([
      prisma.loteImportacion.update({
        where: { id: lote.id },
        data: { estado },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: "Cambio de estado de tránsito",
          detalle: `${lote.estado} → ${estado}`,
        },
      }),
    ]);

    return res.json(serializarLote(actualizado));
  } catch (error) {
    console.error("Error al actualizar estado del lote:", error);
    return res.status(500).json({ message: "Error al actualizar el estado del lote." });
  }
};

/**
 * Edita los datos de embarque/buque de un lote (Tracking Marítimo V1) —
 * PATCH parcial, nunca toca estado/costeo/expediente (eso sigue en sus
 * propios endpoints). Estos son justo los campos que la Bandeja Inteligente
 * identifica de los correos del proveedor (booking, BL, buque, puertos) y
 * que Comercio Exterior también puede completar/corregir a mano.
 */
export const actualizarEmbarqueLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res.status(400).json({ message: ORDEN_ANULADA_MSG("editar el embarque") });
    }

    const {
      blAwb,
      contenedor,
      precinto,
      puertoOrigen,
      puertoDestino,
      naviera,
      booking,
      forwarder,
      buqueNombre,
      buqueImo,
      buqueMmsi,
      fechaEmbarque,
      fechaLlegadaEstimada,
    } = req.body;

    const [actualizado] = await prisma.$transaction([
      prisma.loteImportacion.update({
        where: { id: lote.id },
        data: {
          ...(typeof blAwb === "string" && blAwb.trim() ? { blAwb: blAwb.trim() } : {}),
          ...(contenedor !== undefined ? { contenedor: contenedor || null } : {}),
          ...(precinto !== undefined ? { precinto: precinto || null } : {}),
          ...(typeof puertoOrigen === "string" && puertoOrigen.trim()
            ? { puertoOrigen: puertoOrigen.trim() }
            : {}),
          ...(typeof puertoDestino === "string" && puertoDestino.trim()
            ? { puertoDestino: puertoDestino.trim() }
            : {}),
          ...(naviera !== undefined ? { naviera: naviera || null } : {}),
          ...(booking !== undefined ? { booking: booking || null } : {}),
          ...(forwarder !== undefined ? { forwarder: forwarder || null } : {}),
          ...(buqueNombre !== undefined ? { buqueNombre: buqueNombre || null } : {}),
          ...(buqueImo !== undefined ? { buqueImo: buqueImo || null } : {}),
          ...(buqueMmsi !== undefined ? { buqueMmsi: buqueMmsi || null } : {}),
          ...(fechaEmbarque !== undefined
            ? { fechaEmbarque: fechaEmbarque ? new Date(fechaEmbarque) : null }
            : {}),
          ...(fechaLlegadaEstimada !== undefined
            ? { fechaLlegadaEstimada: fechaLlegadaEstimada ? new Date(fechaLlegadaEstimada) : null }
            : {}),
        },
        include: { contenedores: { orderBy: { numero: "asc" } } },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: "Datos de embarque actualizados",
          detalle: `Lote ${lote.id.slice(0, 8)} — BL/AWB ${
            typeof blAwb === "string" && blAwb.trim() ? blAwb.trim() : lote.blAwb
          }.`,
          etapa: "Embarque",
        },
      }),
    ]);

    return res.json(serializarLote(actualizado));
  } catch (error) {
    console.error("Error al actualizar el embarque del lote:", error);
    return res.status(500).json({ message: "Error al actualizar los datos de embarque." });
  }
};

export const crearContenedorLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res.status(400).json({ message: ORDEN_ANULADA_MSG("agregar contenedores") });
    }

    const numeroContenedor = String(req.body.numero).trim().toUpperCase();
    const existente = await prisma.contenedorLote.findFirst({
      where: { loteId: lote.id, numero: numeroContenedor },
    });
    if (existente) {
      return res
        .status(409)
        .json({ message: `El contenedor "${numeroContenedor}" ya está registrado en este lote.` });
    }

    const contenedor = await prisma.contenedorLote.create({
      data: { loteId: lote.id, numero: numeroContenedor },
    });

    return res.status(201).json(serializarContenedor(contenedor));
  } catch (error) {
    console.error("Error al agregar contenedor:", error);
    return res.status(500).json({ message: "Error al agregar el contenedor." });
  }
};

export const eliminarContenedorLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const contenedor = await prisma.contenedorLote.findFirst({
      where: { id: req.params.contenedorId, lote: { id: req.params.id, tenantId } },
      include: {
        lote: { include: { ordenCompra: { select: { eliminado: true, estado: true } } } },
      },
    });
    if (!contenedor) return res.status(404).json({ message: "Contenedor no encontrado." });
    if (ordenNoOperable(contenedor.lote.ordenCompra)) {
      return res.status(400).json({ message: ORDEN_ANULADA_MSG("eliminar contenedores") });
    }

    await prisma.contenedorLote.delete({ where: { id: contenedor.id } });
    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar contenedor:", error);
    return res.status(500).json({ message: "Error al eliminar el contenedor." });
  }
};

/**
 * Sincronización manual de un lote concreto contra el proveedor de tracking
 * marítimo — mismo motor que el job periódico (embarques-tracking.job.ts),
 * llamado puntualmente para no esperar al próximo ciclo. Reutiliza el mismo
 * provider/estado que el job (nunca duplica la lógica de comparación de
 * ETA/eventos).
 */
export const sincronizarTrackingLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res.status(400).json({ message: ORDEN_ANULADA_MSG("sincronizar el tracking") });
    }

    const { sincronizarUnLote, TrackingSimuladoNoPermitidoError } =
      await import("./embarques-tracking.job");
    try {
      await sincronizarUnLote(lote.id);
    } catch (error) {
      if (error instanceof TrackingSimuladoNoPermitidoError) {
        return res.status(409).json({ message: error.message });
      }
      throw error;
    }

    const actualizado = await prisma.loteImportacion.findUnique({
      where: { id: lote.id },
      include: { contenedores: { orderBy: { numero: "asc" } } },
    });
    return res.json(serializarLote(actualizado!));
  } catch (error) {
    console.error("Error al sincronizar el tracking del lote:", error);
    return res.status(500).json({ message: "Error al sincronizar el tracking marítimo." });
  }
};

/** El lote cambió de estado entre la lectura y la escritura (otra solicitud ganó). */
class ConflictoEstadoLoteError extends Error {}

/** La orden de un lote anulada/eliminada no admite movimientos de recepción ni costeo. */
const ordenNoOperable = (orden: { eliminado: boolean; estado: string }) =>
  orden.eliminado || orden.estado === "Anulada";

const ORDEN_ANULADA_MSG = (accion: string) =>
  `La orden de este lote está anulada: no se puede ${accion}.`;

/**
 * Auditoría de descargas: deja en el historial de la orden quién descargó qué
 * documento (tipo + id del documento). No guarda contenido ni ruta física. Se
 * escribe ANTES de entregar el archivo: si el registro falla, no se entrega
 * (falla cerrada) y la descarga responde 500.
 */
const registrarDescargaDocumento = (
  req: AuthenticatedRequest,
  ordenCompraId: string,
  etiqueta: string,
  documentoId: string,
) =>
  prisma.importacionHistorial.create({
    data: {
      ordenCompraId,
      actor: req.user!.nombre,
      accion: "Documento descargado",
      detalle: `${etiqueta} (${documentoId})`,
      etapa: "Documentación",
    },
  });

/**
 * Ingreso físico a planta antes de la factura/liquidación final. Genera un
 * costeo PROVISIONAL por ítem (FOB * TRM pactada, sin arancel/flete/
 * agenciamiento porque aún no se conocen) para que el inventario tenga un
 * costo de referencia inmediato; liquidarCosteoImportacion agrega después la
 * fila definitiva sin borrar esta.
 *
 * Qué significa "recibir" HOY (verificado en este código): cambia el estado del
 * lote a "Liberado pre-compra", sella la recepción física en planta
 * (LoteImportacion.fechaLlegadaReal + hito RECEPCION_PLANTA) y crea el costeo
 * provisional. NO crea existencias por lote, movimientos de almacén, cuarentena
 * ni liberación de Calidad, y NO escribe en Siesa.
 *
 * El cambio de estado es condicional (updateMany sobre los estados previos a la
 * recepción) dentro de la misma transacción que el costeo y el historial: dos
 * recepciones simultáneas del mismo lote no duplican el costeo provisional.
 */
export const recibirPreCompraPlanta = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { include: { items: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res
        .status(400)
        .json({ message: "La orden de este lote está anulada: no se puede recibir en planta." });
    }
    if (lote.estado === "Liberado pre-compra" || lote.estado === "Nacionalizado") {
      return res
        .status(400)
        .json({ message: `El lote ya fue recibido en planta (estado actual: "${lote.estado}").` });
    }

    const trmPactada = numero(lote.ordenCompra.trmPactada);

    const costeosProvisionales = lote.ordenCompra.items.map((item) => {
      const cantidad = numero(item.cantidad);
      const valorCifUsd = cantidad * numero(item.valorUnitarioFob);
      const valorCifCop = valorCifUsd * trmPactada;
      return {
        tenantId,
        loteId: lote.id,
        itemId: item.id,
        valorCifUsd,
        trmLiquidacion: trmPactada,
        valorCifCop,
        arancelCop: 0,
        ivaTotalCop: 0,
        cantidad,
        costoTotalCop: valorCifCop,
        costoUnitarioCop: valorCifCop / cantidad,
        esProvisional: true,
      };
    });

    const fechaRecepcion = lote.fechaLlegadaReal ?? new Date();

    try {
      await prisma.$transaction(async (tx) => {
        const cambiado = await tx.loteImportacion.updateMany({
          where: { id: lote.id, tenantId, estado: { in: ESTADOS_TRANSITO_MANUAL } },
          data: { estado: "Liberado pre-compra", fechaLlegadaReal: fechaRecepcion },
        });
        if (cambiado.count === 0) throw new ConflictoEstadoLoteError();

        await tx.loteImportacionHito.upsert({
          where: { loteId_tipo: { loteId: lote.id, tipo: "RECEPCION_PLANTA" } },
          create: {
            tenantId,
            loteId: lote.id,
            tipo: "RECEPCION_PLANTA",
            fecha: fechaRecepcion,
            origen: "Sistema",
            registradoPorId: req.user!.id,
            registradoPorNombre: req.user!.nombre,
          },
          update: {
            fecha: fechaRecepcion,
            origen: "Sistema",
            registradoPorId: req.user!.id,
            registradoPorNombre: req.user!.nombre,
          },
        });
        await tx.costeoImportacionDetalle.createMany({ data: costeosProvisionales });
        await tx.importacionHistorial.create({
          data: {
            ordenCompraId: lote.ordenCompraId,
            actor: req.user!.nombre,
            accion: "Recibido en planta (pre-compra)",
            detalle: `Lote ${lote.blAwb}: costeo provisional generado para ${costeosProvisionales.length} ítem(s).`,
            etapa: "Recepción",
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictoEstadoLoteError) {
        return res.status(409).json({
          message:
            "El estado del lote cambió mientras se procesaba la recepción. Recarga e intenta de nuevo.",
        });
      }
      throw error;
    }

    const actualizado = await prisma.loteImportacion.findUnique({
      where: { id: lote.id },
      include: {
        expediente: { include: { vistosBuenos: true } },
        costeos: true,
        hitos: true,
      },
    });

    return res.json(serializarLote(actualizado!));
  } catch (error) {
    console.error("Error al recibir pre-compra en planta:", error);
    return res.status(500).json({ message: "Error al registrar el ingreso a planta." });
  }
};

/**
 * Liquidación definitiva del landed cost (NIC 2), prorrateada por ítem. Valor
 * CIF, arancel e IVA se reparten SIEMPRE por participación en el valor FOB del
 * lote; fletes nacionales, agenciamiento y otros costos se reparten por el
 * método que elija quien liquida (`metodoProrrateoGastos`: FOB por defecto —
 * el comportamiento histórico —, PESO o VOLUMEN). PESO/VOLUMEN exigen dato
 * válido en todos los ítems: si falta, se rechaza (no se reparte con otro
 * método). Registra además la diferencia en cambio (NIC 21) entre la TRM
 * pactada en la orden y la TRM real de nacionalización. No borra el costeo
 * provisional: agrega la fila definitiva (esProvisional=false) para conservar
 * la trazabilidad de la estimación, y guarda el método usado en cada fila.
 *
 * El cambio a "Nacionalizado" es condicional (updateMany sobre los estados
 * liquidables) en la misma transacción que las filas de costeo y el historial:
 * dos liquidaciones simultáneas del mismo lote no duplican el costeo definitivo.
 */
export const liquidarCosteoImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        ordenCompra: { include: { items: true } },
        expediente: { include: { vistosBuenos: true } },
      },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res
        .status(400)
        .json({ message: "La orden de este lote está anulada: no se puede liquidar el costeo." });
    }
    if (!ESTADOS_LOTE_LIQUIDABLES.includes(lote.estado)) {
      return res.status(400).json({
        message: `No se puede liquidar un lote en estado "${lote.estado}". Debe estar en: ${ESTADOS_LOTE_LIQUIDABLES.join(", ")}.`,
      });
    }

    // Decisión #13 (ARCHITECTURAL_DECISIONS_PENDING.md): la liquidación
    // DEFINITIVA (esProvisional=false) es, en los hechos, la nacionalización
    // de la mercancía — no debe poder ocurrir sin el levante aduanero real.
    // El costeo PROVISIONAL (recibirPreCompraPlanta) sigue sin esta
    // exigencia a propósito: existe justo para cubrir el momento en que la
    // mercancía ya está en planta pero el trámite aduanero aún no cierra.
    if (!lote.expediente || lote.expediente.estado !== "Levantado") {
      return res.status(400).json({
        message:
          'No se puede liquidar el costeo definitivo sin el levante aduanero: el expediente de este lote debe estar en estado "Levantado".',
      });
    }
    const vistosNoAprobados = lote.expediente.vistosBuenos.filter((v) => v.estado !== "Aprobado");
    if (vistosNoAprobados.length > 0) {
      return res.status(400).json({
        message: `No se puede liquidar el costeo definitivo: hay visto(s) bueno(s) sin aprobar (${vistosNoAprobados
          .map((v) => `${v.entidad}: ${v.estado}`)
          .join(", ")}).`,
      });
    }

    const items = lote.ordenCompra.items;
    if (items.length === 0) {
      return res.status(400).json({ message: "La orden no tiene ítems para liquidar." });
    }

    const montos = validarMontosLiquidacion(req.body);
    if (!montos.ok) return res.status(400).json({ message: montos.mensaje });
    const {
      trmLiquidacion: trmLiq,
      valorCifTotalUsd: totalCif,
      arancelTotalCop: totalArancel,
      ivaTotalCop: totalIva,
      ivaDescontableCop: totalIvaDescontable,
      fletesNacionalesCop: totalFletes,
      agenciamientoCop: totalAgenciamiento,
      otrosCostosCop: totalOtros,
    } = montos.montos;

    const metodoSolicitado = req.body.metodoProrrateoGastos ?? "FOB";
    if (!esMetodoProrrateo(metodoSolicitado)) {
      return res.status(400).json({
        message: "Método de prorrateo inválido. Usa: FOB, PESO o VOLUMEN.",
      });
    }
    if (!esMetodoAprobado(metodoSolicitado)) {
      return res.status(400).json({
        message: `El método de prorrateo "${metodoSolicitado}" aún no está aprobado por el negocio; usa FOB.`,
      });
    }
    const metodoGastos: MetodoProrrateo = metodoSolicitado;

    const trmPactada = numero(lote.ordenCompra.trmPactada);
    const itemsParaProrrateo = items.map((item) => ({
      itemId: item.id,
      descripcion: item.descripcion,
      fobUsd: numero(item.cantidad) * numero(item.valorUnitarioFob),
      pesoKg: item.pesoKg !== null && item.pesoKg !== undefined ? numero(item.pesoKg) : null,
      volumenM3:
        item.volumenM3 !== null && item.volumenM3 !== undefined ? numero(item.volumenM3) : null,
    }));

    const porFob = calcularParticipaciones(itemsParaProrrateo, "FOB");
    if (!porFob.ok) return res.status(400).json({ message: porFob.mensaje });
    const porGastos =
      metodoGastos === "FOB" ? porFob : calcularParticipaciones(itemsParaProrrateo, metodoGastos);
    if (!porGastos.ok) return res.status(400).json({ message: porGastos.mensaje });

    const costeosDefinitivos = items.map((item) => {
      const cantidad = numero(item.cantidad);
      const fobUsdItem = cantidad * numero(item.valorUnitarioFob);
      const participacion = porFob.participaciones.get(item.id)!;
      const participacionGastos = porGastos.participaciones.get(item.id)!;

      const valorCifUsd = totalCif * participacion;
      const valorCifCop = valorCifUsd * trmLiq;
      const arancelCop = totalArancel * participacion;
      const ivaTotalCopItem = totalIva * participacion;
      const ivaDescontableCopItem = totalIvaDescontable * participacion;
      const ivaCapitalizableCop = ivaTotalCopItem - ivaDescontableCopItem;
      const fletesNacionalesCopItem = totalFletes * participacionGastos;
      const agenciamientoCopItem = totalAgenciamiento * participacionGastos;
      const otrosCostosCopItem = totalOtros * participacionGastos;
      const diferenciaCambioCop = (trmLiq - trmPactada) * fobUsdItem;

      const costoTotalCop =
        valorCifCop +
        arancelCop +
        ivaCapitalizableCop +
        fletesNacionalesCopItem +
        agenciamientoCopItem +
        otrosCostosCopItem +
        diferenciaCambioCop;

      return {
        tenantId,
        loteId: lote.id,
        itemId: item.id,
        valorCifUsd,
        trmLiquidacion: trmLiq,
        valorCifCop,
        arancelCop,
        ivaTotalCop: ivaTotalCopItem,
        ivaDescontableCop: ivaDescontableCopItem,
        ivaCapitalizableCop,
        fletesNacionalesCop: fletesNacionalesCopItem,
        agenciamientoCop: agenciamientoCopItem,
        otrosCostosCop: otrosCostosCopItem,
        diferenciaCambioCop,
        cantidad,
        costoTotalCop,
        costoUnitarioCop: costoTotalCop / cantidad,
        esProvisional: false,
        metodoProrrateoGastos: metodoGastos,
        liquidadoPorId: req.user!.id,
      };
    });

    try {
      await prisma.$transaction(async (tx) => {
        const cambiado = await tx.loteImportacion.updateMany({
          where: { id: lote.id, tenantId, estado: { in: ESTADOS_LOTE_LIQUIDABLES } },
          data: { estado: "Nacionalizado" },
        });
        if (cambiado.count === 0) throw new ConflictoEstadoLoteError();

        await tx.costeoImportacionDetalle.createMany({ data: costeosDefinitivos });
        await tx.importacionHistorial.create({
          data: {
            ordenCompraId: lote.ordenCompraId,
            actor: req.user!.nombre,
            accion: "Costeo de importación liquidado",
            detalle: `Lote ${lote.blAwb}: costo total landed $${costeosDefinitivos
              .reduce((acc, c) => acc + c.costoTotalCop, 0)
              .toLocaleString("es-CO")} (gastos prorrateados por ${metodoGastos}).`,
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictoEstadoLoteError) {
        return res.status(409).json({
          message:
            "El estado del lote cambió mientras se procesaba la liquidación (posible liquidación simultánea). Recarga e intenta de nuevo.",
        });
      }
      throw error;
    }

    const actualizado = await prisma.loteImportacion.findUnique({
      where: { id: lote.id },
      include: {
        expediente: { include: { vistosBuenos: true } },
        costeos: { orderBy: { fechaLiquidacion: "desc" } },
        hitos: true,
      },
    });

    await notificarEventoImportacion({
      tenantId,
      evento: EVENTO_LOTE_NACIONALIZADO,
      categoria: "SEGUIMIENTO",
      prioridadInbox: "MEDIA",
      entidadTipo: "LoteImportacion",
      entidadId: lote.id,
      ordenCompraId: lote.ordenCompraId,
      responsableId: lote.ordenCompra.responsableId,
      actorId: req.user!.id,
      titulo: `Lote nacionalizado: ${lote.blAwb}`,
      mensaje: `${req.user!.nombre} liquidó el costeo definitivo del lote ${lote.blAwb} (orden ${lote.ordenCompra.numeroOrden}). La mercancía queda nacionalizada.`,
      permisoFallback: PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR,
    });

    return res.json(serializarLote(actualizado!));
  } catch (error) {
    console.error("Error al liquidar costeo de importación:", error);
    return res.status(500).json({ message: "Error al liquidar el costeo de importación." });
  }
};

/**
 * Anula la orden — a diferencia de cerrar (que es el desenlace exitoso del
 * proceso), anular representa "esta importación no debe continuar". Por eso
 * tiene guardas de retroceso arbitrario que cerrar no necesita (Fase 5): una
 * orden ya Cerrada es definitiva, y un lote ya Nacionalizado significa que
 * la mercancía real ya llegó, se costeó y probablemente ya se pagó — en ese
 * punto anular TODA la orden borraría un hecho que ya ocurrió. Si algo salió
 * mal con un lote nacionalizado, la vía correcta es registrar una novedad
 * (Dano/Faltante/ProblemaAduanero/etc.), no anular el expediente completo.
 */
class OrdenYaNoAnulableError extends Error {}

export const anularOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { id: req.params.id, tenantId, eliminado: false },
      include: { lotes: { select: { id: true, estado: true, blAwb: true } } },
    });
    if (!orden)
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });

    if (orden.estado === "Cerrada") {
      return res.status(400).json({
        message: "No se puede anular una importación ya cerrada: el cierre es definitivo.",
      });
    }
    if (orden.estado === "Anulada") {
      return res.status(400).json({ message: "La orden ya está anulada." });
    }
    const lotesNacionalizados = orden.lotes.filter((l) => l.estado === "Nacionalizado");
    if (lotesNacionalizados.length > 0) {
      return res.status(400).json({
        message: `No se puede anular: ${lotesNacionalizados.length} lote(s) ya fueron nacionalizados (mercancía recibida y costeada: ${lotesNacionalizados
          .map((l) => l.blAwb)
          .join(", ")}). Registra una novedad para la incidencia en vez de anular toda la orden.`,
      });
    }

    const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim() : "";

    // Anulación, historial y desvinculación de los correos de la Bandeja de
    // ESTA empresa que apuntaban a la orden, en una sola transacción. El cambio
    // de estado es condicional: una anulación o un cierre simultáneos ganan.
    const correosDesvinculados = await prisma.$transaction(async (tx) => {
      const { count } = await tx.ordenCompraIntl.updateMany({
        where: {
          id: orden.id,
          tenantId,
          eliminado: false,
          estado: { notIn: ["Anulada", "Cerrada"] },
        },
        data: { estado: "Anulada", eliminado: true },
      });
      if (count !== 1) throw new OrdenYaNoAnulableError();
      const correoIds = await desvincularCorreosDeOrden(tx, {
        tenantId,
        ordenId: orden.id,
        numeroOrden: orden.codigo ?? orden.numeroOrden,
        usuarioId: req.user!.id,
        motivo: "ORDEN_ANULADA",
      });
      const avisoCorreos = correoIds.length
        ? `${correoIds.length} correo(s) de la Bandeja quedaron en revisión para elegir otra orden.`
        : "";
      await tx.importacionHistorial.create({
        data: {
          ordenCompraId: orden.id,
          actor: req.user!.nombre,
          accion: "Orden anulada",
          detalle: [motivo, avisoCorreos].filter(Boolean).join(" ") || null,
          etapa: "Cierre",
        },
      });
      return correoIds;
    });
    await avisarCorreosDesvinculados(tenantId, correosDesvinculados);

    await notificarEventoImportacion({
      tenantId,
      evento: EVENTO_ORDEN_ANULADA,
      categoria: "ALERTA",
      prioridadInbox: "ALTA",
      entidadTipo: "OrdenCompraIntl",
      entidadId: orden.id,
      ordenCompraId: orden.id,
      responsableId: orden.responsableId,
      actorId: req.user!.id,
      titulo: `Importación anulada: ${orden.numeroOrden}`,
      mensaje: motivo
        ? `${req.user!.nombre} anuló la importación ${orden.numeroOrden}. Motivo: ${motivo}`
        : `${req.user!.nombre} anuló la importación ${orden.numeroOrden}.`,
      permisoFallback: PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO,
    });

    return res.status(204).send();
  } catch (error) {
    if (error instanceof OrdenYaNoAnulableError) {
      return res.status(409).json({ message: "La orden cambió de estado. Actualiza la página." });
    }
    console.error("Error al anular orden de compra internacional:", error);
    return res.status(500).json({ message: "Error al anular la orden de compra internacional." });
  }
};

// --- Expediente aduanero ---
// El expediente es 1:1 con el lote (ExpedienteAduanero.loteId es @unique), así
// que se resuelve siempre por loteId con upsert en vez de exigir un paso
// separado de "crear expediente" antes de poder cargar datos/documentos.

export const actualizarExpedienteAduanero = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res
        .status(400)
        .json({ message: ORDEN_ANULADA_MSG("actualizar el expediente aduanero") });
    }

    const { numeroDIM, fechaDIM, certificadoOrigenTlc, fechaLevante, estado } = req.body;
    if (estado !== undefined && estado !== null && !ESTADOS_EXPEDIENTE_VALIDOS.includes(estado)) {
      return res.status(400).json({
        message: `Estado de expediente inválido. Usa: ${ESTADOS_EXPEDIENTE_VALIDOS.join(", ")}.`,
      });
    }

    const datos = {
      numeroDIM: numeroDIM ?? null,
      fechaDIM: fechaDIM ? new Date(fechaDIM) : null,
      certificadoOrigenTlc: certificadoOrigenTlc ?? null,
      fechaLevante: fechaLevante ? new Date(fechaLevante) : null,
      ...(estado ? { estado } : {}),
    };

    const [expediente] = await prisma.$transaction([
      prisma.expedienteAduanero.upsert({
        where: { loteId: lote.id },
        create: { tenantId, loteId: lote.id, ...datos },
        update: datos,
        include: { vistosBuenos: true },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: "Expediente aduanero actualizado",
          detalle: `Lote ${lote.blAwb}`,
        },
      }),
    ]);

    return res.json(serializarExpediente(expediente));
  } catch (error) {
    console.error("Error al actualizar expediente aduanero:", error);
    return res.status(500).json({ message: "Error al actualizar el expediente aduanero." });
  }
};

export const subirDocumentoExpedienteAduanero = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const tenantId = req.user!.tenantId;
    const tipo = req.params.tipo as TipoDocumentoExpediente;
    const campos = TIPOS_DOCUMENTO_EXPEDIENTE[tipo];
    const archivo = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;

    if (!campos) {
      if (archivo) fs.unlink(archivo.path, () => {});
      return res.status(400).json({
        message: `Tipo de documento inválido. Usa: ${Object.keys(TIPOS_DOCUMENTO_EXPEDIENTE).join(", ")}.`,
      });
    }
    if (!archivo) {
      return res.status(400).json({ message: "No se recibió ningún archivo." });
    }

    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } } },
    });
    if (!lote) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Lote de importación no encontrado." });
    }
    if (ordenNoOperable(lote.ordenCompra)) {
      fs.unlink(archivo.path, () => {});
      return res
        .status(400)
        .json({ message: ORDEN_ANULADA_MSG("adjuntar documentos al expediente") });
    }

    const expedienteActual = await prisma.expedienteAduanero.findUnique({
      where: { loteId: lote.id },
    });
    const rutaAnterior = expedienteActual ? expedienteActual[campos.ruta] : null;

    // Tenant/lote ya confirmados: recién acá se mueve el archivo de la
    // carpeta temporal a la carpeta real de este lote.
    const rutaDefinitiva = moverArchivoDefinitivo(UPLOADS_DIR_EXPEDIENTES, archivo, lote.id);
    const datosArchivo = {
      [campos.nombre]: archivo.originalname,
      [campos.ruta]: rutaDefinitiva,
      [campos.mime]: archivo.mimetype,
      [campos.tamano]: archivo.size,
    };

    const [expediente] = await prisma.$transaction([
      prisma.expedienteAduanero.upsert({
        where: { loteId: lote.id },
        create: { tenantId, loteId: lote.id, ...datosArchivo },
        update: datosArchivo,
        include: { vistosBuenos: true },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: rutaAnterior
            ? `Documento ${campos.etiqueta} reemplazado`
            : `Documento ${campos.etiqueta} adjuntado`,
          detalle: archivo.originalname,
        },
      }),
    ]);

    if (rutaAnterior) {
      fs.unlink(path.join(UPLOADS_DIR_EXPEDIENTES, rutaAnterior), () => {});
    }

    return res.status(201).json(serializarExpediente(expediente));
  } catch (error) {
    console.error("Error al subir documento del expediente aduanero:", error);
    return res.status(500).json({ message: "Error al subir el documento." });
  }
};

/**
 * Sirve un documento del expediente. Igual que en Facturas: nunca se expone
 * un path público, siempre se resuelve primero el lote por tenant y se lee
 * del disco la ruta guardada en BD (nunca una ruta armada desde input del
 * cliente).
 */
export const obtenerDocumentoExpedienteAduanero = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const tenantId = req.user!.tenantId;
    const tipo = req.params.tipo as TipoDocumentoExpediente;
    const campos = TIPOS_DOCUMENTO_EXPEDIENTE[tipo];
    if (!campos) return res.status(400).json({ message: "Tipo de documento inválido." });

    const lote = await prisma.loteImportacion.findFirst({ where: { id: req.params.id, tenantId } });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });

    const expediente = await prisma.expedienteAduanero.findUnique({ where: { loteId: lote.id } });
    const ruta = expediente ? expediente[campos.ruta] : null;
    if (!expediente || !ruta) {
      return res
        .status(404)
        .json({ message: `Este lote no tiene un documento de ${campos.etiqueta} adjunto.` });
    }

    const rutaAbsoluta = path.join(UPLOADS_DIR_EXPEDIENTES, ruta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    await registrarDescargaDocumento(req, lote.ordenCompraId, campos.etiqueta, expediente.id);

    const nombre = expediente[campos.nombre];
    const mime = expediente[campos.mime];
    res.setHeader("Content-Type", mime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(nombre || "documento")}"`,
    );
    return res.sendFile(rutaAbsoluta);
  } catch (error) {
    console.error("Error al obtener documento del expediente aduanero:", error);
    return res.status(500).json({ message: "Error al obtener el documento." });
  }
};

export const eliminarDocumentoExpedienteAduanero = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const tenantId = req.user!.tenantId;
    const tipo = req.params.tipo as TipoDocumentoExpediente;
    const campos = TIPOS_DOCUMENTO_EXPEDIENTE[tipo];
    if (!campos) return res.status(400).json({ message: "Tipo de documento inválido." });

    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res
        .status(400)
        .json({ message: ORDEN_ANULADA_MSG("eliminar documentos del expediente") });
    }

    const expediente = await prisma.expedienteAduanero.findUnique({ where: { loteId: lote.id } });
    const ruta = expediente ? expediente[campos.ruta] : null;
    if (!expediente || !ruta) {
      return res
        .status(404)
        .json({ message: `Este lote no tiene un documento de ${campos.etiqueta} adjunto.` });
    }

    const datosLimpios = {
      [campos.nombre]: null,
      [campos.ruta]: null,
      [campos.mime]: null,
      [campos.tamano]: null,
    };

    const [actualizado] = await prisma.$transaction([
      prisma.expedienteAduanero.update({
        where: { loteId: lote.id },
        data: datosLimpios,
        include: { vistosBuenos: true },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: `Documento ${campos.etiqueta} eliminado`,
        },
      }),
    ]);

    // El archivo se borra DESPUÉS de confirmar la transacción: si esta falla, la
    // fila y el archivo siguen coherentes (antes se borraba el archivo primero).
    fs.unlink(path.join(UPLOADS_DIR_EXPEDIENTES, ruta), () => {});

    return res.json(serializarExpediente(actualizado));
  } catch (error) {
    console.error("Error al eliminar documento del expediente aduanero:", error);
    return res.status(500).json({ message: "Error al eliminar el documento." });
  }
};

// --- Vistos buenos ---
// VistoBuenoAduanero es el único modelo del módulo sin tenantId propio: el
// aislamiento se verifica siempre vía la relación anidada `expediente:
// { tenantId }` (expedienteId -> ExpedienteAduanero.tenantId), nunca
// confiando en el id del visto bueno por sí solo.

export const crearVistoBueno = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res.status(400).json({ message: ORDEN_ANULADA_MSG("registrar vistos buenos") });
    }

    const { entidad, numero: numeroVisto, fecha } = req.body;

    // El expediente puede no existir todavía si el primer dato que se
    // registra del lote es un visto bueno (no el DIM) — mismo criterio de
    // upsert que en actualizarExpedienteAduanero.
    const expediente = await prisma.expedienteAduanero.upsert({
      where: { loteId: lote.id },
      create: { tenantId, loteId: lote.id },
      update: {},
    });

    const [vistoBueno] = await prisma.$transaction([
      prisma.vistoBuenoAduanero.create({
        data: {
          expedienteId: expediente.id,
          entidad,
          numero: numeroVisto ?? null,
          fecha: fecha ? new Date(fecha) : null,
        },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: "Visto bueno registrado",
          detalle: entidad,
        },
      }),
    ]);

    return res.status(201).json(serializarVistoBueno(vistoBueno));
  } catch (error) {
    console.error("Error al crear visto bueno:", error);
    return res.status(500).json({ message: "Error al registrar el visto bueno." });
  }
};

export const actualizarVistoBueno = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const vistoBueno = await prisma.vistoBuenoAduanero.findFirst({
      where: { id: req.params.id, expediente: { tenantId } },
      include: {
        expediente: {
          include: {
            lote: { include: { ordenCompra: { select: { eliminado: true, estado: true } } } },
          },
        },
      },
    });
    if (!vistoBueno) return res.status(404).json({ message: "Visto bueno no encontrado." });
    if (ordenNoOperable(vistoBueno.expediente.lote.ordenCompra)) {
      return res.status(400).json({ message: ORDEN_ANULADA_MSG("actualizar vistos buenos") });
    }

    const { entidad, numero: numeroVisto, estado, fecha } = req.body;
    if (estado !== undefined && estado !== null && !ESTADOS_VISTO_BUENO_VALIDOS.includes(estado)) {
      return res
        .status(400)
        .json({ message: `Estado inválido. Usa: ${ESTADOS_VISTO_BUENO_VALIDOS.join(", ")}.` });
    }

    const estadoAnterior = vistoBueno.estado;

    const [actualizado] = await prisma.$transaction([
      prisma.vistoBuenoAduanero.update({
        where: { id: vistoBueno.id },
        data: {
          ...(entidad !== undefined ? { entidad } : {}),
          ...(numeroVisto !== undefined ? { numero: numeroVisto ?? null } : {}),
          ...(estado ? { estado } : {}),
          ...(fecha !== undefined ? { fecha: fecha ? new Date(fecha) : null } : {}),
        },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: vistoBueno.expediente.lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: "Visto bueno actualizado",
          detalle:
            estado && estado !== estadoAnterior
              ? `${vistoBueno.entidad}: ${estadoAnterior} → ${estado}`
              : vistoBueno.entidad,
        },
      }),
    ]);

    return res.json(serializarVistoBueno(actualizado));
  } catch (error) {
    console.error("Error al actualizar visto bueno:", error);
    return res.status(500).json({ message: "Error al actualizar el visto bueno." });
  }
};

export const subirDocumentoVistoBueno = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const archivo = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;
    if (!archivo) return res.status(400).json({ message: "No se recibió ningún archivo." });

    const vistoBueno = await prisma.vistoBuenoAduanero.findFirst({
      where: { id: req.params.id, expediente: { tenantId } },
      include: {
        expediente: {
          include: {
            lote: { include: { ordenCompra: { select: { eliminado: true, estado: true } } } },
          },
        },
      },
    });
    if (!vistoBueno) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Visto bueno no encontrado." });
    }
    if (ordenNoOperable(vistoBueno.expediente.lote.ordenCompra)) {
      fs.unlink(archivo.path, () => {});
      return res
        .status(400)
        .json({ message: ORDEN_ANULADA_MSG("adjuntar documentos a vistos buenos") });
    }

    if (vistoBueno.archivoRuta) {
      fs.unlink(path.join(UPLOADS_DIR_VISTOS_BUENOS, vistoBueno.archivoRuta), () => {});
    }

    // Tenant/visto bueno ya confirmados: recién acá se mueve el archivo de
    // la carpeta temporal a la carpeta real de este visto bueno.
    const archivoRuta = moverArchivoDefinitivo(UPLOADS_DIR_VISTOS_BUENOS, archivo, vistoBueno.id);

    const [actualizado] = await prisma.$transaction([
      prisma.vistoBuenoAduanero.update({
        where: { id: vistoBueno.id },
        data: {
          archivoNombre: archivo.originalname,
          archivoRuta,
          archivoMime: archivo.mimetype,
          archivoTamano: archivo.size,
        },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: vistoBueno.expediente.lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: vistoBueno.archivoRuta
            ? "Documento de visto bueno reemplazado"
            : "Documento de visto bueno adjuntado",
          detalle: `${vistoBueno.entidad}: ${archivo.originalname}`,
        },
      }),
    ]);

    return res.status(201).json(serializarVistoBueno(actualizado));
  } catch (error) {
    console.error("Error al subir documento de visto bueno:", error);
    return res.status(500).json({ message: "Error al subir el documento." });
  }
};

export const obtenerDocumentoVistoBueno = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const vistoBueno = await prisma.vistoBuenoAduanero.findFirst({
      where: { id: req.params.id, expediente: { tenantId } },
      include: { expediente: { include: { lote: { select: { ordenCompraId: true } } } } },
    });
    if (!vistoBueno || !vistoBueno.archivoRuta) {
      return res.status(404).json({ message: "Este visto bueno no tiene un documento adjunto." });
    }

    const rutaAbsoluta = path.join(UPLOADS_DIR_VISTOS_BUENOS, vistoBueno.archivoRuta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    await registrarDescargaDocumento(
      req,
      vistoBueno.expediente.lote.ordenCompraId,
      "Visto bueno",
      vistoBueno.id,
    );

    res.setHeader("Content-Type", vistoBueno.archivoMime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(vistoBueno.archivoNombre || "documento")}"`,
    );
    return res.sendFile(rutaAbsoluta);
  } catch (error) {
    console.error("Error al obtener documento de visto bueno:", error);
    return res.status(500).json({ message: "Error al obtener el documento." });
  }
};

// --- Documentos iniciales de la orden ---
// Cotización / Proforma Invoice / Oferta comercial / Otros — adjuntados
// directamente a la OrdenCompraIntl (no al lote/expediente). Reutiliza el
// mismo storage/validación (tenant, magic bytes, límite 10MB) que
// expedientes/vistos-buenos, pero con una tabla de filas (varios documentos
// por tipo), no un campo fijo por documento. NUNCA dispara extracción/IA:
// es solo asociación de archivos a la orden.

export const subirDocumentoOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const tipoSlug = req.params.tipo;
    const etiqueta = TIPOS_DOCUMENTO_ORDEN[tipoSlug];
    const archivo = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;

    if (!etiqueta) {
      if (archivo) fs.unlink(archivo.path, () => {});
      return res.status(400).json({
        message: `Tipo de documento inválido. Usa: ${Object.keys(TIPOS_DOCUMENTO_ORDEN).join(", ")}.`,
      });
    }
    if (!archivo) {
      return res.status(400).json({ message: "No se recibió ningún archivo." });
    }

    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { id: req.params.id, tenantId, eliminado: false },
    });
    if (!orden) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });
    }

    // Tenant/orden ya confirmados: recién acá se mueve el archivo de la
    // carpeta temporal a la carpeta real de esta orden.
    const rutaDefinitiva = moverArchivoDefinitivo(
      UPLOADS_DIR_ORDENES_COMPRA_INTL,
      archivo,
      orden.id,
    );

    const [documento] = await prisma.$transaction([
      prisma.ordenCompraIntlDocumento.create({
        data: {
          tenantId,
          ordenCompraId: orden.id,
          tipo: etiqueta,
          nombreOriginal: archivo.originalname,
          mime: archivo.mimetype,
          tamano: archivo.size,
          ruta: rutaDefinitiva,
          subidoPorNombre: req.user!.nombre,
        },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: orden.id,
          actor: req.user!.nombre,
          accion: `Documento inicial adjuntado (${etiqueta})`,
          detalle: archivo.originalname,
        },
      }),
    ]);

    return res.status(201).json({
      id: documento.id,
      tipo: documento.tipo,
      nombreOriginal: documento.nombreOriginal,
      mime: documento.mime,
      tamano: documento.tamano,
      subidoPorNombre: documento.subidoPorNombre,
      createdAt: documento.createdAt,
    });
  } catch (error) {
    console.error("Error al subir documento inicial de la orden:", error);
    return res.status(500).json({ message: "Error al subir el documento." });
  }
};

/**
 * Sirve un documento inicial de la orden. Igual que en Facturas/Expediente:
 * nunca se expone un path público, siempre se resuelve primero la orden por
 * tenant y se lee del disco la ruta guardada en BD (nunca una ruta armada
 * desde input del cliente).
 */
export const obtenerDocumentoOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const documento = await prisma.ordenCompraIntlDocumento.findFirst({
      where: { id: req.params.documentoId, tenantId, ordenCompraId: req.params.id },
    });
    if (!documento) return res.status(404).json({ message: "Documento no encontrado." });

    const rutaAbsoluta = path.join(UPLOADS_DIR_ORDENES_COMPRA_INTL, documento.ruta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    await registrarDescargaDocumento(
      req,
      documento.ordenCompraId,
      `Documento de la orden (${documento.tipo})`,
      documento.id,
    );

    res.setHeader("Content-Type", documento.mime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(documento.nombreOriginal || "documento")}"`,
    );
    return res.sendFile(rutaAbsoluta);
  } catch (error) {
    console.error("Error al obtener documento inicial de la orden:", error);
    return res.status(500).json({ message: "Error al obtener el documento." });
  }
};

export const eliminarDocumentoOrdenCompraIntl = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const tenantId = req.user!.tenantId;
    const documento = await prisma.ordenCompraIntlDocumento.findFirst({
      where: { id: req.params.documentoId, tenantId, ordenCompraId: req.params.id },
    });
    if (!documento) return res.status(404).json({ message: "Documento no encontrado." });

    await prisma.$transaction([
      prisma.ordenCompraIntlDocumento.delete({ where: { id: documento.id } }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: documento.ordenCompraId,
          actor: req.user!.nombre,
          accion: `Documento inicial eliminado (${documento.tipo})`,
          detalle: documento.nombreOriginal,
        },
      }),
    ]);

    // Después de confirmar la transacción (ver eliminarDocumentoExpedienteAduanero).
    fs.unlink(path.join(UPLOADS_DIR_ORDENES_COMPRA_INTL, documento.ruta), () => {});

    return res.json({ message: "Documento eliminado." });
  } catch (error) {
    console.error("Error al eliminar documento inicial de la orden:", error);
    return res.status(500).json({ message: "Error al eliminar el documento." });
  }
};

// --- Hitos reales del lote ---
// Hecho real con fecha y origen (ver domain/importaciones/hitos-lote.ts). Nunca
// reemplaza fechaLlegadaEstimada (proveedor) ni etaTrackingActual (tracking): son
// datos con dueños distintos. Registrar o corregir deja el valor anterior en
// ImportacionHistorial (append-only), en la misma transacción.

const ETAPA_HITO: Record<TipoHitoLote, string> = {
  EMBARQUE_REAL: "Embarque",
  LLEGADA_PUERTO: "Tránsito",
  INSPECCION_ADUANERA: "Aduana",
  RECEPCION_PLANTA: "Recepción",
};

const esErrorUnicoPrisma = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const fechaCorta = (fecha: Date) => fecha.toISOString().slice(0, 10);

export const registrarHitoLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const tipo = req.params.tipo;
    if (!esTipoHitoManual(tipo)) {
      return res.status(400).json({
        message:
          "Tipo de hito inválido o no registrable a mano. Usa: EMBARQUE_REAL, LLEGADA_PUERTO o INSPECCION_ADUANERA (la recepción en planta la registra el sistema al recibir el lote).",
      });
    }

    const fecha = new Date(req.body.fecha);
    if (Number.isNaN(fecha.getTime())) {
      return res.status(400).json({ message: "La fecha del hito no es válida." });
    }

    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } }, hitos: true },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res
        .status(400)
        .json({ message: "La orden de este lote está anulada: no se pueden registrar hitos." });
    }

    const existentes: HitosExistentes = {};
    for (const h of lote.hitos) {
      if ((TIPOS_HITO_LOTE as readonly string[]).includes(h.tipo)) {
        existentes[h.tipo as TipoHitoLote] = h.fecha;
      }
    }
    // Lotes recibidos antes de existir la tabla de hitos: su recepción está en
    // fechaLlegadaReal (única fuente que la escribe).
    if (!existentes.RECEPCION_PLANTA && lote.fechaLlegadaReal) {
      existentes.RECEPCION_PLANTA = lote.fechaLlegadaReal;
    }

    const errorHito = validarHito(tipo, fecha, existentes, new Date());
    if (errorHito) return res.status(400).json({ message: errorHito });

    const anterior = lote.hitos.find((h) => h.tipo === tipo);
    const nota =
      typeof req.body.nota === "string" && req.body.nota.trim() ? req.body.nota.trim() : null;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.loteImportacionHito.upsert({
          where: { loteId_tipo: { loteId: lote.id, tipo } },
          create: {
            tenantId,
            loteId: lote.id,
            tipo,
            fecha,
            origen: "Manual",
            nota,
            registradoPorId: req.user!.id,
            registradoPorNombre: req.user!.nombre,
          },
          update: {
            fecha,
            origen: "Manual",
            nota,
            registradoPorId: req.user!.id,
            registradoPorNombre: req.user!.nombre,
          },
        });
        await tx.importacionHistorial.create({
          data: {
            ordenCompraId: lote.ordenCompraId,
            actor: req.user!.nombre,
            accion: anterior
              ? `Hito corregido: ${ETIQUETA_HITO[tipo]}`
              : `Hito registrado: ${ETIQUETA_HITO[tipo]}`,
            detalle: `Lote ${lote.blAwb}: ${fechaCorta(fecha)}${
              anterior ? ` (antes: ${fechaCorta(anterior.fecha)})` : ""
            }${nota ? `. ${nota}` : ""}`,
            origen: "Manual",
            etapa: ETAPA_HITO[tipo],
          },
        });
      });
    } catch (error) {
      if (esErrorUnicoPrisma(error)) {
        return res.status(409).json({
          message: "Otro usuario registró este hito al mismo tiempo. Recarga e intenta de nuevo.",
        });
      }
      throw error;
    }

    const hitos = await prisma.loteImportacionHito.findMany({
      where: { loteId: lote.id, tenantId },
    });
    return res.json(serializarHitosLote({ ...lote, hitos }));
  } catch (error) {
    console.error("Error al registrar hito del lote:", error);
    return res.status(500).json({ message: "Error al registrar el hito del lote." });
  }
};

export const eliminarHitoLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const tipo = req.params.tipo;
    if (!esTipoHitoManual(tipo)) {
      return res.status(400).json({ message: "Solo se pueden eliminar hitos registrados a mano." });
    }
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (ordenNoOperable(lote.ordenCompra)) {
      return res
        .status(400)
        .json({ message: "La orden de este lote está anulada: no se pueden modificar hitos." });
    }

    const existente = await prisma.loteImportacionHito.findFirst({
      where: { loteId: lote.id, tenantId, tipo },
    });
    if (!existente) {
      return res.status(404).json({ message: "Este lote no tiene ese hito registrado." });
    }

    const eliminado = await prisma.$transaction(async (tx) => {
      const borrados = await tx.loteImportacionHito.deleteMany({
        where: { id: existente.id, tenantId },
      });
      if (borrados.count === 0) return false;
      await tx.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: `Hito eliminado: ${ETIQUETA_HITO[tipo]}`,
          detalle: `Lote ${lote.blAwb}: se retiró la fecha ${fechaCorta(existente.fecha)}.`,
          origen: "Manual",
          etapa: ETAPA_HITO[tipo],
        },
      });
      return true;
    });
    if (!eliminado) {
      return res.status(404).json({ message: "Este lote no tiene ese hito registrado." });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar hito del lote:", error);
    return res.status(500).json({ message: "Error al eliminar el hito del lote." });
  }
};

// --- Documentos del lote (B/L-AWB, COA, otros) ---
// Mismo patrón que los documentos iniciales de la orden: filas en
// LoteImportacionDocumento, archivo privado servido solo por endpoint
// autenticado que valida tenant, historial en la misma transacción. No se
// valida obligatoriedad: la regla (por material/proveedor/país) no está definida.

export const subirDocumentoLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const etiqueta = TIPOS_DOCUMENTO_LOTE[req.params.tipo];
    const archivo = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;

    if (!etiqueta) {
      if (archivo) fs.unlink(archivo.path, () => {});
      return res.status(400).json({
        message: `Tipo de documento inválido. Usa: ${Object.keys(TIPOS_DOCUMENTO_LOTE).join(", ")}.`,
      });
    }
    if (!archivo) return res.status(400).json({ message: "No se recibió ningún archivo." });

    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { select: { eliminado: true, estado: true } } },
    });
    if (!lote) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Lote de importación no encontrado." });
    }
    if (ordenNoOperable(lote.ordenCompra)) {
      fs.unlink(archivo.path, () => {});
      return res
        .status(400)
        .json({ message: "La orden de este lote está anulada: no se pueden adjuntar documentos." });
    }

    // Tenant/lote ya confirmados: recién acá se mueve el archivo de la carpeta
    // temporal a la carpeta real de este lote.
    const rutaDefinitiva = moverArchivoDefinitivo(UPLOADS_DIR_LOTES_IMPORTACION, archivo, lote.id);

    try {
      const [documento] = await prisma.$transaction([
        prisma.loteImportacionDocumento.create({
          data: {
            tenantId,
            loteId: lote.id,
            tipo: etiqueta,
            nombreOriginal: archivo.originalname,
            mime: archivo.mimetype,
            tamano: archivo.size,
            ruta: rutaDefinitiva,
            subidoPorId: req.user!.id,
            subidoPorNombre: req.user!.nombre,
          },
        }),
        prisma.importacionHistorial.create({
          data: {
            ordenCompraId: lote.ordenCompraId,
            actor: req.user!.nombre,
            accion: `Documento de lote adjuntado (${etiqueta})`,
            detalle: `Lote ${lote.blAwb}: ${archivo.originalname}`,
            etapa: "Documentación",
          },
        }),
      ]);
      return res.status(201).json(serializarDocumentoLote(documento));
    } catch (error) {
      // La transacción falló: no dejar el archivo huérfano en disco.
      fs.unlink(path.join(UPLOADS_DIR_LOTES_IMPORTACION, rutaDefinitiva), () => {});
      throw error;
    }
  } catch (error) {
    console.error("Error al subir documento del lote:", error);
    return res.status(500).json({ message: "Error al subir el documento." });
  }
};

export const obtenerDocumentoLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const documento = await prisma.loteImportacionDocumento.findFirst({
      where: { id: req.params.documentoId, tenantId, loteId: req.params.id },
      include: { lote: { select: { ordenCompraId: true } } },
    });
    if (!documento) return res.status(404).json({ message: "Documento no encontrado." });
    const lote = documento.lote;

    const rutaAbsoluta = path.join(UPLOADS_DIR_LOTES_IMPORTACION, documento.ruta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    await registrarDescargaDocumento(
      req,
      lote.ordenCompraId,
      `Documento del lote (${documento.tipo})`,
      documento.id,
    );

    res.setHeader("Content-Type", documento.mime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(documento.nombreOriginal || "documento")}"`,
    );
    return res.sendFile(rutaAbsoluta);
  } catch (error) {
    console.error("Error al obtener documento del lote:", error);
    return res.status(500).json({ message: "Error al obtener el documento." });
  }
};

export const eliminarDocumentoLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const documento = await prisma.loteImportacionDocumento.findFirst({
      where: { id: req.params.documentoId, tenantId, loteId: req.params.id },
      include: { lote: { select: { ordenCompraId: true, blAwb: true } } },
    });
    if (!documento) return res.status(404).json({ message: "Documento no encontrado." });

    const eliminado = await prisma.$transaction(async (tx) => {
      const borrados = await tx.loteImportacionDocumento.deleteMany({
        where: { id: documento.id, tenantId },
      });
      if (borrados.count === 0) return false;
      await tx.importacionHistorial.create({
        data: {
          ordenCompraId: documento.lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: `Documento de lote eliminado (${documento.tipo})`,
          detalle: `Lote ${documento.lote.blAwb}: ${documento.nombreOriginal}`,
          etapa: "Documentación",
        },
      });
      return true;
    });
    if (!eliminado) return res.status(404).json({ message: "Documento no encontrado." });

    // Después de confirmar la transacción: archivo y fila quedan coherentes.
    fs.unlink(path.join(UPLOADS_DIR_LOTES_IMPORTACION, documento.ruta), () => {});
    return res.json({ message: "Documento eliminado." });
  } catch (error) {
    console.error("Error al eliminar documento del lote:", error);
    return res.status(500).json({ message: "Error al eliminar el documento." });
  }
};

// --- Actividades esperadas ---

/**
 * Actividad manual — complementa las sembradas por defecto (ver
 * crearOrdenCompraIntl/crearLoteImportacion) para casos que la plantilla no
 * cubre. loteId es opcional: una actividad puede ser de la orden completa.
 */
export const crearActividadImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { id: req.params.id, tenantId, eliminado: false },
    });
    if (!orden)
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });

    const {
      nombre,
      etapa,
      responsableTipo,
      responsableNombre,
      fechaPlanificada,
      fechaLimite,
      loteId,
      dependeDeId,
    } = req.body;

    if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
      return res.status(400).json({ message: "El nombre de la actividad es obligatorio." });
    }
    if (!ETAPAS_VALIDAS.includes(etapa)) {
      return res
        .status(400)
        .json({ message: `Etapa inválida. Valores permitidos: ${ETAPAS_VALIDAS.join(", ")}.` });
    }
    if (!RESPONSABLE_TIPOS_VALIDOS.includes(responsableTipo)) {
      return res.status(400).json({
        message: `Tipo de responsable inválido. Valores permitidos: ${RESPONSABLE_TIPOS_VALIDOS.join(", ")}.`,
      });
    }
    if (loteId) {
      const lote = await prisma.loteImportacion.findFirst({
        where: { id: loteId, tenantId, ordenCompraId: orden.id },
      });
      if (!lote)
        return res.status(404).json({ message: "El lote indicado no existe en esta orden." });
    }
    if (dependeDeId) {
      const dependencia = await prisma.importacionActividad.findFirst({
        where: { id: dependeDeId, tenantId, ordenCompraId: orden.id },
      });
      if (!dependencia)
        return res
          .status(404)
          .json({ message: "La actividad de la que depende no existe en esta orden." });
    }

    const actividad = await prisma.importacionActividad.create({
      data: {
        tenantId,
        ordenCompraId: orden.id,
        loteId: loteId ?? null,
        nombre: nombre.trim(),
        etapa,
        responsableTipo,
        responsableNombre: responsableNombre?.trim() || null,
        fechaPlanificada: fechaPlanificada ? new Date(fechaPlanificada) : null,
        fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
        dependeDeId: dependeDeId ?? null,
      },
    });

    return res.status(201).json(serializarActividad(actividad));
  } catch (error) {
    console.error("Error al crear actividad de importación:", error);
    return res.status(500).json({ message: "Error al registrar la actividad." });
  }
};

/**
 * Marca una actividad como Completada (o cambia su estado) — al completar,
 * registra un EVENTO real en ImportacionHistorial (origen=Manual), que es
 * exactamente lo que pide el motor de seguimiento para dejar de considerarla
 * vencida/bloqueante en la próxima sincronización.
 */
export const actualizarActividadImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const actividad = await prisma.importacionActividad.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!actividad) return res.status(404).json({ message: "Actividad no encontrada." });

    const { estado, observacion, fechaReal } = req.body;
    if (estado && !ESTADOS_ACTIVIDAD_VALIDOS.includes(estado)) {
      return res.status(400).json({
        message: `Estado inválido. Valores permitidos: ${ESTADOS_ACTIVIDAD_VALIDOS.join(", ")}.`,
      });
    }

    const seCompleta = estado === "Completada" && actividad.estado !== "Completada";

    const [actualizada] = await prisma.$transaction([
      prisma.importacionActividad.update({
        where: { id: actividad.id },
        data: {
          ...(estado ? { estado } : {}),
          ...(observacion !== undefined ? { observacion: observacion || null } : {}),
          ...(seCompleta ? { fechaReal: fechaReal ? new Date(fechaReal) : new Date() } : {}),
        },
      }),
      ...(seCompleta
        ? [
            prisma.importacionHistorial.create({
              data: {
                ordenCompraId: actividad.ordenCompraId,
                actor: req.user!.nombre,
                accion: `Actividad completada: ${actividad.nombre}`,
                detalle: observacion || null,
                origen: "Manual",
                etapa: actividad.etapa,
              },
            }),
          ]
        : []),
    ]);

    return res.json(serializarActividad(actualizada));
  } catch (error) {
    console.error("Error al actualizar actividad de importación:", error);
    return res.status(500).json({ message: "Error al actualizar la actividad." });
  }
};

// --- Novedades ---

export const crearNovedadImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { id: req.params.id, tenantId, eliminado: false },
    });
    if (!orden)
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });

    const {
      tipo,
      descripcion,
      origen,
      responsable,
      prioridad,
      impacto,
      fechaLimite,
      accionRequerida,
    } = req.body;

    const tiposNovedadValidos = await obtenerClavesActivasCatalogo(
      tenantId,
      "MOTIVO_NOVEDAD_IMPORTACION",
    );
    if (!tiposNovedadValidos.has(tipo)) {
      return res.status(400).json({
        message: `Tipo de novedad inválido. Valores permitidos: ${[...tiposNovedadValidos].join(", ")}.`,
      });
    }
    if (!descripcion || typeof descripcion !== "string" || !descripcion.trim()) {
      return res.status(400).json({ message: "La descripción de la novedad es obligatoria." });
    }
    const origenFinal =
      origen && ORIGENES_NOVEDAD_VALIDOS.includes(origen) ? origen : "PorDeterminar";
    const prioridadFinal =
      prioridad && PRIORIDADES_NOVEDAD_VALIDAS.includes(prioridad) ? prioridad : "Media";

    // Novedad + historial en una sola transacción: no puede quedar una
    // novedad sin su rastro (ni un rastro sin novedad).
    const [novedad] = await prisma.$transaction([
      prisma.importacionNovedad.create({
        data: {
          tenantId,
          ordenCompraId: orden.id,
          tipo,
          descripcion: descripcion.trim(),
          origen: origenFinal,
          responsable: responsable?.trim() || null,
          prioridad: prioridadFinal,
          impacto: impacto?.trim() || null,
          fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
          accionRequerida: accionRequerida?.trim() || null,
          automatica: false,
          creadoPorId: req.user!.id,
          creadoPorNombre: req.user!.nombre,
        },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: orden.id,
          actor: req.user!.nombre,
          accion: `Novedad registrada: ${tipo}`,
          detalle: descripcion.trim(),
          origen: "Manual",
        },
      }),
    ]);

    if (prioridadFinal === "Alta") {
      await notificarEventoImportacion({
        tenantId,
        evento: EVENTO_NOVEDAD_ALTA,
        categoria: "INCIDENCIA",
        prioridadInbox: "ALTA",
        entidadTipo: "ImportacionNovedad",
        entidadId: novedad.id,
        ordenCompraId: orden.id,
        responsableId: orden.responsableId,
        actorId: req.user!.id,
        titulo: `Novedad crítica: ${orden.numeroOrden}`,
        mensaje: descripcion.trim(),
        permisoFallback: PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO,
      });
    }

    return res.status(201).json(serializarNovedad(novedad));
  } catch (error) {
    console.error("Error al crear novedad de importación:", error);
    return res.status(500).json({ message: "Error al registrar la novedad." });
  }
};

export const resolverNovedadImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const novedad = await prisma.importacionNovedad.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!novedad) return res.status(404).json({ message: "Novedad no encontrada." });
    if (novedad.estado === "Resuelta") {
      return res.status(400).json({ message: "Esta novedad ya está resuelta." });
    }
    // Una novedad automática representa la condición observada: la resuelve el
    // sistema cuando deja de cumplirse. Declararla "no aplicable" requerirá un
    // flujo explícito aún no definido por Comercio Exterior.
    if (novedad.automatica) {
      return res.status(409).json({
        message:
          "Las novedades automáticas no se resuelven manualmente: el sistema las resuelve cuando la condición deja de cumplirse.",
      });
    }

    const { comentario } = req.body;

    // Resolución condicional: dos resoluciones simultáneas (o una persona y el
    // sistema) no pisan ni duplican el historial.
    const actualizada = await prisma.$transaction(async (tx) => {
      const cambiadas = await tx.importacionNovedad.updateMany({
        where: { id: novedad.id, tenantId, estado: { not: "Resuelta" } },
        data: {
          estado: "Resuelta",
          fechaResolucion: new Date(),
          responsableResolucionId: req.user!.id,
          responsableResolucionNombre: req.user!.nombre,
        },
      });
      if (cambiadas.count === 0) return null;
      await tx.importacionHistorial.create({
        data: {
          ordenCompraId: novedad.ordenCompraId,
          actor: req.user!.nombre,
          accion: `Novedad resuelta: ${novedad.tipo}`,
          detalle: comentario || null,
          origen: "Manual",
        },
      });
      return tx.importacionNovedad.findUniqueOrThrow({ where: { id: novedad.id } });
    });
    if (!actualizada) {
      return res.status(400).json({ message: "Esta novedad ya está resuelta." });
    }

    return res.json(serializarNovedad(actualizada));
  } catch (error) {
    console.error("Error al resolver novedad de importación:", error);
    return res.status(500).json({ message: "Error al resolver la novedad." });
  }
};

// --- Pagos ---

export const crearPagoImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { id: req.params.id, tenantId, eliminado: false },
    });
    if (!orden)
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });

    const { concepto, valor, moneda, fechaVencimiento, observaciones } = req.body;
    const valorNum = numero(valor);
    if (!concepto || typeof concepto !== "string" || !concepto.trim()) {
      return res.status(400).json({ message: "El concepto del pago es obligatorio." });
    }
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      return res
        .status(400)
        .json({ message: "El valor del pago debe ser un número mayor a cero." });
    }

    const monedaPago = typeof moneda === "string" && moneda.trim() ? moneda.trim() : "COP";

    // Alta del pago e historial en una sola transacción: no puede quedar un
    // pago sin su rastro (ni un rastro sin pago).
    const [pago] = await prisma.$transaction([
      prisma.importacionPago.create({
        data: {
          tenantId,
          ordenCompraId: orden.id,
          concepto: concepto.trim(),
          valor: valorNum,
          moneda: monedaPago,
          fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
          responsableId: req.user!.id,
          responsableNombre: req.user!.nombre,
          observaciones: observaciones?.trim() || null,
        },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: orden.id,
          actor: req.user!.nombre,
          accion: `Obligación registrada: ${concepto}`,
          detalle: `$${valorNum.toLocaleString("es-CO")} ${monedaPago}`,
          etapa: "Pagos",
        },
      }),
    ]);

    return res.status(201).json(serializarPago(pago));
  } catch (error) {
    console.error("Error al crear pago de importación:", error);
    return res.status(500).json({ message: "Error al registrar el pago." });
  }
};

export const actualizarEstadoPagoImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const pago = await prisma.importacionPago.findFirst({ where: { id: req.params.id, tenantId } });
    if (!pago) return res.status(404).json({ message: "Pago no encontrado." });

    const { estado } = req.body;
    if (!ESTADOS_PAGO_VALIDOS.includes(estado)) {
      return res.status(400).json({
        message: `Estado inválido. Valores permitidos: ${ESTADOS_PAGO_VALIDOS.join(", ")}.`,
      });
    }
    if (pago.estado === "Anulado") {
      return res.status(400).json({ message: "Este pago ya está anulado." });
    }
    // Repetir el estado actual no cambia nada: evita re-sellar fechaPago (que
    // debe conservar la fecha original del pago) y ruido en el historial.
    if (pago.estado === estado) {
      return res.json(serializarPago(pago));
    }

    const [actualizado] = await prisma.$transaction([
      prisma.importacionPago.update({
        where: { id: pago.id },
        data: {
          estado,
          // Pagado sella la fecha; volver a Pendiente la limpia (un pago
          // pendiente no puede conservar fecha de pago); Anulado la conserva.
          fechaPago:
            estado === "Pagado" ? new Date() : estado === "Pendiente" ? null : pago.fechaPago,
        },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: pago.ordenCompraId,
          actor: req.user!.nombre,
          accion: `Pago ${estado.toLowerCase()}: ${pago.concepto}`,
          etapa: "Pagos",
        },
      }),
    ]);

    return res.json(serializarPago(actualizado));
  } catch (error) {
    console.error("Error al actualizar pago de importación:", error);
    return res.status(500).json({ message: "Error al actualizar el pago." });
  }
};

// --- Cierre ---

/**
 * Cierra el expediente si se cumplen las condiciones evaluadas por
 * domain/importaciones/condiciones-cierre.ts. `forzar:true` + `justificacion`
 * permite cerrar de todos modos (queda registrado en el historial quién y
 * por qué) — la regla de negocio real de cuándo cerrar sigue sin definirse
 * con certeza (ver PENDIENTES_CONSOLIDADO.md #1/#13), así que el sistema
 * informa en vez de bloquear de forma absoluta.
 */
export const cerrarOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { id: req.params.id, tenantId, eliminado: false },
      include: { lotes: true, items: { include: { costeos: true } }, novedades: true },
    });
    if (!orden)
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });
    if (orden.estado === "Cerrada" || orden.estado === "Anulada") {
      return res.status(400).json({ message: `La orden ya está en estado "${orden.estado}".` });
    }

    const { forzar, justificacion } = req.body;

    const resultado = evaluarCondicionesCierre(
      orden.lotes.map((l) => ({ id: l.id, estado: l.estado })),
      orden.items.map((i) => ({
        itemId: i.id,
        tieneCosteoDefinitivo: i.costeos.some((c) => !c.esProvisional),
      })),
      orden.novedades.map((n) => ({ id: n.id, prioridad: n.prioridad, estado: n.estado })),
    );

    if (!resultado.puedeCerrarse && !forzar) {
      // El mensaje incluye la lista textual (no solo el array `faltantes`)
      // porque el cliente HTTP genérico del frontend (fetchApi) solo
      // propaga `message` al lanzar el error — así el usuario ve el detalle
      // sin que cada pantalla tenga que leer `faltantes` por separado.
      return res.status(409).json({
        message: `No se cumplen las condiciones de cierre: ${resultado.faltantes.join(" ")}`,
        faltantes: resultado.faltantes,
      });
    }
    if (!resultado.puedeCerrarse && forzar && !justificacion?.trim()) {
      return res
        .status(400)
        .json({ message: "Cerrar sin cumplir las condiciones requiere una justificación." });
    }

    // El historial se crea PRIMERO en la transacción: el update de abajo
    // trae `include: INCLUDE_ORDEN_DETALLE` y necesita ver esta fila nueva
    // en su propia respuesta (Prisma resuelve cada `include` en el momento
    // de esa operación puntual, no al final de todo el array).
    await prisma.$transaction([
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: orden.id,
          actor: req.user!.nombre,
          accion: resultado.puedeCerrarse ? "Importación cerrada" : "Importación cerrada (forzado)",
          detalle: resultado.puedeCerrarse ? null : `Justificación: ${justificacion.trim()}`,
          etapa: "Cierre",
        },
      }),
      prisma.ordenCompraIntl.update({
        where: { id: orden.id },
        data: { estado: "Cerrada", fechaCierre: new Date() },
      }),
    ]);

    const actualizada = await prisma.ordenCompraIntl.findUnique({
      where: { id: orden.id },
      include: INCLUDE_ORDEN_DETALLE,
    });
    if (!actualizada) {
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });
    }

    await notificarEventoImportacion({
      tenantId,
      evento: EVENTO_ORDEN_CERRADA,
      categoria: "SEGUIMIENTO",
      prioridadInbox: "MEDIA",
      entidadTipo: "OrdenCompraIntl",
      entidadId: orden.id,
      ordenCompraId: orden.id,
      responsableId: orden.responsableId,
      actorId: req.user!.id,
      titulo: `Importación cerrada: ${orden.numeroOrden}`,
      mensaje: resultado.puedeCerrarse
        ? `${req.user!.nombre} cerró la importación ${orden.numeroOrden}.`
        : `${req.user!.nombre} cerró la importación ${orden.numeroOrden} de forma forzada. Justificación: ${justificacion?.trim()}`,
      permisoFallback: PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO,
    });

    return res.json(serializarOrden(actualizada));
  } catch (error) {
    console.error("Error al cerrar orden de compra internacional:", error);
    return res.status(500).json({ message: "Error al cerrar la orden de compra internacional." });
  }
};
