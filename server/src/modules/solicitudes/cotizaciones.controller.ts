import fs from "fs";
import path from "path";
import { Response } from "express";
import { CotizacionProveedor } from "@prisma/client";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  UPLOADS_DIR_COTIZACIONES_PROVEEDOR,
  moverArchivoDefinitivo,
} from "../../middleware/upload.middleware";

// Una SolicitudCompra solo admite cotizaciones mientras sigue en un estado
// "abierto" (todavía no fue aprobada/rechazada/facturada). Una vez resuelta,
// el cuadro comparativo queda congelado como quedó al aprobar.
const ESTADOS_ADMITEN_COTIZACIONES = ["Pendiente", "En Cotización"];
const MAX_COTIZACIONES = 3;
// Antes se exigían las 3 cotizaciones completas antes de poder elegir
// ganadora. Relajado a pedido del negocio: con al menos 1 cotización ya se
// puede elegir ganadora (ver también solicitudes.controller.ts, que exige lo
// mismo — al menos 1 + ganadora — para aprobar la solicitud).
const MIN_COTIZACIONES_PARA_GANADORA = 1;

function serializarCotizacion(c: CotizacionProveedor) {
  return {
    id: c.id,
    solicitudCompraId: c.solicitudCompraId,
    proveedorId: c.proveedorId,
    proveedorNombre: c.proveedorNombre,
    proveedorNit: c.proveedorNit,
    valorTotalCOP: Number(c.valorTotalCOP),
    tiempoEntregaDias: c.tiempoEntregaDias,
    esGanadora: c.esGanadora,
    archivo: { nombre: c.archivoNombre, mime: c.archivoMime, tamano: c.archivoTamano },
    subidoPor: c.subidoPorNombre,
    createdAt: c.createdAt,
  };
}

/**
 * Cuadro comparativo: las cotizaciones de proveedor recogidas para una
 * solicitud de compra, para que Gerencia las compare y elija una ganadora.
 */
export const listarCotizacionesSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const solicitud = await req.tenantPrisma!.solicitudCompra.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada." });

    const cotizaciones = await req.tenantPrisma!.cotizacionProveedor.findMany({
      where: { solicitudCompraId: id, tenantId },
      orderBy: { createdAt: "asc" },
    });

    return res.json(cotizaciones.map(serializarCotizacion));
  } catch (error) {
    console.error("Error al listar cotizaciones de proveedor:", error);
    return res.status(500).json({ message: "Error al obtener las cotizaciones." });
  }
};

/**
 * Registra una cotización de proveedor para una solicitud de compra. Una
 * solicitud solo puede tener hasta 3 (la regla de negocio de "exactamente 3
 * cotizaciones" se valida al intentar aprobar, no aquí, para permitir
 * guardar el trabajo en progreso con 1 o 2). Si la solicitud seguía
 * "Pendiente", la primera cotización la mueve a "En Cotización".
 */
