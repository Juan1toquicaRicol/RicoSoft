import { prisma } from "../config/prisma";
import { getTenantPrisma } from "./tenant-prisma";
import { resolverDestinatarios } from "./motor-destinatarios";
import { crearNotificacion } from "./notificaciones";
import { crearItemDeTrabajo } from "./inbox";

export const EVENTO_SERVICIO_RENOVACION_PROXIMA = "SERVICIO_RENOVACION_PROXIMA";
/** Ventana fija de 7 días — decisión de Fase 5.4, no configurable por tenant. */
export const VENTANA_DIAS_RENOVACION = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Un ciclo completo: recorre TODOS los ServicioSuscripcion activos (de
 * cualquier tenant) cuya fechaRenovacion caiga dentro de los próximos
 * VENTANA_DIAS_RENOVACION días, y distribuye un aviso vía el motor de
 * destinatarios (Fase 5.3) usando la ReglaDestinatarios del evento
 * SERVICIO_RENOVACION_PROXIMA de cada tenant (si no tiene una regel activa,
 * resolverDestinatarios devuelve un Set vacío y no se notifica a nadie — no
 * es un error).
 *
 * Idempotencia: crearItemDeTrabajo dedupe por
 * tenantId+sourceModule+sourceEntityId+tipo. sourceEntityId incluye la fecha
 * de renovación (`${servicioId}:${YYYY-MM-DD}`) a propósito: cuando alguien
 * actualiza fechaRenovacion tras renovar el servicio (decisión de Fase 5.4:
 * "reset automático por fecha", sin botón manual), la clave cambia sola y el
 * siguiente ciclo genera un aviso nuevo — nunca queda "pegado" al ciclo
 * anterior ya resuelto.
 */
export async function ejecutarCicloRenovacionesServicios(): Promise<void> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(hoy.getTime() + VENTANA_DIAS_RENOVACION * DIA_MS);

  const servicios = await prisma.servicioSuscripcion.findMany({
    where: {
      eliminado: false,
      estado: "Activo",
      fechaRenovacion: { gte: hoy, lte: limite },
    },
    select: {
      id: true,
      tenantId: true,
      nombreServicio: true,
      fechaRenovacion: true,
      responsableId: true,
      costo: true,
      moneda: true,
    },
  });

  for (const servicio of servicios) {
    try {
      const tenantPrisma = getTenantPrisma(servicio.tenantId);
      const destinatarios = await resolverDestinatarios(
        tenantPrisma,
        servicio.tenantId,
        EVENTO_SERVICIO_RENOVACION_PROXIMA,
        { responsableId: servicio.responsableId },
      );

      if (destinatarios.size === 0) continue;

      const fechaClave = servicio.fechaRenovacion.toISOString().slice(0, 10);
      const sourceEntityId = `${servicio.id}:${fechaClave}`;
      const titulo = `Renovación próxima: "${servicio.nombreServicio}"`;
      const mensaje = `El servicio "${servicio.nombreServicio}" se renueva el ${fechaClave} (${servicio.moneda} ${servicio.costo.toString()}).`;
      const enlace = `/servicios/${servicio.id}`;

      for (const usuarioId of destinatarios) {
        await crearNotificacion({
          tenantId: servicio.tenantId,
          usuarioId,
          tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA,
          titulo,
          mensaje,
          enlace,
          // Deduplicación genérica (Fase 5.4.1): misma entidad+ciclo nunca
          // duplica, pero un cambio de fechaRenovacion (reset del ciclo)
          // cambia sourceEntityId y sí permite una notificación nueva.
          entidadTipo: "ServicioSuscripcion",
          entidadId: sourceEntityId,
        });
      }

      // Un solo ítem de trabajo por servicio/ciclo (no uno por destinatario):
      // es una cola de seguimiento del renovación, no una bandeja personal —
      // mismo criterio que asignadoPermiso en Solicitudes de Compra.
      await crearItemDeTrabajo(tenantPrisma, {
        tenantId: servicio.tenantId,
        tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA,
        categoria: "ALERTA",
        sourceModule: "servicios",
        sourceEntityTipo: "ServicioSuscripcion",
        sourceEntityId,
        titulo,
        descripcion: mensaje,
        prioridad: "MEDIA",
        enlace,
        dueAt: servicio.fechaRenovacion,
      });
    } catch (error) {
      // Un servicio con error nunca detiene el ciclo de los demás — mismo
      // principio que ejecutarCicloSincronizacionCrossChex.
      console.error(
        `[servicios-renovacion] Error procesando servicio ${servicio.id} (tenant ${servicio.tenantId}):`,
        error,
      );
    }
  }
}
