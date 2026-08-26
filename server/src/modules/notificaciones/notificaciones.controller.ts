import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

/**
 * Notificaciones del usuario autenticado (nunca de otro: el id sale del JWT,
 * no del body ni de la URL). Devuelve las más recientes primero junto con el
 * conteo de no leídas, para pintar la campana sin una segunda petición.
 */
export const listarNotificaciones = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const limite = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limite ?? "20"), 10) || 20));

    const [data, noLeidas] = await Promise.all([
      prisma.notificacion.findMany({
        where: { usuarioId },
        orderBy: { createdAt: "desc" },
        take: limite,
      }),
      prisma.notificacion.count({ where: { usuarioId, leida: false } }),
    ]);

    return res.json({ data, noLeidas });
  } catch (error) {
    console.error("Error al listar notificaciones:", error);
    return res.status(500).json({ message: "Error al obtener las notificaciones." });
  }
};

/** Solo el conteo de no leídas, para refrescar el badge de la campana con
 * una petición liviana (sin traer las 20 notificaciones completas). */
export const contarNoLeidas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const noLeidas = await prisma.notificacion.count({
      where: { usuarioId: req.user!.id, leida: false },
    });
    return res.json({ noLeidas });
  } catch (error) {
    console.error("Error al contar notificaciones no leídas:", error);
    return res.status(500).json({ message: "Error al obtener el contador de notificaciones." });
  }
};

export const marcarLeida = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const usuarioId = req.user!.id;

    // El id sale del JWT, no confía en el tenant/usuario del body: no es
    // posible marcar como leída una notificación de otra persona (IDOR).
    const notificacion = await prisma.notificacion.findFirst({ where: { id, usuarioId } });
    if (!notificacion) {
      return res.status(404).json({ message: "Notificación no encontrada." });
    }

    await prisma.notificacion.update({ where: { id }, data: { leida: true } });
    return res.status(204).send();
  } catch (error) {
    console.error("Error al marcar notificación como leída:", error);
    return res.status(500).json({ message: "Error al actualizar la notificación." });
  }
};

export const marcarTodasLeidas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.notificacion.updateMany({
      where: { usuarioId: req.user!.id, leida: false },
      data: { leida: true },
    });
    return res.status(204).send();
  } catch (error) {
    console.error("Error al marcar notificaciones como leídas:", error);
    return res.status(500).json({ message: "Error al actualizar las notificaciones." });
  }
};
