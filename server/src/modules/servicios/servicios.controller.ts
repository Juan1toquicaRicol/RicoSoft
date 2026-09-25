import { Response } from "express";
import { Prisma, ServicioSuscripcion } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { adjuntarActores } from "../../lib/auditoria-usuarios";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const PERIODICIDADES_VALIDAS = ["Mensual", "Anual", "Trimestral"];
const MONEDAS_VALIDAS = ["COP", "USD"];

function serializar(s: ServicioSuscripcion) {
  return {
    ...s,
    costo: Number(s.costo),
  };
}

export const listarServicios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId, estado, search, page } = req.query;
    const where: Prisma.ServicioSuscripcionWhereInput = { tenantId, eliminado: false };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;
    if (typeof estado === "string" && estado) where.estado = estado;
    if (typeof search === "string" && search.trim()) {
      const term = search.trim();
      where.OR = [{ nombreServicio: { contains: term } }, { proveedor: { contains: term } }];
    }

    // Paginación real (Bloque 6): opt-in con `page`, mismo patrón que
    // Facturas — sin `page`, se conserva el array plano con tope
    // de seguridad para no romper consumidores existentes (p. ej. el select
    // de servicios activos del formulario de Facturas).
    if (typeof page !== "undefined") {
      const pageNum = Math.max(1, Number.parseInt(String(page), 10) || 1);
      const pageSizeNum = Math.min(
        100,
        Math.max(1, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25),
      );

      const [servicios, total] = await Promise.all([
        req.tenantPrisma!.servicioSuscripcion.findMany({
          where,
          orderBy: { fechaRenovacion: "asc" },
          skip: (pageNum - 1) * pageSizeNum,
          take: pageSizeNum,
        }),
        req.tenantPrisma!.servicioSuscripcion.count({ where }),
      ]);

      return res.json({
        items: servicios.map(serializar),
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum),
      });
    }

    const servicios = await req.tenantPrisma!.servicioSuscripcion.findMany({
      where,
      orderBy: { fechaRenovacion: "asc" },
      take: 1000, // tope de seguridad para consumidores que no piden `page` todavía
    });
    return res.json(servicios.map(serializar));
  } catch (error) {
    console.error("Error al listar servicios:", error);
    return res.status(500).json({ message: "Error al obtener servicios y suscripciones." });
  }
};

/**
 * Detalle de un servicio/suscripción para su vista propia (proveedor,
 * responsable). Las facturas relacionadas se consultan aparte vía
 * GET /facturas?servicioId=... (ya soporta `limit`), para no duplicar la
 * lógica de listado/paginación de facturas en dos controladores distintos.
 */
export const obtenerServicio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const servicio = await req.tenantPrisma!.servicioSuscripcion.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado." });

    // Historial de uso: creación, ediciones y activaciones/desactivaciones —
    // no existe una tabla de historial propia para ServicioSuscripcion (a
    // diferencia de Factura), así que se reconstruye a partir de Auditoria,
    // que ya registra estos eventos (ver crearServicio/actualizarServicio/
    // toggleEstadoServicio). Esto es lo que responde "cuándo se activó" y
    // qué se hizo con el servicio, sin necesitar una tabla nueva.
    const filasEventos = await req.tenantPrisma!.auditoria.findMany({
      where: { tenantId, entidadTipo: "ServicioSuscripcion", entidadId: id },
      orderBy: { createdAt: "asc" },
    });
    const eventos = await adjuntarActores(tenantId, filasEventos);

    return res.json({
      ...serializar(servicio),
      historial: eventos.map((e) => ({
        fecha: e.createdAt,
        actor: e.usuario?.nombre ?? "Sistema",
        accion: e.accion,
        detalle: e.detalle,
      })),
    });
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

    // Mismo principio que Facturas: si viene proveedorId o
    // responsableId, el nombre se toma del catálogo/tenant, nunca del texto
    // que mande el cliente; si no, se acepta texto libre por compatibilidad.
    let proveedorNombre = typeof proveedor === "string" ? proveedor : "";
    if (proveedorId) {
      const proveedorDb = await req.tenantPrisma!.proveedor.findFirst({
        where: { id: proveedorId, tenantId, activo: true },
      });
      if (!proveedorDb) {
        return res
          .status(404)
          .json({ message: "El proveedor seleccionado no existe o está inactivo." });
      }
      proveedorNombre = proveedorDb.nombre;
    }

    let responsableNombre = typeof responsableArea === "string" ? responsableArea : "";
    if (responsableId) {
      // User está deliberadamente fuera de MODELOS_TENANT_SCOPED (lecturas
      // cross-tenant legítimas en otros módulos, ver tenant-prisma.ts) — se
      // mantiene con el cliente global, con el mismo filtro manual de
      // tenantId que ya tenía antes de esta migración.
      const responsableDb = await prisma.user.findFirst({
        where: { id: responsableId, tenantId, activo: true },
      });
      if (!responsableDb) {
        return res
          .status(404)
          .json({ message: "El responsable seleccionado no existe o está inactivo." });
      }
      responsableNombre = responsableDb.nombre;
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
        return res
          .status(400)
          .json({ message: "El día de vencimiento debe ser un número entre 1 y 31." });
      }
    }

    const servicio = await req.tenantPrisma!.servicioSuscripcion.create({
      data: {
        tenantId,
        empresaId,
        area,
        nombreServicio,
        descripcion:
          typeof descripcion === "string" && descripcion.trim() ? descripcion.trim() : null,
        proveedorId: proveedorId || null,
        proveedor: proveedorNombre,
        periodicidad: PERIODICIDADES_VALIDAS.includes(periodicidad) ? periodicidad : "Mensual",
        costo: costoNum,
        moneda: MONEDAS_VALIDAS.includes(moneda) ? moneda : "COP",
        fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
        fechaFin: fechaFin ? new Date(fechaFin) : null,
        diaVencimiento: diaVencimientoNum,
        fechaRenovacion: new Date(fechaRenovacion),
        responsableId: responsableId || null,
        responsableArea: responsableNombre || "Líder de Área",
        observaciones:
          typeof observaciones === "string" && observaciones.trim() ? observaciones.trim() : null,
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SERVICIO_CREADO",
        detalle: `${req.user!.nombre} registró el servicio "${nombreServicio}"`,
        entidadTipo: "ServicioSuscripcion",
        entidadId: servicio.id,
        datosNuevos: JSON.stringify({
          nombreServicio,
          proveedor: proveedorNombre,
          costo: costoNum,
        }),
      },
    });

    return res.status(201).json(serializar(servicio));
  } catch (error) {
    console.error("Error al crear servicio:", error);
    return res.status(500).json({ message: "Error al registrar el servicio." });
  }
};

