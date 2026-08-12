import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const PERIODICIDADES_VALIDAS = ["Mensual", "Anual", "Trimestral"];
const MONEDAS_VALIDAS = ["COP", "USD"];

function serializar(s: any) {
  return { ...s, costo: Number(s.costo) };
}

export const listarServicios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: any = { tenantId };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;

    const servicios = await prisma.servicioSuscripcion.findMany({
      where,
      orderBy: { fechaRenovacion: "asc" },
    });
    return res.json(servicios.map(serializar));
  } catch (error) {
    console.error("Error al listar servicios:", error);
    return res.status(500).json({ message: "Error al obtener servicios y suscripciones." });
  }
};

export const crearServicio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      empresaId,
      area,
      nombreServicio,
      proveedor,
      periodicidad,
      costo,
      moneda,
      fechaRenovacion,
      responsableArea,
    } = req.body;

    if (!empresaId || !area || !nombreServicio || !proveedor || !fechaRenovacion) {
      return res.status(400).json({ message: "Faltan campos obligatorios del servicio." });
    }
    const costoNum = Number(costo);
    if (!Number.isFinite(costoNum) || costoNum < 0) {
      return res.status(400).json({ message: "El costo debe ser un número no negativo." });
    }

    const servicio = await prisma.servicioSuscripcion.create({
      data: {
        tenantId,
        empresaId,
        area,
        nombreServicio,
        proveedor,
        periodicidad: PERIODICIDADES_VALIDAS.includes(periodicidad) ? periodicidad : "Mensual",
        costo: costoNum,
        moneda: MONEDAS_VALIDAS.includes(moneda) ? moneda : "COP",
        fechaRenovacion: new Date(fechaRenovacion),
        responsableArea: responsableArea || "Líder de Área",
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SERVICIO_CREADO",
        detalle: `${req.user!.nombre} registró el servicio "${nombreServicio}"`,
      },
    });

    return res.status(201).json(serializar(servicio));
  } catch (error) {
    console.error("Error al crear servicio:", error);
    return res.status(500).json({ message: "Error al registrar el servicio." });
  }
};

export const toggleEstadoServicio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const servicio = await prisma.servicioSuscripcion.findFirst({ where: { id, tenantId } });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado." });

    const nuevoEstado = servicio.estado === "Activo" ? "Inactivo" : "Activo";
    const actualizado = await prisma.servicioSuscripcion.update({
      where: { id },
      data: { estado: nuevoEstado },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SERVICIO_ESTADO_CAMBIADO",
        detalle: `${req.user!.nombre} cambió "${servicio.nombreServicio}" a "${nuevoEstado}"`,
      },
    });

    return res.json(serializar(actualizado));
  } catch (error) {
    console.error("Error al cambiar estado del servicio:", error);
    return res.status(500).json({ message: "Error al actualizar el servicio." });
  }
};
