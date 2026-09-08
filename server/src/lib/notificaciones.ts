import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { listarUsuariosConPermiso } from "./permissions";

interface DatosNotificacion {
  tenantId: string;
  usuarioId: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  enlace?: string;
  /** Deduplicación por entidad/ciclo (Fase 5.4.1, opcional y genérico para
   * cualquier evento futuro). Cuando ambos vienen informados, la combinación
   * tenantId+usuarioId+tipo+entidadTipo+entidadId queda protegida por el
   * índice único filtrado [Notificacion_dedupe_entidad_uq] — una segunda
   * llamada idéntica es un no-op silencioso, no un error. `entidadId` debe
   * incluir el "ciclo" cuando el evento se repite con datos distintos (ej.
   * `${servicioId}:${fechaRenovacion}` en renovaciones de servicios), para
   * que un ciclo nuevo sí genere una notificación nueva. Si se omiten (caso
   * de todos los emisores anteriores a esta fase), no se aplica ninguna
   * deduplicación — comportamiento idéntico al de siempre. */
  entidadTipo?: string;
  entidadId?: string;
}

function esViolacionDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Crea una notificación para un usuario concreto. No lanza si falla: una
 * notificación es una conveniencia, nunca debe tumbar la operación de
 * negocio que la origina (crear una factura, aprobar una solicitud, etc.).
 *
 * Cuando `datos` incluye entidadTipo+entidadId, es idempotente: el índice
 * único filtrado de la base de datos (no una consulta previa) es el árbitro
 * final de "ya existe", así que es seguro incluso si dos corridas del mismo
 * job chocan al mismo tiempo — la que pierde la carrera recibe P2002 y se
 * trata como éxito silencioso, no como error. */
export async function crearNotificacion(datos: DatosNotificacion): Promise<void> {
  try {
    await prisma.notificacion.create({ data: datos });
  } catch (error) {
    if (datos.entidadTipo && datos.entidadId && esViolacionDeUnicidad(error)) {
      return;
    }
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
