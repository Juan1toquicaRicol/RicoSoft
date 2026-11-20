import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { MENSAJE_COLABORADOR_LIQUIDADO } from "./empleados.controller";

const ESTADOS_VALIDOS = ["Pendiente", "Aprobado", "Rechazado"];

export const MENSAJE_PERMISO_COLABORADOR_NO_VIGENTE =
  'El colaborador está liquidado o eliminado: su permiso no se puede aprobar ni reabrir, solo marcar como "Rechazado".';

/** Vigente = ni eliminado ni liquidado (D-04). Misma regla para la lista y el cambio de estado. */
function esColaboradorVigente(empleado: { estado: string; eliminado: boolean }): boolean {
  return !empleado.eliminado && empleado.estado !== "Liquidado";
}

export const listarPermisosLaborales = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: Prisma.PermisoLaboralWhereInput = { tenantId };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;

    const permisos = await prisma.permisoLaboral.findMany({
      where,
      include: {
        empleado: { select: { nombres: true, apellidos: true, estado: true, eliminado: true } },
      },
      orderBy: { fechaSolicitud: "desc" },
      take: 1000, // límite de seguridad temporal; falta paginación real (ver auditoría)
    });
    return res.json(
      permisos.map(({ empleado, ...p }) => ({
        ...p,
        empleado: { nombres: empleado.nombres, apellidos: empleado.apellidos },
        nombreEmpleado: `${empleado.nombres} ${empleado.apellidos}`,
        empleadoId: p.empleadoId,
        // D-04: la UI no ofrece aprobar si el colaborador ya no está vigente.
        colaboradorVigente: esColaboradorVigente(empleado),
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

    // Un colaborador eliminado no existe para esta operación (404) y uno liquidado
    // conserva su historial pero no recibe permisos laborales nuevos (409).
    const empleado = await prisma.empleado.findFirst({
      where: { id: empleadoId, tenantId, eliminado: false },
    });
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });
    if (empleado.estado === "Liquidado") {
      return res.status(409).json({ message: MENSAJE_COLABORADOR_LIQUIDADO });
    }

    const diasNum = Number(dias);
    if (!Number.isFinite(diasNum) || diasNum <= 0) {
      return res.status(400).json({ message: "Los días deben ser un número positivo." });
    }

    const inicioDate = new Date(fechaInicio);
    const finDate = new Date(fechaFin);
    if (Number.isNaN(inicioDate.getTime()) || Number.isNaN(finDate.getTime())) {
      return res.status(400).json({ message: "Las fechas del permiso no son válidas." });
    }
    if (finDate < inicioDate) {
      return res
        .status(400)
        .json({ message: "La fecha de fin no puede ser anterior a la fecha de inicio." });
    }

    const permiso = await prisma.permisoLaboral.create({
      data: {
        tenantId,
        empresaId: empleado.empresaId,
        empleadoId,
        tipoPermiso,
        fechaInicio: inicioDate,
        fechaFin: finDate,
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
      include: {
        empleado: { select: { nombres: true, apellidos: true, estado: true, eliminado: true } },
      },
    });
    if (!permiso) return res.status(404).json({ message: "Permiso no encontrado." });

    // D-04: el permiso de un colaborador liquidado o eliminado no se aprueba ni
    // se reabre; solo puede quedar "Rechazado" (cubre también pendientes
    // anteriores a que liquidar/eliminar los cerrara automáticamente).
    if (!esColaboradorVigente(permiso.empleado) && estado !== "Rechazado") {
      return res.status(409).json({ message: MENSAJE_PERMISO_COLABORADOR_NO_VIGENTE });
    }

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
