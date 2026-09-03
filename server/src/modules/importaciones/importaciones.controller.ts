import fs from "fs";
import path from "path";
import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  UPLOADS_DIR_EXPEDIENTES,
  UPLOADS_DIR_VISTOS_BUENOS,
  moverArchivoDefinitivo,
} from "../../middleware/upload.middleware";
import {
  calcularActividadesVencidas,
  generarNovedadesSugeridas,
  calcularSituacionActual,
  type ActividadSeguimiento,
} from "../../domain/importaciones/motor-seguimiento";
import { evaluarCondicionesCierre } from "../../domain/importaciones/condiciones-cierre";

const INCOTERMS_VALIDOS = [
  "EXW",
  "FCA",
  "FAS",
  "FOB",
  "CFR",
  "CIF",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
];
const MONEDAS_VALIDAS = ["USD", "EUR", "CNY", "GBP", "JPY"];
const ESTADOS_ORDEN_VALIDOS = ["Borrador", "Confirmada", "Cerrada", "Anulada"];
// Validación de forma en el controlador, mismo patrón que ESTADOS_ORDEN_VALIDOS
// arriba — no una máquina de estados con transiciones: la regla de negocio de
// cuándo debe cambiar cada uno no está definida todavía (ver
// ARCHITECTURAL_DECISIONS_PENDING.md, decisión #10).
const ESTADOS_EXPEDIENTE_VALIDOS = ["En trámite", "Levantado"];
const ESTADOS_VISTO_BUENO_VALIDOS = ["Pendiente", "Aprobado", "Rechazado"];

type TipoDocumentoExpediente = "dim" | "factura-comercial" | "certificado-origen";

const TIPOS_DOCUMENTO_EXPEDIENTE: Record<
  TipoDocumentoExpediente,
  { nombre: string; ruta: string; mime: string; tamano: string; etiqueta: string }