export const crearCotizacionSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const archivo = req.file as Express.Multer.File | undefined;
    const { proveedorId, proveedorNombre, proveedorNit, valorTotalCOP, tiempoEntregaDias } =
      req.body;

    if (!archivo) {
      return res.status(400).json({ message: "Debes adjuntar el documento de la cotización." });
    }

    // El proveedor puede venir del catálogo (proveedorId, preferido: nombre y
    // NIT se toman de ahí, nunca del texto que mande el cliente) o, para uno
    // todavía no catalogado, como texto libre — mismo patrón que Factura y
    // SolicitudCompra.
    let proveedorNombreFinal = typeof proveedorNombre === "string" ? proveedorNombre.trim() : "";
    let proveedorNitFinal = typeof proveedorNit === "string" ? proveedorNit.trim() : "";
    if (proveedorId) {
      const proveedorDb = await req.tenantPrisma!.proveedor.findFirst({
        where: { id: proveedorId, tenantId, activo: true },
      });
      if (!proveedorDb) {
        fs.unlink(archivo.path, () => {});
        return res
          .status(404)
          .json({ message: "El proveedor seleccionado no existe o está inactivo." });
      }
      proveedorNombreFinal = proveedorDb.nombre;
      proveedorNitFinal = proveedorDb.nit;
    }
    if (!proveedorNombreFinal || !proveedorNitFinal) {
      fs.unlink(archivo.path, () => {});
      return res.status(400).json({ message: "Proveedor y NIT son obligatorios." });
    }
    const valor = Number(valorTotalCOP);
    const dias = Number(tiempoEntregaDias);
    if (!Number.isFinite(valor) || valor <= 0 || !Number.isInteger(dias) || dias < 0) {
      fs.unlink(archivo.path, () => {});
      return res
        .status(400)
        .json({ message: "Valor y tiempo de entrega deben ser números válidos." });
    }

    const solicitud = await req.tenantPrisma!.solicitudCompra.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!solicitud) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Solicitud no encontrada." });
    }
    if (!ESTADOS_ADMITEN_COTIZACIONES.includes(solicitud.estado)) {
      fs.unlink(archivo.path, () => {});
      return res.status(409).json({
        message: `No se pueden agregar cotizaciones a una solicitud en estado "${solicitud.estado}".`,
      });
    }

    const totalActuales = await req.tenantPrisma!.cotizacionProveedor.count({
      where: { solicitudCompraId: id, tenantId },
    });
    if (totalActuales >= MAX_COTIZACIONES) {
      fs.unlink(archivo.path, () => {});
      return res
        .status(409)
        .json({ message: `Ya se registraron las ${MAX_COTIZACIONES} cotizaciones permitidas.` });
    }

    // Tenant/solicitud ya confirmados: recién acá se mueve el archivo de la
    // carpeta temporal a la carpeta real de esta solicitud.
    const archivoRuta = moverArchivoDefinitivo(UPLOADS_DIR_COTIZACIONES_PROVEEDOR, archivo, id);

    const [cotizacion] = await req.tenantPrisma!.$transaction([
      req.tenantPrisma!.cotizacionProveedor.create({
        data: {
          tenantId,
          solicitudCompraId: id,
          proveedorId: proveedorId || null,
          proveedorNombre: proveedorNombreFinal,
          proveedorNit: proveedorNitFinal,
          valorTotalCOP: valor,
          tiempoEntregaDias: dias,
          archivoNombre: archivo.originalname,
          archivoRuta,
          archivoMime: archivo.mimetype,
          archivoTamano: archivo.size,
          subidoPorId: req.user!.id,
          subidoPorNombre: req.user!.nombre,
        },
      }),
      ...(solicitud.estado === "Pendiente"
        ? [
            req.tenantPrisma!.solicitudCompra.update({
              where: { id },
              data: { estado: "En Cotización" },
            }),
          ]
        : []),
    ]);

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_COTIZACION_PROVEEDOR_AGREGADA",
        detalle: `${req.user!.nombre} agregó la cotización de "${proveedorNombreFinal}" a la solicitud "${solicitud.item}"`,
      },
    });

    return res.status(201).json(serializarCotizacion(cotizacion));
  } catch (error) {
    console.error("Error al registrar cotización de proveedor:", error);
    return res.status(500).json({ message: "Error al registrar la cotización." });
  }
};

/**
 * Elimina (definitivamente, con su archivo) una cotización de proveedor
 * mientras la solicitud siga abierta. Si era la ganadora, la solicitud se
 * queda sin ganadora y no podrá aprobarse hasta que se elija otra.
 */
