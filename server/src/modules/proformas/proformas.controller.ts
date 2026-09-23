import { Response } from "express";
import { Prisma } from "@prisma/client";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import {
  buscarClientesSiesa,
  leerClienteSiesa,
  leerDatosFacturacionCliente,
} from "../integraciones-siesa/siesa-clientes.service";
import { leerBodegasSiesa } from "../integraciones-siesa/siesa-inventario.service";
import {
  buscarCotizacionesSiesa,
  leerCotizacionSiesa,
} from "../integraciones-siesa/siesa-pedidos.service";
import { calcularTotalesProforma } from "../../domain/ventas/proforma-calculo";
import {
  buscarClientesProformaSchema,
  datosFacturacionClienteSchema,
  crearProformaSchema,
  actualizarProformaSchema,
  listarProformasSchema,
  obtenerProformaSchema,
  actualizarConfiguracionComercialSchema,
  buscarCotizacionesSchema,
  obtenerCotizacionSchema,
  asignarDocumentoErpProformaSchema,
} from "./proformas.schemas";
import { siguienteNumeroProforma } from "./proformas-consecutivo";

/** Defaults de ConfiguracionComercial cuando el tenant todavía no configuró
 * nada — mismos valores que el default de la columna en Prisma, mismo
 * patrón que UMBRALES_*_DEFECTO en inventario.controller.ts. */
const RETENCIONES_DEFECTO = {
  retencionFuentePct: 2.5,
  retencionIvaPct: 15,
  retencionIcaPct: 0.7,
};

/** Exportada para que otros módulos (ej. comercial/cotizaciones.controller.ts,
 * para vincular a mano el documento ERP de una Cotización interna) resuelvan
 * la compañía Siesa de un tenant sin duplicar esta consulta. */
export async function resolverCiaSiesa(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });
  return tenant?.siesaCiaId ?? null;
}

type ProformaConItems = NonNullable<Awaited<ReturnType<typeof obtenerProformaConItems>>>;
/** Acepta tanto el resultado completo de obtenerProformaConItems (con
 * cotizacion/pedidosComerciales incluidos, usado por GET) como el resultado
 * más simple de create/update (solo items) — ambos comparten los campos que
 * esta función realmente usa. */
type ProformaParaSerializar = Omit<ProformaConItems, "cotizacion" | "pedidosComerciales"> &
  Partial<Pick<ProformaConItems, "cotizacion" | "pedidosComerciales">>;

function serializarProforma(p: ProformaParaSerializar | null) {
  if (!p) return null;
  const items = p.items.map((it) => ({
    ...it,
    cantidad: Number(it.cantidad),
    precioUnitario: Number(it.precioUnitario),
    descuentoPct: Number(it.descuentoPct),
    ivaPct: Number(it.ivaPct),
  }));
  const retencionPct = Number(p.retencionPct);
  const retencionIvaPct = Number(p.retencionIvaPct);
  const icaPct = Number(p.icaPct);
  const totales = calcularTotalesProforma(items, {
    aplicaRetencion: p.aplicaRetencion,
    retencionPct,
    aplicaRetencionIva: p.aplicaRetencionIva,
    retencionIvaPct,
    aplicaIca: p.aplicaIca,
    icaPct,
  });
  return {
    ...p,
    retencionPct,
    retencionIvaPct,
    icaPct,
    items,
    ...totales,
  };
}

async function obtenerProformaConItems(id: string, tenantId: string) {
  return prisma.proforma.findFirst({
    where: { id, tenantId },
    include: {
      items: { orderBy: { orden: "asc" } },
      cotizacion: { select: { id: true, numero: true, estado: true } },
      pedidosComerciales: {
        select: { id: true, numero: true, estado: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

/** Autocompletado de cliente — reutiliza buscarClientesSiesa (mismo patrón que buscarProductosVenta en Ventas). */
export const buscarClientesProforma = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = buscarClientesProformaSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene Siesa configurado.",
      items: [],
    });
  }

  try {
    const items = await buscarClientesSiesa(siesaCiaId, parseo.data.search);
    return res.json({ disponible: true, items });
  } catch (error) {
    console.error("Error buscando clientes en Siesa para proforma:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento.",
      items: [],
    });
  }
};

/** Trae los datos de facturación del cliente elegido para pre-llenar el formulario de proforma. */
export const obtenerDatosFacturacionCliente = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = datosFacturacionClienteSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({ disponible: false, motivo: "Este tenant no tiene Siesa configurado." });
  }

  try {
    const [cliente, facturacion] = await Promise.all([
      leerClienteSiesa(siesaCiaId, parseo.data.clienteRowId),
      leerDatosFacturacionCliente(siesaCiaId, parseo.data.clienteRowId),
    ]);
    if (!cliente) {
      return res.json({ disponible: false, motivo: "Cliente no encontrado en esta compañía." });
    }
    return res.json({ disponible: true, cliente, facturacion });
  } catch (error) {
    console.error("Error leyendo datos de facturación del cliente:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento.",
    });
  }
};

