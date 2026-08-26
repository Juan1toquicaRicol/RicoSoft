import fs from "fs";
import path from "path";
import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { UPLOADS_DIR } from "../../middleware/upload.middleware";
import { notificarPorPermiso } from "../../lib/notificaciones";

const ESTADOS_VALIDOS = ["Pendiente", "Aprobada", "Pagada", "Rechazada"];
const PRIORIDADES_VALIDAS = ["Baja", "Media", "Alta", "Crítica"];
const MONEDAS_VALIDAS = ["COP", "USD"];

// Transiciones de estado permitidas y el permiso requerido para ejecutarlas.
// "Pagada" NO está aquí a propósito: ya no se alcanza cambiando el estado a
// mano, sino registrando pagos reales (ver pagos.controller.ts). Si alguien
// intenta ponerlo directamente, TRANSICIONES["Pagada"] es undefined y cae en
// el mensaje "no se puede establecer directamente" más abajo.
const TRANSICIONES: Record<string, { desde: string[]; permiso: string }> = {
  Aprobada: { desde: ["Pendiente"], permiso: PERMISOS_SISTEMA.FACTURAS_APROBAR },
  Rechazada: { desde: ["Pendiente"], permiso: PERMISOS_SISTEMA.FACTURAS_RECHAZAR },
};

