import { Response } from "express";
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

    const [data, total] = await Promise.all([
      prisma.auditoria.findMany({
        where: { tenantId },
        include: { usuario: { select: { nombre: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditoria.count({ where: { tenantId } }),
    ]);

    return res.json({ data, total, page, pageSize });
  } catch (error) {
    console.error("Error al listar auditoría:", error);
    return res.status(500).json({ message: "Error al obtener el registro de auditoría." });
  }
};
