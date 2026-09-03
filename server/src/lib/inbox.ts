import type { TenantPrisma } from "./tenant-prisma";

/**
 * Bandeja de Entrada Global — capa de DESCUBRIMIENTO sobre eventos que ya
 * ocurren en otros módulos, nunca un proceso paralelo. Un InboxItem:
 *  - se genera automáticamente desde el mismo punto de código donde hoy se
 *    llama a crearNotificacion/notificarPorPermiso (nunca lo crea un
 *    usuario a mano);
 *  - se resuelve automáticamente desde el mismo bloque donde la entidad
 *    origen cambia su estado real (nunca queda un "estado de Inbox"
 *    desincronizado del proceso de negocio real);
 *  - no tiene una acción de "descartar" en esta fase: si algo no le
 *    corresponde a un usuario, el filtro de asignación/permiso ya lo
 *    excluye del listado — no se inventa un estado adicional.
 * Ver auditoría "Bandeja de Entrada Global" (2026-09-03) para el diseño
 * completo. Fase 9.1-9.2: solo Solicitudes de Compra está conectado.
 */

interface DatosItemDeTrabajo {
  tenantId: string;
  tipo: string;
  categoria: "ACCION" | "APROBACION" | "REVISION" | "INCIDENCIA" | "ALERTA" | "SEGUIMIENTO";
  sourceModule: string;
  sourceEntityTipo: string;
  sourceEntityId: string;
  titulo: string;
  descripcion?: string;
  prioridad?: "CRITICA" | "ALTA" | "MEDIA" | "BAJA";
  /** Trabajo personal (ej. el solicitante que debe recibir el resultado). */
  asignadoUsuarioId?: string;
  /** Trabajo de cola/área: cualquier usuario con este permiso lo ve — misma
   * semántica que notificarPorPermiso. */
  asignadoPermiso?: string;
  enlace?: string;
  dueAt?: Date;
}

/**
 * Crea (o reabre, si el mismo evento vuelve a dispararse tras haberse
 * resuelto) un ítem de trabajo. Idempotente: la clave real es
 * tenantId+sourceModule+sourceEntityId+tipo — llamar esto varias veces para
 * el mismo evento nunca duplica filas. No lanza si falla: un ítem de Inbox
 * es una proyección de conveniencia, nunca debe tumbar la operación de
 * negocio que lo origina (mismo principio que crearNotificacion).
 */
export async function crearItemDeTrabajo(
  tenantPrisma: TenantPrisma,
  datos: DatosItemDeTrabajo,
): Promise<void> {
  try {
    const existente = await tenantPrisma.inboxItem.findFirst({
      where: {
        tenantId: datos.tenantId,
        sourceModule: datos.sourceModule,
        sourceEntityId: datos.sourceEntityId,
        tipo: datos.tipo,
      },
      select: { id: true, status: true },
    });

    if (existente) {
      // Ya existe: si estaba resuelto y el mismo tipo de evento se repite
      // (caso raro pero posible), lo reabre con los datos frescos. Si sigue
      // pendiente, no hace nada — evita duplicar o pisar el estado actual.
      if (existente.status === "RESUELTO") {
        await tenantPrisma.inboxItem.update({
          where: { id: existente.id },
          data: {
            status: "PENDIENTE",
            titulo: datos.titulo,
            descripcion: datos.descripcion,
            prioridad: datos.prioridad || "MEDIA",
            asignadoUsuarioId: datos.asignadoUsuarioId,
            asignadoPermiso: datos.asignadoPermiso,
            enlace: datos.enlace,
            dueAt: datos.dueAt,
            resolvedAt: null,
            resolvedByUsuarioId: null,
          },
        });
      }
      return;
    }

    await tenantPrisma.inboxItem.create({
      data: {
        tenantId: datos.tenantId,
        tipo: datos.tipo,
        categoria: datos.categoria,
        sourceModule: datos.sourceModule,
        sourceEntityTipo: datos.sourceEntityTipo,
        sourceEntityId: datos.sourceEntityId,
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        prioridad: datos.prioridad || "MEDIA",
        asignadoUsuarioId: datos.asignadoUsuarioId,
        asignadoPermiso: datos.asignadoPermiso,
        enlace: datos.enlace,
        dueAt: datos.dueAt,
      },
    });
  } catch (error) {
    console.error("Error al crear ítem de trabajo en el Inbox:", error);
  }
}

/**
 * Marca como RESUELTO todos los InboxItem abiertos de una entidad origen
 * (opcionalmente solo los de un `tipo` concreto) — se llama desde el mismo
 * bloque de código donde la entidad real cambia de estado, nunca desde una
 * acción propia del Inbox.
 */
export async function resolverItemDeTrabajo(
  tenantPrisma: TenantPrisma,
  datos: {
    tenantId: string;
    sourceModule: string;
    sourceEntityId: string;
    tipo?: string;
    resolvedByUsuarioId?: string;
  },
): Promise<void> {
  try {
    await tenantPrisma.inboxItem.updateMany({
      where: {
        tenantId: datos.tenantId,
        sourceModule: datos.sourceModule,
        sourceEntityId: datos.sourceEntityId,
        ...(datos.tipo ? { tipo: datos.tipo } : {}),
        status: { not: "RESUELTO" },
      },
      data: {
        status: "RESUELTO",
        resolvedAt: new Date(),
        resolvedByUsuarioId: datos.resolvedByUsuarioId,
      },
    });
  } catch (error) {
    console.error("Error al resolver ítem de trabajo del Inbox:", error);
  }
}