function serializar(f: any) {
  const pagos = Array.isArray(f.pagos) ? f.pagos : [];
  const totalPagado = pagos
    .filter((p: any) => p.estado === "Confirmado")
    .reduce((acc: number, p: any) => acc + Number(p.valor), 0);
  const total = Number(f.total);

  // Alerta informativa (no bloqueante): si la factura está ligada a un
  // servicio recurrente y su total supera el costo configurado, se avisa
  // pero NUNCA se rechaza automáticamente (puede ser un cargo legítimo
  // adicional). Sirve como punto de partida para reglas configurables
  // futuras, no como validación dura.
  let alertaValor: { mensaje: string } | null = null;
  if (f.servicioRel) {
    const costoRecurrente = Number(f.servicioRel.costo);
    if (total > costoRecurrente) {
      alertaValor = {
        mensaje: `El valor de la factura ($${total.toLocaleString("es-CO")}) supera el valor recurrente configurado para "${f.servicioRel.nombreServicio}" ($${costoRecurrente.toLocaleString("es-CO")}).`,
      };
    }
  }

  return {
    id: f.id,
    empresaId: f.empresaId,
    numero: f.numero,
    proveedor: f.proveedor,
    nit: f.nit,
    servicioId: f.servicioId,
    servicio: f.servicioRel ? { id: f.servicioRel.id, nombre: f.servicioRel.nombreServicio } : null,
    contratoId: f.contratoId,
    contratoRel: f.contratoRel ? { id: f.contratoRel.id, proveedor: f.contratoRel.proveedor } : null,
    contrato: f.contrato,
    solicitudCompraId: f.solicitudCompraId,
    solicitudCompraRel: f.solicitudCompraRel ? { id: f.solicitudCompraRel.id, item: f.solicitudCompraRel.item } : null,
    centroCostos: f.centroCostos,
    area: f.area,
    responsable: f.responsable,
    fecha: f.fecha,
    vence: f.vence,
    subtotal: Number(f.subtotal),
    iva: Number(f.iva),
    total,
    moneda: f.moneda,
    estado: f.estado,
    // Derivada, no almacenada: evita duplicar la máquina de estados con un
    // campo "Vencida" que habría que mantener sincronizado aparte.
    vencida: (f.estado === "Pendiente" || f.estado === "Aprobada") && new Date(f.vence) < new Date(),
    prioridad: f.prioridad,
    origen: f.origen,
    totalPagado,
    saldoPendiente: total - totalPagado,
    alertaValor,
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

const INCLUDE_FACTURA = {
  historial: { orderBy: { createdAt: "asc" as const } },
  servicioRel: { select: { id: true, nombreServicio: true, costo: true } },
  contratoRel: { select: { id: true, proveedor: true } },
  solicitudCompraRel: { select: { id: true, item: true } },
  pagos: { where: { estado: "Confirmado" as const }, select: { valor: true, estado: true } },
};

export const listarFacturas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId, estado, search, servicioId, limit } = req.query;

    const where: any = { tenantId, eliminado: false };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;
    if (typeof estado === "string" && ESTADOS_VALIDOS.includes(estado)) where.estado = estado;
    if (typeof servicioId === "string" && servicioId) where.servicioId = servicioId;
    if (typeof search === "string" && search.trim()) {
      const term = search.trim();
      where.OR = [
        { numero: { contains: term } },
        { proveedor: { contains: term } },
        { nit: { contains: term } },
        { responsable: { contains: term } },
      ];
    }

    // `limit` es opcional: vistas como el detalle de un servicio piden solo
    // las últimas N facturas relacionadas en vez de cargar el histórico
    // completo del tenant. Sin `limit`, se mantiene el tope de seguridad de
    // siempre (1000) para no romper el listado general.
    const limiteNum = Number.parseInt(String(limit ?? ""), 10);
    const take = Number.isFinite(limiteNum) && limiteNum > 0 ? Math.min(limiteNum, 1000) : 1000;

    const facturas = await prisma.factura.findMany({
      where,
      include: INCLUDE_FACTURA,
      orderBy: { createdAt: "desc" },
      take, // límite de seguridad; falta paginación real (ver auditoría)
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
      where: { id, tenantId, eliminado: false },
      include: INCLUDE_FACTURA,
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
      proveedorId,
      proveedor,
      nit,
      servicioId,
      contratoId,
      contrato,
      solicitudCompraId,
      centroCostos,
      area,
      responsableId,
      responsable,
      vence,
      subtotal,
      iva,
      moneda,
      prioridad,
      origen,
    } = req.body;

    // El servicio/contrato relacionados son opcionales (no toda factura
    // corresponde a un servicio recurrente), pero si se envían deben existir
    // en el mismo tenant (IDOR) — igual que proveedor y responsable.
    if (servicioId) {
      const servicioDb = await prisma.servicioSuscripcion.findFirst({
        where: { id: servicioId, tenantId, eliminado: false },
      });
      if (!servicioDb) {
        return res.status(404).json({ message: "El servicio seleccionado no existe." });
      }
    }
    if (contratoId) {
      const contratoDb = await prisma.contrato.findFirst({
        where: { id: contratoId, tenantId, eliminado: false },
      });
      if (!contratoDb) {
        return res.status(404).json({ message: "El contrato seleccionado no existe." });
      }
    }
    // Solicitud de compra que dio origen a esta factura: cierra el ciclo
    // solicitud (Comprado) -> factura final que se paga. Opcional.
    if (solicitudCompraId) {
      const solicitudDb = await prisma.solicitudCompra.findFirst({
        where: { id: solicitudCompraId, tenantId, eliminado: false },
      });
      if (!solicitudDb) {
        return res.status(404).json({ message: "La solicitud de compra seleccionada no existe." });
      }
    }

    // El proveedor puede venir del catálogo (proveedorId, preferido: nombre y
    // NIT se toman de ahí, nunca del texto que mande el cliente) o, por
    // compatibilidad con datos/flujos existentes, como texto libre si no se
    // selecciona ninguno del catálogo.
    let proveedorNombre = typeof proveedor === "string" ? proveedor : "";
    let proveedorNit = typeof nit === "string" ? nit : "";
    if (proveedorId) {
      const proveedorDb = await prisma.proveedor.findFirst({
        where: { id: proveedorId, tenantId, activo: true },
      });
      if (!proveedorDb) {
        return res.status(404).json({ message: "El proveedor seleccionado no existe o está inactivo." });
      }
      proveedorNombre = proveedorDb.nombre;
      proveedorNit = proveedorDb.nit;
    }

    // Mismo principio para el responsable: si viene responsableId, el nombre
    // se toma del usuario real del tenant, nunca del texto que mande el
    // cliente. Si no viene, se acepta el nombre en texto por compatibilidad.
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

    if (!empresaId || !numero || !proveedorNombre || !proveedorNit || !area || !responsableNombre || !vence) {
      return res.status(400).json({ message: "Faltan campos obligatorios de la factura." });
    }
    const sub = Number(subtotal);
    const ivaNum = Number(iva);
    if (!Number.isFinite(sub) || sub < 0 || !Number.isFinite(ivaNum) || ivaNum < 0) {
      return res.status(400).json({ message: "Subtotal e IVA deben ser números no negativos." });
    }
    const monedaFinal = MONEDAS_VALIDAS.includes(moneda) ? moneda : "COP";
    const prioridadFinal = PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : "Media";

    // Solo las facturas activas cuentan para la unicidad del número: una
    // factura eliminada (soft-delete) no debe bloquear para siempre volver a
    // usar ese número.
    const existente = await prisma.factura.findFirst({ where: { tenantId, empresaId, numero, eliminado: false } });
    if (existente) {
      return res.status(409).json({
        message: `Ya existe una factura activa con el número "${numero}" para esta empresa.`,
      });
    }

    const factura = await prisma.factura.create({
      data: {
        tenantId,
        empresaId,
        numero,
        proveedorId: proveedorId || null,
        proveedor: proveedorNombre,
        nit: proveedorNit,
        servicioId: servicioId || null,
        contratoId: contratoId || null,
        contrato: contrato || null,
        solicitudCompraId: solicitudCompraId || null,
        centroCostos: centroCostos || null,
        area,
        responsableId: responsableId || null,
        responsable: responsableNombre,
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
      include: INCLUDE_FACTURA,
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "FACTURA_CREADA",
        detalle: `${req.user!.nombre} registró la factura "${factura.numero}" (${factura.proveedor})`,
      },
    });

    await notificarPorPermiso(
      tenantId,
      PERMISOS_SISTEMA.FACTURAS_APROBAR,
      {
        tipo: "FACTURA_PENDIENTE",
        titulo: "Nueva factura pendiente de aprobación",
        mensaje: `Factura "${factura.numero}" de ${factura.proveedor} (${factura.empresaId}).`,
        enlace: "/facturas",
      },
      { excluirUsuarioId: req.user!.id },
    );

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

    const factura = await prisma.factura.findFirst({ where: { id, tenantId, eliminado: false } });
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
      include: INCLUDE_FACTURA,
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

    const factura = await prisma.factura.findFirst({ where: { id, tenantId, eliminado: false } });
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
      include: INCLUDE_FACTURA,
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

    const factura = await prisma.factura.findFirst({ where: { id, tenantId, eliminado: false } });
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

    const factura = await prisma.factura.findFirst({ where: { id, tenantId, eliminado: false } });
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
      include: INCLUDE_FACTURA,
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

    const factura = await prisma.factura.findFirst({ where: { id, tenantId, eliminado: false } });
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
      include: INCLUDE_FACTURA,
    });

    return res.json(serializar(actualizada));
  } catch (error) {
    console.error("Error al agregar comentario a la factura:", error);
    return res.status(500).json({ message: "Error al agregar el comentario." });
  }
};

/**
 * Elimina (soft-delete) una factura. No se borra de la base de datos: se
 * marca `eliminado` para conservar el historial y la trazabilidad contable,
 * y deja de aparecer en cualquier listado o consulta del módulo.
 */
export const eliminarFactura = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const factura = await prisma.factura.findFirst({ where: { id, tenantId, eliminado: false } });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada." });

    await prisma.factura.update({
      where: { id },
      data: {
        eliminado: true,
        historial: {
          create: {
            actor: req.user!.nombre,
            accion: "Factura eliminada",
            detalle: null,
          },
        },
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "FACTURA_ELIMINADA",
        detalle: `${req.user!.nombre} eliminó la factura "${factura.numero}" (${factura.proveedor})`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar factura:", error);
    return res.status(500).json({ message: "Error al eliminar la factura." });
  }
};
