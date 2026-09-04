import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import {
  leerBodegasSiesa,
  leerExistenciaPorBodegaSiesa,
} from "../integraciones-siesa/siesa-inventario.service";
import {
  calcularLineasTomaFisica,
  calcularResumenTomaFisica,
  detectarPatronesRecurrentes,
  type OcurrenciaDiferencia,
} from "../../lib/toma-fisica";
import { crearTomaFisicaSchema, registrarConteoSchema } from "./toma-fisica.schemas";

/**
 * Trae el tenant + su compañía Siesa, o null si no está configurada — mismo
 * patrón de autoridad usado en el resto del módulo Inventario (Tenant.siesaCiaId
 * resuelto SIEMPRE desde el tenant autenticado, nunca del body/query).
 */
async function resolverCiaSiesa(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });
  return tenant?.siesaCiaId ?? null;
}

/**
 * Busca la toma física por id VERIFICANDO que pertenezca al tenant
 * autenticado. TomaFisicaLinea no tiene columna tenantId propia — se aísla
 * vía esta relación (ver nota en lib/tenant-prisma.ts sobre modelos
 * relation-isolated como VistoBuenoAduanero/PermisoUsuario), así que toda
 * ruta que toque una línea debe pasar primero por aquí.
 */
async function buscarTomaFisicaDelTenant(tomaFisicaId: string, tenantId: string) {
  return prisma.tomaFisica.findFirst({ where: { id: tomaFisicaId, tenantId } });
}

