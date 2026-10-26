import { Response } from "express";
import { Prisma } from "@prisma/client";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import { calcularTotalesComercial } from "../../domain/comercial/comercial-calculo";
import {
  crearCotizacionSchema,
  actualizarCotizacionSchema,
  listarCotizacionesSchema,
  idParamSchema,
  accionConObservacionSchema,
  asignarErpCotizacionSchema,
} from "./comercial.schemas";
import {
  crearProforma as crearProformaHandler,
  resolverCiaSiesa,
} from "../proformas/proformas.controller";
import { leerCotizacionSiesa } from "../integraciones-siesa/siesa-pedidos.service";

/** Numeración propia de Cotizacion — formato visible COT-XXXXX, pero el
 * consecutivo real (numero) es un entero independiente del consecutivo de
 * Siesa (nunca se usa su rowid como PK), igual criterio que Proforma.numero. */
const PRIMER_NUMERO_COTIZACION = 1;

export function formatearNumeroCotizacion(numero: number): string {
  return `COT-${String(numero).padStart(5, "0")}`;
}

export function formatearNumeroPedido(numero: number): string {
  return `PC-${String(numero).padStart(5, "0")}`;
}

function calcularSiguienteNumero(ultimoNumero: number | null, piso: number): number {
  return Math.max(piso, (ultimoNumero ?? piso - 1) + 1);
}

