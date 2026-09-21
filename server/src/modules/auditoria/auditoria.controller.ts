import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

/** Mismos filtros de fecha/acción/usuario para el listado paginado y para la
 * exportación — para que "exportar" siempre traiga exactamente lo que la
 * pantalla está mostrando filtrado, tenant incluido. */
function construirFiltro(req: AuthenticatedRequest): Prisma.AuditoriaWhereInput {
  const tenantId = req.user!.tenantId;
  const { desde, hasta, accion, usuarioId } = req.query;
  const where: Prisma.AuditoriaWhereInput = { tenantId };
  if (typeof desde === "string" && desde) {
    where.createdAt = { ...(where.createdAt as object), gte: new Date(`${desde}T00:00:00.000Z`) };
  }
  if (typeof hasta === "string" && hasta) {
    where.createdAt = { ...(where.createdAt as object), lte: new Date(`${hasta}T23:59:59.999Z`) };
  }
  if (typeof accion === "string" && accion) where.accion = { contains: accion };
  if (typeof usuarioId === "string" && usuarioId) where.usuarioId = usuarioId;
  return where;
}

export const listarAuditoria = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25),
    );

    // Filtros reales contra el backend (antes la pantalla solo reordenaba
    // visualmente los primeros 50 registros ya cargados) — rango de fechas
    // sobre `createdAt`, más acción/usuario opcionales para acotar búsquedas.
    const where = construirFiltro(req);

    const [data, total] = await Promise.all([
      prisma.auditoria.findMany({
        where,
        include: { usuario: { select: { nombre: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditoria.count({ where }),
    ]);

    return res.json({ data, total, page, pageSize });
  } catch (error) {
    console.error("Error al listar auditoría:", error);
    return res.status(500).json({ message: "Error al obtener el registro de auditoría." });
  }
};

// Tope de filas por exportación: suficiente para un reporte de auditoría
// normal (meses de actividad de un tenant) sin arriesgar tirar el proceso
// por memoria si alguien pide un rango de fechas enorme. Si algún día se
// necesita más, el filtro de fecha en pantalla ya permite acotar el reporte.
const MAX_FILAS_EXPORTACION = 20_000;

/** Envuelve en comillas dobles y escapa las que traiga el propio valor,
 * como exige el formato CSV (RFC 4180) — necesario porque `detalle` es texto
 * libre que puede traer comas, comillas o saltos de línea. */
function celdaCsv(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

/**
 * Exporta a CSV el mismo registro de auditoría que ve la pantalla, con los
 * mismos filtros de fecha/acción/usuario — permiso separado
 * (auditoria.exportar) de solo poder consultarlo (auditoria.ver), porque
 * descargar el log completo es una operación más sensible que solo verlo
 * paginado en pantalla.
 */
export const exportarAuditoria = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const where = construirFiltro(req);

    const eventos = await prisma.auditoria.findMany({
      where,
      include: { usuario: { select: { nombre: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: MAX_FILAS_EXPORTACION,
    });

    const encabezado = [
      "Fecha",
      "Usuario",
      "Correo",
      "Acción",
      "Detalle",
      "Entidad",
      "ID entidad",
      "Datos anteriores",
      "Datos nuevos",
    ];
    const filas = eventos.map((e) =>
      [
        e.createdAt.toISOString(),
        e.usuario?.nombre ?? e.usuarioAfectado ?? "",
        e.usuario?.email ?? "",
        e.accion,
        e.detalle,
        e.entidadTipo ?? "",
        e.entidadId ?? "",
        e.datosAnteriores ?? "",
        e.datosNuevos ?? "",
      ]
        .map(celdaCsv)
        .join(","),
    );
    // BOM UTF-8 al inicio: sin esto, Excel en Windows (el consumidor
    // esperado de este CSV) muestra tildes y "ñ" corrupted al abrirlo.
    const csv = "﻿" + [encabezado.map(celdaCsv).join(","), ...filas].join("\r\n");

    await prisma.auditoria.create({
      data: {
        tenantId: req.user!.tenantId,
        usuarioId: req.user!.id,
        accion: "AUDITORIA_EXPORTADA",
        detalle: `${req.user!.nombre} exportó el registro de auditoría (${eventos.length} eventos).`,
      },
    });

    const nombreArchivo = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
    return res.send(csv);
  } catch (error) {
    console.error("Error al exportar auditoría:", error);
    return res.status(500).json({ message: "Error al exportar el registro de auditoría." });
  }
};
