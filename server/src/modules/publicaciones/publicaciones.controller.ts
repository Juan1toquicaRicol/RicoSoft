import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { whereAlcance } from "../../lib/alcance";

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
        ...(categoria === "EVENTO" ? { fechaEvento: { gte: ahora } } : {}),
      },
      include: { autor: { select: { nombre: true } } },
      orderBy: categoria === "EVENTO" ? { fechaEvento: "asc" } : { fechaPublicacion: "desc" },
      take: 20,
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
      include: { autor: { select: { nombre: true } } },
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
      include: { autor: { select: { nombre: true } } },
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
      include: { autor: { select: { nombre: true } } },
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

    await prisma.publicacion.delete({ where: { id } });

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
