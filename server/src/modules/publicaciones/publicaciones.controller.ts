import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  UPLOADS_DIR_PUBLICACIONES,
  MAX_ARCHIVOS_POR_PUBLICACION,
  moverArchivoDefinitivo,
  nombreArchivoUtf8,
  tipoArchivoPublicacion,
} from "../../middleware/upload.middleware";
import { whereAlcance } from "../../lib/alcance";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { permisosRequeridos } from "../../lib/catalogo-permisos";

const CATEGORIAS = ["NOVEDAD", "AVISO", "EVENTO"] as const;
type Categoria = (typeof CATEGORIAS)[number];

const ESTADOS = ["PROGRAMADA", "PUBLICADA", "DESACTIVADA", "VENCIDA"] as const;
type Estado = (typeof ESTADOS)[number];

const ALCANCES = ["GENERAL", "TENANT"] as const;

function esCategoriaValida(valor: unknown): valor is Categoria {
  return typeof valor === "string" && (CATEGORIAS as readonly string[]).includes(valor);
}

/**
 * Publicacion no tiene un campo `estado`: se deriva de activo + fechas, igual
 * que el resto del modelo (nunca inventamos una columna nueva para esto).
 * PROGRAMADA = activa pero con fechaPublicacion en el futuro (equivalente al
 * "borrador programado" del enunciado, sin un flag de borrador aparte).
 */
function calcularEstado(p: {
  activo: boolean;
  fechaPublicacion: Date;
  fechaVencimiento: Date | null;
}): Estado {
  const ahora = new Date();
  if (!p.activo) return "DESACTIVADA";
  if (p.fechaVencimiento && p.fechaVencimiento < ahora) return "VENCIDA";
  if (p.fechaPublicacion > ahora) return "PROGRAMADA";
  return "PUBLICADA";
}

const INCLUDE_PUBLICACION = {
  autor: { select: { nombre: true } },
  archivos: {
    select: { id: true, tipo: true, nombreOriginal: true, mime: true, tamano: true },
    orderBy: { createdAt: "asc" as const },
  },
};

