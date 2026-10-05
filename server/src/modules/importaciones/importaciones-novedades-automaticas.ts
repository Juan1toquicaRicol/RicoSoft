import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

/**
 * Ciclo de vida de una novedad AUTOMÁTICA (motor de seguimiento y tracking
 * marítimo). Única implementación compartida por ambos: antes cada uno tenía
 * su propia versión y la del controller fallaba (P2002 → 500 en el detalle)
 * cuando una novedad ya Resuelta volvía a ser sugerida, porque el índice
 * único (ordenCompraId, reglaOrigen) cubre TODAS las filas, resueltas o no.
 *
 * Reglas:
 *  - Una sola fila por (orden, regla): nunca se crea una segunda.
 *  - Condición vigente y fila inexistente → se crea (origen PorDeterminar:
 *    una alerta no atribuye causa). P2002 por carrera → otra consulta la
 *    creó; no es un error.
 *  - Condición vigente y fila Resuelta → se REABRE, sin importar quién la
 *    resolvió: una novedad automática representa la condición observada y
 *    solo el sistema la resuelve (la API rechaza resolverlas a mano). Si una
 *    fila heredada fue resuelta por una persona mientras la condición seguía
 *    vigente, no se suprime en silencio: se vuelve a mostrar y el historial
 *    conserva quién la resolvió, cuándo y por qué (comentario original).
 *  - Condición superada y fila abierta → la resuelve el sistema.
 *  - Cada resolución y reapertura automática queda en ImportacionHistorial
 *    (en la misma transacción que el cambio), de modo que reabrir no borra
 *    la cronología anterior aunque la fila vuelva a quedar sin resolución.
 *  - Los cambios son condicionales (updateMany por estado): dos corridas
 *    simultáneas no duplican ni reabren/resuelven dos veces.
 */

export const RESOLUCION_SISTEMA = "Sistema (condición resuelta)";

export interface DatosNovedadAutomatica {
  tipo: string;
  descripcion: string;
  prioridad: string;
  /** Contexto operativo (p. ej. responsable de la actividad): NO es causa. */
  responsable?: string | null;
  fechaLimite?: Date | null;
  accionRequerida?: string | null;
}

export type ResultadoNovedadAutomatica = "creada" | "reabierta" | "resuelta" | "sin_cambio";

function esViolacionUnica(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function aplicarNovedadAutomatica(params: {
  tenantId: string;
  ordenCompraId: string;
  reglaOrigen: string;
  condicionVigente: boolean;
  datos: DatosNovedadAutomatica;
}): Promise<ResultadoNovedadAutomatica> {
  const { tenantId, ordenCompraId, reglaOrigen, condicionVigente, datos } = params;

  const existente = await prisma.importacionNovedad.findUnique({
    where: { ordenCompraId_reglaOrigen: { ordenCompraId, reglaOrigen } },
  });
  if (existente && existente.tenantId !== tenantId) return "sin_cambio";

  if (condicionVigente) {
    if (!existente) {
      try {
        await prisma.importacionNovedad.create({
          data: {
            tenantId,
            ordenCompraId,
            tipo: datos.tipo,
            descripcion: datos.descripcion,
            origen: "PorDeterminar",
            responsable: datos.responsable ?? null,
            prioridad: datos.prioridad,
            fechaLimite: datos.fechaLimite ?? null,
            accionRequerida: datos.accionRequerida ?? null,
            automatica: true,
            reglaOrigen,
            creadoPorNombre: "Sistema",
          },
        });
        return "creada";
      } catch (error) {
        if (esViolacionUnica(error)) return "sin_cambio";
        throw error;
      }
    }

    if (existente.estado !== "Resuelta") return "sin_cambio"; // ya abierta

    // Solo se registran datos CIERTOS de la fila anterior. El comentario de una
    // resolución manual vive en el evento "Novedad resuelta" del historial de
    // la orden (nunca se borra), pero ese evento no guarda el id de la novedad:
    // no se busca ni se copia por proximidad temporal, porque dos novedades del
    // mismo tipo resueltas por la misma persona en el mismo minuto no son
    // distinguibles.
    const resolvioUnaPersona = !!existente.responsableResolucionId;

    return prisma.$transaction(async (tx) => {
      const cambiadas = await tx.importacionNovedad.updateMany({
        where: { id: existente.id, tenantId, estado: "Resuelta" },
        data: {
          estado: "Abierta",
          descripcion: datos.descripcion,
          fechaResolucion: null,
          responsableResolucionId: null,
          responsableResolucionNombre: null,
        },
      });
      if (cambiadas.count === 0) return "sin_cambio" as const;
      await tx.importacionHistorial.create({
        data: {
          ordenCompraId,
          actor: "Sistema",
          accion: `Novedad automática reabierta: ${existente.tipo}`,
          detalle: [
            `La condición sigue vigente (${reglaOrigen}).`,
            `Novedad ${existente.id}. Resolución anterior: ${
              existente.fechaResolucion ? existente.fechaResolucion.toISOString() : "sin fecha"
            }, por ${existente.responsableResolucionNombre ?? "sin responsable"} (id ${
              existente.responsableResolucionId ?? "sistema"
            })${resolvioUnaPersona ? ", resolución manual" : ""}.`,
            resolvioUnaPersona
              ? "El comentario original, si lo hubo, permanece en el historial de la orden (evento «Novedad resuelta»)."
              : null,
          ]
            .filter(Boolean)
            .join(" "),
          origen: "Sistema",
        },
      });
      return "reabierta" as const;
    });
  }

  if (!existente || existente.estado === "Resuelta") return "sin_cambio";

  return prisma.$transaction(async (tx) => {
    const cambiadas = await tx.importacionNovedad.updateMany({
      where: { id: existente.id, tenantId, estado: { not: "Resuelta" } },
      data: {
        estado: "Resuelta",
        fechaResolucion: new Date(),
        responsableResolucionNombre: RESOLUCION_SISTEMA,
      },
    });
    if (cambiadas.count === 0) return "sin_cambio" as const;
    await tx.importacionHistorial.create({
      data: {
        ordenCompraId,
        actor: "Sistema",
        accion: `Novedad automática resuelta: ${existente.tipo}`,
        detalle: `La condición dejó de cumplirse (${reglaOrigen}).`,
        origen: "Sistema",
      },
    });
    return "resuelta" as const;
  });
}
