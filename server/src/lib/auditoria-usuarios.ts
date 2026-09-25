import { prisma } from "../config/prisma";

export type ActorAuditoria = { nombre: string; email: string };

/**
 * Auditoria.usuarioId ya no tiene FK ni relación Prisma (inmutabilidad del
 * historial, ISO 27001 A.12.4): las filas nunca se modifican cuando se borra a
 * un usuario. El actor se resuelve aquí: primero el usuario vigente y, si fue
 * eliminado, el snapshot {nombre,email} que guardó su evento USUARIO_ELIMINADO
 * (datosAnteriores) dentro del mismo tenant.
 */
export async function adjuntarActores<T extends { usuarioId: string | null }>(
  tenantId: string,
  eventos: T[],
): Promise<Array<T & { usuario: ActorAuditoria | null }>> {
  const ids = [...new Set(eventos.map((e) => e.usuarioId).filter((x): x is string => !!x))];
  const actores = new Map<string, ActorAuditoria>();

  if (ids.length) {
    const vigentes = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, nombre: true, email: true },
    });
    for (const u of vigentes) actores.set(u.id, { nombre: u.nombre, email: u.email });

    const faltantes = ids.filter((id) => !actores.has(id));
    if (faltantes.length) {
      const eliminaciones = await prisma.auditoria.findMany({
        where: { tenantId, accion: "USUARIO_ELIMINADO", entidadId: { in: faltantes } },
        select: { entidadId: true, datosAnteriores: true },
      });
      for (const ev of eliminaciones) {
        if (!ev.entidadId || !ev.datosAnteriores) continue;
        try {
          const snap = JSON.parse(ev.datosAnteriores) as Partial<ActorAuditoria>;
          if (typeof snap.nombre === "string" && typeof snap.email === "string") {
            actores.set(ev.entidadId, { nombre: snap.nombre, email: snap.email });
          }
        } catch {
          // snapshot ilegible: el actor queda sin resolver
        }
      }
    }
  }

  return eventos.map((e) => ({
    ...e,
    usuario: e.usuarioId ? (actores.get(e.usuarioId) ?? null) : null,
  }));
}
