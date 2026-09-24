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
import {
  siguienteNumeroPedidoComercial,
  avanzarContadorPedidoComercial,
} from "./pedidos-consecutivo";
import {
  ESTADO_PROFORMA,
  puedeCrearPedidoDesdeProforma,
} from "../proformas/proformas-estados";
import {
  obtenerCompromisoInventarioPedidos,
  SiesaConsultaError,
  SiesaNoConfiguradoError,
} from "./pedidos-compromiso.service";
import { obtenerEstadoPedidoUnoee } from "./pedidos-estado-unoee.service";

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
  const { clienteRowId, estado, search, incluirCompromiso, page, pageSize } = parseo.data;

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

  // Compromiso de inventario en Siesa de TODA la página en UNA consulta en
  // lote (sin N+1). Si Siesa falla, el listado sigue funcionando: cada pedido
  // queda con compromiso null y se avisa con compromisoDisponible=false.
  let compromisoPorPedido: Map<string, unknown> | null = null;
  let compromisoDisponible = true;
  if (incluirCompromiso) {
    try {
      const dtos = await obtenerCompromisoInventarioPedidos(
        tenantId,
        items.map((p) => p.id),
      );
      compromisoPorPedido = new Map(dtos.map((d) => [d.pedidoId, d]));
    } catch (error) {
      console.error("Error enriqueciendo pedidos con compromiso de Siesa:", error);
      compromisoDisponible = false;
    }
  }

  return res.json({
    items: items.map((p) => ({
      ...p,
      numeroFormateado: formatearNumeroPedido(p.numero),
      ...(incluirCompromiso ? { compromiso: compromisoPorPedido?.get(p.id) ?? null } : {}),
    })),
    page,
    pageSize,
    total,
    ...(incluirCompromiso ? { compromisoDisponible } : {}),
  });
};

/** GET /comercial/pedidos/:id/compromiso-inventario — trazabilidad del
 * compromiso de inventario del pedido en Siesa. Une SOLO por
 * PedidoComercial.erpRowId = t430.f430_rowid (nunca por número visible ni
 * cliente); la compañía Siesa sale del tenant autenticado (el cliente no
 * puede enviar ciaId/tenantId). Pedido de otro tenant -> 404. Sin vínculo
 * ERP -> 200 con compromiso SIN_VINCULO_ERP (sin consultar Siesa). Siesa
 * caído -> 502 con mensaje fijo. */
export const obtenerCompromisoInventarioPedido = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const tenantId = req.user!.tenantId;
  const parseo = idParamSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  try {
    const [dto] = await obtenerCompromisoInventarioPedidos(tenantId, [parseo.data.id]);
    if (!dto) return res.status(404).json({ message: "Pedido no encontrado." });
    return res.json(dto);
  } catch (error) {
    if (error instanceof SiesaNoConfiguradoError) {
      return res.status(400).json({ message: error.message });
    }
    if (error instanceof SiesaConsultaError) {
      console.error("Error consultando el compromiso de inventario en Siesa:", error.causa);
      return res.status(502).json({
        message: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      });
    }
    throw error;
  }
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

/** Nombre real del índice único filtrado (migración
 * 20260924100000_proforma_maquina_estados_pedido_consecutivo): máximo un
 * PedidoComercial por Proforma. No existe como @@unique en schema.prisma. */
const INDICE_UNICO_PROFORMA = "PedidoComercial_tenantId_proformaId_filtered_uq";

function esViolacionIndiceUnicoProforma(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    String(error.meta?.target ?? "").includes(INDICE_UNICO_PROFORMA)
  );
}