function serializar(p: {
  id: string;
  tenantId: string | null;
  categoria: string;
  tipo: string;
  titulo: string;
  contenido: string;
  fechaPublicacion: Date;
  fechaVencimiento: Date | null;
  fechaEvento: Date | null;
  activo: boolean;
  autorId: string;
  autor?: { nombre: string } | null;
  archivos?: { id: string; tipo: string; nombreOriginal: string; mime: string; tamano: number }[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    categoria: p.categoria,
    tipo: p.tipo,
    titulo: p.titulo,
    contenido: p.contenido,
    fechaPublicacion: p.fechaPublicacion,
    fechaVencimiento: p.fechaVencimiento,
    fechaEvento: p.fechaEvento,
    activo: p.activo,
    estado: calcularEstado(p),
    autorNombre: p.autor?.nombre ?? null,
    alcance: p.tenantId === null ? "GENERAL" : "TENANT",
    archivos: (p.archivos ?? []).map((a) => ({
      id: a.id,
      tipo: a.tipo,
      nombre: a.nombreOriginal,
      mime: a.mime,
      tamano: a.tamano,
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * GET /api/publicaciones?categoria=NOVEDAD|AVISO|EVENTO — lo que consume el
 * Home: solo lo que le corresponde ver al usuario (GENERALES + del tenant de
 * su sesión, nunca de otra empresa), activas, ya publicadas (fechaPublicacion
 * <= ahora — respeta la programación a futuro) y sin vencer. Cualquier
 * usuario autenticado puede leer (igual que plantillas de notificación /
 * catálogos): es contenido informativo, no administrativo.
 */
export const listarPublicaciones = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const categoria = req.query.categoria;
    if (!esCategoriaValida(categoria)) {
      return res.status(400).json({ message: "categoria debe ser NOVEDAD, AVISO o EVENTO." });
    }

    // Calendario del Home: con desde/hasta el EVENTO se lista por rango (mes
    // visible, incluyendo días ya pasados) en vez de "solo lo que viene".
    const desde = typeof req.query.desde === "string" ? new Date(req.query.desde) : null;
    const hasta = typeof req.query.hasta === "string" ? new Date(req.query.hasta) : null;
    if ((desde && Number.isNaN(desde.getTime())) || (hasta && Number.isNaN(hasta.getTime()))) {
      return res.status(400).json({ message: "desde/hasta deben ser fechas válidas." });
    }
    const porRango = categoria === "EVENTO" && (desde !== null || hasta !== null);

    const ahora = new Date();
    const publicaciones = await prisma.publicacion.findMany({
      where: {
        categoria,
        activo: true,
        fechaPublicacion: { lte: ahora },
        // AND explícito: whereAlcance() y el filtro de vencimiento usan cada
        // uno su propia clave `OR` — combinarlos con un solo spread pisaría
        // uno con el otro y dejaría el filtro de tenant sin efecto (fuga
        // cross-tenant).
        AND: [
          whereAlcance(tenantId),
          { OR: [{ fechaVencimiento: null }, { fechaVencimiento: { gte: ahora } }] },
        ],
        ...(categoria === "EVENTO"
          ? {
              fechaEvento: porRango
                ? { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) }
                : { gte: ahora },
            }
          : {}),
      },
      include: INCLUDE_PUBLICACION,
      orderBy: categoria === "EVENTO" ? { fechaEvento: "asc" } : { fechaPublicacion: "desc" },
      take: porRango ? 200 : 20,
    });

    return res.json(publicaciones.map(serializar));
  } catch (error) {
    console.error("Error al listar publicaciones:", error);
    return res.status(500).json({ message: "Error al obtener las publicaciones." });
  }
};

/**
 * GET /api/publicaciones/admin — pantalla de administración (Configuración >
 * Publicaciones): a diferencia de listarPublicaciones, aquí SÍ se ven las
 * inactivas/vencidas/programadas (el admin necesita administrar el ciclo de
 * vida completo, no solo lo que ya se le muestra a los usuarios en Home).
 * Protegido con publicaciones.gestionar — nunca expuesto a lectura pública.
 */
export const listarPublicacionesAdmin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { categoria, alcance, q, estado } = req.query;

    if (categoria !== undefined && !esCategoriaValida(categoria)) {
      return res.status(400).json({ message: "categoria debe ser NOVEDAD, AVISO o EVENTO." });
    }
    if (alcance !== undefined && !(ALCANCES as readonly string[]).includes(String(alcance))) {
      return res.status(400).json({ message: 'alcance debe ser "GENERAL" o "TENANT".' });
    }
    if (estado !== undefined && !(ESTADOS as readonly string[]).includes(String(estado))) {
      return res.status(400).json({ message: "estado inválido." });
    }

    const publicaciones = await prisma.publicacion.findMany({
      where: {
        ...whereAlcance(tenantId),
        ...(categoria ? { categoria: String(categoria) } : {}),
        ...(alcance === "GENERAL" ? { tenantId: null } : {}),
        ...(alcance === "TENANT" ? { tenantId } : {}),
        ...(typeof q === "string" && q.trim() ? { titulo: { contains: q.trim() } } : {}),
      },
      include: INCLUDE_PUBLICACION,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    let resultado = publicaciones.map(serializar);
    // `estado` es derivado (no una columna), así que su filtro se aplica en
    // memoria después de traer los candidatos — el dataset por tenant es
    // pequeño (contenido corporativo, no transaccional), no vale la pena
    // replicar la lógica de calcularEstado() en SQL para esto.
    if (typeof estado === "string") {
      resultado = resultado.filter((p) => p.estado === estado);
    }

    return res.json(resultado);
  } catch (error) {
    console.error("Error al listar publicaciones (admin):", error);
    return res.status(500).json({ message: "Error al obtener las publicaciones." });
  }
};

export const crearPublicacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      categoria,
      tipo,
      titulo,
      contenido,
      fechaPublicacion,
      fechaVencimiento,
      fechaEvento,
      alcance,
    } = req.body;

    if (!esCategoriaValida(categoria)) {
      return res.status(400).json({ message: "categoria debe ser NOVEDAD, AVISO o EVENTO." });
    }
    if (!tipo || typeof tipo !== "string" || !tipo.trim()) {
      return res.status(400).json({ message: "tipo es obligatorio." });
    }
    if (!titulo || typeof titulo !== "string" || !titulo.trim()) {
      return res.status(400).json({ message: "titulo es obligatorio." });
    }
    if (!contenido || typeof contenido !== "string" || !contenido.trim()) {
      return res.status(400).json({ message: "contenido es obligatorio." });
    }
    if (alcance !== undefined && alcance !== "GENERAL" && alcance !== "TENANT") {
      return res.status(400).json({ message: 'alcance debe ser "GENERAL" o "TENANT".' });
    }
    // Igual que Departamento/Rol/PlantillaNotificacion: una publicación
    // GENERAL es visible en TODOS los tenants, solo un superadmin puede
    // publicarla.
    if (alcance === "GENERAL" && !req.user!.isSuperadmin) {
      return res
        .status(403)
        .json({ message: "Solo un superadministrador puede publicar contenido general." });
    }
    if (categoria === "EVENTO" && !fechaEvento) {
      return res.status(400).json({ message: "fechaEvento es obligatoria para categoría EVENTO." });
    }

    const publicacion = await prisma.publicacion.create({
      data: {
        tenantId: alcance === "GENERAL" ? null : tenantId,
        categoria,
        tipo: tipo.trim(),
        titulo: titulo.trim(),
        contenido: contenido.trim(),
        // Programar a futuro: si se manda una fecha, se respeta tal cual (el
        // Home ya filtra fechaPublicacion <= ahora); sin fecha, se publica de
        // inmediato (default de schema = now()).
        ...(fechaPublicacion ? { fechaPublicacion: new Date(fechaPublicacion) } : {}),
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
        fechaEvento: fechaEvento ? new Date(fechaEvento) : null,
        autorId: req.user!.id,
      },
      include: INCLUDE_PUBLICACION,
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PUBLICACION_CREADA",
        detalle: `${req.user!.nombre} creó la publicación "${publicacion.titulo}" (${publicacion.categoria}).`,
      },
    });

    return res.status(201).json(serializar(publicacion));
  } catch (error) {
    console.error("Error al crear publicación:", error);
    return res.status(500).json({ message: "Error al crear la publicación." });
  }
};

