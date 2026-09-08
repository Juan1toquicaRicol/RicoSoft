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
 */
function leerUmbralStaleMinutos(): number {
  const raw = process.env.CROSSCHEX_SYNC_STALE_MINUTES;
  const valor = raw ? Number(raw) : UMBRAL_STALE_MINUTOS_DEFAULT;
  return Number.isFinite(valor) && valor > 0 ? valor : UMBRAL_STALE_MINUTOS_DEFAULT;
}

/**
 * Recupera SincronizacionBiometricoLog huérfanos: EN_CURSO desde hace más
 * del umbral configurado. Sin esto, una corrida que murió a mitad de camino
 * (proceso matado, servidor reiniciado) dejaría el índice único filtrado
 * `SincronizacionBiometricoLog_fuenteId_en_curso_uq` bloqueando para
 * siempre cualquier sincronización futura de esa misma fuente.
 *
 * Devuelve cuántas filas se recuperaron (para loguear desde el caller).
 */
export async function recuperarSincronizacionesBiometricoInterrumpidas(): Promise<number> {
  const umbralMinutos = leerUmbralStaleMinutos();
  const limite = new Date(Date.now() - umbralMinutos * 60_000);

  const { count } = await prisma.sincronizacionBiometricoLog.updateMany({
    where: { estado: "EN_CURSO", iniciadoEn: { lt: limite } },
    data: {
      estado: "FALLIDO",
      finalizadoEn: new Date(),
      mensajeError: `Interrumpido: la corrida seguía EN_CURSO después de más de ${umbralMinutos} minuto(s), se recuperó al arrancar el servidor.`,
    },
  });
  return count;
}
