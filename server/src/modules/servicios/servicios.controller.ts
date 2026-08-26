import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const PERIODICIDADES_VALIDAS = ["Mensual", "Anual", "Trimestral"];
const MONEDAS_VALIDAS = ["COP", "USD"];

function serializar(s: any) {
  return {
    ...s,
    costo: Number(s.costo),
    contratoRel: s.contratoRel ? { id: s.contratoRel.id, proveedor: s.contratoRel.proveedor } : undefined,
  };
}

const INCLUDE_SERVICIO = {
  contratoRel: { select: { id: true, proveedor: true } },
};

export const listarServicios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: any = { tenantId, eliminado: false };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;

    const servicios = await prisma.servicioSuscripcion.findMany({
      where,
      include: INCLUDE_SERVICIO,
      orderBy: { fechaRenovacion: "asc" },
      take: 1000, // límite de seguridad temporal; falta paginación real (ver auditoría)
    });
    return res.json(servicios.map(serializar));
  } catch (error) {
    console.error("Error al listar servicios:", error);
    return res.status(500).json({ message: "Error al obtener servicios y suscripciones." });
  }
};

/**
 * Detalle de un servicio/suscripción para su vista propia (proveedor,
 * responsable, contrato). Las facturas relacionadas se consultan aparte vía
 * GET /facturas?servicioId=... (ya soporta `limit`), para no duplicar la
 * lógica de listado/paginación de facturas en dos controladores distintos.
 */
export const obtenerServicio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const servicio = await prisma.servicioSuscripcion.findFirst({
      where: { id, tenantId, eliminado: false },
      include: INCLUDE_SERVICIO,
    });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado." });

    return res.json(serializar(servicio));
  } catch (error) {
    console.error("Error al obtener servicio:", error);
    return res.status(500).json({ message: "Error al obtener el servicio." });
  }
};

export const crearServicio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      empresaId,
      area,
      nombreServicio,
      descripcion,
      proveedorId,
      proveedor,
      contratoId,
      periodicidad,
      costo,
      moneda,
      fechaInicio,
      fechaFin,
      diaVencimiento,
      fechaRenovacion,
      responsableId,
      responsableArea,
      observaciones,
    } = req.body;

    // Mismo principio que Facturas/Contratos: si viene proveedorId o
    // responsableId, el nombre se toma del catálogo/tenant, nunca del texto
    // que mande el cliente; si no, se acepta texto libre por compatibilidad.
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

    let responsableNombre = typeof responsableArea === "string" ? responsableArea : "";
    if (responsableId) {
      const responsableDb = await prisma.user.findFirst({
        where: { id: responsableId, tenantId, activo: true },
      });
      if (!responsableDb) {
        return res.status(404).json({ message: "El responsable seleccionado no existe o está inactivo." });
      }
      responsableNombre = responsableDb.nombre;
    }

    // Aislamiento multi-tenant: el contrato relacionado debe ser del mismo tenant (IDOR).
    if (contratoId) {
      const contratoDb = await prisma.contrato.findFirst({ where: { id: contratoId, tenantId, eliminado: false } });
      if (!contratoDb) {
        return res.status(404).json({ message: "El contrato seleccionado no existe." });
      }
    }

    if (!empresaId || !area || !nombreServicio || !proveedorNombre || !fechaRenovacion) {
      return res.status(400).json({ message: "Faltan campos obligatorios del servicio." });
    }
    const costoNum = Number(costo);
    if (!Number.isFinite(costoNum) || costoNum < 0) {
      return res.status(400).json({ message: "El costo debe ser un número no negativo." });
    }
    let diaVencimientoNum: number | null = null;
    if (diaVencimiento !== undefined && diaVencimiento !== null && diaVencimiento !== "") {
      diaVencimientoNum = Number(diaVencimiento);
      if (!Number.isInteger(diaVencimientoNum) || diaVencimientoNum < 1 || diaVencimientoNum > 31) {
        return res.status(400).json({ message: "El día de vencimiento debe ser un número entre 1 y 31." });
      }
    }

    const servicio = await prisma.servicioSuscripcion.create({
      data: {
        tenantId,
        empresaId,
        area,
        nombreServicio,
        descripcion: typeof descripcion === "string" && descripcion.trim() ? descripcion.trim() : null,
        proveedorId: proveedorId || null,
        proveedor: proveedorNombre,
        contratoId: contratoId || null,
        periodicidad: PERIODICIDADES_VALIDAS.includes(periodicidad) ? periodicidad : "Mensual",
        costo: costoNum,
        moneda: MONEDAS_VALIDAS.includes(moneda) ? moneda : "COP",
        fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
        fechaFin: fechaFin ? new Date(fechaFin) : null,
        diaVencimiento: diaVencimientoNum,
        fechaRenovacion: new Date(fechaRenovacion),
        responsableId: responsableId || null,
        responsableArea: responsableNombre || "Líder de Área",
        observaciones: typeof observaciones === "string" && observaciones.trim() ? observaciones.trim() : null,
      },
      include: INCLUDE_SERVICIO,
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SERVICIO_CREADO",
        detalle: `${req.user!.nombre} registró el servicio "${nombreServicio}"`,
        entidadTipo: "ServicioSuscripcion",
        entidadId: servicio.id,
        datosNuevos: JSON.stringify({ nombreServicio, proveedor: proveedorNombre, costo: costoNum }),
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

    const servicio = await prisma.servicioSuscripcion.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado." });

    const nuevoEstado = servicio.estado === "Activo" ? "Inactivo" : "Activo";
    const actualizado = await prisma.servicioSuscripcion.update({
      where: { id },
      data: { estado: nuevoEstado },
      include: INCLUDE_SERVICIO,
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SERVICIO_ESTADO_CAMBIADO",
        detalle: `${req.user!.nombre} cambió "${servicio.nombreServicio}" a "${nuevoEstado}"`,
        entidadTipo: "ServicioSuscripcion",
        entidadId: id,
        datosAnteriores: JSON.stringify({ estado: servicio.estado }),
        datosNuevos: JSON.stringify({ estado: nuevoEstado }),
      },
    });

    return res.json(serializar(actualizado));
  } catch (error) {
    console.error("Error al cambiar estado del servicio:", error);
    return res.status(500).json({ message: "Error al actualizar el servicio." });
  }
};

/**
 * Elimina (soft-delete) un servicio o suscripción. No se borra de la base
 * de datos: se marca `eliminado` para conservar el histórico de gasto y
 * deja de aparecer en el inventario. Si tiene facturas asociadas, se
 * conserva la relación (las facturas siguen mostrando el nombre del
 * servicio aunque ya no aparezca en el listado activo).
 */
export const eliminarServicio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const servicio = await prisma.servicioSuscripcion.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado." });

    await prisma.servicioSuscripcion.update({ where: { id }, data: { eliminado: true } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SERVICIO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el servicio "${servicio.nombreServicio}"`,
        entidadTipo: "ServicioSuscripcion",
        entidadId: id,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar servicio:", error);
    return res.status(500).json({ message: "Error al eliminar el servicio." });
  }
};
