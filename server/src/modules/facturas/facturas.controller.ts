import fs from "fs";
import path from "path";
import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { UPLOADS_DIR } from "../../middleware/upload.middleware";

const ESTADOS_VALIDOS = ["Pendiente", "Aprobada", "Pagada", "Rechazada"];
const PRIORIDADES_VALIDAS = ["Baja", "Media", "Alta", "Crítica"];
const MONEDAS_VALIDAS = ["COP", "USD"];

// Transiciones de estado permitidas y el permiso requerido para ejecutarlas.
const TRANSICIONES: Record<string, { desde: string[]; permiso: string }> = {
  Aprobada: { desde: ["Pendiente"], permiso: PERMISOS_SISTEMA.FACTURAS_APROBAR },
  Rechazada: { desde: ["Pendiente"], permiso: PERMISOS_SISTEMA.FACTURAS_RECHAZAR },
  Pagada: { desde: ["Aprobada"], permiso: PERMISOS_SISTEMA.FACTURAS_PAGAR },
};

function serializar(f: any) {
  return {
    id: f.id,
    empresaId: f.empresaId,
    numero: f.numero,
    proveedor: f.proveedor,
    nit: f.nit,
    contrato: f.contrato,
    centroCostos: f.centroCostos,
    area: f.area,
    responsable: f.responsable,
    fecha: f.fecha,
    vence: f.vence,
    subtotal: Number(f.subtotal),
    iva: Number(f.iva),
    total: Number(f.total),
    moneda: f.moneda,
    estado: f.estado,
    prioridad: f.prioridad,
    origen: f.origen,
    archivo: f.archivoNombre
      ? {
          nombre: f.archivoNombre,
          mime: f.archivoMime,
          tamano: f.archivoTamano,
          subidoPor: f.archivoSubidoPorNombre,
          subidoEn: f.archivoSubidoEn,
        }
      : null,
    historial: (f.historial ?? []).map((h: any) => ({
      fecha: h.createdAt,
      actor: h.actor,
      accion: h.accion,
      detalle: h.detalle,
    })),
  };
}

export const listarFacturas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId, estado, search } = req.query;

    const where: any = { tenantId };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;
    if (typeof estado === "string" && ESTADOS_VALIDOS.includes(estado)) where.estado = estado;
    if (typeof search === "string" && search.trim()) {
      const term = search.trim();
      where.OR = [
        { numero: { contains: term } },
        { proveedor: { contains: term } },
        { nit: { contains: term } },
        { responsable: { contains: term } },
      ];
    }

    const facturas = await prisma.factura.findMany({
      where,
      include: { historial: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });

    return res.json(facturas.map(serializar));
  } catch (error) {
    console.error("Error al listar facturas:", error);
    return res.status(500).json({ message: "Error al obtener facturas." });
  }
};

export const obtenerFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const factura = await prisma.factura.findFirst({
      where: { id, tenantId },
      include: { historial: { orderBy: { createdAt: "asc" } } },
    });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });
    return res.json(serializar(factura));
  } catch (error) {
    console.error("Error al obtener factura:", error);
    return res.status(500).json({ message: "Error al obtener la factura." });
  }
};