/** Bodegas reales de la compañía Siesa del tenant — mismo patrón que
 * listarBodegas en toma-fisica.controller.ts (leerBodegasSiesa), sin
 * catálogo propio: RicoSoft no tiene bodegas, siempre son las de Siesa. */
export const listarBodegasProforma = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene Siesa configurado.",
      bodegas: [],
    });
  }

  try {
    const bodegas = await leerBodegasSiesa(siesaCiaId);
    return res.json({ disponible: true, bodegas });
  } catch (error) {
    console.error("Error leyendo bodegas desde Siesa para proforma:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento.",
      bodegas: [],
    });
  }
};

/** Valida que cada bodegaRowId enviado por el cliente pertenezca de verdad
 * a la compañía Siesa del tenant actual — nunca se confía en un rowid
 * arbitrario del body, mismo criterio que ya usa toma-fisica.controller.ts
 * para bodegaRowId. Devuelve un mensaje de error o null si todo es válido. */
async function validarBodegasDelTenant(
  siesaCiaId: number | null,
  items: { bodegaRowId?: number | null }[],
): Promise<string | null> {
  const rowIds = [...new Set(items.map((it) => it.bodegaRowId).filter((id): id is number => !!id))];
  if (rowIds.length === 0) return null;
  if (!siesaCiaId) return "Este tenant no tiene Siesa configurado para validar bodegas.";

  const bodegas = await leerBodegasSiesa(siesaCiaId);
  const validas = new Set(bodegas.map((b) => b.bodegaRowId));
  const invalida = rowIds.find((id) => !validas.has(id));
  if (invalida !== undefined) {
    return `La bodega ${invalida} no pertenece a la compañía de este tenant en Siesa.`;
  }
  return null;
}

/** GET /proformas/cotizaciones/buscar?q= — busca cotizaciones de Siesa por
 * número visible. tenantId SIEMPRE sale del contexto de auth (req.user),
 * nunca del query — la compañía Siesa se resuelve server-side a partir de
 * ese tenant, igual que el resto de este controller. */
export const buscarCotizaciones = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = buscarCotizacionesSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({ disponible: false, motivo: "Este tenant no tiene Siesa configurado.", items: [] });
  }

  try {
    const items = await buscarCotizacionesSiesa(siesaCiaId, parseo.data.q, 20);
    return res.json({ disponible: true, items });
  } catch (error) {
    console.error("Error buscando cotizaciones en Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento.",
      items: [],
    });
  }
};

/** GET /proformas/cotizaciones/:id — detalle completo de UNA cotización,
 * acotado a la compañía Siesa del tenant autenticado. :id es el
 * identificador técnico externo real (f430_rowid en Siesa), nunca el
 * número visible. */
export const obtenerCotizacion = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = obtenerCotizacionSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({ disponible: false, motivo: "Este tenant no tiene Siesa configurado." });
  }

  try {
    const cotizacion = await leerCotizacionSiesa(siesaCiaId, parseo.data.id);
    if (!cotizacion) {
      return res.json({ disponible: false, motivo: "Cotización no encontrada en esta compañía." });
    }
    return res.json({ disponible: true, cotizacion });
  } catch (error) {
    console.error("Error leyendo la cotización desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento.",
    });
  }
};

/** POST /proformas/:id/anular — marca la proforma como anulada. Una
 * proforma anulada deja de contar para la regla anti-duplicados de
 * cotización (ver crearProforma): permite volver a generar una proforma
 * nueva sobre la misma cotización de origen. */
export const anularProforma = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = obtenerProformaSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const existente = await prisma.proforma.findFirst({
    where: { id: parseo.data.id, tenantId },
    select: { id: true },
  });
  if (!existente) {
    return res.status(404).json({ message: "Proforma no encontrada." });
  }

  const actualizada = await prisma.proforma.update({
    where: { id: existente.id },
    data: { estado: "anulada" },
  });
  await prisma.auditoria.create({
    data: {
      tenantId,
      usuarioId: req.user!.id,
      accion: "PROFORMA_ANULADA",
      detalle: `${req.user!.nombre} anuló la proforma ${actualizada.numero}.`,
      entidadTipo: "Proforma",
      entidadId: actualizada.id,
    },
  });
  return res.json({ id: actualizada.id, estado: actualizada.estado });
};

