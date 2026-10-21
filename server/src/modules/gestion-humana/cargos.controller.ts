import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { limpiarNombreCargo, normalizarNombreCargo } from "../../lib/cargos";

const NOMBRE_MAX = 255;

// Solo colaboradores vigentes: los expedientes eliminados (soft-delete,
// Empleado.eliminado = true) siguen en la tabla pero ya no aparecen en el
// listado de Gestión Humana, así que no cuentan como asignados al cargo.
const CONTEO_COLABORADORES = { where: { eliminado: false } } as const;

function esViolacionUnica(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function serializar(c: {
  id: string;
  nombre: string;
  activo: boolean;
  correoCorporativoRequerido: boolean;
  _count?: { empleados: number };
}) {
  return {
    id: c.id,
    nombre: c.nombre,
    activo: c.activo,
    correoCorporativoRequerido: c.correoCorporativoRequerido,
    colaboradoresAsignados: c._count?.empleados ?? 0,
  };
}

/** Catálogo completo (activos e inactivos) del tenant autenticado. */
export const listarCargos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const cargos = await prisma.cargoColaborador.findMany({
      where: { tenantId },
      include: { _count: { select: { empleados: CONTEO_COLABORADORES } } },
      orderBy: { nombre: "asc" },
    });
    return res.json(cargos.map(serializar));
  } catch (error) {
    console.error("Error al listar cargos:", error);
    return res.status(500).json({ message: "Error al obtener los cargos." });
  }
};

/**
 * Cargos ACTIVOS (id, nombre, regla de correo) para el selector del formulario
 * de colaborador. Va aparte de listarCargos para que quien registra
 * colaboradores no necesite el permiso de administrar el catálogo.
 */
export const listarCargosOpciones = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const cargos = await prisma.cargoColaborador.findMany({
      where: { tenantId, activo: true },
      select: { id: true, nombre: true, correoCorporativoRequerido: true },
      orderBy: { nombre: "asc" },
    });
    return res.json(cargos);
  } catch (error) {
    console.error("Error al listar opciones de cargos:", error);
    return res.status(500).json({ message: "Error al obtener los cargos." });
  }
};

function validarNombre(valor: unknown): { nombre: string; normalizado: string } | string {
  if (typeof valor !== "string") return "El nombre del cargo es obligatorio.";
  const nombre = limpiarNombreCargo(valor);
  if (!nombre) return "El nombre del cargo es obligatorio.";
  if (nombre.length > NOMBRE_MAX) {
    return `El nombre del cargo no puede superar ${NOMBRE_MAX} caracteres.`;
  }
  return { nombre, normalizado: normalizarNombreCargo(nombre) };
}

export const crearCargo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { nombre: nombreBody, correoCorporativoRequerido } = req.body ?? {};

    const validado = validarNombre(nombreBody);
    if (typeof validado === "string") return res.status(400).json({ message: validado });
    if (
      correoCorporativoRequerido !== undefined &&
      typeof correoCorporativoRequerido !== "boolean"
    ) {
      return res.status(400).json({ message: "correoCorporativoRequerido debe ser booleano." });
    }

    const existente = await prisma.cargoColaborador.findFirst({
      where: { tenantId, nombreNormalizado: validado.normalizado },
      select: { id: true },
    });
    if (existente) {
      return res.status(409).json({ message: "Ya existe un cargo con ese nombre." });
    }

    // Cargo + auditoría en una sola transacción: si la auditoría falla, el
    // cargo no queda creado sin rastro.
    const cargo = await prisma.$transaction(async (tx) => {
      const creado = await tx.cargoColaborador.create({
        data: {
          tenantId,
          nombre: validado.nombre,
          nombreNormalizado: validado.normalizado,
          correoCorporativoRequerido: correoCorporativoRequerido ?? true,
        },
      });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "CARGO_CREADO",
          detalle: `${req.user!.nombre} creó el cargo "${creado.nombre}"`,
          entidadTipo: "CargoColaborador",
          entidadId: creado.id,
        },
      });
      return creado;
    });

    return res.status(201).json(serializar(cargo));
  } catch (error) {
    // La carrera de dos creaciones simultáneas la resuelve el índice único
    // (tenantId, nombreNormalizado), no el findFirst de arriba.
    if (esViolacionUnica(error)) {
      return res.status(409).json({ message: "Ya existe un cargo con ese nombre." });
    }
    console.error("Error al crear cargo:", error);
    return res.status(500).json({ message: "Error al crear el cargo." });
  }
};

export const actualizarCargo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { nombre: nombreBody, activo, correoCorporativoRequerido } = req.body ?? {};

    const existente = await prisma.cargoColaborador.findFirst({ where: { id, tenantId } });
    if (!existente) return res.status(404).json({ message: "Cargo no encontrado." });

    const data: Prisma.CargoColaboradorUpdateInput = {};
    const cambios: string[] = [];

    if (nombreBody !== undefined) {
      const validado = validarNombre(nombreBody);
      if (typeof validado === "string") return res.status(400).json({ message: validado });
      if (validado.normalizado !== existente.nombreNormalizado) {
        const duplicado = await prisma.cargoColaborador.findFirst({
          where: { tenantId, nombreNormalizado: validado.normalizado, id: { not: id } },
          select: { id: true },
        });
        if (duplicado) {
          return res.status(409).json({ message: "Ya existe un cargo con ese nombre." });
        }
      }
      if (validado.nombre !== existente.nombre) {
        data.nombre = validado.nombre;
        data.nombreNormalizado = validado.normalizado;
        cambios.push("nombre");
      }
    }
    if (activo !== undefined) {
      if (typeof activo !== "boolean") {
        return res.status(400).json({ message: "activo debe ser booleano." });
      }
      if (activo !== existente.activo) {
        data.activo = activo;
        cambios.push(activo ? "activado" : "desactivado");
      }
    }
    if (correoCorporativoRequerido !== undefined) {
      if (typeof correoCorporativoRequerido !== "boolean") {
        return res.status(400).json({ message: "correoCorporativoRequerido debe ser booleano." });
      }
      if (correoCorporativoRequerido !== existente.correoCorporativoRequerido) {
        data.correoCorporativoRequerido = correoCorporativoRequerido;
        cambios.push("correo corporativo requerido");
      }
    }

    if (cambios.length === 0) return res.json(serializar(existente));

    // El renombre de un cargo no reescribe Empleado.cargo (snapshot histórico
    // del nombre al momento de la asignación).
    const actualizado = await prisma.$transaction(async (tx) => {
      const c = await tx.cargoColaborador.update({
        where: { id },
        data,
        include: { _count: { select: { empleados: CONTEO_COLABORADORES } } },
      });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "CARGO_EDITADO",
          detalle: `${req.user!.nombre} editó el cargo "${existente.nombre}" (${cambios.join(", ")})`,
          entidadTipo: "CargoColaborador",
          entidadId: id,
        },
      });
      return c;
    });

    return res.json(serializar(actualizado));
  } catch (error) {
    if (esViolacionUnica(error)) {
      return res.status(409).json({ message: "Ya existe un cargo con ese nombre." });
    }
    console.error("Error al actualizar cargo:", error);
    return res.status(500).json({ message: "Error al actualizar el cargo." });
  }
};
