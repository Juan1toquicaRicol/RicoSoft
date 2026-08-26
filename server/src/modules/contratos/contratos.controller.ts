import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const ESTADOS_VALIDOS = ["Activo", "Vencido", "Terminado", "En Renovación"];

function serializar(c: any) {
  return { ...c, valorContratado: Number(c.valorContratado) };
}

export const listarContratos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: any = { tenantId, eliminado: false };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;

    const contratos = await prisma.contrato.findMany({
      where,
      orderBy: { fechaFin: "asc" },
      take: 1000, // límite de seguridad temporal; falta paginación real (ver auditoría)
    });
    return res.json(contratos.map(serializar));
  } catch (error) {
    console.error("Error al listar contratos:", error);
    return res.status(500).json({ message: "Error al obtener contratos." });
  }
};

export const crearContrato = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      empresaId,
      proveedorId,
      proveedor,
      cliente,
      responsableId,
      responsable,
      supervisor,
      gerente,
      area,
      centroCostos,
      valorContratado,
      fechaInicio,
      fechaFin,
      observaciones,
    } = req.body;

    // Igual que en Facturas: si viene proveedorId/responsableId se toma el
    // nombre real del catálogo/tenant (nunca del texto que mande el
    // cliente); si no, se acepta texto libre por compatibilidad.
    let proveedorNombre = typeof proveedor === "string" ? proveedor : "";
    if (proveedorId) {
      const proveedorDb = await prisma.proveedor.findFirst({
        where: { id: proveedorId, tenantId, activo: true },
      });
      if (!proveedorDb) {
        return res.status(404).json({ message: "El proveedor seleccionado no existe o está inactivo." });
      }
      proveedorNombre = proveedorDb.nombre;
    }

    let responsableNombre = typeof responsable === "string" ? responsable : "";
    if (responsableId) {
      const responsableDb = await prisma.user.findFirst({
        where: { id: responsableId, tenantId, activo: true },
      });
      if (!responsableDb) {
        return res.status(404).json({ message: "El responsable seleccionado no existe o está inactivo." });
      }
      responsableNombre = responsableDb.nombre;
    }

    if (!empresaId || !proveedorNombre || !responsableNombre || !area || !fechaInicio || !fechaFin) {
      return res.status(400).json({ message: "Faltan campos obligatorios del contrato." });
    }
    const valor = Number(valorContratado);
    if (!Number.isFinite(valor) || valor < 0) {
      return res.status(400).json({ message: "El valor contratado debe ser un número no negativo." });
    }

    const contrato = await prisma.contrato.create({
      data: {
        tenantId,
        empresaId,
        proveedorId: proveedorId || null,
        proveedor: proveedorNombre,
        cliente: cliente || null,
        responsableId: responsableId || null,
        responsable: responsableNombre,
        supervisor: supervisor || null,
        gerente: gerente || null,
        area,
        centroCostos: centroCostos || null,
        valorContratado: valor,
        fechaInicio: new Date(fechaInicio),
        fechaFin: new Date(fechaFin),
        observaciones: observaciones || null,
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CONTRATO_CREADO",
        detalle: `${req.user!.nombre} registró el contrato con "${proveedorNombre}"`,
      },
    });

    return res.status(201).json(serializar(contrato));
  } catch (error) {
    console.error("Error al crear contrato:", error);
    return res.status(500).json({ message: "Error al registrar el contrato." });
  }
};

export const actualizarContrato = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { estado, observaciones } = req.body;

    const existente = await prisma.contrato.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!existente) return res.status(404).json({ message: "Contrato no encontrado." });

    if (estado && !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }

    const contrato = await prisma.contrato.update({
      where: { id },
      data: {
        ...(estado ? { estado } : {}),
        ...(typeof observaciones === "string" ? { observaciones } : {}),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CONTRATO_EDITADO",
        detalle: `${req.user!.nombre} editó el contrato con "${contrato.proveedor}"`,
      },
    });

    return res.json(serializar(contrato));
  } catch (error) {
    console.error("Error al actualizar contrato:", error);
    return res.status(500).json({ message: "Error al actualizar el contrato." });
  }
};

/**
 * Elimina (soft-delete) un contrato. No se borra de la base de datos: se
 * marca `eliminado` para conservar la trazabilidad y deja de aparecer en
 * el listado de contratos.
 */
export const eliminarContrato = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const contrato = await prisma.contrato.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!contrato) return res.status(404).json({ message: "Contrato no encontrado." });

    await prisma.contrato.update({ where: { id }, data: { eliminado: true } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CONTRATO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el contrato con "${contrato.proveedor}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar contrato:", error);
    return res.status(500).json({ message: "Error al eliminar el contrato." });
  }
};
