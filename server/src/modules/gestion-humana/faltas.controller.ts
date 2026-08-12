import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const GRAVEDADES_VALIDAS = ["Leve", "Grave", "Muy Grave"];

export const listarFaltas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: any = { tenantId };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;

    const faltas = await prisma.faltaStrike.findMany({
      where,
      include: { empleado: { select: { nombres: true, apellidos: true } } },
      orderBy: { fecha: "desc" },
    });
    return res.json(
      faltas.map((f) => ({ ...f, nombreEmpleado: `${f.empleado.nombres} ${f.empleado.apellidos}` })),
    );
  } catch (error) {
    console.error("Error al listar faltas:", error);
    return res.status(500).json({ message: "Error al obtener las faltas disciplinarias." });
  }
};

export const crearFalta = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empleadoId, gravedad, motivo, descargos } = req.body;

    if (!empleadoId || !motivo) {
      return res.status(400).json({ message: "Colaborador y motivo son obligatorios." });
    }
    if (!GRAVEDADES_VALIDAS.includes(gravedad)) {
      return res.status(400).json({ message: "Gravedad no válida." });
    }

    const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, tenantId } });
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    const falta = await prisma.faltaStrike.create({
      data: {
        tenantId,
        empresaId: empleado.empresaId,
        empleadoId,
        gravedad,
        motivo,
        descargos: descargos || null,
        registradoPor: req.user!.nombre,
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "FALTA_REGISTRADA",
        detalle: `${req.user!.nombre} registró una falta (${gravedad}) a "${empleado.nombres} ${empleado.apellidos}"`,
      },
    });

    return res.status(201).json({
      ...falta,
      nombreEmpleado: `${empleado.nombres} ${empleado.apellidos}`,
    });
  } catch (error) {
    console.error("Error al crear falta:", error);
    return res.status(500).json({ message: "Error al registrar la falta." });
  }
};
