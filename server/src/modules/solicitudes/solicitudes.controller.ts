import fs from "fs";
import path from "path";
import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { UPLOADS_DIR_COTIZACIONES } from "../../middleware/upload.middleware";
import { crearNotificacion, notificarPorPermiso } from "../../lib/notificaciones";

const ESTADOS_VALIDOS = ["Pendiente", "En Cotización", "Aprobada", "Rechazada", "Comprado"];
const PRIORIDADES_VALIDAS = ["Baja", "Media", "Alta", "Urgente"];

// Estados que aún requieren gestión: se muestran en "Solicitudes de compra".
const ESTADOS_ACTIVOS = ["Pendiente", "En Cotización"];
// Estados ya resueltos: se muestran en "Historia de compras" y ya no aparecen
// en el listado de solicitudes activas. Ninguna solicitud se elimina de la
// base de datos; solo cambia su campo `estado`.
const ESTADOS_HISTORICOS = ["Aprobada", "Rechazada", "Comprado"];

const TRANSICIONES: Record<string, { desde: string[]; permiso: string }> = {
  Aprobada: { desde: ["Pendiente", "En Cotización"], permiso: PERMISOS_SISTEMA.SOLICITUDES_APROBAR },
  Rechazada: { desde: ["Pendiente", "En Cotización"], permiso: PERMISOS_SISTEMA.SOLICITUDES_RECHAZAR },
  Comprado: { desde: ["Aprobada"], permiso: PERMISOS_SISTEMA.SOLICITUDES_COMPRAR },
};

// Transiciones que registran quién resolvió la solicitud y cuándo.
const TRANSICIONES_DE_RESOLUCION = new Set(["Aprobada", "Rechazada"]);

// No se expone `cotizacionRuta` (ruta interna en disco): se sirve solo a
// través del endpoint autenticado GET /:id/archivo, igual que en facturas.
function serializar(s: any) {
  const {
    cotizacionRuta,
    cotizacionNombre,
    cotizacionMime,
    cotizacionTamano,
    cotizacionSubidoPorNombre,
    cotizacionSubidoEn,
    facturas,
    ...resto
  } = s;
  return {
    ...resto,
    valorEstimado: Number(s.valorEstimado),
    cotizacion: cotizacionNombre
      ? {
          nombre: cotizacionNombre,
          mime: cotizacionMime,
          tamano: cotizacionTamano,
          subidoPor: cotizacionSubidoPorNombre,
          subidoEn: cotizacionSubidoEn,
        }
      : null,
    // Factura final que se paga, si ya se registró (una solicitud "Comprado"
    // puede seguir sin factura hasta que llegue la factura del proveedor).
    factura: Array.isArray(facturas) && facturas.length > 0
      ? { id: facturas[0].id, numero: facturas[0].numero, estado: facturas[0].estado }
      : null,
  };
}

const INCLUDE_FACTURA_VINCULADA = {
  facturas: {
    where: { eliminado: false },
    select: { id: true, numero: true, estado: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
};

/**
 * Solicitudes activas (Pendiente / En Cotización): son las únicas visibles
 * en "Solicitudes de compra". En cuanto se aprueban o rechazan dejan de
 * aparecer aquí y pasan a "Historia de compras".
 */
export const listarSolicitudes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: any = { tenantId, estado: { in: ESTADOS_ACTIVOS }, eliminado: false };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;

    const solicitudes = await prisma.solicitudCompra.findMany({
      where,
      include: INCLUDE_FACTURA_VINCULADA,
      orderBy: { fechaSolicitud: "desc" },
      take: 1000, // límite de seguridad temporal; falta paginación real (ver auditoría)
    });
    return res.json(solicitudes.map(serializar));
  } catch (error) {
    console.error("Error al listar solicitudes de compra:", error);
    return res.status(500).json({ message: "Error al obtener solicitudes de compra." });
  }
};

/**
 * Historia de compras: consulta de solo lectura sobre las solicitudes ya
 * resueltas (aprobadas, rechazadas o compradas). Reutiliza la misma tabla
 * SolicitudCompra -- no existe una tabla de historial separada -- filtrando
 * por estado, para no perder ni duplicar información.
 */