/** Bodegas reales de Siesa disponibles para iniciar una toma física nueva. */
export const listarBodegas = async (req: AuthenticatedRequest, res: Response) => {
  const ciaId = await resolverCiaSiesa(req.user!.tenantId);
  if (!ciaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
    });
  }
  try {
    const bodegas = await leerBodegasSiesa(ciaId);
    return res.json({ disponible: true, bodegas });
  } catch (error) {
    console.error("Error al leer bodegas desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/** Lista las tomas físicas del tenant (sin líneas — solo cabecera), más recientes primero. */
export const listarTomasFisicas = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const tomas = await prisma.tomaFisica.findMany({
    where: { tenantId },
    orderBy: { fecha: "desc" },
    include: { _count: { select: { lineas: true } } },
  });
  return res.json(tomas);
};

/**
 * Crea una toma física nueva: toma un snapshot EN VIVO de la existencia real
 * de la bodega elegida (leerExistenciaPorBodegaSiesa) y la congela como
 * líneas — el "listado esperado" contra el que se registra el conteo físico.
 * Este snapshot nunca se vuelve a leer de Siesa: si Siesa cambia después,
 * la toma física ya abierta sigue comparando contra el momento en que se creó.
 */
export const crearTomaFisica = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = crearTomaFisicaSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const ciaId = await resolverCiaSiesa(tenantId);
  if (!ciaId) {
    return res
      .status(400)
      .json({ message: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada." });
  }

  let bodegas;
  try {
    bodegas = await leerBodegasSiesa(ciaId);
  } catch (error) {
    console.error("Error al leer bodegas desde Siesa:", error);
    return res.status(502).json({
      message: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
  const bodega = bodegas.find((b) => b.bodegaRowId === parseo.data.bodegaRowId);
  if (!bodega) {
    return res
      .status(404)
      .json({ message: "La bodega indicada no existe en Siesa para este tenant." });
  }

  let existencia;
  try {
    existencia = await leerExistenciaPorBodegaSiesa(ciaId, bodega.bodegaRowId);
  } catch (error) {
    console.error("Error al leer existencia por bodega desde Siesa:", error);
    return res.status(502).json({
      message: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }

  const toma = await prisma.tomaFisica.create({
    data: {
      tenantId,
      bodegaRowId: bodega.bodegaRowId,
      bodegaNombre: bodega.nombre,
      fecha: new Date(),
      responsableId: req.user!.id,
      responsable: req.user!.nombre,
      lineas: {
        create: existencia.map((e) => ({
          itemRowId: e.itemRowId,
          descripcion: e.descripcion,
          referencia: e.referencia,
          stockSistema: e.cantidadExistente,
          valorUnitario: e.costoUnitario,
        })),
      },
    },
    include: { _count: { select: { lineas: true } } },
  });

  // R-C-02 (auditoría de Comercial, 2026-09-02): crear y cerrar una toma
  // física mutan estado de negocio real (el snapshot congelado y luego el
  // cierre) — mismo patrón entidadTipo/entidadId/datosNuevos ya usado en
  // Despachos, hasta ahora ausente en este módulo.
  await prisma.auditoria.create({
    data: {
      tenantId,
      usuarioId: req.user!.id,
      accion: "TOMA_FISICA_CREADA",
      detalle: `${req.user!.nombre} inició una toma física en la bodega "${bodega.nombre}" (${toma._count.lineas} referencias).`,
      entidadTipo: "TomaFisica",
      entidadId: toma.id,
      datosNuevos: JSON.stringify({
        estado: "Abierta",
        bodegaRowId: bodega.bodegaRowId,
        lineas: toma._count.lineas,
      }),
    },
  });

  return res.status(201).json(toma);
};

/** Detalle de una toma física: líneas con diferencia/valor calculados en vivo (nunca guardados) + resumen. */
export const obtenerTomaFisica = async (req: AuthenticatedRequest, res: Response) => {
  const toma = await buscarTomaFisicaDelTenant(req.params.id, req.user!.tenantId);
  if (!toma) return res.status(404).json({ message: "Toma física no encontrada." });

  const lineasCrudas = await prisma.tomaFisicaLinea.findMany({
    where: { tomaFisicaId: toma.id },
    orderBy: { descripcion: "asc" },
  });
  const lineas = calcularLineasTomaFisica(
    lineasCrudas.map((l) => ({
      id: l.id,
      itemRowId: l.itemRowId,
      descripcion: l.descripcion,
      referencia: l.referencia,
      stockSistema: Number(l.stockSistema),
      conteoFisico: l.conteoFisico !== null ? Number(l.conteoFisico) : null,
      valorUnitario: Number(l.valorUnitario),
    })),
  );

  return res.json({ toma, lineas, resumen: calcularResumenTomaFisica(lineas) });
};

/**
 * Registra (o corrige) el conteo físico de una línea. Solo permitido
 * mientras la toma física siga "Abierta" — una vez cerrada es historial
 * inmutable, igual que Siesa nunca se toca por este flujo.
 */
export const registrarConteo = async (req: AuthenticatedRequest, res: Response) => {
  const toma = await buscarTomaFisicaDelTenant(req.params.id, req.user!.tenantId);
  if (!toma) return res.status(404).json({ message: "Toma física no encontrada." });
  if (toma.estado !== "Abierta") {
    return res
      .status(400)
      .json({ message: "Esta toma física ya está cerrada; no se puede modificar el conteo." });
  }

  const parseo = registrarConteoSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const linea = await prisma.tomaFisicaLinea.findFirst({
    where: { id: req.params.lineaId, tomaFisicaId: toma.id },
  });
  if (!linea) return res.status(404).json({ message: "Línea no encontrada en esta toma física." });

  const actualizada = await prisma.tomaFisicaLinea.update({
    where: { id: linea.id },
    data: { conteoFisico: parseo.data.conteoFisico },
  });

  return res.json(actualizada);
};

/**
 * Cierra la toma física — registro interno de RicoSoft únicamente, nunca un
 * ajuste contable real en Siesa (Siesa es de solo lectura para RicoSoft).
 * Cualquier ajuste que corresponda por la diferencia lo hace un usuario
 * directamente en Siesa, manualmente, con su propio criterio.
 */
export const cerrarTomaFisica = async (req: AuthenticatedRequest, res: Response) => {
  const toma = await buscarTomaFisicaDelTenant(req.params.id, req.user!.tenantId);
  if (!toma) return res.status(404).json({ message: "Toma física no encontrada." });
  if (toma.estado !== "Abierta") {
    return res.status(400).json({ message: "Esta toma física ya está cerrada." });
  }

  const resumenLineas = await prisma.tomaFisicaLinea.findMany({ where: { tomaFisicaId: toma.id } });
  const resumen = calcularResumenTomaFisica(
    calcularLineasTomaFisica(
      resumenLineas.map((l) => ({
        id: l.id,
        itemRowId: l.itemRowId,
        descripcion: l.descripcion,
        referencia: l.referencia,
        stockSistema: Number(l.stockSistema),
        conteoFisico: l.conteoFisico !== null ? Number(l.conteoFisico) : null,
        valorUnitario: Number(l.valorUnitario),
      })),
    ),
  );

  const [actualizada] = await prisma.$transaction([
    prisma.tomaFisica.update({
      where: { id: toma.id },
      data: { estado: "Cerrada", cerradaEn: new Date() },
    }),
    prisma.auditoria.create({
      data: {
        tenantId: req.user!.tenantId,
        usuarioId: req.user!.id,
        accion: "TOMA_FISICA_CERRADA",
        detalle: `${req.user!.nombre} cerró la toma física de "${toma.bodegaNombre}".`,
        entidadTipo: "TomaFisica",
        entidadId: toma.id,
        datosAnteriores: JSON.stringify({ estado: "Abierta" }),
        datosNuevos: JSON.stringify({ estado: "Cerrada", resumen }),
      },
    }),
  ]);

  return res.json(actualizada);
};

/**
 * Diferencias recurrentes entre TODAS las tomas físicas cerradas del
 * tenant — señal de un problema operativo real (despacho, recepción,
 * unidad de medida), no ruido de un solo conteo. Ver lib/toma-fisica.ts
 * para la fórmula exacta. EXTRAÍDO como función reutilizable para que el
 * Centro Gerencial (server/src/modules/gerencial/) pueda usar el mismo
 * cálculo sin repetir la consulta ni la lógica.
 */
export async function calcularPatronesRecurrentesTenant(tenantId: string) {
  const tomasCerradas = await prisma.tomaFisica.findMany({
    where: { tenantId, estado: "Cerrada" },
    include: { lineas: true },
  });

  const historico: OcurrenciaDiferencia[] = [];
  for (const toma of tomasCerradas) {
    for (const linea of toma.lineas) {
      if (linea.conteoFisico === null) continue;
      const stockSistema = Number(linea.stockSistema);
      if (stockSistema === 0) continue;
      const diferenciaPct = ((Number(linea.conteoFisico) - stockSistema) / stockSistema) * 100;
      historico.push({
        tomaFisicaId: toma.id,
        fecha: toma.fecha,
        itemRowId: linea.itemRowId,
        descripcion: linea.descripcion,
        diferenciaPct,
      });
    }
  }

  return detectarPatronesRecurrentes(historico);
}

export const obtenerPatronesRecurrentes = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const patrones = await calcularPatronesRecurrentesTenant(tenantId);
  return res.json({ patrones });
};
