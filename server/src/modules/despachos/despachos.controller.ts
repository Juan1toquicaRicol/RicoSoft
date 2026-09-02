import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import {
  leerHistoricoVentasSiesa,
  contarHistoricoVentasSiesa,
  leerDocumentoVentaPorIdSiesa,
  leerLineasDocumentoVentaSiesa,
} from "../integraciones-siesa/siesa-ventas.service";
import {
  esTransicionValidaDespacho,
  camposRequeridosParaTransicion,
  type EstadoDespacho,
} from "../../lib/despachos";
import { notificarPorPermiso } from "../../lib/notificaciones";
import {
  crearDespachoSchema,
  actualizarEstadoDespachoSchema,
  actualizarLineaDespachoSchema,
  crearNovedadSchema,
  resolverNovedadSchema,
  listarDespachosSchema,
  documentosVentaParaDespachoSchema,
} from "./despachos.schemas";

async function resolverCiaSiesa(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { siesaCiaId: true } });
  return tenant?.siesaCiaId ?? null;
}

/**
 * Busca el despacho por id verificando que pertenezca al tenant
 * autenticado — req.tenantPrisma ya lo filtra (Despacho está en
 * MODELOS_TENANT_SCOPED), pero se re-confirma explícitamente antes de
 * tocar sus líneas/novedades (que NO tienen tenantId propio, se aíslan vía
 * esta relación — mismo patrón documentado en lib/tenant-prisma.ts para
 * TomaFisicaLinea).
 */
async function buscarDespachoDelTenant(req: AuthenticatedRequest, id: string) {
  return req.tenantPrisma!.despacho.findUnique({ where: { id } });
}

/**
 * Documentos de venta reales de Siesa disponibles para originar un
 * despacho — reutiliza tal cual leerHistoricoVentasSiesa/
 * contarHistoricoVentasSiesa (ya paginado, ya con búsqueda), el mismo
 * motor que usa el histórico de Analítica. Ventana de 90 días: un despacho
 * se crea sobre una venta reciente, no sobre el histórico completo.
 */