> = {
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
// Solo los estados previos a la llegada física se cambian a mano desde
// actualizarEstadoLote. "Liberado pre-compra" lo asigna recibirPreCompraPlanta
// y "Nacionalizado" lo asigna liquidarCosteoImportacion: ninguno de los dos
// se puede saltar a mano, porque cada uno dispara su propio efecto de negocio
// (crear costeo provisional / costeo definitivo).
const ESTADOS_TRANSITO_MANUAL = ["En tránsito", "En puerto", "En inspección"];
const ESTADOS_LOTE_LIQUIDABLES = ["En puerto", "En inspección", "Liberado pre-compra"];

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
const TIPOS_NOVEDAD_VALIDOS = [
  "Retraso",
  "DocumentoFaltante",
  "Inconsistencia",
  "Dano",
  "Faltante",
  "ProblemaAduanero",
  "ProblemaProveedor",
  "ProblemaTransporte",
  "ProblemaFinanciero",
  "Bloqueo",
  "Otro",
];
const ORIGENES_NOVEDAD_VALIDOS = ["Interno", "Externo", "PorDeterminar"];
const PRIORIDADES_NOVEDAD_VALIDAS = ["Alta", "Media", "Baja"];
const ESTADOS_NOVEDAD_VALIDOS = ["Abierta", "EnGestion", "Resuelta"];
const ESTADOS_PAGO_VALIDOS = ["Pendiente", "Pagado", "Anulado"];

/**
 * IMP-{año}-{consecutivo de 3 dígitos por tenant y año}, ej. "IMP-2026-004".
 * No se garantiza único a nivel de BD (mismo principio que numeroOrden: una
 * orden anulada no debe bloquear el consecutivo para siempre) — se calcula
 * contando órdenes YA con código de ese tenant+año, sin importar su estado.
 */
async function generarCodigoImportacion(tenantId: string): Promise<string> {
  const anio = new Date().getUTCFullYear();
  const inicioAnio = new Date(Date.UTC(anio, 0, 1));
  const conteo = await prisma.ordenCompraIntl.count({
    where: { tenantId, createdAt: { gte: inicioAnio }, codigo: { not: null } },
  });
  const consecutivo = String(conteo + 1).padStart(3, "0");
  return `IMP-${anio}-${consecutivo}`;
}

const serializarActividad = (a: any) => ({
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

const serializarNovedad = (n: any) => ({
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

const serializarPago = (p: any) => ({
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

const serializarItem = (item: any) => ({
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
  cantidad: numero(item.cantidad),
  pesoKg: item.pesoKg !== null && item.pesoKg !== undefined ? numero(item.pesoKg) : null,
  volumenM3:
    item.volumenM3 !== null && item.volumenM3 !== undefined ? numero(item.volumenM3) : null,
  valorUnitarioFob: numero(item.valorUnitarioFob),
});

const serializarCosteo = (c: any) => ({
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
  fechaLiquidacion: c.fechaLiquidacion,
});

const serializarVistoBueno = (v: any) => ({
  id: v.id,
  entidad: v.entidad,
  numero: v.numero,
  estado: v.estado,
  fecha: v.fecha,
  archivo: v.archivoNombre
    ? { nombre: v.archivoNombre, mime: v.archivoMime, tamano: v.archivoTamano }
    : null,
});

const serializarExpediente = (e: any) => ({
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

const serializarLote = (l: any) => ({
  id: l.id,
  ordenCompraId: l.ordenCompraId,
  blAwb: l.blAwb,
  contenedor: l.contenedor,
  precinto: l.precinto,
  puertoOrigen: l.puertoOrigen,
  puertoDestino: l.puertoDestino,
  naviera: l.naviera,
  fechaEmbarque: l.fechaEmbarque,
  fechaLlegadaEstimada: l.fechaLlegadaEstimada,
  fechaLlegadaReal: l.fechaLlegadaReal,
  estado: l.estado,
  expediente: l.expediente ? serializarExpediente(l.expediente) : null,
  costeos: (l.costeos ?? []).map(serializarCosteo),
});

const serializarOrden = (o: any) => ({
  id: o.id,
  codigo: o.codigo ?? `IMP-${o.id.slice(0, 8)}`, // fallback legible para órdenes anteriores a esta migración
  numeroOrden: o.numeroOrden,
  incoterm: o.incoterm,
  proveedorExtranjero: o.proveedorExtranjero,
  paisOrigen: o.paisOrigen,
  moneda: o.moneda,
  trmPactada: numero(o.trmPactada),
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
  historial: (o.historial ?? []).map((h: any) => ({
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
  // "Situación actual" en lenguaje de negocio — ver domain/importaciones/motor-seguimiento.ts.
  // Se calcula siempre en el servidor, nunca en frontend.
  situacionActual: calcularSituacionActual(
    (o.actividades ?? []).map(aParaSeguimiento),
    new Date(),
  ),
});

function aParaSeguimiento(a: any): ActividadSeguimiento {
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
  items: { include: { subpartida: true } },
  lotes: {
    include: {
      expediente: { include: { vistosBuenos: true } },
      costeos: { orderBy: { fechaLiquidacion: "desc" as const } },
    },
  },
  historial: { orderBy: { createdAt: "asc" as const } },
  actividades: { orderBy: { fechaLimite: "asc" as const } },
  novedades: { orderBy: { createdAt: "desc" as const } },
  pagos: { orderBy: { fechaVencimiento: "asc" as const } },
};

export const listarOrdenesCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { estado, search } = req.query;

    const where: any = { tenantId, eliminado: false };
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
 */
async function sincronizarNovedadesAutomaticas(tenantId: string, ordenCompraId: string) {
  const [actividades, novedadesAutomaticasAbiertas] = await Promise.all([
    prisma.importacionActividad.findMany({ where: { ordenCompraId } }),
    prisma.importacionNovedad.findMany({
      where: { ordenCompraId, automatica: true, estado: { not: "Resuelta" } },
    }),
  ]);

  const sugeridas = generarNovedadesSugeridas(actividades.map(aParaSeguimiento), new Date());
  const reglasSugeridas = new Set(sugeridas.map((s) => s.reglaOrigen));
  const reglasExistentes = new Set(novedadesAutomaticasAbiertas.map((n) => n.reglaOrigen));

  const operaciones = [];

  for (const s of sugeridas) {
    if (reglasExistentes.has(s.reglaOrigen)) continue; // ya existe abierta, no se duplica
    operaciones.push(
      prisma.importacionNovedad.create({
        data: {
          tenantId,
          ordenCompraId,
          tipo: s.tipo,
          descripcion: s.descripcion,
          origen: s.origen,
          responsable: s.responsable,
          prioridad: s.prioridad,
          fechaLimite: s.fechaLimite,
          accionRequerida: s.accionRequerida,
          automatica: true,
          reglaOrigen: s.reglaOrigen,
          creadoPorNombre: "Sistema",
        },
      }),
    );
  }

  for (const n of novedadesAutomaticasAbiertas) {
    if (n.reglaOrigen && !reglasSugeridas.has(n.reglaOrigen)) {
      operaciones.push(
        prisma.importacionNovedad.update({
          where: { id: n.id },
          data: {
            estado: "Resuelta",
            fechaResolucion: new Date(),
            responsableResolucionNombre: "Sistema (condición resuelta)",
          },
        }),
      );
    }
  }

  if (operaciones.length > 0) await prisma.$transaction(operaciones);
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
    const {
      numeroOrden,
      incoterm,
      proveedorExtranjero,
      paisOrigen,
      moneda,
      trmPactada,
      observaciones,
      items,
    } = req.body;

    if (!INCOTERMS_VALIDOS.includes(incoterm)) {
      return res.status(400).json({
        message: `Incoterm inválido. Valores permitidos: ${INCOTERMS_VALIDOS.join(", ")}.`,
      });
    }
    if (!MONEDAS_VALIDAS.includes(moneda)) {
      return res
        .status(400)
        .json({ message: `Moneda inválida. Valores permitidos: ${MONEDAS_VALIDAS.join(", ")}.` });
    }
    const trm = numero(trmPactada);
    if (!Number.isFinite(trm) || trm <= 0) {
      return res.status(400).json({ message: "La TRM pactada debe ser un número mayor a cero." });
    }

    // Solo las órdenes activas cuentan para la unicidad del número: una orden
    // eliminada (soft-delete) no debe bloquear para siempre volver a usarlo.
    const existente = await prisma.ordenCompraIntl.findFirst({
      where: { tenantId, numeroOrden, eliminado: false },
    });
    if (existente) {
      return res
        .status(409)
        .json({ message: `Ya existe una orden activa con el número "${numeroOrden}".` });
    }

    for (const item of items) {
      calcularCantidadValida(numero(item.cantidad), item.descripcion);
    }

    const subpartidaIds = [
      ...new Set(items.map((i: any) => i.subpartidaArancelariaId).filter(Boolean)),
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

    const codigo = await generarCodigoImportacion(tenantId);

    const orden = await prisma.ordenCompraIntl.create({
      data: {
        tenantId,
        codigo,
        numeroOrden,
        incoterm,
        proveedorExtranjero,
        paisOrigen,
        moneda,
        trmPactada: trm,
        valorEstimadoTotal,
        observaciones: observaciones ?? null,
        responsableId: req.user!.id,
        items: {
          create: items.map((item: any) => ({
            descripcion: item.descripcion,
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

    return res.status(201).json(serializarOrden(orden));
  } catch (error) {
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
    } = req.body;

    const lote = await prisma.loteImportacion.create({
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
      },
    });

    await prisma.$transaction([
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: orden.id,
          actor: req.user!.nombre,
          accion: "Lote registrado",
          detalle: `BL/AWB ${blAwb}`,
          etapa: "Embarque",
        },
      }),
      // Actividades sembradas por defecto al nacer el lote — plantilla
      // mínima del proceso de embarque; el usuario puede agregar más a
      // mano si el caso lo requiere (ver crearActividad).
      prisma.importacionActividad.createMany({
        data: [
          {
            tenantId,
            ordenCompraId: orden.id,
            loteId: lote.id,
            nombre: "Enviar documentos de embarque",
            etapa: "Documentación",
            responsableTipo: "Proveedor",
            fechaLimite: fechaEmbarque ? new Date(fechaEmbarque) : null,
          },
          {
            tenantId,
            ordenCompraId: orden.id,
            loteId: lote.id,
            nombre: "Confirmar arribo del embarque",
            etapa: "Tránsito",
            responsableTipo: "Naviera",
            fechaLimite: fechaLlegadaEstimada ? new Date(fechaLlegadaEstimada) : null,
          },
        ],
      }),
      ...(orden.estado === "Borrador"
        ? [prisma.ordenCompraIntl.update({ where: { id: orden.id }, data: { estado: "Confirmada" } })]
        : []),
    ]);

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

    const lote = await prisma.loteImportacion.findFirst({ where: { id: req.params.id, tenantId } });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (!ESTADOS_TRANSITO_MANUAL.includes(lote.estado)) {
      return res.status(400).json({
        message: `El lote ya está en estado "${lote.estado}" y no puede volver a tránsito manual.`,
      });
    }

    const actualizado = await prisma.loteImportacion.update({
      where: { id: lote.id },
      data: { estado },
    });

    await prisma.importacionHistorial.create({
      data: {
        ordenCompraId: lote.ordenCompraId,
        actor: req.user!.nombre,
        accion: "Cambio de estado de tránsito",
        detalle: `${lote.estado} → ${estado}`,
      },
    });

    return res.json(serializarLote(actualizado));
  } catch (error) {
    console.error("Error al actualizar estado del lote:", error);
    return res.status(500).json({ message: "Error al actualizar el estado del lote." });
  }
};

/**
 * Ingreso físico a planta antes de la factura/liquidación final. Genera un
 * costeo PROVISIONAL por ítem (FOB * TRM pactada, sin arancel/flete/
 * agenciamiento porque aún no se conocen) para que el inventario tenga un
 * costo de referencia inmediato; liquidarCosteoImportacion agrega después la
 * fila definitiva sin borrar esta.
 */
export const recibirPreCompraPlanta = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { include: { items: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
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

    await prisma.$transaction([
      prisma.loteImportacion.update({
        where: { id: lote.id },
        data: {
          estado: "Liberado pre-compra",
          fechaLlegadaReal: lote.fechaLlegadaReal ?? new Date(),
        },
      }),
      prisma.costeoImportacionDetalle.createMany({ data: costeosProvisionales }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: "Recibido en planta (pre-compra)",
          detalle: `Lote ${lote.blAwb}: costeo provisional generado para ${costeosProvisionales.length} ítem(s).`,
        },
      }),
    ]);

    const actualizado = await prisma.loteImportacion.findUnique({
      where: { id: lote.id },
      include: { expediente: { include: { vistosBuenos: true } }, costeos: true },
    });

    return res.json(serializarLote(actualizado));
  } catch (error) {
    console.error("Error al recibir pre-compra en planta:", error);
    return res.status(500).json({ message: "Error al registrar el ingreso a planta." });
  }
};

/**
 * Liquidación definitiva del landed cost (NIC 2), prorrateada por ítem según
 * su participación en el valor FOB del lote. Registra además la diferencia
 * en cambio (NIC 21) entre la TRM pactada en la orden y la TRM real de
 * nacionalización. No borra el costeo provisional: agrega la fila definitiva
 * (esProvisional=false) para conservar la trazabilidad de la estimación.
 */
export const liquidarCosteoImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { include: { items: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (!ESTADOS_LOTE_LIQUIDABLES.includes(lote.estado)) {
      return res.status(400).json({
        message: `No se puede liquidar un lote en estado "${lote.estado}". Debe estar en: ${ESTADOS_LOTE_LIQUIDABLES.join(", ")}.`,
      });
    }

    const items = lote.ordenCompra.items;
    if (items.length === 0) {
      return res.status(400).json({ message: "La orden no tiene ítems para liquidar." });
    }

    const {
      trmLiquidacion,
      valorCifTotalUsd,
      arancelTotalCop,
      ivaTotalCop,
      ivaDescontableCop,
      fletesNacionalesCop,
      agenciamientoCop,
      otrosCostosCop,
    } = req.body;

    const trmLiq = numero(trmLiquidacion);
    const trmPactada = numero(lote.ordenCompra.trmPactada);
    const sumFobUsd = items.reduce(
      (acc, item) => acc + numero(item.cantidad) * numero(item.valorUnitarioFob),
      0,
    );
    if (sumFobUsd <= 0) {
      return res.status(400).json({
        message: "El valor FOB total de la orden debe ser mayor a cero para prorratear costos.",
      });
    }

    const totalIvaDescontable = numero(ivaDescontableCop);
    const totalFletes = numero(fletesNacionalesCop);
    const totalAgenciamiento = numero(agenciamientoCop);
    const totalOtros = numero(otrosCostosCop);
    const totalArancel = numero(arancelTotalCop);
    const totalIva = numero(ivaTotalCop);
    const totalCif = numero(valorCifTotalUsd);

    const costeosDefinitivos = items.map((item) => {
      const cantidad = numero(item.cantidad);
      const fobUsdItem = cantidad * numero(item.valorUnitarioFob);
      const participacion = fobUsdItem / sumFobUsd;

      const valorCifUsd = totalCif * participacion;
      const valorCifCop = valorCifUsd * trmLiq;
      const arancelCop = totalArancel * participacion;
      const ivaTotalCopItem = totalIva * participacion;
      const ivaDescontableCopItem = totalIvaDescontable * participacion;
      const ivaCapitalizableCop = ivaTotalCopItem - ivaDescontableCopItem;
      const fletesNacionalesCopItem = totalFletes * participacion;
      const agenciamientoCopItem = totalAgenciamiento * participacion;
      const otrosCostosCopItem = totalOtros * participacion;
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
        liquidadoPorId: req.user!.id,
      };
    });

    await prisma.$transaction([
      prisma.costeoImportacionDetalle.createMany({ data: costeosDefinitivos }),
      prisma.loteImportacion.update({ where: { id: lote.id }, data: { estado: "Nacionalizado" } }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: "Costeo de importación liquidado",
          detalle: `Lote ${lote.blAwb}: costo total landed $${costeosDefinitivos
            .reduce((acc, c) => acc + c.costoTotalCop, 0)
            .toLocaleString("es-CO")}`,
        },
      }),
    ]);

    const actualizado = await prisma.loteImportacion.findUnique({
      where: { id: lote.id },
      include: {
        expediente: { include: { vistosBuenos: true } },
        costeos: { orderBy: { fechaLiquidacion: "desc" } },
      },
    });

    return res.json(serializarLote(actualizado));
  } catch (error) {
    console.error("Error al liquidar costeo de importación:", error);
    return res.status(500).json({ message: "Error al liquidar el costeo de importación." });
  }
};

export const anularOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { id: req.params.id, tenantId, eliminado: false },
    });
    if (!orden)
      return res.status(404).json({ message: "Orden de compra internacional no encontrada." });

    await prisma.ordenCompraIntl.update({
      where: { id: orden.id },
      data: { estado: "Anulada", eliminado: true },
    });
    await prisma.importacionHistorial.create({
      data: { ordenCompraId: orden.id, actor: req.user!.nombre, accion: "Orden anulada" },
    });

    return res.status(204).send();
  } catch (error) {
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
    const lote = await prisma.loteImportacion.findFirst({ where: { id: req.params.id, tenantId } });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });

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
    const archivo = (req as any).file as Express.Multer.File | undefined;

    if (!campos) {
      if (archivo) fs.unlink(archivo.path, () => {});
      return res.status(400).json({
        message: `Tipo de documento inválido. Usa: ${Object.keys(TIPOS_DOCUMENTO_EXPEDIENTE).join(", ")}.`,
      });
    }
    if (!archivo) {
      return res.status(400).json({ message: "No se recibió ningún archivo." });
    }

    const lote = await prisma.loteImportacion.findFirst({ where: { id: req.params.id, tenantId } });
    if (!lote) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Lote de importación no encontrado." });
    }

    const expedienteActual = await prisma.expedienteAduanero.findUnique({
      where: { loteId: lote.id },
    });
    const rutaAnterior = expedienteActual ? (expedienteActual as any)[campos.ruta] : null;

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
    const ruta = expediente ? (expediente as any)[campos.ruta] : null;
    if (!expediente || !ruta) {
      return res
        .status(404)
        .json({ message: `Este lote no tiene un documento de ${campos.etiqueta} adjunto.` });
    }

    const rutaAbsoluta = path.join(UPLOADS_DIR_EXPEDIENTES, ruta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    const nombre = (expediente as any)[campos.nombre];
    const mime = (expediente as any)[campos.mime];
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

    const lote = await prisma.loteImportacion.findFirst({ where: { id: req.params.id, tenantId } });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });

    const expediente = await prisma.expedienteAduanero.findUnique({ where: { loteId: lote.id } });
    const ruta = expediente ? (expediente as any)[campos.ruta] : null;
    if (!expediente || !ruta) {
      return res
        .status(404)
        .json({ message: `Este lote no tiene un documento de ${campos.etiqueta} adjunto.` });
    }

    fs.unlink(path.join(UPLOADS_DIR_EXPEDIENTES, ruta), () => {});

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
    const lote = await prisma.loteImportacion.findFirst({ where: { id: req.params.id, tenantId } });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });

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
      include: { expediente: { include: { lote: true } } },
    });
    if (!vistoBueno) return res.status(404).json({ message: "Visto bueno no encontrado." });

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
    const archivo = (req as any).file as Express.Multer.File | undefined;
    if (!archivo) return res.status(400).json({ message: "No se recibió ningún archivo." });

    const vistoBueno = await prisma.vistoBuenoAduanero.findFirst({
      where: { id: req.params.id, expediente: { tenantId } },
      include: { expediente: { include: { lote: true } } },
    });
    if (!vistoBueno) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Visto bueno no encontrado." });
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
    });
    if (!vistoBueno || !vistoBueno.archivoRuta) {
      return res.status(404).json({ message: "Este visto bueno no tiene un documento adjunto." });
    }

    const rutaAbsoluta = path.join(UPLOADS_DIR_VISTOS_BUENOS, vistoBueno.archivoRuta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

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

    const { nombre, etapa, responsableTipo, responsableNombre, fechaPlanificada, fechaLimite, loteId, dependeDeId } =
      req.body;

    if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
      return res.status(400).json({ message: "El nombre de la actividad es obligatorio." });
    }
    if (!ETAPAS_VALIDAS.includes(etapa)) {
      return res.status(400).json({ message: `Etapa inválida. Valores permitidos: ${ETAPAS_VALIDAS.join(", ")}.` });
    }
    if (!RESPONSABLE_TIPOS_VALIDOS.includes(responsableTipo)) {
      return res.status(400).json({
        message: `Tipo de responsable inválido. Valores permitidos: ${RESPONSABLE_TIPOS_VALIDOS.join(", ")}.`,
      });
    }
    if (loteId) {
      const lote = await prisma.loteImportacion.findFirst({ where: { id: loteId, tenantId, ordenCompraId: orden.id } });
      if (!lote) return res.status(404).json({ message: "El lote indicado no existe en esta orden." });
    }
    if (dependeDeId) {
      const dependencia = await prisma.importacionActividad.findFirst({
        where: { id: dependeDeId, tenantId, ordenCompraId: orden.id },
      });
      if (!dependencia)
        return res.status(404).json({ message: "La actividad de la que depende no existe en esta orden." });
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

    const { tipo, descripcion, origen, responsable, prioridad, impacto, fechaLimite, accionRequerida } = req.body;

    if (!TIPOS_NOVEDAD_VALIDOS.includes(tipo)) {
      return res.status(400).json({ message: `Tipo de novedad inválido. Valores permitidos: ${TIPOS_NOVEDAD_VALIDOS.join(", ")}.` });
    }
    if (!descripcion || typeof descripcion !== "string" || !descripcion.trim()) {
      return res.status(400).json({ message: "La descripción de la novedad es obligatoria." });
    }
    const origenFinal = origen && ORIGENES_NOVEDAD_VALIDOS.includes(origen) ? origen : "PorDeterminar";
    const prioridadFinal =
      prioridad && PRIORIDADES_NOVEDAD_VALIDAS.includes(prioridad) ? prioridad : "Media";

    const novedad = await prisma.importacionNovedad.create({
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
    });

    await prisma.importacionHistorial.create({
      data: {
        ordenCompraId: orden.id,
        actor: req.user!.nombre,
        accion: `Novedad registrada: ${tipo}`,
        detalle: descripcion.trim(),
        origen: "Manual",
      },
    });

    return res.status(201).json(serializarNovedad(novedad));
  } catch (error) {
    console.error("Error al crear novedad de importación:", error);
    return res.status(500).json({ message: "Error al registrar la novedad." });
  }
};

