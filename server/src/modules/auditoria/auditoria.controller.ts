import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

export const listarAuditoria = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25),
    );

    // Filtros reales contra el backend (antes la pantalla solo reordenaba
    // visualmente los primeros 50 registros ya cargados) — rango de fechas
    // sobre `createdAt`, más acción/usuario opcionales para acotar búsquedas.
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
