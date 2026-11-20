import { Response } from "express";
import { Empleado, HistorialSalario, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { normalizarNombreCargo, validarCorreoColaborador } from "../../lib/cargos";

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

type CargoResuelto = {
  id: string;
  nombre: string;
  correoCorporativoRequerido: boolean;
  departamentoId: string | null;
  departamento: { nombre: string } | null;
};

/**
 * Resuelve un cargo SOLO dentro del tenant autenticado: un id de otro tenant
 * responde igual que uno inexistente (no revela que existe). `permitirInactivo`
 * se usa al editar para conservar el cargo actual aunque ya esté desactivado.
 */
async function resolverCargoDelTenant(
  tenantId: string,
  cargoId: string,
  permitirInactivo = false,
): Promise<{ cargo: CargoResuelto } | { error: string }> {
  const cargo = await prisma.cargoColaborador.findFirst({
    where: { id: cargoId, tenantId },
    select: {
      id: true,
      nombre: true,
      activo: true,
      correoCorporativoRequerido: true,
      departamentoId: true,
      departamento: { select: { nombre: true } },
    },
  });
  if (!cargo) return { error: "El cargo seleccionado no es válido." };
  if (!cargo.activo && !permitirInactivo) {
    return { error: "El cargo seleccionado está inactivo." };
  }
  return { cargo };
}

/**
 * Resuelve el tipo de contrato SOLO dentro del catálogo ACTIVO del tenant
 * autenticado y devuelve el nombre canónico del catálogo.
 */
async function resolverTipoContrato(
  tenantId: string,
  valor: string,
): Promise<{ nombre: string } | { error: string }> {
  const item = await prisma.catalogoSeguridadSocial.findFirst({
    where: {
      tenantId,
      tipo: "TIPO_CONTRATO",
      activo: true,
      nombreNormalizado: normalizarNombreCargo(valor),
    },
    select: { nombre: true },
  });
  return item
    ? { nombre: item.nombre }
    : {
        error: "El tipo de contrato seleccionado no está en el catálogo de Gestión de información.",
      };
}

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
      cargoId,
      tipoContrato,
      area,
      fechaContratacion,
      salarioActual,
    } = req.body;

    if (!empresaId || !documento || !nombres || !apellidos || !fechaContratacion) {
      return res.status(400).json({ message: "Faltan campos obligatorios del colaborador." });
    }

    // Regla del correo según el cargo del catálogo. Sin cargo del catálogo
    // (cargoId ausente) se conserva el comportamiento histórico: correo
    // corporativo obligatorio.
    let cargoCatalogo: CargoResuelto | null = null;
    if (cargoId !== undefined && cargoId !== null && cargoId !== "") {
      if (typeof cargoId !== "string") {
        return res.status(400).json({ message: "El cargo seleccionado no es válido." });
      }
      const resuelto = await resolverCargoDelTenant(tenantId, cargoId);
      if ("error" in resuelto) return res.status(400).json({ message: resuelto.error });
      cargoCatalogo = resuelto.cargo;
    }
    const validacionCorreo = validarCorreoColaborador(
      correo,
      cargoCatalogo ? cargoCatalogo.correoCorporativoRequerido : true,
      typeof empresaId === "string" ? empresaId : null,
    );
    if (!validacionCorreo.ok) {
      return res.status(400).json({ message: validacionCorreo.message });
    }

    const salario = Number(salarioActual);
    if (!Number.isFinite(salario) || salario < 0) {
      return res.status(400).json({ message: "El salario debe ser un número no negativo." });
    }

    let tipoContratoNombre: string | null = null;
    if (tipoContrato !== undefined && tipoContrato !== null && tipoContrato !== "") {
      if (typeof tipoContrato !== "string") {
        return res.status(400).json({ message: "El tipo de contrato no es válido." });
      }
      const resuelto = await resolverTipoContrato(tenantId, tipoContrato);
      if ("error" in resuelto) return res.status(400).json({ message: resuelto.error });
      tipoContratoNombre = resuelto.nombre;
    }

    const nombreCargo =
      cargoCatalogo?.nombre ?? (typeof cargo === "string" && cargo.trim() ? cargo : "Colaborador");

    // Empleado + auditoría en una sola transacción.
    const empleado = await prisma.$transaction(async (tx) => {
      const creado = await tx.empleado.create({
        data: {
          tenantId,
          empresaId,
          documento,
          nombres,
          apellidos,
          correo: validacionCorreo.correo,
          cargo: nombreCargo,
          cargoId: cargoCatalogo?.id ?? null,
          tipoContrato: tipoContratoNombre,
          area: (cargoCatalogo?.departamento?.nombre ?? area) || "Operaciones",
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
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "EMPLEADO_CREADO",
          detalle: `${req.user!.nombre} registró al colaborador "${nombres} ${apellidos}"`,
        },
      });
      return creado;
    });

    return res.status(201).json(serializarEmpleado(empleado));
  } catch (error) {
    console.error("Error al crear empleado:", error);
    return res.status(500).json({ message: "Error al registrar el colaborador." });
  }
};

