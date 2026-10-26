import { schedule, type ScheduledTask } from "node-cron";
import {
  ejecutarRegistrado,
  quitarScheduler,
  registrarScheduler,
  reportarFalloEnCorrida,
} from "../lib/job-registry";
import { prisma } from "../config/prisma";
import {
  sincronizarFuenteBiometrica,
  SincronizacionEnCursoError,
} from "../modules/gestion-humana/biometrico-import.service";

/**
 * Scheduler in-process con node-cron (Fase 5). Solo dispara el intento de
 * sincronización — toda la lógica real (lock, cursor, lotes, idempotencia)
 * vive en biometrico-import.service.ts y ya se prueba ahí de forma
 * independiente. Este archivo solo orquesta CUÁNDO se llama y QUÉ pasa si
 * una fuente falla o encuentra el lock ocupado.
 */

const CRON_DEFAULT = "* * * * *"; // cada minuto
const TAMANO_LOTE_DEFAULT = 1000;

export interface ConfigSchedulerCrossChex {
  habilitado: boolean;
  expresionCron: string;
  tamanoLote: number;
}

/** No hardcodea nada: intervalo, tamaño de lote y habilitación salen del
 * entorno, mismo patrón que crosschex.config.ts. Deshabilitado por defecto
 * — un entorno sin CrossChex real (como cualquier equipo de desarrollo) no
 * debe intentar sincronizar cada minuto contra un MDB que no existe. */
export function leerConfigSchedulerCrossChex(): ConfigSchedulerCrossChex {
  const habilitado = process.env.CROSSCHEX_SYNC_ENABLED === "true";
  const expresionCron = process.env.CROSSCHEX_SYNC_CRON || CRON_DEFAULT;

  const tamanoLoteEnv = process.env.CROSSCHEX_SYNC_BATCH_SIZE
    ? Number(process.env.CROSSCHEX_SYNC_BATCH_SIZE)
    : TAMANO_LOTE_DEFAULT;
  const tamanoLote =
    Number.isFinite(tamanoLoteEnv) && tamanoLoteEnv > 0 ? tamanoLoteEnv : TAMANO_LOTE_DEFAULT;

  return { habilitado, expresionCron, tamanoLote };
}

/**
 * Un ciclo completo: recorre todas las FuenteBiometrica activas y
 * sincroniza cada una por separado. Multi-tenant/multi-sede por diseño: cada
 * fuente tiene su propio lock (el índice único filtrado es por fuenteId), así
 * que una fuente ocupada u ocurrida en error NUNCA detiene a las demás.
 */
export async function ejecutarCicloSincronizacionCrossChex(
  tamanoLote = TAMANO_LOTE_DEFAULT,
): Promise<void> {
  const fuentes = await prisma.fuenteBiometrica.findMany({
    where: { activa: true },
    select: { nombre: true },
  });

  // Un solo CrossChex.mdb por instalación (CROSSCHEX_MDB_PATH global): con más de
  // una fuente activa se copiarían las mismas marcaciones a cada tenant. Se
  // falla cerrado: no se sincroniza nada y se deja constancia en el monitoreo.
  // El mensaje no incluye nombres ni tenants.
  if (fuentes.length > 1) {
    const mensaje = `Hay ${fuentes.length} fuentes biométricas activas y solo se admite una por instalación (un único CrossChex.mdb). No se sincronizó ninguna; desactiva las sobrantes.`;
    console.error(`[crosschex-sync] ${mensaje}`);
    reportarFalloEnCorrida("crosschex-sync", mensaje);
    return;
  }

  for (const fuente of fuentes) {
    try {
      const reporte = await sincronizarFuenteBiometrica(fuente.nombre, { tamanoLote });
      if (reporte.estado === "FALLIDO") {
        console.error(
          `[crosschex-sync] "${fuente.nombre}" terminó FALLIDA: ${reporte.mensajeError}`,
        );
        reportarFalloEnCorrida("crosschex-sync", `"${fuente.nombre}": ${reporte.mensajeError}`);
      } else if (reporte.leidos > 0) {
        console.log(
          `[crosschex-sync] "${fuente.nombre}": ${reporte.leidos} leídas, ${reporte.insertados} insertadas, ` +
            `${reporte.duplicados} duplicadas, ${reporte.sinEmpleado} sin empleado (Logid hasta ${reporte.logIdHasta}).`,
        );
      }
      // reporte.leidos === 0 y estado COMPLETADO: no hay nada nuevo, no se
      // loguea nada para no llenar la consola cada minuto sin novedad.
    } catch (error) {
      if (error instanceof SincronizacionEnCursoError) {
        // Esperado bajo concurrencia (rule 11: una corrida que tarda más de
        // un minuto hace que el siguiente tick encuentre el lock ocupado).
        // No es un error de la aplicación, solo se deja constancia en info.
        console.log(
          `[crosschex-sync] "${fuente.nombre}": omitida, ya hay una sincronización en curso.`,
        );
      } else {
        console.error(`[crosschex-sync] Error inesperado sincronizando "${fuente.nombre}":`, error);
        reportarFalloEnCorrida(
          "crosschex-sync",
          `"${fuente.nombre}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

let tareaProgramada: ScheduledTask | null = null;

/**
 * Registra el ciclo en node-cron. Deliberadamente NO ejecuta nada de
 * inmediato al llamar esta función — solo programa. La primera corrida real
 * ocurre en el próximo tick del cron; así se evita una sincronización
 * duplicada justo al arrancar el proceso (rule 12) además de la programada.
 * Llamar dos veces es un no-op (no se registran dos tareas).
 */
export function iniciarSchedulerCrossChex(): ScheduledTask | null {
  const config = leerConfigSchedulerCrossChex();
  if (!config.habilitado) {
    console.log(
      "[crosschex-sync] Scheduler deshabilitado (CROSSCHEX_SYNC_ENABLED distinto de 'true').",
    );
    return null;
  }
  if (tareaProgramada) return tareaProgramada;

  tareaProgramada = schedule(
    config.expresionCron,
    () => {
      ejecutarRegistrado("crosschex-sync", () =>
        ejecutarCicloSincronizacionCrossChex(config.tamanoLote),
      ).catch((error) => {
        console.error("[crosschex-sync] Error inesperado en el ciclo de sincronización:", error);
      });
    },
    // noOverlap: defensa adicional DENTRO del mismo proceso — si un ciclo
    // sigue corriendo cuando el cron dispara de nuevo, node-cron ni siquiera
    // invoca la función. El lock real (multi-proceso, vía el índice único
    // filtrado en SQL Server) sigue siendo la garantía definitiva; esto solo
    // evita trabajo redundante dentro de este mismo proceso.
    { noOverlap: true, name: "crosschex-sync" },
  );
  registrarScheduler("crosschex-sync", config.expresionCron, tareaProgramada);
  console.log(`[crosschex-sync] Scheduler iniciado (expresión cron: "${config.expresionCron}").`);
  return tareaProgramada;
}

/** Detiene el scheduler y limpia el estado — usado en shutdown ordenado y
 * en tests para no dejar tareas de node-cron corriendo entre casos. */
export function detenerSchedulerCrossChex(): void {
  tareaProgramada?.stop();
  tareaProgramada = null;
  quitarScheduler("crosschex-sync");
}
