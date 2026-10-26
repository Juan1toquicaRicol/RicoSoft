import { Response } from "express";
import { Prisma, EmpleadoBiometrico } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

/**
 * API administrativa de EmpleadoBiometrico (Fase 6): el vínculo explícito
 * entre un `externalUserId` de CrossChex y un Empleado de RicoSoft. Nunca
 * se crea/infiere automáticamente por nombre, documento, teléfono o correo
 * — ver la prohibición explícita en la auditoría original.
 *
 * Fase 6.1: la unicidad de EmpleadoBiometrico se corrigió a
 * (tenantId, fuenteId, externalUserId) — un externalUserId identifica a un
 * usuario dentro de UNA instalación física de CrossChex, no de "todo lo que
 * use el mismo proveedor". Esta API exige `fuenteId` al crear, valida que
 * pertenezca al tenant, y usa exactamente ese `fuenteId` (no solo el
 * `proveedor` derivado de él) al construir el registro y al filtrar.
 */

type AsociacionConRelaciones = EmpleadoBiometrico & {
  empleado: { id: string; nombres: string; apellidos: string; documento: string } | null;
};

function serializarAsociacion(a: AsociacionConRelaciones) {
  return {
    id: a.id,
    fuenteId: a.fuenteId,
    proveedor: a.proveedor,
    externalUserId: a.externalUserId,
    activo: a.activo,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    empleado: a.empleado
      ? {
          id: a.empleado.id,
          nombres: a.empleado.nombres,
          apellidos: a.empleado.apellidos,
          documento: a.empleado.documento,
        }
      : null,
  };
}

const INCLUDE_EMPLEADO = {
  empleado: { select: { id: true, nombres: true, apellidos: true, documento: true } },
};

function leerPaginacion(query: AuthenticatedRequest["query"]) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit };
}

/** Lista asociaciones del tenant actual. `fuenteId` es el filtro principal
 * esperado; también admite filtrar directo por empleadoId/externalUserId/
 * activo. */
export async function listarAsociacionesBiometricas(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { fuenteId, empleadoId, externalUserId, activo } = req.query;
    const { page, limit } = leerPaginacion(req.query);

    const where: Prisma.EmpleadoBiometricoWhereInput = { tenantId };

    if (typeof fuenteId === "string" && fuenteId) {
      const fuente = await prisma.fuenteBiometrica.findFirst({ where: { id: fuenteId, tenantId } });
      if (!fuente) return res.status(404).json({ message: "Fuente biométrica no encontrada." });
      where.fuenteId = fuente.id;
    }
    if (typeof empleadoId === "string" && empleadoId) where.empleadoId = empleadoId;
    if (typeof externalUserId === "string" && externalUserId) where.externalUserId = externalUserId;
    if (activo === "true") where.activo = true;
    else if (activo === "false") where.activo = false;

    const [items, total] = await Promise.all([
      prisma.empleadoBiometrico.findMany({
        where,
        include: INCLUDE_EMPLEADO,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.empleadoBiometrico.count({ where }),
    ]);

    return res.json({
      items: items.map(serializarAsociacion),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error al listar asociaciones biométricas:", error);
    return res.status(500).json({ message: "Error al obtener las asociaciones biométricas." });
  }
}

/**
 * Crea una asociación explícita. Valida, en este orden: la fuente pertenece
 * al tenant, el empleado pertenece al tenant (y no está eliminado),
 * `externalUserId` tiene formato válido, y deja que la restricción única de
 * Prisma/SQL Server sea el árbitro final de "ya existe" (P2002 → 409) en vez
 * de duplicar esa lógica con un findFirst previo que igual podría perder
 * una carrera. NO valida `externalUserId` contra CrossChex en vivo: acoplar
 * esta escritura administrativa a la disponibilidad del .mdb (que puede
 * estar bloqueado por CrossChex en ese instante) es un costo/riesgo que no
 * se justifica — el admin puede confirmar por separado con
 * GET /biometrico/marcaciones?soloNoAsociados=true si ese externalUserId ya
 * está generando marcaciones reales.
 */
export async function crearAsociacionBiometrica(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { fuenteId, externalUserId, empleadoId } = req.body ?? {};

    if (typeof fuenteId !== "string" || !fuenteId) {
      return res.status(400).json({ message: "fuenteId es obligatorio." });
    }
    if (
      typeof externalUserId !== "string" ||
      externalUserId.trim().length === 0 ||
      externalUserId.length > 50
    ) {
      return res
        .status(400)
        .json({ message: "externalUserId es obligatorio (máximo 50 caracteres)." });
    }
    if (typeof empleadoId !== "string" || !empleadoId) {
      return res.status(400).json({ message: "empleadoId es obligatorio." });
    }

    const fuente = await prisma.fuenteBiometrica.findFirst({ where: { id: fuenteId, tenantId } });
    if (!fuente) return res.status(404).json({ message: "Fuente biométrica no encontrada." });

    const empleado = await prisma.empleado.findFirst({
      where: { id: empleadoId, tenantId, eliminado: false },
    });
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    const asociacion = await prisma.empleadoBiometrico.create({
      data: {
        tenantId,
        empleadoId,
        fuenteId: fuente.id,
        proveedor: fuente.proveedor,
        externalUserId: externalUserId.trim(),
      },
      include: INCLUDE_EMPLEADO,
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "BIOMETRICO_ASOCIACION_CREADA",
        detalle: `${req.user!.nombre} asoció el usuario biométrico "${asociacion.externalUserId}" (${fuente.nombre}) con "${empleado.nombres} ${empleado.apellidos}".`,
        entidadTipo: "EmpleadoBiometrico",
        entidadId: asociacion.id,
      },
    });

    return res.status(201).json(serializarAsociacion(asociacion));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({
        message:
          "Ya existe una asociación con ese externalUserId para esta fuente, o este colaborador ya tiene una asociación activa con esta fuente.",
      });
    }
    console.error("Error al crear asociación biométrica:", error);
    return res.status(500).json({ message: "Error al crear la asociación biométrica." });
  }
}

