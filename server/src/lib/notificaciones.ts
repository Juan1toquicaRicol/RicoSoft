import { prisma } from "../config/prisma";
import { listarUsuariosConPermiso } from "./permissions";

interface DatosNotificacion {
  tenantId: string;
  usuarioId: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  enlace?: string;
}

/** Crea una notificación para un usuario concreto. No lanza si falla: una
 * notificación es una conveniencia, nunca debe tumbar la operación de
 * negocio que la origina (crear una factura, aprobar una solicitud, etc.). */
export async function crearNotificacion(datos: DatosNotificacion): Promise<void> {
  try {
    await prisma.notificacion.create({ data: datos });
  } catch (error) {
    console.error("Error al crear notificación:", error);
  }
}

/**
 * Notifica a todos los usuarios activos del tenant que tengan el permiso
 * indicado (p. ej. avisar a quienes pueden aprobar solicitudes de compra que
 * hay una nueva pendiente). Excluye opcionalmente a quien disparó el evento,
 * para no auto-notificarse por su propia acción.
 */
export async function notificarPorPermiso(
  tenantId: string,
  permiso: string,
  datos: Omit<DatosNotificacion, "tenantId" | "usuarioId">,
  opciones: { excluirUsuarioId?: string } = {},
): Promise<void> {
  try {
    const usuarioIds = await listarUsuariosConPermiso(tenantId, permiso);
    const destinatarios = usuarioIds.filter((id) => id !== opciones.excluirUsuarioId);
    if (destinatarios.length === 0) return;

    await prisma.notificacion.createMany({
      data: destinatarios.map((usuarioId) => ({ tenantId, usuarioId, ...datos })),
    });
  } catch (error) {
    console.error("Error al notificar por permiso:", error);
  }
}