export async function siguienteNumeroCotizacion(tx: Prisma.TransactionClient, tenantId: string) {
  const ultima = await tx.cotizacion.findFirst({
    where: { tenantId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return calcularSiguienteNumero(ultima?.numero ?? null, PRIMER_NUMERO_COTIZACION);
}

function esViolacionUnicidad(error: unknown, modelName: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    error.meta?.modelName === modelName
  );
}

function serializarCotizacion(c: {
  items: {
    cantidad: Prisma.Decimal;
    precioUnitario: Prisma.Decimal;
    descuentoPct: Prisma.Decimal;
    ivaPct: Prisma.Decimal;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}) {
  const items = c.items.map((it) => ({
    ...it,
    cantidad: Number(it.cantidad),
    precioUnitario: Number(it.precioUnitario),
    descuentoPct: Number(it.descuentoPct),
    ivaPct: Number(it.ivaPct),
  }));
  const totales = calcularTotalesComercial(items);
  return {
    ...c,
    numeroFormateado: formatearNumeroCotizacion(c.numero as number),
    items,
    ...totales,
  };
}

async function obtenerCotizacionCompleta(id: string, tenantId: string) {
  return prisma.cotizacion.findFirst({
    where: { id, tenantId },
    include: {
      items: { orderBy: { orden: "asc" } },
      proformas: {
        select: { id: true, numero: true, estado: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      pedidos: {
        select: { id: true, numero: true, estado: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export const listarCotizaciones = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = listarCotizacionesSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const { clienteRowId, estado, search, page, pageSize } = parseo.data;

  const where: Prisma.CotizacionWhereInput = {
    tenantId,
    ...(clienteRowId !== undefined ? { clienteRowId } : {}),
    ...(estado ? { estado } : {}),
    ...(search
      ? {
          OR: [
            { clienteNombre: { contains: search } },
            { erpNumero: { contains: search } },
            ...(Number.isFinite(Number(search.replace(/\D/g, "")))
              ? [{ numero: Number(search.replace(/\D/g, "")) || -1 }]
              : []),
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.cotizacion.findMany({
      where,
      orderBy: { numero: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.cotizacion.count({ where }),
  ]);

  return res.json({
    items: items.map((c) => ({ ...c, numeroFormateado: formatearNumeroCotizacion(c.numero) })),
    page,
    pageSize,
    total,
  });
};

export const obtenerCotizacion = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = idParamSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const cotizacion = await obtenerCotizacionCompleta(parseo.data.id, tenantId);
  if (!cotizacion) {
    return res.status(404).json({ message: "Cotización no encontrada." });
  }
  return res.json(serializarCotizacion(cotizacion));
};

export const crearCotizacion = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = crearCotizacionSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const { items, numero: numeroSolicitado, ...encabezado } = parseo.data;

  try {
    const creada = await prisma.$transaction(async (tx) => {
      const numero = numeroSolicitado ?? (await siguienteNumeroCotizacion(tx, tenantId));
      return tx.cotizacion.create({
        data: {
          tenantId,
          numero,
          ...encabezado,
          creadoPorId: req.user!.id,
          creadoPorNombre: req.user!.nombre,
          items: {
            create: items.map((it, idx) => ({
              orden: idx,
              itemRowId: it.itemRowId ?? null,
              referencia: it.referencia ?? null,
              descripcion: it.descripcion,
              bodegaRowId: it.bodegaRowId ?? null,
              bodega: it.bodega ?? null,
              unidadMedida: it.unidadMedida ?? null,
              cantidad: it.cantidad,
              precioUnitario: it.precioUnitario,
              descuentoPct: it.descuentoPct,
              ivaPct: it.ivaPct,
            })),
          },
        },
        include: { items: { orderBy: { orden: "asc" } } },
      });
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "COTIZACION_CREADA",
        detalle: `${req.user!.nombre} creó la cotización ${formatearNumeroCotizacion(creada.numero)} para ${creada.clienteNombre}.`,
        entidadTipo: "Cotizacion",
        entidadId: creada.id,
      },
    });

    return res.status(201).json(serializarCotizacion(creada));
  } catch (error) {
    if (esViolacionUnicidad(error, "Cotizacion")) {
      return res
        .status(409)
        .json({ message: `Ya existe una cotización con el número ${numeroSolicitado}.` });
    }
    console.error("Error creando la cotización:", error);
    return res.status(500).json({ message: "No fue posible crear la cotización." });
  }
};

export const actualizarCotizacion = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseoParams = idParamSchema.safeParse(req.params);
  const parseoBody = actualizarCotizacionSchema.safeParse(req.body);
  if (!parseoParams.success) {
    return res
      .status(400)
      .json({ message: parseoParams.error.errors[0]?.message ?? "Datos inválidos." });
  }
  if (!parseoBody.success) {
    return res
      .status(400)
      .json({ message: parseoBody.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const existente = await prisma.cotizacion.findFirst({
    where: { id: parseoParams.data.id, tenantId },
  });
  if (!existente) {
    return res.status(404).json({ message: "Cotización no encontrada." });
  }
  if (existente.estado !== "BORRADOR") {
    return res.status(400).json({ message: "Solo una cotización en BORRADOR puede editarse." });
  }

  const { items, numero, ...encabezado } = parseoBody.data;

  try {
    const actualizada = await prisma.$transaction(async (tx) => {
      await tx.cotizacionItem.deleteMany({ where: { cotizacionId: existente.id } });
      return tx.cotizacion.update({
        where: { id: existente.id },
        data: {
          ...encabezado,
          ...(numero !== undefined ? { numero } : {}),
          items: {
            create: items.map((it, idx) => ({
              orden: idx,
              itemRowId: it.itemRowId ?? null,
              referencia: it.referencia ?? null,
              descripcion: it.descripcion,
              bodegaRowId: it.bodegaRowId ?? null,
              bodega: it.bodega ?? null,
              unidadMedida: it.unidadMedida ?? null,
              cantidad: it.cantidad,
              precioUnitario: it.precioUnitario,
              descuentoPct: it.descuentoPct,
              ivaPct: it.ivaPct,
            })),
          },
        },
        include: { items: { orderBy: { orden: "asc" } } },
      });
    });
    return res.json(serializarCotizacion(actualizada));
  } catch (error) {
    if (esViolacionUnicidad(error, "Cotizacion")) {
      return res.status(409).json({ message: `Ya existe una cotización con el número ${numero}.` });
    }
    console.error("Error actualizando la cotización:", error);
    return res.status(500).json({ message: "No fue posible actualizar la cotización." });
  }
};

/** Transiciones de estado válidas — backend es la única fuente de verdad,
 * ver sección 5 del encargo. Máquina de estados deliberadamente simple. */
const TRANSICIONES_COTIZACION: Record<string, string[]> = {
  BORRADOR: ["ENVIADA", "ANULADA"],
  ENVIADA: ["APROBADA", "RECHAZADA", "ANULADA"],
  APROBADA: ["ANULADA"],
  RECHAZADA: ["ANULADA"],
  CONVERTIDA: [],
  ANULADA: [],
};

async function cambiarEstadoCotizacion(
  req: AuthenticatedRequest,
  res: Response,
  siguiente: string,
  accionAuditoria: string,
) {
  const tenantId = req.user!.tenantId;
  const parseoParams = idParamSchema.safeParse(req.params);
  if (!parseoParams.success) {
    return res
      .status(400)
      .json({ message: parseoParams.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const parseoBody = accionConObservacionSchema.safeParse(req.body ?? {});
  const observacion = parseoBody.success ? parseoBody.data.observacion : null;

  const existente = await prisma.cotizacion.findFirst({
    where: { id: parseoParams.data.id, tenantId },
  });
  if (!existente) {
    return res.status(404).json({ message: "Cotización no encontrada." });
  }

  const permitidas = TRANSICIONES_COTIZACION[existente.estado] ?? [];
  if (!permitidas.includes(siguiente)) {
    return res.status(400).json({
      message: `No es posible pasar la cotización de ${existente.estado} a ${siguiente}.`,
    });
  }

  const actualizada = await prisma.cotizacion.update({
    where: { id: existente.id },
    data: { estado: siguiente },
  });

  await prisma.auditoria.create({
    data: {
      tenantId,
      usuarioId: req.user!.id,
      accion: accionAuditoria,
      detalle:
        observacion ??
        `${req.user!.nombre} cambió la cotización ${formatearNumeroCotizacion(actualizada.numero)} a ${siguiente}.`,
      entidadTipo: "Cotizacion",
      entidadId: actualizada.id,
      datosAnteriores: JSON.stringify({ estado: existente.estado }),
      datosNuevos: JSON.stringify({ estado: siguiente }),
    },
  });

  return res.json({ id: actualizada.id, estado: actualizada.estado });
}

export const enviarCotizacion = (req: AuthenticatedRequest, res: Response) =>
  cambiarEstadoCotizacion(req, res, "ENVIADA", "COTIZACION_ENVIADA");

export const aprobarCotizacion = (req: AuthenticatedRequest, res: Response) =>
  cambiarEstadoCotizacion(req, res, "APROBADA", "COTIZACION_APROBADA");

export const rechazarCotizacion = (req: AuthenticatedRequest, res: Response) =>
  cambiarEstadoCotizacion(req, res, "RECHAZADA", "COTIZACION_RECHAZADA");

export const anularCotizacion = (req: AuthenticatedRequest, res: Response) =>
  cambiarEstadoCotizacion(req, res, "ANULADA", "COTIZACION_ANULADA");

/** Nombre real del índice único filtrado creado por SQL manual (migración
 * 20260923100000_cotizacion_erp_row_id_filtered_unique) — no existe como
 * @@unique en schema.prisma (ver comentario junto a los campos erp* de
 * Cotizacion). Mismo mecanismo que PedidoComercial: Prisma igualmente
 * reporta su violación como P2002 con `meta.target` = nombre del índice. */
const INDICE_UNICO_ERP_ROW_ID_COTIZACION = "Cotizacion_tenantId_erpRowId_filtered_uq";

function esViolacionIndiceUnicoErpRowId(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    String(error.meta?.target ?? "").includes(INDICE_UNICO_ERP_ROW_ID_COTIZACION)
  );
}

function respuestaVinculoErpCotizacion(c: {
  id: string;
  erpTipoDocumento: string | null;
  erpRowId: number | null;
  erpNumero: string | null;
}) {
  return {
    id: c.id,
    erpTipoDocumento: c.erpTipoDocumento,
    erpRowId: c.erpRowId,
    erpNumero: c.erpNumero,
  };
}

/** POST /comercial/cotizaciones/:id/asignar-erp — vincula a mano el
 * documento Siesa (CDV) de esta Cotización interna, para cuando el
 * adaptador automático de sincronización todavía no existe (fase futura).
 * erpRowId SIEMPRE se revalida contra Siesa antes de guardar, mismo
 * criterio que asignarDocumentoErpProforma.
 *
 * Reglas:
 *  1. Idempotente: si la cotización YA tiene este mismo erpRowId, responde
 *     200 sin tocar Siesa ni escribir (ni duplicar auditoría).
 *  2. Nunca reemplaza en silencio: si ya tiene un erpRowId DISTINTO -> 409.
 *  3. Un mismo CDV no puede vincularse a dos cotizaciones del mismo tenant
 *     -> 409. La comprobación previa solo evita trabajo inútil; la garantía
 *     real (bajo concurrencia) es el índice único filtrado de BD, cuyo P2002
 *     también se traduce a 409.
 *  4. Update + auditoría en UNA sola $transaction: si la auditoría falla, el
 *     vínculo se revierte. El update es condicional (erpRowId IS NULL) para
 *     que dos vinculaciones simultáneas con CDV distintos no se pisen.
 *  5. Ningún mensaje de error revela documentos de otros tenants: todas las
 *     búsquedas van acotadas por tenantId y una cotización ajena es 404. */
export const asignarErpCotizacion = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseoParams = idParamSchema.safeParse(req.params);
  const parseoBody = asignarErpCotizacionSchema.safeParse(req.body);
  if (!parseoParams.success) {
    return res
      .status(400)
      .json({ message: parseoParams.error.errors[0]?.message ?? "Datos inválidos." });
  }
  if (!parseoBody.success) {
    return res
      .status(400)
      .json({ message: parseoBody.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const { erpRowId } = parseoBody.data;

  const existente = await prisma.cotizacion.findFirst({
    where: { id: parseoParams.data.id, tenantId },
    select: {
      id: true,
      numero: true,
      erpTipoDocumento: true,
      erpRowId: true,
      erpNumero: true,
    },
  });
  if (!existente) {
    return res.status(404).json({ message: "Cotización no encontrada." });
  }

  if (existente.erpRowId !== null) {
    if (existente.erpRowId === erpRowId) {
      return res.json(respuestaVinculoErpCotizacion(existente));
    }
    return res.status(409).json({
      message: `Esta cotización ya está vinculada al documento Siesa ${existente.erpNumero ?? existente.erpRowId}. No se puede vincular a otro documento sin desvincularlo primero.`,
    });
  }

  const yaVinculadaAOtra = await prisma.cotizacion.findFirst({
    where: { tenantId, erpRowId, id: { not: existente.id } },
    select: { id: true },
  });
  if (yaVinculadaAOtra) {
    return res.status(409).json({
      message: "Este documento Siesa ya está vinculado a otra cotización de esta empresa.",
    });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.status(400).json({ message: "Este tenant no tiene Siesa configurado." });
  }

  let cotizacionSiesa;
  try {
    cotizacionSiesa = await leerCotizacionSiesa(siesaCiaId, String(erpRowId));
  } catch (error) {
    console.error("Error validando la cotización contra Siesa:", error);
    return res.status(502).json({ message: "No fue posible validar el documento con Siesa." });
  }
  if (!cotizacionSiesa) {
    return res.status(400).json({ message: "El documento indicado no existe en esta compañía." });
  }

  // Siesa se consulta ANTES y fuera de la transacción a propósito: es una
  // conexión de red externa y no debe mantener abierta una transacción de BD.
  let resultado;
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const { count } = await tx.cotizacion.updateMany({
        where: { id: existente.id, tenantId, erpRowId: null },
        data: {
          erpTipoDocumento: "CDV",
          erpRowId,
          erpNumero: cotizacionSiesa.erpDocumentoNumero ?? cotizacionSiesa.cotizacionNumero,
        },
      });
      if (count === 0) {
        // Otra petición la vinculó entre la lectura y este update.
        const actual = await tx.cotizacion.findFirst({
          where: { id: existente.id, tenantId },
          select: { id: true, erpTipoDocumento: true, erpRowId: true, erpNumero: true },
        });
        return { vinculadaAhora: false as const, actual };
      }

      const actualizada = await tx.cotizacion.findFirstOrThrow({
        where: { id: existente.id, tenantId },
        select: { id: true, numero: true, erpTipoDocumento: true, erpRowId: true, erpNumero: true },
      });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "COTIZACION_DOCUMENTO_ERP_ASIGNADO",
          detalle: `${req.user!.nombre} vinculó a mano la cotización ${formatearNumeroCotizacion(actualizada.numero)} con el documento Siesa ${cotizacionSiesa.cotizacionNumero}.`,
          entidadTipo: "Cotizacion",
          entidadId: actualizada.id,
        },
      });
      return { vinculadaAhora: true as const, actual: actualizada };
    });
  } catch (error) {
    if (esViolacionIndiceUnicoErpRowId(error)) {
      return res.status(409).json({
        message: "Este documento Siesa ya está vinculado a otra cotización de esta empresa.",
      });
    }
    console.error("Error al guardar la vinculación Siesa de la cotización:", error);
    return res.status(500).json({ message: "No fue posible vincular la cotización." });
  }

  const { vinculadaAhora, actual } = resultado;
  if (!actual) {
    return res.status(404).json({ message: "Cotización no encontrada." });
  }
  if (!vinculadaAhora && actual.erpRowId !== erpRowId) {
    return res.status(409).json({
      message: `Esta cotización ya está vinculada al documento Siesa ${actual.erpNumero ?? actual.erpRowId}. No se puede vincular a otro documento sin desvincularlo primero.`,
    });
  }
  return res.json(respuestaVinculoErpCotizacion(actual));
};

/** DELETE /comercial/cotizaciones/:id — borrado PERMANENTE, solo superadmin
 * (ver requireSuperadmin en la ruta). A diferencia de anular (que conserva
 * el histórico), esto elimina la fila y sus items. Bloqueado si ya existe
 * una Proforma o Pedido relacionado (la FK es NoAction, no cascada) — en
 * ese caso hay que anular/eliminar primero esos documentos dependientes. */
export const eliminarCotizacion = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = idParamSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const existente = await prisma.cotizacion.findFirst({
    where: { id: parseo.data.id, tenantId },
    select: { id: true, numero: true },
  });
  if (!existente) {
    return res.status(404).json({ message: "Cotización no encontrada." });
  }

  const [proformasRelacionadas, pedidosRelacionados] = await Promise.all([
    prisma.proforma.count({ where: { cotizacionId: existente.id } }),
    prisma.pedidoComercial.count({ where: { cotizacionId: existente.id } }),
  ]);
  if (proformasRelacionadas > 0 || pedidosRelacionados > 0) {
    return res.status(409).json({
      message:
        "No se puede eliminar: esta cotización tiene proformas o pedidos relacionados. Elimínalos o anúlalos primero.",
    });
  }

  await prisma.$transaction([
    prisma.cotizacionItem.deleteMany({ where: { cotizacionId: existente.id } }),
    prisma.cotizacion.delete({ where: { id: existente.id } }),
    prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "COTIZACION_ELIMINADA",
        detalle: `${req.user!.nombre} eliminó permanentemente la cotización ${formatearNumeroCotizacion(existente.numero)}.`,
        entidadTipo: "Cotizacion",
        entidadId: existente.id,
      },
    }),
  ]);
  return res.status(204).send();
};

/** POST /comercial/cotizaciones/:id/proforma — crea una Proforma desde una
 * Cotización interna, REUTILIZANDO el endpoint/lógica ya existente de
 * Proforma (crearProforma en proformas.controller.ts): construye el mismo
 * payload que usaría el formulario de Proforma a partir del snapshot de la
 * cotización, y delega la creación/anti-duplicado/numeración/auditoría a esa
 * misma función — nunca se duplica esa lógica aquí. */
export const crearProformaDesdeCotizacion = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = idParamSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const cotizacion = await obtenerCotizacionCompleta(parseo.data.id, tenantId);
  if (!cotizacion) {
    return res.status(404).json({ message: "Cotización no encontrada." });
  }
  if (cotizacion.estado === "ANULADA" || cotizacion.estado === "RECHAZADA") {
    return res.status(400).json({
      message: `La cotización ${formatearNumeroCotizacion(cotizacion.numero)} está ${cotizacion.estado.toLowerCase()} y no puede generar una proforma.`,
    });
  }

  const payload = {
    cotizacionId: cotizacion.id,
    clienteRowId: cotizacion.clienteRowId,
    clienteNombre: cotizacion.clienteNombre,
    clienteNit: cotizacion.clienteNit,
    contacto: cotizacion.contacto,
    direccion: cotizacion.direccion,
    ciudad: cotizacion.ciudad,
    telefono: cotizacion.telefono,
    formaPago: null,
    fechaVencimiento: cotizacion.fechaVencimiento,
    vendedorNombre: cotizacion.vendedorNombre,
    moneda: cotizacion.moneda,
    observaciones: cotizacion.observaciones,
    items: cotizacion.items.map((it) => ({
      itemRowId: it.itemRowId,
      referencia: it.referencia,
      descripcion: it.descripcion,
      bodegaRowId: it.bodegaRowId,
      bodega: it.bodega,
      unidadMedida: it.unidadMedida,
      cantidad: Number(it.cantidad),
      precioUnitario: Number(it.precioUnitario),
      descuentoPct: Number(it.descuentoPct),
      ivaPct: Number(it.ivaPct),
    })),
  };

  // Reutiliza directamente el handler HTTP de Proforma (misma validación,
  // numeración transaccional, anti-duplicado y auditoría) — sin duplicar
  // ese código, construyendo el request/response mínimo que necesita.
  const fakeReq = { ...req, body: payload } as AuthenticatedRequest;
  let statusCode = 200;
  let payloadRespuesta: unknown = null;
  const fakeRes = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      payloadRespuesta = data;
      return this;
    },
  } as Response;

  await crearProformaHandler(fakeReq, fakeRes);
  return res.status(statusCode).json(payloadRespuesta);
};