/** Solo permite activar/desactivar. Reasignar empleado o externalUserId
 * exige desactivar y crear una asociación nueva — evita que una edición
 * "silenciosa" cambie a quién pertenecen marcaciones ya importadas. */
export async function actualizarAsociacionBiometrica(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { activo } = req.body ?? {};

    if (typeof activo !== "boolean") {
      return res.status(400).json({ message: "'activo' es obligatorio y debe ser booleano." });
    }

    const asociacion = await prisma.empleadoBiometrico.findFirst({ where: { id, tenantId } });
    if (!asociacion)
      return res.status(404).json({ message: "Asociación biométrica no encontrada." });

    const actualizada = await prisma.empleadoBiometrico.update({
      where: { id },
      data: { activo },
      include: INCLUDE_EMPLEADO,
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: activo ? "BIOMETRICO_ASOCIACION_ACTIVADA" : "BIOMETRICO_ASOCIACION_DESACTIVADA",
        detalle: `${req.user!.nombre} ${activo ? "activó" : "desactivó"} la asociación biométrica "${asociacion.externalUserId}".`,
        entidadTipo: "EmpleadoBiometrico",
        entidadId: asociacion.id,
      },
    });

    return res.json(serializarAsociacion(actualizada));
  } catch (error) {
    console.error("Error al actualizar asociación biométrica:", error);
    return res.status(500).json({ message: "Error al actualizar la asociación biométrica." });
  }
}

/** "Eliminar" = desactivar (reutiliza el campo `activo` existente, sin
 * borrar el historial de a qué empleado apuntaba esta asociación). */
export async function eliminarAsociacionBiometrica(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const asociacion = await prisma.empleadoBiometrico.findFirst({ where: { id, tenantId } });
    if (!asociacion)
      return res.status(404).json({ message: "Asociación biométrica no encontrada." });

    if (!asociacion.activo) return res.status(204).send();

    await prisma.empleadoBiometrico.update({ where: { id }, data: { activo: false } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "BIOMETRICO_ASOCIACION_DESACTIVADA",
        detalle: `${req.user!.nombre} eliminó (desactivó) la asociación biométrica "${asociacion.externalUserId}".`,
        entidadTipo: "EmpleadoBiometrico",
        entidadId: asociacion.id,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar asociación biométrica:", error);
    return res.status(500).json({ message: "Error al eliminar la asociación biométrica." });
  }
}