export const crearFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      empresaId,
      numero,
      proveedor,
      nit,
      contrato,
      centroCostos,
      area,
      responsable,
      vence,
      subtotal,
      iva,
      moneda,
      prioridad,
      origen,
    } = req.body;

    if (!empresaId || !numero || !proveedor || !nit || !area || !responsable || !vence) {
      return res.status(400).json({ message: "Faltan campos obligatorios de la factura." });
    }
    const sub = Number(subtotal);
    const ivaNum = Number(iva);
    if (!Number.isFinite(sub) || sub < 0 || !Number.isFinite(ivaNum) || ivaNum < 0) {
      return res.status(400).json({ message: "Subtotal e IVA deben ser números no negativos." });
    }
    const monedaFinal = MONEDAS_VALIDAS.includes(moneda) ? moneda : "COP";
    const prioridadFinal = PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : "Media";

    const existente = await prisma.factura.findFirst({ where: { tenantId, empresaId, numero } });
    if (existente) {
      return res.status(409).json({
        message: `Ya existe una factura con el número "${numero}" para esta empresa.`,
      });
    }

    const factura = await prisma.factura.create({
      data: {
        tenantId,
        empresaId,
        numero,
        proveedor,
        nit,
        contrato: contrato || null,
        centroCostos: centroCostos || null,
        area,
        responsable,
        vence: new Date(vence),
        subtotal: sub,
        iva: ivaNum,
        total: sub + ivaNum,
        moneda: monedaFinal,
        prioridad: prioridadFinal,
        origen: typeof origen === "string" ? origen : "Carga manual",
        historial: {
          create: {
            actor: req.user!.nombre,
            accion: "Factura recibida",
            detalle: "Ingreso al sistema",
          },
        },
      },
      include: { historial: true },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "FACTURA_CREADA",
        detalle: `${req.user!.nombre} registró la factura "${factura.numero}" (${proveedor})`,
      },
    });

    return res.status(201).json(serializar(factura));
  } catch (error) {
    console.error("Error al crear factura:", error);
    return res.status(500).json({ message: "Error al registrar la factura." });
  }
};

export const cambiarEstadoFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { estado: nuevoEstado, detalle } = req.body;

    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }

    const transicion = TRANSICIONES[nuevoEstado];
    if (!transicion) {
      return res.status(400).json({ message: `No se puede establecer el estado "${nuevoEstado}" directamente.` });
    }

    const factura = await prisma.factura.findFirst({ where: { id, tenantId } });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });

    if (!transicion.desde.includes(factura.estado)) {
      return res.status(409).json({
        message: `No se puede pasar de "${factura.estado}" a "${nuevoEstado}".`,
      });
    }

    const tienePermiso = req.user!.isSuperadmin || req.user!.permisos.includes(transicion.permiso);
    if (!tienePermiso) {
      return res.status(403).json({ message: "No tienes permiso para realizar esta acción." });
    }

    const accionLabel =
      nuevoEstado === "Aprobada" ? "Factura aprobada" : nuevoEstado === "Rechazada" ? "Factura rechazada" : "Pago registrado";

    const actualizada = await prisma.factura.update({
      where: { id },
      data: {
        estado: nuevoEstado,
        historial: {
          create: {
            actor: req.user!.nombre,
            accion: accionLabel,
            detalle: typeof detalle === "string" ? detalle : undefined,
          },
        },
      },
      include: { historial: { orderBy: { createdAt: "asc" } } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: `FACTURA_${nuevoEstado.toUpperCase()}`,
        detalle: `${req.user!.nombre} cambió la factura "${factura.numero}" a "${nuevoEstado}"`,
      },
    });

    return res.json(serializar(actualizada));
  } catch (error) {
    console.error("Error al cambiar estado de factura:", error);
    return res.status(500).json({ message: "Error al actualizar la factura." });
  }
};

/**
 * Recibe el archivo (PDF/imagen) adjunto a la factura. El middleware de
 * multer ya guardó el archivo en disco antes de llegar aquí; este handler
 * solo valida que la factura exista en el tenant del usuario y actualiza
 * los metadatos. Si la factura ya tenía un archivo, el anterior se borra
 * del disco (se reemplaza, no se acumulan versiones huérfanas).
 */