export const listarHistorialCompras = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId, estado, area, solicitante, desde, hasta } = req.query;

    const where: any = { tenantId, estado: { in: ESTADOS_HISTORICOS }, eliminado: false };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;
    if (typeof estado === "string" && ESTADOS_HISTORICOS.includes(estado)) where.estado = estado;
    if (typeof area === "string" && area) where.area = { contains: area };
    if (typeof solicitante === "string" && solicitante) where.solicitante = { contains: solicitante };
    if (typeof desde === "string" && desde) {
      where.fechaResolucion = { ...(where.fechaResolucion || {}), gte: new Date(desde) };
    }
    if (typeof hasta === "string" && hasta) {
      const hastaFin = new Date(hasta);
      hastaFin.setHours(23, 59, 59, 999);
      where.fechaResolucion = { ...(where.fechaResolucion || {}), lte: hastaFin };
    }

    const historial = await prisma.solicitudCompra.findMany({
      where,
      include: INCLUDE_FACTURA_VINCULADA,
      orderBy: { fechaResolucion: "desc" },
      take: 1000, // límite de seguridad temporal; falta paginación real (ver auditoría)
    });
    return res.json(historial.map(serializar));
  } catch (error) {
    console.error("Error al listar historia de compras:", error);
    return res.status(500).json({ message: "Error al obtener la historia de compras." });
  }
};

export const crearSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId, area, solicitanteId, proveedorId, item, descripcion, cantidad, valorEstimado, prioridad } =
      req.body;

    if (!empresaId || !area || !solicitanteId || !item) {
      return res.status(400).json({ message: "Faltan campos obligatorios de la solicitud." });
    }
    const cant = Number(cantidad);
    const valor = Number(valorEstimado);
    if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(valor) || valor < 0) {
      return res.status(400).json({ message: "Cantidad y valor estimado deben ser números válidos." });
    }

    // El solicitante se elige en el formulario, pero nunca se confía en el
    // nombre que mande el cliente: se busca el usuario real por id dentro del
    // mismo tenant y su nombre se toma de la base de datos (evita ids de otro
    // tenant o nombres inventados).
    const solicitanteUsuario = await prisma.user.findFirst({
      where: { id: solicitanteId, tenantId, activo: true },
    });
    if (!solicitanteUsuario) {
      return res.status(400).json({ message: "El solicitante seleccionado no es válido." });
    }

    // El proveedor es opcional (muchas solicitudes se crean antes de saber a
    // quién se le va a comprar), pero si se envía debe existir en el mismo
    // tenant. El nombre se toma siempre del catálogo, nunca del texto que
    // mande el cliente — mismo principio que Facturas.
    let proveedorNombre: string | null = null;
    if (proveedorId) {
      const proveedorDb = await prisma.proveedor.findFirst({
        where: { id: proveedorId, tenantId, activo: true },
      });
      if (!proveedorDb) {
        return res.status(404).json({ message: "El proveedor seleccionado no existe o está inactivo." });
      }
      proveedorNombre = proveedorDb.nombre;
    }

    const solicitud = await prisma.solicitudCompra.create({
      data: {
        tenantId,
        empresaId,
        area,
        solicitanteId: solicitanteUsuario.id,
        solicitante: solicitanteUsuario.nombre,
        proveedorId: proveedorId || null,
        proveedor: proveedorNombre,
        item,
        descripcion: descripcion || null,
        cantidad: cant,
        valorEstimado: valor,
        prioridad: PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : "Media",
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_CREADA",
        detalle: `${req.user!.nombre} registró la solicitud de compra "${item}"`,
      },
    });

    await notificarPorPermiso(
      tenantId,
      PERMISOS_SISTEMA.SOLICITUDES_APROBAR,
      {
        tipo: "SOLICITUD_COMPRA_PENDIENTE",
        titulo: "Nueva solicitud de compra pendiente",
        mensaje: `${solicitanteUsuario.nombre} solicitó "${item}" (${solicitud.empresaId}).`,
        enlace: "/solicitudes-compra",
      },
      { excluirUsuarioId: req.user!.id },
    );

    return res.status(201).json(serializar(solicitud));
  } catch (error) {
    console.error("Error al crear solicitud de compra:", error);
    return res.status(500).json({ message: "Error al registrar la solicitud de compra." });
  }
};

