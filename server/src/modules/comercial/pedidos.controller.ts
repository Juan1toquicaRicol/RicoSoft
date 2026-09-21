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
} from "./comercial.schemas";
import { formatearNumeroPedido } from "./cotizaciones.controller";

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
      return res.status(409).json({ message: "Conflicto generando el consecutivo del pedido, intenta de nuevo." });
    }
    console.error("Error creando el pedido comercial:", error);
    return res.status(500).json({ message: "No fue posible crear el pedido." });
  }
};

const TRANSICIONES_PEDIDO: Record<string, string[]> = {
  BORRADOR: ["CONFIRMADO", "ANULADO"],
  CONFIRMADO: ["LISTO_PARA_ERP", "ANULADO"],
  LISTO_PARA_ERP: ["ANULADO"],
  // SINCRONIZADO/ERROR_SINCRONIZACION quedan preparados para la integración
  // futura con Siesa — sin transición manual disponible todavía.
  SINCRONIZADO: [],
  ERROR_SINCRONIZACION: [],
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