export const eliminarCotizacionSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, cotizacionId } = req.params;

    const solicitud = await req.tenantPrisma!.solicitudCompra.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada." });
    if (!ESTADOS_ADMITEN_COTIZACIONES.includes(solicitud.estado)) {
      return res.status(409).json({
        message: `No se pueden modificar las cotizaciones de una solicitud en estado "${solicitud.estado}".`,
      });
    }

    const cotizacion = await req.tenantPrisma!.cotizacionProveedor.findFirst({
      where: { id: cotizacionId, solicitudCompraId: id, tenantId },
    });
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada." });

    await req.tenantPrisma!.cotizacionProveedor.delete({ where: { id: cotizacionId } });
    fs.unlink(path.join(UPLOADS_DIR_COTIZACIONES_PROVEEDOR, cotizacion.archivoRuta), () => {});

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_COTIZACION_PROVEEDOR_ELIMINADA",
        detalle: `${req.user!.nombre} eliminó la cotización de "${cotizacion.proveedorNombre}" de la solicitud "${solicitud.item}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar cotización de proveedor:", error);
    return res.status(500).json({ message: "Error al eliminar la cotización." });
  }
};

/**
 * Marca una cotización como la ganadora del cuadro comparativo (y desmarca
 * cualquier otra). Requiere al menos MIN_COTIZACIONES_PARA_GANADORA
 * cotización(es) registrada(s) (antes se exigían las 3 completas): es la
 * decisión de Gerencia que, junto con la(s) cotización(es), desbloquea el
 * paso de la solicitud a "Aprobada" (ver cambiarEstadoSolicitud).
 */
export const seleccionarCotizacionGanadora = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, cotizacionId } = req.params;

    const solicitud = await req.tenantPrisma!.solicitudCompra.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada." });
    if (!ESTADOS_ADMITEN_COTIZACIONES.includes(solicitud.estado)) {
      return res.status(409).json({
        message: `No se puede elegir la cotización ganadora de una solicitud en estado "${solicitud.estado}".`,
      });
    }

    // Mismo control de separación de funciones que cambiarEstadoSolicitud:
    // el precio final que se aprueba depende de cuál cotización gana, así
    // que el propio solicitante no puede decidir eso — igual que no puede
    // aprobar/rechazar su propia solicitud.
    if (solicitud.solicitanteId && solicitud.solicitanteId === req.user!.id) {
      return res.status(403).json({
        message: "No puedes seleccionar la cotización ganadora de una solicitud que tú mismo creaste.",
      });
    }

    const cotizaciones = await req.tenantPrisma!.cotizacionProveedor.findMany({
      where: { solicitudCompraId: id, tenantId },
    });
    if (cotizaciones.length < MIN_COTIZACIONES_PARA_GANADORA) {
      return res.status(409).json({
        message: `Se requiere al menos ${MIN_COTIZACIONES_PARA_GANADORA} cotización antes de elegir la ganadora (hay ${cotizaciones.length}).`,
      });
    }
    const objetivo = cotizaciones.find((c) => c.id === cotizacionId);
    if (!objetivo) return res.status(404).json({ message: "Cotización no encontrada." });

    await req.tenantPrisma!.$transaction([
      req.tenantPrisma!.cotizacionProveedor.updateMany({
        where: { solicitudCompraId: id, tenantId, esGanadora: true },
        data: { esGanadora: false },
      }),
      req.tenantPrisma!.cotizacionProveedor.update({
        where: { id: cotizacionId },
        data: { esGanadora: true },
      }),
    ]);

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_COTIZACION_GANADORA_SELECCIONADA",
        detalle: `${req.user!.nombre} eligió la cotización de "${objetivo.proveedorNombre}" como ganadora para la solicitud "${solicitud.item}"`,
      },
    });

    const actualizadas = await req.tenantPrisma!.cotizacionProveedor.findMany({
      where: { solicitudCompraId: id, tenantId },
      orderBy: { createdAt: "asc" },
    });
    return res.json(actualizadas.map(serializarCotizacion));
  } catch (error) {
    console.error("Error al seleccionar cotización ganadora:", error);
    return res.status(500).json({ message: "Error al seleccionar la cotización ganadora." });
  }
};

export const obtenerArchivoCotizacionSolicitud = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, cotizacionId } = req.params;

    const cotizacion = await req.tenantPrisma!.cotizacionProveedor.findFirst({
      where: { id: cotizacionId, solicitudCompraId: id, tenantId },
    });
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada." });

    const rutaAbsoluta = path.join(UPLOADS_DIR_COTIZACIONES_PROVEEDOR, cotizacion.archivoRuta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    res.setHeader("Content-Type", cotizacion.archivoMime);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(cotizacion.archivoNombre)}"`,
    );
    return res.sendFile(rutaAbsoluta);
  } catch (error) {
    console.error("Error al obtener archivo de cotización de proveedor:", error);
    return res.status(500).json({ message: "Error al obtener el archivo." });
  }
};
