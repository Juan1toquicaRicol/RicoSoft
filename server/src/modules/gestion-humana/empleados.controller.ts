import { Response } from "express";
import { Empleado, HistorialSalario, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { DOMINIOS_PERMITIDOS, esDominioCorporativoValido } from "../../lib/dominios";

type EmpleadoConRelaciones = Empleado & {
  historicoSalario?: HistorialSalario[];
  _count?: { faltas: number };
};

function serializarEmpleado(e: EmpleadoConRelaciones) {
  return {
    ...e,
    salarioActual: Number(e.salarioActual),
    strikesCount: e._count?.faltas ?? 0,
    historicoSalario: (e.historicoSalario ?? []).map((h) => ({
      fecha: h.fecha,
      salarioAnterior: Number(h.salarioAnterior),
      nuevoSalario: Number(h.nuevoSalario),
      motivo: h.motivo,
    })),
  };
}

export const listarEmpleados = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: Prisma.EmpleadoWhereInput = { tenantId, eliminado: false };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;

    const empleados = await prisma.empleado.findMany({
      where,
      include: {
        historicoSalario: { orderBy: { fecha: "desc" } },
        _count: { select: { faltas: true } },
      },
      orderBy: { nombres: "asc" },
      take: 1000, // límite de seguridad temporal; falta paginación real (ver auditoría)
    });
    return res.json(empleados.map(serializarEmpleado));
  } catch (error) {
    console.error("Error al listar empleados:", error);
    return res.status(500).json({ message: "Error al obtener empleados." });
  }
};

export const crearEmpleado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      empresaId,
      documento,
      nombres,
      apellidos,
      correo,
      cargo,
      area,
      fechaContratacion,
      salarioActual,
    } = req.body;

    if (!empresaId || !documento || !nombres || !apellidos || !fechaContratacion || !correo) {
      return res.status(400).json({ message: "Faltan campos obligatorios del colaborador." });
    }
    const correoLimpio = String(correo).trim().toLowerCase();
    if (!esDominioCorporativoValido(correoLimpio)) {
      return res.status(400).json({
        message: `El correo debe ser corporativo (${DOMINIOS_PERMITIDOS.map((d) => `@${d}`).join(", ")}). No se permiten correos personales.`,
      });
    }
    const salario = Number(salarioActual);
    if (!Number.isFinite(salario) || salario < 0) {
      return res.status(400).json({ message: "El salario debe ser un número no negativo." });
    }

    const empleado = await prisma.empleado.create({
      data: {
        tenantId,
        empresaId,
        documento,
        nombres,
        apellidos,
        correo: correoLimpio,
        cargo: cargo || "Colaborador",
        area: area || "Operaciones",
        fechaContratacion: new Date(fechaContratacion),
        salarioActual: salario,
        historicoSalario: {
          create: {
            salarioAnterior: 0,
            nuevoSalario: salario,
            motivo: "Contratación Inicial",
          },
        },
      },
      include: { historicoSalario: true },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "EMPLEADO_CREADO",
        detalle: `${req.user!.nombre} registró al colaborador "${nombres} ${apellidos}"`,
      },
    });

    return res.status(201).json(serializarEmpleado(empleado));
  } catch (error) {
    console.error("Error al crear empleado:", error);
    return res.status(500).json({ message: "Error al registrar el colaborador." });
  }
};

export const actualizarSalario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { nuevoSalario, motivo } = req.body;

    const empleado = await prisma.empleado.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    const salario = Number(nuevoSalario);
    if (!Number.isFinite(salario) || salario < 0) {
      return res.status(400).json({ message: "El salario debe ser un número no negativo." });
    }

    const actualizado = await prisma.empleado.update({
      where: { id },
      data: {
        salarioActual: salario,
        historicoSalario: {
          create: {
            salarioAnterior: empleado.salarioActual,
            nuevoSalario: salario,
            motivo: motivo || "Ajuste salarial",
          },
        },
      },
      include: { historicoSalario: { orderBy: { fecha: "desc" } } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "EMPLEADO_SALARIO_EDITADO",
        detalle: `${req.user!.nombre} modificó el salario de "${empleado.nombres} ${empleado.apellidos}"`,
      },
    });

    return res.json(serializarEmpleado(actualizado));
  } catch (error) {
    console.error("Error al actualizar salario:", error);
    return res.status(500).json({ message: "Error al actualizar el salario." });
  }
};

export const liquidarEmpleado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { fechaLiquidacion } = req.body;

    const empleado = await prisma.empleado.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    const actualizado = await prisma.empleado.update({
      where: { id },
      data: {
        estado: "Liquidado",
        fechaLiquidacion: fechaLiquidacion ? new Date(fechaLiquidacion) : new Date(),
      },
      include: { historicoSalario: { orderBy: { fecha: "desc" } } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "EMPLEADO_LIQUIDADO",
        detalle: `${req.user!.nombre} liquidó a "${empleado.nombres} ${empleado.apellidos}"`,
      },
    });

    return res.json(serializarEmpleado(actualizado));
  } catch (error) {
    console.error("Error al liquidar empleado:", error);
    return res.status(500).json({ message: "Error al liquidar el colaborador." });
  }
};

/**
 * Elimina (soft-delete) el expediente de un colaborador. No se borra de la
 * base de datos: se marca `eliminado` para conservar historial salarial,
 * faltas y permisos asociados, y deja de aparecer en el listado.
 */
export const eliminarEmpleado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const empleado = await prisma.empleado.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    await prisma.empleado.update({ where: { id }, data: { eliminado: true } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "EMPLEADO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el expediente de "${empleado.nombres} ${empleado.apellidos}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar empleado:", error);
    return res.status(500).json({ message: "Error al eliminar el colaborador." });
  }
};
