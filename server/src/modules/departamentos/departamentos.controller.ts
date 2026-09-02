import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { obtenerTenantPorDominio } from "../../lib/dominios";
import { whereAlcance } from "../../lib/alcance";

function serializar(d: {
  id: string;
  tenantId: string | null;
  nombre: string;
  esSistemas: boolean;
  activo: boolean;
  _count?: { usuarios: number };
}) {
  return {
    id: d.id,
    nombre: d.nombre,
    esSistemas: d.esSistemas,
    activo: d.activo,
    alcance: d.tenantId === null ? "GENERAL" : "TENANT",
    usuariosAsignados: d._count?.usuarios ?? 0,
  };
}

/** Departamentos generales + propios del tenant actual (nunca de otro tenant). */
export const listarDepartamentos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const departamentos = await prisma.departamento.findMany({
      where: whereAlcance(tenantId),
      include: { _count: { select: { usuarios: true } } },
      orderBy: { nombre: "asc" },
    });

    return res.json(departamentos.map(serializar));
  } catch (error) {
    console.error("Error al listar departamentos:", error);
    return res.status(500).json({ message: "Error al obtener departamentos." });
  }
};

/**
 * Listado público sin autenticación: usado por el formulario de registro para
 * que un usuario nuevo pueda elegir su departamento antes de tener sesión.
 * Solo expone id/nombre de departamentos activos, nada sensible.
 *
 * El tenant se resuelve EXCLUSIVAMENTE por el dominio de correo (query
 * ?dominio=), nunca por tenant.findFirst() ni ningún otro criterio
 * arbitrario. Incluye generales + los propios de ese tenant.
 */
export const listarDepartamentosPublico = async (req: Request, res: Response) => {
  try {
    const dominio =
      typeof req.query.dominio === "string" ? req.query.dominio.trim().toLowerCase() : "";
    if (!dominio) {
      return res.status(400).json({ message: "Falta indicar el dominio de correo (?dominio=)." });
    }

    const tenant = await obtenerTenantPorDominio(dominio);
    if (!tenant || !tenant.activo) {
      return res.json([]);
    }

    const departamentos = await prisma.departamento.findMany({
      where: { ...whereAlcance(tenant.id), activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });

    return res.json(departamentos);
  } catch (error) {
    console.error("Error al listar departamentos públicos:", error);
    return res.status(500).json({ message: "Error al obtener departamentos." });
  }
};

/**
 * Departamentos activos (id + nombre) del tenant del usuario autenticado, sin
 * exigir el permiso administrativo "departamentos.ver" — para poblar el
 * select de "Área" en formularios operativos. Incluye generales + propios.
 */
export const listarDepartamentosPropios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const departamentos = await prisma.departamento.findMany({
      where: { ...whereAlcance(tenantId), activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    return res.json(departamentos);
  } catch (error) {
    console.error("Error al listar departamentos propios:", error);
    return res.status(500).json({ message: "Error al obtener departamentos." });
  }
};

export const crearDepartamento = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { nombre, esSistemas, alcance } = req.body;

    if (!nombre || typeof nombre !== "string") {
      return res.status(400).json({ message: "El nombre del departamento es obligatorio." });
    }
    if (alcance !== undefined && alcance !== "GENERAL" && alcance !== "TENANT") {
      return res.status(400).json({ message: 'El alcance debe ser "GENERAL" o "TENANT".' });
    }

    // El alcance lo decide el body (GENERAL/TENANT), pero el tenant al que
    // queda ligado un departamento TENANT sale SIEMPRE de la sesión — nunca
    // se acepta un tenantId explícito del cliente.
    const departamento = await prisma.departamento.create({
      data: {
        tenantId: alcance === "GENERAL" ? null : tenantId,
        nombre,
        esSistemas: Boolean(esSistemas),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "DEPARTAMENTO_CREADO",
        detalle: `${req.user!.nombre} creó el departamento "${departamento.nombre}" (${departamento.tenantId === null ? "GENERAL" : "exclusivo de esta empresa"})`,
      },
    });

    return res.status(201).json(serializar({ ...departamento, _count: { usuarios: 0 } }));
  } catch (error) {
    console.error("Error al crear departamento:", error);
    return res.status(500).json({ message: "Error al crear el departamento." });
  }
};