/** Conflicto de escritura/deadlock transitorio de SQL Server. */
function esConflictoTransitorio(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/** La proforma dejó de estar ACEPTADA entre la lectura y la transición. */
class ProformaYaNoAceptadaError extends Error {}

const MAX_INTENTOS_CONSECUTIVO_PEDIDO = 5;

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
  if (!puedeCrearPedidoDesdeProforma(proforma.estado)) {
    return res.status(409).json({
      message: `Solo se puede crear un pedido desde una proforma ACEPTADA (estado actual: ${proforma.estado}).`,
    });
  }

  const crearEnTransaccion = () =>
    prisma.$transaction(async (tx) => {
      const numero = await siguienteNumeroPedidoComercial(tx, tenantId);
      const pedido = await tx.pedidoComercial.create({
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

      // Transición CONDICIONAL: solo si la proforma sigue ACEPTADA. Si otra
      // petición ya la pasó a PEDIDO_CREADO/ANULADA, count = 0 y toda la
      // transacción (incluido el pedido recién creado) se revierte.
      const { count } = await tx.proforma.updateMany({
        where: { id: proforma.id, tenantId, estado: ESTADO_PROFORMA.ACEPTADA },
        data: { estado: ESTADO_PROFORMA.PEDIDO_CREADO },
      });
      if (count === 0) throw new ProformaYaNoAceptadaError();

      await avanzarContadorPedidoComercial(tx, tenantId, numero);

      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "PEDIDO_COMERCIAL_CREADO",
          detalle: `${req.user!.nombre} creó el pedido ${formatearNumeroPedido(pedido.numero)} desde la proforma ${proforma.numero} (proforma: ${ESTADO_PROFORMA.ACEPTADA} → ${ESTADO_PROFORMA.PEDIDO_CREADO}).`,
          entidadTipo: "PedidoComercial",
          entidadId: pedido.id,
          datosAnteriores: JSON.stringify({ proformaEstado: ESTADO_PROFORMA.ACEPTADA }),
          datosNuevos: JSON.stringify({ proformaEstado: ESTADO_PROFORMA.PEDIDO_CREADO }),
        },
      });
      return pedido;
    });

  try {
    // Reintentos SOLO ante carreras benignas del consecutivo (P2002 del número
    // de pedido o de la fila del contador) y conflictos transitorios (P2034);
    // cada intento es una transacción completa nueva.
    let creado;
    for (let intento = 1; ; intento++) {
      try {
        creado = await crearEnTransaccion();
        break;
      } catch (error) {
        const reintentable =
          intento < MAX_INTENTOS_CONSECUTIVO_PEDIDO &&
          !esViolacionIndiceUnicoProforma(error) &&
          (esViolacionUnicidad(error, "PedidoComercial") ||
            esViolacionUnicidad(error, "ConfiguracionComercial") ||
            esConflictoTransitorio(error));
        if (!reintentable) throw error;
      }
    }
    return res.status(201).json(serializarPedido(creado));
  } catch (error) {
    if (error instanceof ProformaYaNoAceptadaError) {
      return res.status(409).json({
        message: "La proforma ya no está ACEPTADA (otro proceso la modificó). Recarga e intenta de nuevo.",
      });
    }
    if (esViolacionIndiceUnicoProforma(error)) {
      return res.status(409).json({ message: "Esta proforma ya tiene un pedido comercial." });
    }
    if (
      esViolacionUnicidad(error, "PedidoComercial") ||
      esViolacionUnicidad(error, "ConfiguracionComercial") ||
      esConflictoTransitorio(error)
    ) {
      return res
        .status(409)
        .json({ message: "Conflicto generando el consecutivo del pedido, intenta de nuevo." });
    }
    console.error("Error creando el pedido comercial:", error);
    return res.status(500).json({ message: "No fue posible crear el pedido." });
  }
};

/** GET /comercial/pedidos/:id/estado-unoee — "Estado del Pedido UnoEE": cabecera
 * e ítems del PDV de Siesa vinculado (solo lectura). Une SOLO por
 * PedidoComercial.erpRowId; la compañía sale del tenant autenticado (no acepta
 * ciaId/tenantId del cliente). Pedido de otro tenant -> 404. Sin vínculo ERP ->
 * 200 con vinculado=false (sin consultar Siesa). Siesa caído -> 502 fijo. */
export const obtenerEstadoPedidoUnoeeHandler = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const tenantId = req.user!.tenantId;
  const parseo = idParamSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  try {
    const dto = await obtenerEstadoPedidoUnoee(tenantId, parseo.data.id);
    if (!dto) return res.status(404).json({ message: "Pedido no encontrado." });
    return res.json(dto);
  } catch (error) {
    if (error instanceof SiesaNoConfiguradoError) {
      return res.status(400).json({ message: error.message });
    }
    if (error instanceof SiesaConsultaError) {
      console.error("Error consultando el estado UnoEE del pedido en Siesa:", error.causa);
      return res.status(502).json({
        message: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      });
    }
    throw error;
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