export const cambiarEstadoSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { estado: nuevoEstado, comentario } = req.body;

    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }
    const transicion = TRANSICIONES[nuevoEstado];
    if (!transicion) {
      return res.status(400).json({ message: `No se puede establecer el estado "${nuevoEstado}" directamente.` });
    }

    const solicitud = await prisma.solicitudCompra.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada." });

    if (!transicion.desde.includes(solicitud.estado)) {
      return res.status(409).json({ message: `No se puede pasar de "${solicitud.estado}" a "${nuevoEstado}".` });
    }

    const tienePermiso = req.user!.isSuperadmin || req.user!.permisos.includes(transicion.permiso);
    if (!tienePermiso) {
      return res.status(403).json({ message: "No tienes permiso para realizar esta acción." });
    }

    const data: any = { estado: nuevoEstado };
    if (TRANSICIONES_DE_RESOLUCION.has(nuevoEstado)) {
      data.fechaResolucion = new Date();
      data.resueltoPorId = req.user!.id;
      data.resueltoPorNombre = req.user!.nombre;
      data.comentarioResolucion = typeof comentario === "string" && comentario.trim() ? comentario.trim() : null;
    }

    const actualizada = await prisma.solicitudCompra.update({
      where: { id },
      data,
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: `SOLICITUD_COMPRA_${nuevoEstado.toUpperCase().replace(/ /g, "_")}`,
        detalle: `${req.user!.nombre} cambió la solicitud "${solicitud.item}" a "${nuevoEstado}"`,
      },
    });

    // Avisa a quien la solicitó que ya se resolvió (Aprobada/Rechazada/
    // Comprado; "En Cotización" sigue siendo un estado activo, no una
    // resolución final, así que no genera notificación).
    if (solicitud.solicitanteId && ESTADOS_HISTORICOS.includes(nuevoEstado)) {
      await crearNotificacion({
        tenantId,
        usuarioId: solicitud.solicitanteId,
        tipo: "SOLICITUD_COMPRA_RESUELTA",
        titulo: `Tu solicitud fue ${nuevoEstado.toLowerCase()}`,
        mensaje: `"${solicitud.item}" fue ${nuevoEstado.toLowerCase()} por ${req.user!.nombre}.`,
        enlace: "/historia-compras",
      });
    }

    return res.json(serializar(actualizada));
  } catch (error) {
    console.error("Error al cambiar estado de solicitud:", error);
    return res.status(500).json({ message: "Error al actualizar la solicitud." });
  }
};

/**
 * Elimina (soft-delete) una solicitud de compra, ya sea activa o histórica.
 * No se borra de la base de datos: se marca `eliminado` para conservar la
 * trazabilidad y deja de aparecer en el listado activo ni en la historia.
 */
export const eliminarSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const solicitud = await prisma.solicitudCompra.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada." });

    await prisma.solicitudCompra.update({ where: { id }, data: { eliminado: true } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_ELIMINADA",
        detalle: `${req.user!.nombre} eliminó la solicitud de compra "${solicitud.item}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar solicitud de compra:", error);
    return res.status(500).json({ message: "Error al eliminar la solicitud de compra." });
  }
};

/**
 * Recibe la cotización (PDF/imagen) adjunta a la solicitud de compra. El
 * middleware de multer ya guardó el archivo en disco antes de llegar aquí;
 * este handler solo valida que la solicitud exista en el tenant del usuario
 * y actualiza los metadatos. Si ya tenía una cotización, la anterior se
 * borra del disco (se reemplaza, no se acumulan versiones huérfanas).
 */
export const subirCotizacionSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const archivo = (req as any).file as Express.Multer.File | undefined;

    if (!archivo) {
      return res.status(400).json({ message: "No se recibió ningún archivo." });
    }

    const solicitud = await prisma.solicitudCompra.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!solicitud) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Solicitud no encontrada." });
    }

    if (solicitud.cotizacionRuta) {
      fs.unlink(path.join(UPLOADS_DIR_COTIZACIONES, solicitud.cotizacionRuta), () => {});
    }

    const actualizada = await prisma.solicitudCompra.update({
      where: { id },
      data: {
        cotizacionNombre: archivo.originalname,
        cotizacionRuta: path.join(id, archivo.filename),
        cotizacionMime: archivo.mimetype,
        cotizacionTamano: archivo.size,
        cotizacionSubidoPorNombre: req.user!.nombre,
        cotizacionSubidoEn: new Date(),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_COTIZACION_ADJUNTADA",
        detalle: `${req.user!.nombre} adjuntó la cotización "${archivo.originalname}" a la solicitud "${solicitud.item}"`,
      },
    });

    return res.status(201).json(serializar(actualizada));
  } catch (error) {
    console.error("Error al subir cotización de solicitud de compra:", error);
    return res.status(500).json({ message: "Error al subir la cotización." });
  }
};

/**
 * Sirve la cotización adjunta para visualizarla/descargarla. Nunca se expone
 * un path público directo: siempre se busca la solicitud por tenant primero
 * y se lee del disco la ruta ya validada que quedó guardada en la BD.
 */
export const obtenerCotizacionSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const solicitud = await prisma.solicitudCompra.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!solicitud || !solicitud.cotizacionRuta) {
      return res.status(404).json({ message: "Esta solicitud no tiene una cotización adjunta." });
    }

    const rutaAbsoluta = path.join(UPLOADS_DIR_COTIZACIONES, solicitud.cotizacionRuta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    res.setHeader("Content-Type", solicitud.cotizacionMime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(solicitud.cotizacionNombre || "cotizacion")}"`,
    );
    return res.sendFile(rutaAbsoluta);
  } catch (error) {
    console.error("Error al obtener cotización de solicitud de compra:", error);
    return res.status(500).json({ message: "Error al obtener la cotización." });
  }
};