/** PATCH /proformas/:id/documento-erp — vincula o corrige a mano el
 * documento Siesa (CDV) de una proforma, para cuando el buscador automático
 * (buscarCotizacionesSiesa) no lo encontró. Igual que en crearProforma, el
 * identificador técnico SIEMPRE se revalida contra Siesa (nunca se confía
 * en lo que mande el frontend) y se aplica la misma regla anti-duplicados:
 * no puede quedar una segunda proforma ACTIVA con la misma cotización. */
export const asignarDocumentoErpProforma = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseoParams = obtenerProformaSchema.safeParse(req.params);
  const parseoBody = asignarDocumentoErpProformaSchema.safeParse(req.body);
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

  const existente = await prisma.proforma.findFirst({
    where: { id: parseoParams.data.id, tenantId },
    select: { id: true, numero: true },
  });
  if (!existente) {
    return res.status(404).json({ message: "Proforma no encontrada." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.status(400).json({ message: "Este tenant no tiene Siesa configurado." });
  }

  const { cotizacionIdExterno } = parseoBody.data;
  let cotizacion;
  try {
    cotizacion = await leerCotizacionSiesa(siesaCiaId, cotizacionIdExterno);
  } catch (error) {
    console.error("Error validando la cotización contra Siesa:", error);
    return res.status(502).json({ message: "No fue posible validar la cotización con Siesa." });
  }
  if (!cotizacion) {
    return res.status(400).json({ message: "La cotización indicada no existe en esta compañía." });
  }

  const duplicada = await prisma.proforma.findFirst({
    where: {
      tenantId,
      cotizacionIdExterno,
      estado: "activa",
      id: { not: existente.id },
    },
    select: { numero: true },
  });
  if (duplicada) {
    return res.status(409).json({
      message: `La cotización ${cotizacion.cotizacionNumero} ya tiene una proforma activa: ${duplicada.numero}.`,
    });
  }

  const actualizada = await prisma.proforma.update({
    where: { id: existente.id },
    data: {
      cotizacionOrigen: "siesa",
      cotizacionIdExterno,
      cotizacionNumero: cotizacion.cotizacionNumero,
      erpDocumentoNumero: cotizacion.erpDocumentoNumero,
    },
  });
  await prisma.auditoria.create({
    data: {
      tenantId,
      usuarioId: req.user!.id,
      accion: "PROFORMA_DOCUMENTO_ERP_ASIGNADO",
      detalle: `${req.user!.nombre} vinculó a mano la proforma ${actualizada.numero} con la cotización ${cotizacion.cotizacionNumero}.`,
      entidadTipo: "Proforma",
      entidadId: actualizada.id,
    },
  });
  return res.json({
    id: actualizada.id,
    cotizacionOrigen: actualizada.cotizacionOrigen,
    cotizacionIdExterno: actualizada.cotizacionIdExterno,
    cotizacionNumero: actualizada.cotizacionNumero,
    erpDocumentoNumero: actualizada.erpDocumentoNumero,
  });
};

/** DELETE /proformas/:id — borrado PERMANENTE, solo superadmin (ver
 * requireSuperadmin en la ruta). A diferencia de anularProforma (que
 * conserva el histórico marcando estado:"anulada"), esto elimina la fila y
 * sus items sin dejar rastro — úsalo solo para corregir errores de captura,
 * nunca como flujo normal de cancelación. */
export const eliminarProforma = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = obtenerProformaSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const existente = await prisma.proforma.findFirst({
    where: { id: parseo.data.id, tenantId },
    select: { id: true, numero: true },
  });
  if (!existente) {
    return res.status(404).json({ message: "Proforma no encontrada." });
  }

  const pedidosRelacionados = await prisma.pedidoComercial.count({
    where: { proformaId: existente.id },
  });
  if (pedidosRelacionados > 0) {
    return res.status(409).json({
      message: "No se puede eliminar: esta proforma tiene pedidos comerciales relacionados. Elimínalos primero.",
    });
  }

  await prisma.$transaction([
    prisma.proformaItem.deleteMany({ where: { proformaId: existente.id } }),
    prisma.proforma.delete({ where: { id: existente.id } }),
    prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PROFORMA_ELIMINADA",
        detalle: `${req.user!.nombre} eliminó permanentemente la proforma ${existente.numero}.`,
        entidadTipo: "Proforma",
        entidadId: existente.id,
      },
    }),
  ]);
  return res.status(204).send();
};

