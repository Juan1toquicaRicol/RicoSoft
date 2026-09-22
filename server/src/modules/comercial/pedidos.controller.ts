import { Response } from "express";
import { Prisma } from "@prisma/client";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import { calcularTotalesComercial } from "../../domain/comercial/comercial-calculo";
import {
  idParamSchema,
  listarPedidosSchema,
  crearPedidoDesdeProformaSchema,
  accionConObservacionSchema,
  asignarErpPedidoSchema,
} from "./comercial.schemas";
import { formatearNumeroPedido } from "./cotizaciones.controller";
import { resolverCiaSiesa } from "../../lib/siesa-tenant";
import { leerPdvSiesa } from "../integraciones-siesa/siesa-pedidos.service";

const PRIMER_NUMERO_PEDIDO = 1;

function calcularSiguienteNumero(ultimoNumero: number | null, piso: number): number {
  return Math.max(piso, (ultimoNumero ?? piso - 1) + 1);
}

async function siguienteNumeroPedido(tx: Prisma.TransactionClient, tenantId: string) {
  const ultima = await tx.pedidoComercial.findFirst({
    where: { tenantId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return calcularSiguienteNumero(ultima?.numero ?? null, PRIMER_NUMERO_PEDIDO);
}

function esViolacionUnicidad(error: unknown, modelName: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    error.meta?.modelName === modelName
  );
}

/** Nombre real del índice único filtrado creado por SQL manual (migración
 * 20260922100000_pedido_comercial_erp_row_id_filtered_unique) — NO existe
 * como @@unique en schema.prisma (ver comentario junto a los campos erp*),
 * así que Prisma no lo conoce como constraint de su propio schema. */
const INDICE_UNICO_ERP_ROW_ID = "PedidoComercial_tenantId_erpRowId_filtered_uq";

/**
 * Verificado empíricamente (SQL Server + Prisma 5.22 reales, dentro de una
 * transacción de prueba revertida): aunque el índice no está declarado en
 * schema.prisma, el motor de Prisma SIGUE reportando su violación como
 * P2002/PrismaClientKnownRequestError — el mapeo lo hace a partir del error
 * nativo que devuelve el driver de SQL Server (2601/2627), no de un
 * catálogo estático de `@@unique` del schema. `meta.target` trae el nombre
 * real del índice violado, lo que permite distinguirlo de una eventual
 * violación de `@@unique([tenantId, numero])` sobre el mismo modelo (que
 * también sería P2002, pero con otro `target`) — nunca se asume "es P2002
 * sobre PedidoComercial, entonces es este índice" sin comprobar el nombre.
 */
function esViolacionIndiceUnicoErpRowId(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    String(error.meta?.target ?? "").includes(INDICE_UNICO_ERP_ROW_ID)
  );
}

function serializarPedido(p: {
  items: {
    cantidad: Prisma.Decimal;
    precioUnitario: Prisma.Decimal;
    descuentoPct: Prisma.Decimal;
    ivaPct: Prisma.Decimal;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}) {
  const items = p.items.map((it) => ({
    ...it,
    cantidad: Number(it.cantidad),
    precioUnitario: Number(it.precioUnitario),
    descuentoPct: Number(it.descuentoPct),
    ivaPct: Number(it.ivaPct),
  }));
  const totales = calcularTotalesComercial(items);
  return {
    ...p,
    numeroFormateado: formatearNumeroPedido(p.numero as number),
    items,
    ...totales,
  };
}

async function obtenerPedidoCompleto(id: string, tenantId: string) {
  return prisma.pedidoComercial.findFirst({
    where: { id, tenantId },
    include: {
      items: { orderBy: { orden: "asc" } },
      cotizacion: { select: { id: true, numero: true, estado: true } },
      proforma: { select: { id: true, numero: true, estado: true } },
    },
  });
}

export const listarPedidos = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = listarPedidosSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const { clienteRowId, estado, search, page, pageSize } = parseo.data;

  const where: Prisma.PedidoComercialWhereInput = {
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
    prisma.pedidoComercial.findMany({
      where,
      orderBy: { numero: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.pedidoComercial.count({ where }),
  ]);

  return res.json({
    items: items.map((p) => ({ ...p, numeroFormateado: formatearNumeroPedido(p.numero) })),
    page,
    pageSize,
    total,
  });
};

export const obtenerPedido = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = idParamSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const pedido = await obtenerPedidoCompleto(parseo.data.id, tenantId);
  if (!pedido) {
    return res.status(404).json({ message: "Pedido no encontrado." });
  }
  return res.json(serializarPedido(pedido));
};

/** POST /comercial/proformas/:id/pedido — crea un PedidoComercial desde una
 * Proforma ACTIVA. Copia snapshot de cliente/items/cantidades/precios/
 * descuentos/impuestos — nunca vuelve a leer la Proforma después de crear el
 * pedido (snapshot independiente, ver sección 16 del encargo). Conserva
 * proformaId y, si existe, la cotización interna de origen. */
export const crearPedidoDesdeProforma = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseoParams = idParamSchema.safeParse(req.params);
  if (!parseoParams.success) {
    return res
      .status(400)
      .json({ message: parseoParams.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const parseoBody = crearPedidoDesdeProformaSchema.safeParse(req.body ?? {});
  const observacionesExtra = parseoBody.success ? parseoBody.data.observaciones : null;

  const proforma = await prisma.proforma.findFirst({
    where: { id: parseoParams.data.id, tenantId },
    include: { items: { orderBy: { orden: "asc" } } },
  });
  if (!proforma) {
    return res.status(404).json({ message: "Proforma no encontrada." });
  }
  if (proforma.estado !== "activa") {
    return res
      .status(400)
      .json({ message: "Solo se puede crear un pedido desde una proforma activa." });
  }

  try {
    const creado = await prisma.$transaction(async (tx) => {
      const numero = await siguienteNumeroPedido(tx, tenantId);
      return tx.pedidoComercial.create({
        data: {
          tenantId,
          numero,
          cotizacionId: proforma.cotizacionId,
          proformaId: proforma.id,
          clienteRowId: proforma.clienteRowId,
          clienteNombre: proforma.clienteNombre,
          clienteNit: proforma.clienteNit,
          vendedorNombre: proforma.vendedorNombre,
          moneda: proforma.moneda,
          observaciones: observacionesExtra ?? proforma.observaciones,
          creadoPorId: req.user!.id,
          creadoPorNombre: req.user!.nombre,
          items: {
            create: proforma.items.map((it, idx) => ({
              orden: idx,
              itemRowId: it.itemRowId,
              referencia: it.referencia,
              descripcion: it.descripcion,
              bodegaRowId: it.bodegaRowId,
              bodega: it.bodega,
              unidadMedida: it.unidadMedida,
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
        accion: "PEDIDO_COMERCIAL_CREADO",
        detalle: `${req.user!.nombre} creó el pedido ${formatearNumeroPedido(creado.numero)} desde la proforma ${proforma.numero}.`,
        entidadTipo: "PedidoComercial",
        entidadId: creado.id,
      },
    });

    return res.status(201).json(serializarPedido(creado));
  } catch (error) {
    if (esViolacionUnicidad(error, "PedidoComercial")) {
      return res
        .status(409)
        .json({ message: "Conflicto generando el consecutivo del pedido, intenta de nuevo." });
    }
    console.error("Error creando el pedido comercial:", error);
    return res.status(500).json({ message: "No fue posible crear el pedido." });
  }
};

// Estado exclusivamente COMERCIAL — nunca mezcla el estado de integración
// con Siesa (ver erpEstadoSincronizacion, columna aparte). SINCRONIZADO/
// ERROR_SINCRONIZACION se retiraron de este mapa (microaudit 2026-09-22):
// eran valores declarados pero inalcanzables, ningún código los asignaba.
const TRANSICIONES_PEDIDO: Record<string, string[]> = {
  BORRADOR: ["CONFIRMADO", "ANULADO"],
  CONFIRMADO: ["LISTO_PARA_ERP", "ANULADO"],
  LISTO_PARA_ERP: ["ANULADO"],
  ANULADO: [],
};

async function cambiarEstadoPedido(
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

  const existente = await prisma.pedidoComercial.findFirst({
    where: { id: parseoParams.data.id, tenantId },
  });
  if (!existente) {
    return res.status(404).json({ message: "Pedido no encontrado." });
  }

  const permitidas = TRANSICIONES_PEDIDO[existente.estado] ?? [];
  if (!permitidas.includes(siguiente)) {
    return res.status(400).json({
      message: `No es posible pasar el pedido de ${existente.estado} a ${siguiente}.`,
    });
  }

  const actualizado = await prisma.pedidoComercial.update({
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
        `${req.user!.nombre} cambió el pedido ${formatearNumeroPedido(actualizado.numero)} a ${siguiente}.`,
      entidadTipo: "PedidoComercial",
      entidadId: actualizado.id,
      datosAnteriores: JSON.stringify({ estado: existente.estado }),
      datosNuevos: JSON.stringify({ estado: siguiente }),
    },
  });

  return res.json({ id: actualizado.id, estado: actualizado.estado });
}

export const confirmarPedido = (req: AuthenticatedRequest, res: Response) =>
  cambiarEstadoPedido(req, res, "CONFIRMADO", "PEDIDO_COMERCIAL_CONFIRMADO");

export const marcarListoParaErpPedido = (req: AuthenticatedRequest, res: Response) =>
  cambiarEstadoPedido(req, res, "LISTO_PARA_ERP", "PEDIDO_COMERCIAL_LISTO_PARA_ERP");

export const anularPedido = (req: AuthenticatedRequest, res: Response) =>
  cambiarEstadoPedido(req, res, "ANULADO", "PEDIDO_COMERCIAL_ANULADO");

/**
 * POST /comercial/pedidos/:id/asignar-erp — vincula a mano un
 * PedidoComercial con el PDV real de Siesa (t430_cm_pv_docto,
 * f430_id_tipo_docto = 'PDV') que le corresponde. Mismo criterio que
 * asignarErpCotizacion (cotizaciones.controller.ts): erpRowId SIEMPRE se
 * revalida en vivo contra Siesa antes de guardar — nunca se confía en un
 * rowid que "se ve válido".
 *
 * V1 (alcance explícito):
 *  - Solo vincula el DOCUMENTO (f430_rowid) — no persiste líneas (f431).
 *  - RicoSoft no crea ni sincroniza nada hacia Siesa: solo lee y valida un
 *    PDV que YA existe.
 *  - Nunca toca `estado` (estado comercial) — el resultado de la
 *    vinculación se guarda exclusivamente en erpEstadoSincronizacion
 *    (estado de integración, columna aparte — nunca mezclados).
 *
 * Reglas de negocio de esta V1:
 *  1. Solo se puede vincular un pedido en estado comercial LISTO_PARA_ERP.
 *  2. El PDV debe pertenecer a la compañía Siesa del tenant (siesaCiaId) —
 *     lo garantiza el propio filtro `f430_id_cia = @ciaId` de leerPdvSiesa.
 *  3. El cliente del PDV (f430_rowid_tercero_fact) debe coincidir con
 *     PedidoComercial.clienteRowId — si no, se bloquea (nunca se confía
 *     solo en que el documento exista en la compañía correcta).
 *  4. Re-vinculación: el MISMO erpRowId ya vinculado es idempotente (se
 *     revalida contra Siesa y se responde 200 sin error); un erpRowId
 *     DISTINTO al ya vinculado se rechaza con 409 — nunca se reemplaza un
 *     PDV vinculado en silencio.
 *  5. La unicidad real (un mismo PDV no puede vincularse a dos pedidos del
 *     mismo tenant) la impone el índice único filtrado de BD, NUNCA un
 *     `findFirst` previo (esa comprobación tendría una carrera real bajo
 *     concurrencia) — ver esViolacionIndiceUnicoErpRowId.
 */
export const asignarErpPedido = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseoParams = idParamSchema.safeParse(req.params);
  if (!parseoParams.success) {
    return res
      .status(400)
      .json({ message: parseoParams.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const parseoBody = asignarErpPedidoSchema.safeParse(req.body);
  if (!parseoBody.success) {
    return res
      .status(400)
      .json({ message: parseoBody.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const { erpRowId } = parseoBody.data;

  const existente = await prisma.pedidoComercial.findFirst({
    where: { id: parseoParams.data.id, tenantId },
  });
  if (!existente) {
    return res.status(404).json({ message: "Pedido no encontrado." });
  }

  if (existente.estado !== "LISTO_PARA_ERP") {
    return res.status(409).json({
      message: `Solo se puede vincular con Siesa un pedido en estado LISTO_PARA_ERP (estado actual: ${existente.estado}).`,
    });
  }

  // Un erpRowId DISTINTO al ya vinculado nunca reemplaza en silencio — se
  // rechaza antes de tocar Siesa (regla 7 del encargo). El MISMO erpRowId
  // continúa abajo: se revalida en vivo y responde idempotente.
  if (existente.erpRowId !== null && existente.erpRowId !== erpRowId) {
    return res.status(409).json({
      message: `Este pedido ya está vinculado al documento Siesa ${existente.erpNumero ?? existente.erpRowId}. No se puede vincular a otro documento sin desvincularlo primero.`,
    });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res
      .status(400)
      .json({ message: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada." });
  }

  let pdv;
  try {
    pdv = await leerPdvSiesa(siesaCiaId, erpRowId);
  } catch (error) {
    console.error("Error al validar el PDV con Siesa:", error);
    return res.status(502).json({
      message: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
  if (!pdv) {
    return res
      .status(400)
      .json({ message: "El documento indicado no existe en Siesa para esta compañía." });
  }
  if (pdv.clienteRowId !== existente.clienteRowId) {
    return res.status(409).json({
      message: `El documento Siesa ${pdv.pdvNumero} pertenece a otro cliente (${pdv.clienteNombre ?? pdv.clienteRowId}), no al cliente de este pedido (${existente.clienteNombre}).`,
    });
  }

  // Escritura + auditoría en UNA sola transacción Prisma (microaudit
  // 2026-09-22, punto CRÍTICO): mismo patrón que ya usa eliminarPedido más
  // abajo en este archivo. Si auditoria.create falla, Prisma revierte
  // también el update del pedido — nunca debe quedar erpRowId persistido
  // junto con una respuesta 500. Siesa se consulta ANTES y fuera de este
  // bloque a propósito: es una conexión de red externa (pool mssql
  // separado) y no debe mantener abierta una transacción de BD mientras se
  // espera esa respuesta.
  let actualizado;
  try {
    actualizado = await prisma.$transaction(async (tx) => {
      const pedidoActualizado = await tx.pedidoComercial.update({
        where: { id: existente.id },
        data: {
          erpTipoDocumento: "PDV",
          erpRowId: pdv.pdvRowId,
          erpNumero: pdv.pdvNumero,
          erpFechaSincronizacion: new Date(),
          erpEstadoSincronizacion: "VINCULADO",
        },
      });

      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "PEDIDO_COMERCIAL_ERP_VINCULADO",
          detalle: `${req.user!.nombre} vinculó el pedido ${formatearNumeroPedido(pedidoActualizado.numero)} con el documento Siesa ${pdv.pdvNumero} (rowid ${pdv.pdvRowId}).`,
          entidadTipo: "PedidoComercial",
          entidadId: pedidoActualizado.id,
        },
      });

      return pedidoActualizado;
    });
  } catch (error) {
    if (esViolacionIndiceUnicoErpRowId(error)) {
      return res.status(409).json({
        message: "Este documento Siesa ya está vinculado a otro pedido de esta empresa.",
      });
    }
    console.error("Error al guardar la vinculación Siesa del pedido:", error);
    return res.status(500).json({ message: "No fue posible vincular el pedido." });
  }

  return res.json({
    id: actualizado.id,
    erpTipoDocumento: actualizado.erpTipoDocumento,
    erpRowId: actualizado.erpRowId,
    erpNumero: actualizado.erpNumero,
    erpFechaSincronizacion: actualizado.erpFechaSincronizacion,
    erpEstadoSincronizacion: actualizado.erpEstadoSincronizacion,
  });
};

/** DELETE /comercial/pedidos/:id — borrado PERMANENTE, solo superadmin (ver
 * requireSuperadmin en la ruta). A diferencia de anular (que conserva el
 * histórico), esto elimina la fila y sus items sin dejar rastro. */
export const eliminarPedido = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = idParamSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const existente = await prisma.pedidoComercial.findFirst({
    where: { id: parseo.data.id, tenantId },
    select: { id: true, numero: true },
  });
  if (!existente) {
    return res.status(404).json({ message: "Pedido no encontrado." });
  }

  await prisma.$transaction([
    prisma.pedidoComercialItem.deleteMany({ where: { pedidoId: existente.id } }),
    prisma.pedidoComercial.delete({ where: { id: existente.id } }),
    prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PEDIDO_COMERCIAL_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó permanentemente el pedido ${formatearNumeroPedido(existente.numero)}.`,
        entidadTipo: "PedidoComercial",
        entidadId: existente.id,
      },
    }),
  ]);
  return res.status(204).send();
};