export const listarDocumentosVentaParaDespacho = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = documentosVentaParaDespachoSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({ disponible: false, motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada." });
  }

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 90 * 24 * 60 * 60 * 1000);
  const filtros = { ciaId: siesaCiaId, desde, hasta, search: parseo.data.search };

  try {
    const [items, total] = await Promise.all([
      leerHistoricoVentasSiesa(filtros, parseo.data.page, parseo.data.pageSize),
      contarHistoricoVentasSiesa(filtros),
    ]);
    return res.json({ disponible: true, items, page: parseo.data.page, pageSize: parseo.data.pageSize, total });
  } catch (error) {
    console.error("Error al leer documentos de venta desde Siesa:", error);
    return res.json({ disponible: false, motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde." });
  }
};

/**
 * Crea un despacho a partir de un documento de venta REAL de Siesa —
 * cliente y líneas se congelan como snapshot (mismo patrón que TomaFisica
 * con la existencia): no son una relación viva a Siesa, así que si el
 * documento cambia después en Siesa, este despacho conserva el contexto
 * real del momento en que se creó. RicoSoft nunca escribe de vuelta a
 * Siesa — crear un despacho no modifica el documento de venta original.
 */
export const crearDespacho = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = crearDespachoSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.status(400).json({ message: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada." });
  }

  let doc, lineas;
  try {
    [doc, lineas] = await Promise.all([
      leerDocumentoVentaPorIdSiesa(siesaCiaId, parseo.data.siesaDocRowId),
      leerLineasDocumentoVentaSiesa(siesaCiaId, parseo.data.siesaDocRowId),
    ]);
  } catch (error) {
    console.error("Error al leer el documento de venta desde Siesa:", error);
    return res.status(502).json({ message: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde." });
  }
  if (!doc) {
    return res.status(404).json({ message: "El documento de venta indicado no existe en Siesa para este tenant." });
  }
  if (lineas.length === 0) {
    return res.status(400).json({ message: "El documento de venta no tiene líneas de producto — no se puede crear un despacho vacío." });
  }

  const yaExiste = await req.tenantPrisma!.despacho.findFirst({ where: { siesaDocRowId: doc.id } });
  if (yaExiste) {
    return res.status(409).json({ message: `Ya existe un despacho para el documento ${doc.referencia ?? doc.id}.` });
  }

  const despacho = await req.tenantPrisma!.despacho.create({
    data: {
      tenantId,
      siesaDocRowId: doc.id,
      siesaDocReferencia: doc.referencia,
      clienteNombre: doc.clienteNombre ?? "Cliente sin nombre",
      clienteNit: doc.clienteNit,
      direccionEntrega: parseo.data.direccionEntrega ?? null,
      contactoEntrega: parseo.data.contactoEntrega ?? null,
      telefonoContacto: parseo.data.telefonoContacto ?? null,
      bodegaRowId: parseo.data.bodegaRowId ?? null,
      bodegaNombre: parseo.data.bodegaNombre ?? null,
      valorPedido: doc.neto,
      fechaEntregaEstimada: parseo.data.fechaEntregaEstimada ?? null,
      responsableId: req.user!.id,
      responsable: req.user!.nombre,
      lineas: {
        create: lineas.map((l) => ({
          itemRowId: l.itemRowId,
          descripcion: l.descripcion,
          referencia: l.referencia,
          unidadMedida: l.unidadMedida,
          cantidadSolicitada: l.cantidad,
        })),
      },
    },
    include: { _count: { select: { lineas: true } } },
  });

  await prisma.auditoria.create({
    data: {
      tenantId,
      usuarioId: req.user!.id,
      accion: "PEDIDO_RECIBIDO",
      detalle: `Despacho creado desde el documento de venta ${doc.referencia ?? doc.id} (${doc.clienteNombre ?? "cliente sin nombre"}).`,
      entidadTipo: "Despacho",
      entidadId: despacho.id,
      datosNuevos: JSON.stringify({ estado: "RECIBIDO" }),
    },
  });

  return res.status(201).json(despacho);
};

/** Lista despachos del tenant, paginado y filtrable — nunca descarga el histórico completo. */
export const listarDespachos = async (req: AuthenticatedRequest, res: Response) => {
  const parseo = listarDespachosSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const { page, pageSize, estado, clienteSearch, bodegaRowId, conductorSearch, desde, hasta } = parseo.data;

  const where: Record<string, unknown> = {};
  if (estado) where.estado = estado;
  if (bodegaRowId !== undefined) where.bodegaRowId = bodegaRowId;
  if (clienteSearch) where.clienteNombre = { contains: clienteSearch };
  if (conductorSearch) where.conductorNombre = { contains: conductorSearch };
  if (desde || hasta) {
    where.createdAt = {
      ...(desde ? { gte: desde } : {}),
      ...(hasta ? { lte: hasta } : {}),
    };
  }

  const [items, total] = await Promise.all([
    req.tenantPrisma!.despacho.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { lineas: true, novedades: true } } },
    }),
    req.tenantPrisma!.despacho.count({ where }),
  ]);

  return res.json({ items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
};

/** Conteo por estado — para los indicadores clicables del listado (Sección 4). */
export const obtenerResumenDespachos = async (req: AuthenticatedRequest, res: Response) => {
  const conteos = await req.tenantPrisma!.despacho.groupBy({
    by: ["estado"],
    _count: { _all: true },
  });
  const porEstado: Record<string, number> = {};
  for (const c of conteos) porEstado[c.estado] = c._count._all;
  return res.json({ porEstado });
};

/**
 * Detalle de un despacho: cabecera + líneas + línea de tiempo. La línea de
 * tiempo REUTILIZA el modelo Auditoria existente (entidadTipo="Despacho")
 * en vez de una tabla de eventos paralela — mismo mecanismo de
 * trazabilidad que ya usa el resto del sistema.
 */
export const obtenerDespacho = async (req: AuthenticatedRequest, res: Response) => {
  const despacho = await buscarDespachoDelTenant(req, req.params.id);
  if (!despacho) return res.status(404).json({ message: "Despacho no encontrado." });

  const [lineas, novedades, eventos] = await Promise.all([
    prisma.despachoLinea.findMany({ where: { despachoId: despacho.id }, orderBy: { descripcion: "asc" } }),
    prisma.despachoNovedad.findMany({ where: { despachoId: despacho.id }, orderBy: { createdAt: "desc" } }),
    prisma.auditoria.findMany({
      where: { tenantId: req.user!.tenantId, entidadTipo: "Despacho", entidadId: despacho.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, accion: true, detalle: true, datosAnteriores: true, datosNuevos: true, usuarioAfectado: true, createdAt: true, usuarioId: true },
    }),
  ]);

  return res.json({ despacho, lineas, novedades, eventos });
};

/**
 * Avanza el estado logístico — valida la transición (lib/despachos.ts) y
 * que vengan los campos que esa transición exige (ej. no se puede
 * "CARGANDO" sin vehículo/conductor) ANTES de escribir nada. Transaccional:
 * actualización + evento de auditoría en una sola operación de base de
 * datos (Sección 26).
 */
export const actualizarEstadoDespacho = async (req: AuthenticatedRequest, res: Response) => {
  const despacho = await buscarDespachoDelTenant(req, req.params.id);
  if (!despacho) return res.status(404).json({ message: "Despacho no encontrado." });

  const parseo = actualizarEstadoDespachoSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const actual = despacho.estado as EstadoDespacho;
  const siguiente = parseo.data.estado;
  if (!esTransicionValidaDespacho(actual, siguiente)) {
    return res.status(400).json({ message: `No se puede pasar de "${actual}" a "${siguiente}".` });
  }

  const camposRequeridos = camposRequeridosParaTransicion(siguiente);
  const datosEntrada = parseo.data as Record<string, unknown>;
  const faltantes = camposRequeridos.filter((campo) => {
    if (campo === "fechaDespacho") return false; // se genera automáticamente al despachar
    return !datosEntrada[campo];
  });
  if (faltantes.length > 0) {
    return res.status(400).json({
      message: `Para pasar a "${siguiente}" hace falta: ${faltantes.join(", ")}.`,
    });
  }

  const ahora = new Date();
  const dataActualizacion: Record<string, unknown> = { estado: siguiente };
  if (parseo.data.vehiculoPlaca !== undefined) dataActualizacion.vehiculoPlaca = parseo.data.vehiculoPlaca;
  if (parseo.data.vehiculoTipo !== undefined) dataActualizacion.vehiculoTipo = parseo.data.vehiculoTipo;
  if (parseo.data.conductorNombre !== undefined) dataActualizacion.conductorNombre = parseo.data.conductorNombre;
  if (parseo.data.conductorTelefono !== undefined) dataActualizacion.conductorTelefono = parseo.data.conductorTelefono;
  if (parseo.data.recibidoPor !== undefined) dataActualizacion.recibidoPor = parseo.data.recibidoPor;
  if (siguiente === "CARGANDO") dataActualizacion.fechaCargue = ahora;
  if (siguiente === "DESPACHADO") dataActualizacion.fechaDespacho = ahora;
  if (siguiente === "ENTREGADO" || siguiente === "ENTREGA_PARCIAL") dataActualizacion.fechaEntregaReal = ahora;

  const [actualizado] = await prisma.$transaction([
    prisma.despacho.update({ where: { id: despacho.id }, data: dataActualizacion }),
    prisma.auditoria.create({
      data: {
        tenantId: req.user!.tenantId,
        usuarioId: req.user!.id,
        accion: `ESTADO_${siguiente}`,
        detalle: parseo.data.observacion ?? `Estado cambiado de ${actual} a ${siguiente}.`,
        entidadTipo: "Despacho",
        entidadId: despacho.id,
        datosAnteriores: JSON.stringify({ estado: actual }),
        datosNuevos: JSON.stringify({ estado: siguiente }),
      },
    }),
  ]);

  if (siguiente === "DESPACHADO" || siguiente === "ENTREGADO") {
    await notificarPorPermiso(
      req.user!.tenantId,
      "despachos.ver",
      {
        tipo: "despacho",
        titulo: siguiente === "DESPACHADO" ? "Despacho en camino" : "Despacho entregado",
        mensaje: `El despacho de "${despacho.clienteNombre}" (${despacho.siesaDocReferencia ?? despacho.siesaDocRowId}) pasó a ${siguiente}.`,
        enlace: `/despachos/${despacho.id}`,
      },
      { excluirUsuarioId: req.user!.id },
    );
  }

  return res.json(actualizado);
};

/** Registra avance de preparación/despacho/entrega de una línea concreta. */
export const actualizarLineaDespacho = async (req: AuthenticatedRequest, res: Response) => {
  const despacho = await buscarDespachoDelTenant(req, req.params.id);
  if (!despacho) return res.status(404).json({ message: "Despacho no encontrado." });

  const parseo = actualizarLineaDespachoSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const linea = await prisma.despachoLinea.findFirst({ where: { id: req.params.lineaId, despachoId: despacho.id } });
  if (!linea) return res.status(404).json({ message: "Línea no encontrada en este despacho." });

  const actualizada = await prisma.despachoLinea.update({
    where: { id: linea.id },
    data: parseo.data,
  });

  return res.json(actualizada);
};

/** Registra una novedad — no cambia el estado automáticamente (ver lib/despachos.ts). */
export const crearNovedad = async (req: AuthenticatedRequest, res: Response) => {
  const despacho = await buscarDespachoDelTenant(req, req.params.id);
  if (!despacho) return res.status(404).json({ message: "Despacho no encontrado." });

  const parseo = crearNovedadSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const novedad = await prisma.despachoNovedad.create({
    data: {
      despachoId: despacho.id,
      tipo: parseo.data.tipo,
      descripcion: parseo.data.descripcion,
      usuarioId: req.user!.id,
      usuario: req.user!.nombre,
    },
  });

  await prisma.auditoria.create({
    data: {
      tenantId: req.user!.tenantId,
      usuarioId: req.user!.id,
      accion: "NOVEDAD_REGISTRADA",
      detalle: `${parseo.data.tipo}: ${parseo.data.descripcion}`,
      entidadTipo: "Despacho",
      entidadId: despacho.id,
    },
  });

  await notificarPorPermiso(
    req.user!.tenantId,
    "despachos.gestionar",
    {
      tipo: "despacho_novedad",
      titulo: "Novedad en despacho",
      mensaje: `${despacho.clienteNombre}: ${parseo.data.tipo} — ${parseo.data.descripcion}`,
      enlace: `/despachos/${despacho.id}`,
    },
    { excluirUsuarioId: req.user!.id },
  );

  return res.status(201).json(novedad);
};

/** Marca una novedad como resuelta. */
export const resolverNovedad = async (req: AuthenticatedRequest, res: Response) => {
  const despacho = await buscarDespachoDelTenant(req, req.params.id);
  if (!despacho) return res.status(404).json({ message: "Despacho no encontrado." });

  const parseo = resolverNovedadSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const novedad = await prisma.despachoNovedad.findFirst({
    where: { id: req.params.novedadId, despachoId: despacho.id },
  });
  if (!novedad) return res.status(404).json({ message: "Novedad no encontrada en este despacho." });
  if (novedad.estado === "RESUELTA") {
    return res.status(400).json({ message: "Esta novedad ya está resuelta." });
  }

  const actualizada = await prisma.despachoNovedad.update({
    where: { id: novedad.id },
    data: {
      estado: "RESUELTA",
      resueltaPorId: req.user!.id,
      resueltaPor: req.user!.nombre,
      fechaResolucion: new Date(),
      observacionResolucion: parseo.data.observacionResolucion ?? null,
    },
  });

  // R-C-08 (auditoría de Comercial, 2026-09-02): crearNovedad ya deja
  // rastro; resolverla también debe quedar en la línea de tiempo del
  // despacho, con el mismo patrón entidadTipo/entidadId/datosAnteriores/
  // datosNuevos usado en actualizarEstadoDespacho.
  await prisma.auditoria.create({
    data: {
      tenantId: req.user!.tenantId,
      usuarioId: req.user!.id,
      accion: "NOVEDAD_RESUELTA",
      detalle: parseo.data.observacionResolucion ?? `Novedad "${novedad.tipo}" marcada como resuelta.`,
      entidadTipo: "Despacho",
      entidadId: despacho.id,
      datosAnteriores: JSON.stringify({ novedadId: novedad.id, estado: novedad.estado }),
      datosNuevos: JSON.stringify({ novedadId: novedad.id, estado: "RESUELTA" }),
    },
  });

  return res.json(actualizada);
};