const AUDITORIA_POR_INTENT: Record<string, { accion: string; verbo: string }> = {
  publicar: { accion: "PUBLICACION_PUBLICADA", verbo: "publicó" },
  activar: { accion: "PUBLICACION_ACTIVADA", verbo: "activó" },
  desactivar: { accion: "PUBLICACION_DESACTIVADA", verbo: "desactivó" },
};

export const actualizarPublicacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const {
      tipo,
      titulo,
      contenido,
      fechaPublicacion,
      fechaVencimiento,
      fechaEvento,
      activo,
      intent,
    } = req.body;

    const existente = await prisma.publicacion.findFirst({
      where: { id, ...whereAlcance(tenantId) },
    });
    if (!existente) {
      return res.status(404).json({ message: "Publicación no encontrada." });
    }
    if (existente.tenantId === null && !req.user!.isSuperadmin) {
      return res
        .status(403)
        .json({ message: "Solo un superadministrador puede editar publicaciones generales." });
    }

    // "Publicar ahora" es una acción explícita: fuerza fechaPublicacion=now +
    // activo=true, ignorando cualquier otro campo que venga en el mismo
    // request (la UI la dispara como botón aislado, no mezclada con edición).
    const esPublicarAhora = intent === "publicar";

    const publicacion = await prisma.publicacion.update({
      where: { id },
      data: esPublicarAhora
        ? { fechaPublicacion: new Date(), activo: true }
        : {
            ...(typeof tipo === "string" && tipo.trim() ? { tipo: tipo.trim() } : {}),
            ...(typeof titulo === "string" && titulo.trim() ? { titulo: titulo.trim() } : {}),
            ...(typeof contenido === "string" && contenido.trim()
              ? { contenido: contenido.trim() }
              : {}),
            ...(fechaPublicacion !== undefined
              ? { fechaPublicacion: fechaPublicacion ? new Date(fechaPublicacion) : new Date() }
              : {}),
            ...(fechaVencimiento !== undefined
              ? { fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null }
              : {}),
            ...(fechaEvento !== undefined
              ? { fechaEvento: fechaEvento ? new Date(fechaEvento) : null }
              : {}),
            ...(typeof activo === "boolean" ? { activo } : {}),
          },
      include: INCLUDE_PUBLICACION,
    });

    const infoAuditoria = (typeof intent === "string" && AUDITORIA_POR_INTENT[intent]) || undefined;
    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: infoAuditoria?.accion ?? "PUBLICACION_EDITADA",
        detalle: infoAuditoria
          ? `${req.user!.nombre} ${infoAuditoria.verbo} la publicación "${publicacion.titulo}".`
          : `${req.user!.nombre} editó la publicación "${publicacion.titulo}".`,
      },
    });

    return res.json(serializar(publicacion));
  } catch (error) {
    console.error("Error al actualizar publicación:", error);
    return res.status(500).json({ message: "Error al actualizar la publicación." });
  }
};