export const actualizarDepartamento = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { nombre, esSistemas, activo, alcance } = req.body;

    // Visible/editable si es GENERAL o si es exclusivo de este tenant —
    // nunca uno exclusivo de otro tenant (404, no revela que existe).
    const existente = await prisma.departamento.findFirst({
      where: { id, ...whereAlcance(tenantId) },
      include: { _count: { select: { usuarios: true, membresias: true } } },
    });
    if (!existente) {
      return res.status(404).json({ message: "Departamento no encontrado." });
    }

    let nuevoTenantId: string | null | undefined;
    if (alcance !== undefined) {
      if (alcance !== "GENERAL" && alcance !== "TENANT") {
        return res.status(400).json({ message: 'El alcance debe ser "GENERAL" o "TENANT".' });
      }
      const eraGeneral = existente.tenantId === null;
      const seraGeneral = alcance === "GENERAL";
      if (eraGeneral && !seraGeneral) {
        // GENERAL -> TENANT: si algún usuario/membresía de OTRO tenant ya lo
        // usa, esa gente se quedaría con una referencia a un departamento
        // que ya no puede ver — se bloquea la conversión.
        const usuariosDeOtroTenant = await prisma.user.count({
          where: { departamentoId: id, tenantId: { not: tenantId } },
        });
        const membresiasDeOtroTenant = await prisma.membresia.count({
          where: { departamentoId: id, tenantId: { not: tenantId } },
        });
        if (usuariosDeOtroTenant > 0 || membresiasDeOtroTenant > 0) {
          return res.status(409).json({
            message:
              "No se puede convertir a exclusivo de esta empresa: hay usuarios o membresías de otras empresas usando este departamento.",
          });
        }
        nuevoTenantId = tenantId;
      } else if (!eraGeneral && seraGeneral) {
        nuevoTenantId = null; // TENANT -> GENERAL siempre es seguro (amplía, no restringe)
      }
    }

    const departamento = await prisma.departamento.update({
      where: { id },
      data: {
        ...(typeof nombre === "string" ? { nombre } : {}),
        ...(typeof esSistemas === "boolean" ? { esSistemas } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
        ...(nuevoTenantId !== undefined ? { tenantId: nuevoTenantId } : {}),
      },
      include: { _count: { select: { usuarios: true } } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "DEPARTAMENTO_EDITADO",
        detalle:
          `${req.user!.nombre} editó el departamento "${departamento.nombre}"` +
          (nuevoTenantId !== undefined
            ? ` (alcance cambiado a ${departamento.tenantId === null ? "GENERAL" : "TENANT"})`
            : ""),
      },
    });

    return res.json(serializar(departamento));
  } catch (error) {
    console.error("Error al actualizar departamento:", error);
    return res.status(500).json({ message: "Error al actualizar el departamento." });
  }
};

export const eliminarDepartamento = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const departamento = await prisma.departamento.findFirst({
      where: { id, ...whereAlcance(tenantId) },
      include: { _count: { select: { usuarios: true, membresias: true } } },
    });
    if (!departamento) {
      return res.status(404).json({ message: "Departamento no encontrado." });
    }
    if (departamento._count.usuarios > 0 || departamento._count.membresias > 0) {
      return res.status(409).json({
        message: `No se puede eliminar: hay ${departamento._count.usuarios} usuario(s)/${departamento._count.membresias} membresía(s) asignados a este departamento.`,
      });
    }
    if (departamento.tenantId === null) {
      // Es GENERAL: aunque este tenant no tenga usuarios ahí, otro sí podría.
      const usadoEnOtroLado = await prisma.user.count({ where: { departamentoId: id } });
      const usadoEnMembresias = await prisma.membresia.count({ where: { departamentoId: id } });
      if (usadoEnOtroLado > 0 || usadoEnMembresias > 0) {
        return res.status(409).json({
          message:
            "No se puede eliminar: es un departamento general y está en uso en otra empresa.",
        });
      }
    }

    await prisma.departamento.delete({ where: { id } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "DEPARTAMENTO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el departamento "${departamento.nombre}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar departamento:", error);
    return res.status(500).json({ message: "Error al eliminar el departamento." });
  }
};