/**
 * Cambia el cargo y/o el correo de un colaborador. Revalida la regla del
 * correo con el cargo RESULTANTE: pasar a un cargo que exige correo falla si
 * el colaborador no tiene uno y no se envía. Se permite conservar un cargo
 * ya desactivado (histórico), pero no cambiar hacia uno inactivo.
 */
export const editarEmpleado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const body = req.body ?? {};

    const empleado = await prisma.empleado.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    const incluyeCargo = "cargoId" in body;
    const cambiaCargo = incluyeCargo && (body.cargoId || null) !== empleado.cargoId;
    const incluyeCorreo = "correo" in body;
    const incluyeTipoContrato = "tipoContrato" in body;
    if (!incluyeCargo && !incluyeCorreo && !incluyeTipoContrato) {
      return res.status(400).json({ message: "No hay cambios para aplicar." });
    }

    const cargoIdDestino = incluyeCargo ? body.cargoId || null : empleado.cargoId;
    let cargoDestino: CargoResuelto | null = null;
    if (cargoIdDestino) {
      if (typeof cargoIdDestino !== "string") {
        return res.status(400).json({ message: "El cargo seleccionado no es válido." });
      }
      const resuelto = await resolverCargoDelTenant(tenantId, cargoIdDestino, !cambiaCargo);
      if ("error" in resuelto) return res.status(400).json({ message: resuelto.error });
      cargoDestino = resuelto.cargo;
    } else if (cambiaCargo) {
      // El colaborador ya tiene un cargo del catálogo: no se permite dejarlo vacío.
      return res.status(400).json({ message: "El cargo seleccionado no es válido." });
    }

    // Un correo YA guardado que no se envía de nuevo no se revalida contra el
    // dominio (puede ser anterior a la regla); solo se exige que exista si el
    // cargo resultante lo requiere.
    const correoRequeridoDestino = cargoDestino ? cargoDestino.correoCorporativoRequerido : true;
    const validacionCorreo =
      !incluyeCorreo && empleado.correo
        ? ({ ok: true, correo: empleado.correo } as const)
        : validarCorreoColaborador(
            incluyeCorreo ? body.correo : empleado.correo,
            correoRequeridoDestino,
            empleado.empresaId,
          );
    if (!validacionCorreo.ok) {
      return res.status(400).json({ message: validacionCorreo.message });
    }

    const data: Prisma.EmpleadoUncheckedUpdateInput = {};
    const cambios: string[] = [];
    if (cambiaCargo && cargoDestino) {
      data.cargoId = cargoDestino.id;
      data.cargo = cargoDestino.nombre;
      cambios.push("cargo");
    }
    if (validacionCorreo.correo !== empleado.correo) {
      data.correo = validacionCorreo.correo;
      cambios.push("correo");
    }
    if (incluyeTipoContrato) {
      const v = body.tipoContrato;
      if (v === null || v === undefined || v === "") {
        if (empleado.tipoContrato !== null) {
          data.tipoContrato = null;
          cambios.push("tipo de contrato");
        }
      } else if (typeof v !== "string") {
        return res.status(400).json({ message: "El tipo de contrato no es válido." });
      } else if (v !== empleado.tipoContrato) {
        // Conservar el valor ya guardado no se revalida (puede estar desactivado).
        const resuelto = await resolverTipoContrato(tenantId, v);
        if ("error" in resuelto) return res.status(400).json({ message: resuelto.error });
        if (resuelto.nombre !== empleado.tipoContrato) {
          data.tipoContrato = resuelto.nombre;
          cambios.push("tipo de contrato");
        }
      }
    }
    if (cambios.length === 0) {
      return res.json(serializarEmpleado(empleado));
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      const e = await tx.empleado.update({
        where: { id },
        data,
        include: { historicoSalario: { orderBy: { fecha: "desc" } } },
      });
      // Solo se registran los NOMBRES de los campos cambiados, no sus valores.
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "EMPLEADO_EDITADO",
          detalle: `${req.user!.nombre} modificó (${cambios.join(", ")}) del colaborador "${empleado.nombres} ${empleado.apellidos}"`,
          entidadTipo: "Empleado",
          entidadId: id,
        },
      });
      return e;
    });

    return res.json(serializarEmpleado(actualizado));
  } catch (error) {
    console.error("Error al editar empleado:", error);
    return res.status(500).json({ message: "Error al editar el colaborador." });
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