export const eliminarPublicacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const existente = await prisma.publicacion.findFirst({
      where: { id, ...whereAlcance(tenantId) },
    });
    if (!existente) {
      return res.status(404).json({ message: "Publicación no encontrada." });
    }
    if (existente.tenantId === null && !req.user!.isSuperadmin) {
      return res
        .status(403)
        .json({ message: "Solo un superadministrador puede eliminar publicaciones generales." });
    }

    // Las filas de PublicacionArchivo caen por cascade; los archivos en
    // disco no, así que se borra la carpeta de la publicación.
    await prisma.publicacion.delete({ where: { id } });
    fs.rm(path.join(UPLOADS_DIR_PUBLICACIONES, id), { recursive: true, force: true }, () => {});

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PUBLICACION_ELIMINADA",
        detalle: `${req.user!.nombre} eliminó la publicación "${existente.titulo}".`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar publicación:", error);
    return res.status(500).json({ message: "Error al eliminar la publicación." });
  }
};

/**
 * POST /api/publicaciones/:id/archivos — adjunta fotos/videos/documentos.
 * multer ya dejó los archivos (validados) en la carpeta temporal: aquí solo
 * se confirma que la publicación es del alcance del usuario y recién ahí se
 * mueven a su carpeta definitiva.
 */
export const subirArchivosPublicacion = async (req: AuthenticatedRequest, res: Response) => {
  const archivos = (req as Request & { files?: Express.Multer.File[] }).files ?? [];
  const descartar = () => archivos.forEach((a) => fs.unlink(a.path, () => {}));

  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    if (archivos.length === 0) {
      return res.status(400).json({ message: "No se recibió ningún archivo." });
    }

    const existente = await prisma.publicacion.findFirst({
      where: { id, ...whereAlcance(tenantId) },
      include: { _count: { select: { archivos: true } } },
    });
    if (!existente) {
      descartar();
      return res.status(404).json({ message: "Publicación no encontrada." });
    }
    if (existente.tenantId === null && !req.user!.isSuperadmin) {
      descartar();
      return res
        .status(403)
        .json({ message: "Solo un superadministrador puede editar publicaciones generales." });
    }
    if (existente._count.archivos + archivos.length > MAX_ARCHIVOS_POR_PUBLICACION) {
      descartar();
      return res.status(400).json({
        message: `Una publicación admite hasta ${MAX_ARCHIVOS_POR_PUBLICACION} archivos.`,
      });
    }

    const filas = archivos.map((archivo) => ({
      tipo: tipoArchivoPublicacion(archivo.mimetype) ?? "DOCUMENTO",
      nombreOriginal: nombreArchivoUtf8(archivo.originalname),
      mime: archivo.mimetype,
      tamano: archivo.size,
      ruta: moverArchivoDefinitivo(UPLOADS_DIR_PUBLICACIONES, archivo, id),
    }));

    const publicacion = await prisma.publicacion.update({
      where: { id },
      data: { archivos: { create: filas } },
      include: INCLUDE_PUBLICACION,
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PUBLICACION_ARCHIVOS_ADJUNTADOS",
        detalle: `${req.user!.nombre} adjuntó ${filas.length} archivo(s) a la publicación "${publicacion.titulo}".`,
      },
    });

    return res.status(201).json(serializar(publicacion));
  } catch (error) {
    descartar();
    console.error("Error al subir archivos de publicación:", error);
    return res.status(500).json({ message: "Error al subir los archivos." });
  }
};

