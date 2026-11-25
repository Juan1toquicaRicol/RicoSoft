import { prisma } from "../config/prisma";

const UMBRAL_STALE_MINUTOS_DEFAULT = 15;

/**
 * A diferencia de recuperarSincronizacionesInterrumpidas (Siesa), que marca
 * TODO EN_CURSO como FALLIDO al arrancar, aquí solo se recuperan corridas
 * EN_CURSO más viejas que un umbral (15 min por defecto). Motivo: si algún
 * día RicoSoft corre en más de una instancia/proceso compartiendo la misma
 * base de datos, el arranque de la instancia B no debe poder pisotear una
 * corrida legítimamente activa de la instancia A — un umbral de "esto ya
 * lleva demasiado tiempo EN_CURSO" es una señal mucho más confiable de
 * "proceso caído" que "está EN_CURSO en este instante".
 *
 * Se ejecuta al arrancar el servidor Y al inicio de cada ciclo del job: si solo
 * corriera al arrancar, una corrida EN_CURSO más joven que el umbral en ese
 * momento (o una cuyo cierre falló) bloquearía la fuente para siempre.
 */
export function leerUmbralStaleMinutos(): number {
  const raw = process.env.CROSSCHEX_SYNC_STALE_MINUTES;
  const valor = raw ? Number(raw) : UMBRAL_STALE_MINUTOS_DEFAULT;
  return Number.isFinite(valor) && valor > 0 ? valor : UMBRAL_STALE_MINUTOS_DEFAULT;
}

export interface OpcionesRecuperacionBiometrico {
  /** Corridas que este mismo proceso sigue ejecutando: no son huérfanas. */
  excluirIds?: string[];
  /** Solo cambia el texto que queda en el log. */
  momento?: "arranque" | "ciclo";
}

/**
 * Recupera SincronizacionBiometricoLog huérfanos: EN_CURSO desde hace más
 * del umbral configurado. Sin esto, una corrida que murió a mitad de camino
 * (proceso matado, servidor reiniciado) dejaría el índice único filtrado
 * `SincronizacionBiometricoLog_fuenteId_en_curso_uq` bloqueando para
 * siempre cualquier sincronización futura de esa misma fuente.
 *
 * Si la corrida liberada seguía viva en otro proceso, se detiene sola antes de
 * su siguiente lote (biometrico-import.service.ts revisa su estado en cada lote).
 *
 * Devuelve cuántas filas se recuperaron (para loguear desde el caller).
 */
export async function recuperarSincronizacionesBiometricoInterrumpidas(
  opciones: OpcionesRecuperacionBiometrico = {},
): Promise<number> {
  const umbralMinutos = leerUmbralStaleMinutos();
  const limite = new Date(Date.now() - umbralMinutos * 60_000);
  const excluirIds = opciones.excluirIds ?? [];
  const cuando =
    opciones.momento === "ciclo"
      ? "se recuperó en un ciclo posterior del proceso automático"
      : "se recuperó al arrancar el servidor";

  const { count } = await prisma.sincronizacionBiometricoLog.updateMany({
    where: {
      estado: "EN_CURSO",
      iniciadoEn: { lt: limite },
      ...(excluirIds.length > 0 ? { id: { notIn: excluirIds } } : {}),
    },
    data: {
      estado: "FALLIDO",
      finalizadoEn: new Date(),
      mensajeError: `Interrumpido: la corrida seguía EN_CURSO después de más de ${umbralMinutos} minuto(s), ${cuando}.`,
    },
  });
  return count;
}