export const resolverNovedadImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const novedad = await prisma.importacionNovedad.findFirst({ where: { id: req.params.id, tenantId } });
    if (!novedad) return res.status(404).json({ message: "Novedad no encontrada." });
    if (novedad.estado === "Resuelta") {
      return res.status(400).json({ message: "Esta novedad ya está resuelta." });
    }

    const { comentario } = req.body;

    const [actualizada] = await prisma.$transaction([
      prisma.importacionNovedad.update({
        where: { id: novedad.id },
        data: {
          estado: "Resuelta",
          fechaResolucion: new Date(),
          responsableResolucionId: req.user!.id,
          responsableResolucionNombre: req.user!.nombre,
        },
      }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: novedad.ordenCompraId,
          actor: req.user!.nombre,
          accion: `Novedad resuelta: ${novedad.tipo}`,
          detalle: comentario || null,
          origen: "Manual",
        },
      }),
    ]);

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
      return res.status(400).json({ message: "El valor del pago debe ser un número mayor a cero." });
    }

    const pago = await prisma.importacionPago.create({
      data: {
        tenantId,
        ordenCompraId: orden.id,
        concepto: concepto.trim(),
        valor: valorNum,
        moneda: typeof moneda === "string" && moneda.trim() ? moneda.trim() : "COP",
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
        responsableId: req.user!.id,
        responsableNombre: req.user!.nombre,
        observaciones: observaciones?.trim() || null,
      },
    });

    await prisma.importacionHistorial.create({
      data: {
        ordenCompraId: orden.id,
        actor: req.user!.nombre,
        accion: `Obligación registrada: ${concepto}`,
        detalle: `$${valorNum.toLocaleString("es-CO")} ${pago.moneda}`,
        etapa: "Pagos",
      },
    });

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
      return res.status(400).json({ message: `Estado inválido. Valores permitidos: ${ESTADOS_PAGO_VALIDOS.join(", ")}.` });
    }
    if (pago.estado === "Anulado") {
      return res.status(400).json({ message: "Este pago ya está anulado." });
    }

    const [actualizado] = await prisma.$transaction([
      prisma.importacionPago.update({
        where: { id: pago.id },
        data: {
          estado,
          fechaPago: estado === "Pagado" ? new Date() : pago.fechaPago,
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
      return res.status(400).json({ message: "Cerrar sin cumplir las condiciones requiere una justificación." });
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

    return res.json(serializarOrden(actualizada));
  } catch (error) {
    console.error("Error al cerrar orden de compra internacional:", error);
    return res.status(500).json({ message: "Error al cerrar la orden de compra internacional." });
  }
};