/**
 * GET /api/publicaciones/:id/archivos/:archivoId — sirve el archivo. Nunca
 * hay una URL pública directa: se valida el alcance de la publicación y, para
 * quien no administra publicaciones, que esté vigente (igual que el listado
 * del Home — un archivo de una publicación desactivada/vencida no se filtra
 * conociendo su id). ?descargar=1 fuerza descarga en vez de vista inline.
 */
export const obtenerArchivoPublicacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, archivoId } = req.params;
    const tenantId = req.user!.tenantId;
    const ahora = new Date();
    const esAdmin =
      req.user!.isSuperadmin ||
      permisosRequeridos(PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR).every((p) =>
        req.user!.permisos.includes(p),
      );

    const archivo = await prisma.publicacionArchivo.findFirst({
      where: {
        id: archivoId,
        publicacionId: id,
        publicacion: {
          AND: [
            whereAlcance(tenantId),
            ...(esAdmin
              ? []
              : [
                  { activo: true, fechaPublicacion: { lte: ahora } },
                  { OR: [{ fechaVencimiento: null }, { fechaVencimiento: { gte: ahora } }] },
                ]),
          ],
        },
      },
    });
    if (!archivo) {
      return res.status(404).json({ message: "Archivo no encontrado." });
    }

    const rutaAbsoluta = path.join(UPLOADS_DIR_PUBLICACIONES, archivo.ruta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    const inline = req.query.descargar !== "1" && archivo.tipo !== "DOCUMENTO";
    res.setHeader("Content-Type", archivo.mime);
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(archivo.nombreOriginal)}`,
    );
    return res.sendFile(rutaAbsoluta);
  } catch (error) {
    console.error("Error al obtener archivo de publicación:", error);
    return res.status(500).json({ message: "Error al obtener el archivo." });
  }
};

export const eliminarArchivoPublicacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, archivoId } = req.params;
    const tenantId = req.user!.tenantId;

    const archivo = await prisma.publicacionArchivo.findFirst({
      where: { id: archivoId, publicacionId: id, publicacion: whereAlcance(tenantId) },
      include: { publicacion: { select: { tenantId: true, titulo: true } } },
    });
    if (!archivo) {
      return res.status(404).json({ message: "Archivo no encontrado." });
    }
    if (archivo.publicacion.tenantId === null && !req.user!.isSuperadmin) {
      return res
        .status(403)
        .json({ message: "Solo un superadministrador puede editar publicaciones generales." });
    }

    await prisma.publicacionArchivo.delete({ where: { id: archivoId } });
    fs.unlink(path.join(UPLOADS_DIR_PUBLICACIONES, archivo.ruta), () => {});

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PUBLICACION_ARCHIVO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el archivo "${archivo.nombreOriginal}" de la publicación "${archivo.publicacion.titulo}".`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar archivo de publicación:", error);
    return res.status(500).json({ message: "Error al eliminar el archivo." });
  }
};