/** GET /proformas/configuracion-comercial — tasas de retención vigentes del
 * tenant (o los defaults documentados si nunca las configuró), mismo patrón
 * que obtenerConfiguracionInventario en inventario.controller.ts. */
export const obtenerConfiguracionComercial = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const config = await req.tenantPrisma!.configuracionComercial.findUnique({ where: { tenantId } });
  return res.json(
    config
      ? {
          retencionFuentePct: Number(config.retencionFuentePct),
          retencionIvaPct: Number(config.retencionIvaPct),
          retencionIcaPct: Number(config.retencionIcaPct),
        }
      : RETENCIONES_DEFECTO,
  );
};

/** PUT /proformas/configuracion-comercial — solo administración
 * (configuracion.editar), crea la fila si el tenant nunca la tuvo. Cambiar
 * esto NUNCA afecta proformas ya creadas: cada una guarda su propio
 * snapshot de porcentajes al momento de crearse. */
export const actualizarConfiguracionComercial = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const tenantId = req.user!.tenantId;
  const parseo = actualizarConfiguracionComercialSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const config = await req.tenantPrisma!.configuracionComercial.upsert({
    where: { tenantId },
    create: { tenantId, ...parseo.data },
    update: { ...parseo.data },
  });

  return res.json({
    retencionFuentePct: Number(config.retencionFuentePct),
    retencionIvaPct: Number(config.retencionIvaPct),
    retencionIcaPct: Number(config.retencionIcaPct),
  });
};

export const listarProformas = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = listarProformasSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const { clienteRowId, page, pageSize } = parseo.data;
  const where = { tenantId, ...(clienteRowId !== undefined ? { clienteRowId } : {}) };

  const [items, total] = await Promise.all([
    prisma.proforma.findMany({
      where,
      orderBy: { numero: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.proforma.count({ where }),
  ]);

  return res.json({
    items: items.map((p) => ({
      ...p,
      retencionPct: Number(p.retencionPct),
      retencionIvaPct: Number(p.retencionIvaPct),
      icaPct: Number(p.icaPct),
    })),
    page,
    pageSize,
    total,
  });
};

export const obtenerProforma = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = obtenerProformaSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const proforma = await obtenerProformaConItems(parseo.data.id, tenantId);
  if (!proforma) {
    return res.status(404).json({ message: "Proforma no encontrada." });
  }
  return res.json(serializarProforma(proforma));
};

/** GET /proformas/siguiente-numero — INFORMATIVO: sugiere, no reserva ni
 * bloquea el número (dos consultas seguidas pueden devolver el mismo valor
 * si todavía no se creó ninguna proforma con él). Usa el mismo helper que la
 * creación automática (proformas-consecutivo.ts). La autoridad real es la
 * creación en backend; la unicidad la garantiza @@unique([tenantId, numero])
 * con manejo explícito de P2002. */
export const obtenerSiguienteNumeroProforma = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  return res.json({ numero: await siguienteNumeroProforma(prisma, tenantId) });
};

/** SQL Server no reporta meta.target como array de columnas (a diferencia de
 * Postgres/MySQL) — aquí siempre es un string tipo "dbo.Proforma". La única
 * restricción única que puede chocar al crear/actualizar una Proforma es
 * @@unique([tenantId, numero]) (el id es un UUID recién generado, nunca
 * colisiona), así que cualquier P2002 sobre este modelo en este flujo es la
 * violación de número duplicado. */
function esViolacionUnicidad(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    error.meta?.modelName === "Proforma"
  );
}

/** Señaliza el 409 de duplicado detectado DENTRO de la transacción de
 * creación (re-chequeo contra condición de carrera) — se distingue de
 * esViolacionUnicidad (P2002 de número) en el catch de crearProforma. */
class DuplicadoCotizacionError extends Error {}

/** Tope de reintentos del consecutivo automático ante carreras (P2002). */
const MAX_INTENTOS_NUMERO_AUTOMATICO = 8;