/**
 * Edita los datos de un servicio/suscripción ya registrado (proveedor,
 * costo, periodicidad, fechas, responsable, etc.). Separado de
 * toggleEstadoServicio, que solo activa/desactiva sin tocar el resto de
 * campos.
 */
export const actualizarServicio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const {
      empresaId,
      area,
      nombreServicio,
      descripcion,
      proveedorId,
      proveedor,
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

    const existente = await req.tenantPrisma!.servicioSuscripcion.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!existente) return res.status(404).json({ message: "Servicio no encontrado." });

    // Mismo principio que crearServicio: si viene proveedorId o
    // responsableId, el nombre se toma del catálogo/tenant, nunca del texto
    // que mande el cliente.
    let proveedorNombre = typeof proveedor === "string" ? proveedor : "";
    if (proveedorId) {
      const proveedorDb = await req.tenantPrisma!.proveedor.findFirst({
        where: { id: proveedorId, tenantId, activo: true },
      });
      if (!proveedorDb) {
        return res
          .status(404)
          .json({ message: "El proveedor seleccionado no existe o está inactivo." });
      }
      proveedorNombre = proveedorDb.nombre;
    }

    let responsableNombre = typeof responsableArea === "string" ? responsableArea : "";
    if (responsableId) {
      const responsableDb = await prisma.user.findFirst({
        where: { id: responsableId, tenantId, activo: true },
      });
      if (!responsableDb) {
        return res
          .status(404)
          .json({ message: "El responsable seleccionado no existe o está inactivo." });
      }
      responsableNombre = responsableDb.nombre;
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
        return res
          .status(400)
          .json({ message: "El día de vencimiento debe ser un número entre 1 y 31." });
      }
    }

    const actualizado = await req.tenantPrisma!.servicioSuscripcion.update({
      where: { id },
      data: {
        empresaId,
        area,
        nombreServicio,
        descripcion:
          typeof descripcion === "string" && descripcion.trim() ? descripcion.trim() : null,
        proveedorId: proveedorId || null,
        proveedor: proveedorNombre,
        periodicidad: PERIODICIDADES_VALIDAS.includes(periodicidad) ? periodicidad : "Mensual",
        costo: costoNum,
        moneda: MONEDAS_VALIDAS.includes(moneda) ? moneda : "COP",
        fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
        fechaFin: fechaFin ? new Date(fechaFin) : null,
        diaVencimiento: diaVencimientoNum,
        fechaRenovacion: new Date(fechaRenovacion),
        responsableId: responsableId || null,
        responsableArea: responsableNombre || "Líder de Área",
        observaciones:
          typeof observaciones === "string" && observaciones.trim() ? observaciones.trim() : null,
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SERVICIO_EDITADO",
        detalle: `${req.user!.nombre} editó el servicio "${actualizado.nombreServicio}"`,
        entidadTipo: "ServicioSuscripcion",
        entidadId: id,
        datosAnteriores: JSON.stringify({
          nombreServicio: existente.nombreServicio,
          proveedor: existente.proveedor,
          costo: Number(existente.costo),
        }),
        datosNuevos: JSON.stringify({
          nombreServicio: actualizado.nombreServicio,
          proveedor: actualizado.proveedor,
          costo: costoNum,
        }),
      },
    });

    return res.json(serializar(actualizado));
  } catch (error) {
    console.error("Error al editar servicio:", error);
    return res.status(500).json({ message: "Error al editar el servicio." });
  }
};

export const toggleEstadoServicio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const servicio = await req.tenantPrisma!.servicioSuscripcion.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado." });

    const nuevoEstado = servicio.estado === "Activo" ? "Inactivo" : "Activo";
    const actualizado = await req.tenantPrisma!.servicioSuscripcion.update({
      where: { id },
      data: { estado: nuevoEstado },
    });

    await req.tenantPrisma!.auditoria.create({
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

    const servicio = await req.tenantPrisma!.servicioSuscripcion.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado." });

    await req.tenantPrisma!.servicioSuscripcion.update({
      where: { id },
      data: { eliminado: true },
    });

    await req.tenantPrisma!.auditoria.create({
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
