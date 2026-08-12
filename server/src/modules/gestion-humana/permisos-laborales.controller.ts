import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const ESTADOS_VALIDOS = ["Pendiente", "Aprobado", "Rechazado"];

export const listarPermisosLaborales = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: any = { tenantId };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;

    const permisos = await prisma.permisoLaboral.findMany({
      where,
      include: { empleado: { select: { nombres: true, apellidos: true } } },
      orderBy: { fechaSolicitud: "desc" },
    });
    return res.json(
      permisos.map((p) => ({
        ...p,
        nombreEmpleado: `${p.empleado.nombres} ${p.empleado.apellidos}`,
        empleadoId: p.empleadoId,
      })),
    );
  } catch (error) {
    console.error("Error al listar permisos laborales:", error);
    return res.status(500).json({ message: "Error al obtener permisos laborales." });
  }
};

export const crearPermisoLaboral = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empleadoId, tipoPermiso, fechaInicio, fechaFin, dias, observaciones } = req.body;

    if (!empleadoId || !tipoPermiso || !fechaInicio || !fechaFin) {
      return res.status(400).json({ message: "Faltan campos obligatorios del permiso." });
    }

    const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, tenantId } });
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    const diasNum = Number(dias);
    if (!Number.isFinite(diasNum) || diasNum <= 0) {
      return res.status(400).json({ message: "Los días deben ser un número positivo." });
    }

    const permiso = await prisma.permisoLaboral.create({
      data: {
        tenantId,
        empresaId: empleado.empresaId,
        empleadoId,
        tipoPermiso,
        fechaInicio: new Date(fechaInicio),
        fechaFin: new Date(fechaFin),
        dias: diasNum,
        observaciones: observaciones || null,
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PERMISO_LABORAL_SOLICITADO",
        detalle: `${req.user!.nombre} solicitó ${tipoPermiso} para "${empleado.nombres} ${empleado.apellidos}"`,
      },
    });

    return res.status(201).json({
      ...permiso,
      nombreEmpleado: `${empleado.nombres} ${empleado.apellidos}`,
    });
  } catch (error) {
    console.error("Error al crear permiso laboral:", error);
    return res.status(500).json({ message: "Error al registrar el permiso." });
  }
};

export const actualizarEstadoPermisoLaboral = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { estado } = req.body;

    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }

    const permiso = await prisma.permisoLaboral.findFirst({
      where: { id, tenantId },
      include: { empleado: { select: { nombres: true, apellidos: true } } },
    });
    if (!permiso) return res.status(404).json({ message: "Permiso no encontrado." });

    const actualizado = await prisma.permisoLaboral.update({ where: { id }, data: { estado } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PERMISO_LABORAL_ACTUALIZADO",
        detalle: `${req.user!.nombre} marcó el permiso de "${permiso.empleado.nombres} ${permiso.empleado.apellidos}" como "${estado}"`,
      },
    });

    return res.json({
      ...actualizado,
      nombreEmpleado: `${permiso.empleado.nombres} ${permiso.empleado.apellidos}`,
    });
  } catch (error) {
    console.error("Error al actualizar permiso laboral:", error);
    return res.status(500).json({ message: "Error al actualizar el permiso." });
  }
};