export const crearProforma = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = crearProformaSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  // numero: sugerido/editable (GET /proformas/siguiente-numero calcula
  // SIEMPRE el real MAX(numero)+1 del tenant, fresco, nunca un contador
  // aparte) — si el usuario lo edita a mano en el diálogo (botón "Editar"
  // junto al campo), se respeta tal cual; si no, se usa el consecutivo real
  // calculado aquí mismo dentro de la transacción.
  const {
    items,
    numero: numeroSolicitado,
    cotizacionIdExterno,
    cotizacionId,
    ...encabezado
  } = parseo.data;

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  const errorBodegas = await validarBodegasDelTenant(siesaCiaId, items);
  if (errorBodegas) {
    return res.status(400).json({ message: errorBodegas });
  }

  // Cotización INTERNA de RicoSoft (módulo Comercial → Gestión Comercial):
  // independiente de cotizacionIdExterno (Siesa), nunca se confía en el
  // número que mande el frontend — se revalida contra la propia tabla
  // Cotizacion, acotada al tenant. Misma regla anti-duplicados que ya existe
  // para cotizacionIdExterno: solo una Proforma activa por Cotización.
  let cotizacionInterna: { id: string; numero: number } | null = null;
  if (cotizacionId) {
    const cot = await prisma.cotizacion.findFirst({
      where: { id: cotizacionId, tenantId },
      select: { id: true, numero: true, estado: true },
    });
    if (!cot) {
      return res.status(400).json({ message: "La cotización indicada no existe en este tenant." });
    }
    if (cot.estado === "ANULADA" || cot.estado === "RECHAZADA") {
      return res
        .status(400)
        .json({ message: `La cotización COT-${cot.numero} está ${cot.estado.toLowerCase()} y no puede generar una proforma.` });
    }
    cotizacionInterna = { id: cot.id, numero: cot.numero };

    const duplicadaInterna = await prisma.proforma.findFirst({
      where: { tenantId, cotizacionId, estado: "activa" },
      select: { numero: true },
    });
    if (duplicadaInterna) {
      return res.status(409).json({
        message: `La cotización COT-${cot.numero} ya tiene una proforma activa: ${duplicadaInterna.numero}.`,
      });
    }
  }

  // Si viene una cotización de origen, se revalida SIEMPRE contra Siesa
  // (nunca se confía en cotizacionNumero/erpDocumentoNumero que mande el
  // frontend) y se acota a la compañía Siesa de este tenant.
  let cotizacionValidada: { numero: string; erpDocumentoNumero: string | null } | null = null;
  if (cotizacionIdExterno) {
    if (!siesaCiaId) {
      return res.status(400).json({ message: "Este tenant no tiene Siesa configurado." });
    }
    let cotizacion;
    try {
      cotizacion = await leerCotizacionSiesa(siesaCiaId, cotizacionIdExterno);
    } catch (error) {
      console.error("Error validando la cotización contra Siesa:", error);
      return res.status(502).json({ message: "No fue posible validar la cotización con Siesa." });
    }
    if (!cotizacion) {
      return res.status(400).json({ message: "La cotización indicada no existe en esta compañía." });
    }
    cotizacionValidada = {
      numero: cotizacion.cotizacionNumero,
      erpDocumentoNumero: cotizacion.erpDocumentoNumero,
    };

    // Anti-duplicados: no permitir una segunda proforma ACTIVA sobre la
    // misma cotización, del mismo tenant. Una proforma anulada no bloquea.
    const duplicada = await prisma.proforma.findFirst({
      where: { tenantId, cotizacionIdExterno, estado: "activa" },
      select: { numero: true },
    });
    if (duplicada) {
      return res.status(409).json({
        message: `La cotización ${cotizacion.cotizacionNumero} ya tiene una proforma activa: ${duplicada.numero}.`,
      });
    }
  }

  try {
    const crearEnTransaccion = () =>
      prisma.$transaction(async (tx) => {
        // Respeta un número editado a mano (numeroSolicitado); si no vino
        // ninguno, calcula el consecutivo real fresco dentro de esta misma
        // transacción.
        const numero = numeroSolicitado ?? (await siguienteNumeroProforma(tx, tenantId));

        // Re-chequeo de duplicados dentro de la misma transacción, para cerrar
        // la ventana de carrera entre la validación de arriba y el commit.
        if (cotizacionIdExterno) {
          const duplicada = await tx.proforma.findFirst({
            where: { tenantId, cotizacionIdExterno, estado: "activa" },
            select: { numero: true },
          });
          if (duplicada) {
            throw new DuplicadoCotizacionError(
              `La cotización ${cotizacionValidada?.numero} ya tiene una proforma activa: ${duplicada.numero}.`,
            );
          }
        }
        if (cotizacionInterna) {
          const duplicadaInterna = await tx.proforma.findFirst({
            where: { tenantId, cotizacionId: cotizacionInterna.id, estado: "activa" },
            select: { numero: true },
          });
          if (duplicadaInterna) {
            throw new DuplicadoCotizacionError(
              `La cotización COT-${cotizacionInterna.numero} ya tiene una proforma activa: ${duplicadaInterna.numero}.`,
            );
          }
        }

        const proformaCreada = await tx.proforma.create({
          data: {
            tenantId,
            numero,
            ...encabezado,
            cotizacionOrigen: cotizacionIdExterno ? "siesa" : cotizacionInterna ? "ricosoft" : null,
            cotizacionIdExterno: cotizacionIdExterno ?? null,
            cotizacionId: cotizacionInterna?.id ?? null,
            cotizacionNumero:
              cotizacionValidada?.numero ??
              (cotizacionInterna
                ? `COT-${String(cotizacionInterna.numero).padStart(5, "0")}`
                : null),
            erpDocumentoNumero: cotizacionValidada?.erpDocumentoNumero ?? null,
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

        // La cotización interna queda CONVERTIDA una vez que tiene una proforma
        // activa — no se recalcula ni se modifica ningún otro dato de la
        // cotización; solo su estado.
        if (cotizacionInterna) {
          await tx.cotizacion.update({
            where: { id: cotizacionInterna.id },
            data: { estado: "CONVERTIDA" },
          });
          await tx.auditoria.create({
            data: {
              tenantId,
              usuarioId: req.user!.id,
              accion: "PROFORMA_CREADA_DESDE_COTIZACION",
              detalle: `${req.user!.nombre} creó la proforma ${proformaCreada.numero} desde la cotización COT-${cotizacionInterna.numero}.`,
              entidadTipo: "Proforma",
              entidadId: proformaCreada.id,
            },
          });
        }

        return proformaCreada;
      });

    // Número AUTOMÁTICO: dos creaciones simultáneas pueden calcular el mismo
    // MAX+1; la que pierde choca contra @@unique([tenantId, numero]) (P2002),
    // su transacción se revierte completa y se reintenta con el máximo ya
    // actualizado, así ambas terminan con números distintos. Un número
    // MANUAL nunca se reintenta: su duplicado es un 409 legítimo.
    let creada;
    for (let intento = 1; ; intento++) {
      try {
        creada = await crearEnTransaccion();
        break;
      } catch (error) {
        const reintentable =
          numeroSolicitado === undefined &&
          esViolacionUnicidad(error) &&
          intento < MAX_INTENTOS_NUMERO_AUTOMATICO;
        if (!reintentable) throw error;
      }
    }
    return res.status(201).json(serializarProforma(creada));
  } catch (error) {
    if (error instanceof DuplicadoCotizacionError) {
      return res.status(409).json({ message: error.message });
    }
    if (esViolacionUnicidad(error)) {
      return res.status(409).json({
        message:
          numeroSolicitado === undefined
            ? "No fue posible asignar un número consecutivo por alta concurrencia. Intenta de nuevo."
            : `Ya existe una proforma con el número ${numeroSolicitado}.`,
      });
    }
    console.error("Error creando la proforma:", error);
    return res.status(500).json({ message: "No fue posible crear la proforma." });
  }
};

export const actualizarProforma = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseoParams = obtenerProformaSchema.safeParse(req.params);
  const parseoBody = actualizarProformaSchema.safeParse(req.body);
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

  const existente = await prisma.proforma.findFirst({
    where: { id: parseoParams.data.id, tenantId },
    select: { id: true },
  });
  if (!existente) {
    return res.status(404).json({ message: "Proforma no encontrada." });
  }

  const { items, numero, ...encabezado } = parseoBody.data;

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  const errorBodegas = await validarBodegasDelTenant(siesaCiaId, items);
  if (errorBodegas) {
    return res.status(400).json({ message: errorBodegas });
  }

  try {
    const actualizada = await prisma.$transaction(async (tx) => {
      await tx.proformaItem.deleteMany({ where: { proformaId: existente.id } });
      return tx.proforma.update({
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
    return res.json(serializarProforma(actualizada));
  } catch (error) {
    if (esViolacionUnicidad(error)) {
      return res.status(409).json({ message: `Ya existe una proforma con el número ${numero}.` });
    }
    console.error("Error actualizando la proforma:", error);
    return res.status(500).json({ message: "No fue posible actualizar la proforma." });
  }
};