export const subirArchivoFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const archivo = (req as any).file as Express.Multer.File | undefined;

    if (!archivo) {
      return res.status(400).json({ message: "No se recibió ningún archivo." });
    }

    const factura = await prisma.factura.findFirst({ where: { id, tenantId } });
    if (!factura) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Factura no encontrada." });
    }

    if (factura.archivoRuta) {
      const rutaAnterior = path.join(UPLOADS_DIR, factura.archivoRuta);
      fs.unlink(rutaAnterior, () => {});
    }

    const actualizada = await prisma.factura.update({
      where: { id },
      data: {
        archivoNombre: archivo.originalname,
        archivoRuta: path.join(id, archivo.filename),
        archivoMime: archivo.mimetype,
        archivoTamano: archivo.size,
        archivoSubidoPorNombre: req.user!.nombre,
        archivoSubidoEn: new Date(),
        historial: {
          create: {
            actor: req.user!.nombre,
            accion: "Documento adjuntado",
            detalle: archivo.originalname,
          },
        },
      },
      include: { historial: { orderBy: { createdAt: "asc" } } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "FACTURA_ARCHIVO_ADJUNTADO",
        detalle: `${req.user!.nombre} adjuntó "${archivo.originalname}" a la factura "${factura.numero}"`,
      },
    });

    return res.status(201).json(serializar(actualizada));
  } catch (error) {
    console.error("Error al subir archivo de factura:", error);
    return res.status(500).json({ message: "Error al subir el archivo." });
  }
};

/**
 * Sirve el archivo adjunto para visualizarlo/descargarlo. Nunca se expone
 * un path público directo: siempre se busca la factura por tenant primero
 * y se lee del disco la ruta ya validada que quedó guardada en la BD.
 */
export const obtenerArchivoFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const factura = await prisma.factura.findFirst({ where: { id, tenantId } });
    if (!factura || !factura.archivoRuta) {
      return res.status(404).json({ message: "Esta factura no tiene un archivo adjunto." });
    }

    const rutaAbsoluta = path.join(UPLOADS_DIR, factura.archivoRuta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    res.setHeader("Content-Type", factura.archivoMime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(factura.archivoNombre || "documento")}"`,
    );
    return res.sendFile(rutaAbsoluta);
  } catch (error) {
    console.error("Error al obtener archivo de factura:", error);
    return res.status(500).json({ message: "Error al obtener el archivo." });
  }
};

export const eliminarArchivoFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const factura = await prisma.factura.findFirst({ where: { id, tenantId } });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });
    if (!factura.archivoRuta) {
      return res.status(404).json({ message: "Esta factura no tiene un archivo adjunto." });
    }

    fs.unlink(path.join(UPLOADS_DIR, factura.archivoRuta), () => {});

    const actualizada = await prisma.factura.update({
      where: { id },
      data: {
        archivoNombre: null,
        archivoRuta: null,
        archivoMime: null,
        archivoTamano: null,
        archivoSubidoPorNombre: null,
        archivoSubidoEn: null,
        historial: {
          create: {
            actor: req.user!.nombre,
            accion: "Documento eliminado",
            detalle: factura.archivoNombre,
          },
        },
      },
      include: { historial: { orderBy: { createdAt: "asc" } } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "FACTURA_ARCHIVO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el archivo adjunto de la factura "${factura.numero}"`,
      },
    });

    return res.json(serializar(actualizada));
  } catch (error) {
    console.error("Error al eliminar archivo de factura:", error);
    return res.status(500).json({ message: "Error al eliminar el archivo." });
  }
};

/**
 * Comentario libre sobre la factura. Reutiliza FacturaHistorial (misma
 * tabla que ya registra aprobaciones/rechazos/pagos) en vez de crear una
 * tabla de comentarios paralela: un comentario es solo otra entrada de la
 * misma línea de tiempo, con accion="Comentario".
 */
export const agregarComentarioFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { texto } = req.body;

    if (typeof texto !== "string" || !texto.trim()) {
      return res.status(400).json({ message: "El comentario no puede estar vacío." });
    }
    if (texto.length > 2000) {
      return res.status(400).json({ message: "El comentario es demasiado largo (máx. 2000 caracteres)." });
    }

    const factura = await prisma.factura.findFirst({ where: { id, tenantId } });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });

    const actualizada = await prisma.factura.update({
      where: { id },
      data: {
        historial: {
          create: {
            actor: req.user!.nombre,
            accion: "Comentario",
            detalle: texto.trim(),
          },
        },
      },
      include: { historial: { orderBy: { createdAt: "asc" } } },
    });

    return res.json(serializar(actualizada));
  } catch (error) {
    console.error("Error al agregar comentario a la factura:", error);
    return res.status(500).json({ message: "Error al agregar el comentario." });
  }
};
