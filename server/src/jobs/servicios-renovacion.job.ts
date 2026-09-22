import { schedule, type ScheduledTask } from "node-cron";
import { ejecutarRegistrado, quitarScheduler, registrarScheduler } from "../lib/job-registry";
import { ejecutarCicloRenovacionesServicios } from "../lib/servicios-renovacion.service";

/**
 * Scheduler in-process con node-cron (Fase 5.4), mismo patrón que
 * crosschex-sync.job.ts: este archivo solo orquesta CUÁNDO se llama al
 * ciclo — toda la lógica real (ventana de 7 días, resolución de
 * destinatarios, idempotencia) vive en servicios-renovacion.service.ts y se
 * prueba ahí de forma independiente.
 */

const CRON_DEFAULT = "0 6 * * *"; // una vez al día, 6:00 a.m.

export interface ConfigSchedulerServiciosRenovacion {
  habilitado: boolean;
  expresionCron: string;
}

/** Deshabilitado por defecto (decisión de Fase 5.4) — igual que CrossChex,
 * un entorno de desarrollo no debe empezar a notificar renovaciones sin que
 * alguien lo encienda explícitamente. */
export function leerConfigSchedulerServiciosRenovacion(): ConfigSchedulerServiciosRenovacion {
  const habilitado = process.env.SERVICIOS_RENOVACION_SYNC_ENABLED === "true";
  const expresionCron = process.env.SERVICIOS_RENOVACION_SYNC_CRON || CRON_DEFAULT;
  return { habilitado, expresionCron };
}

let tareaProgramada: ScheduledTask | null = null;

/**
 * Registra el ciclo en node-cron. No ejecuta nada de inmediato al llamar
 * esta función — solo programa; la primera corrida real ocurre en el
 * próximo tick. Llamar dos veces es un no-op.
 */
export function iniciarSchedulerServiciosRenovacion(): ScheduledTask | null {
  const config = leerConfigSchedulerServiciosRenovacion();
  if (!config.habilitado) {
    console.log(
      "[servicios-renovacion] Scheduler deshabilitado (SERVICIOS_RENOVACION_SYNC_ENABLED distinto de 'true').",
    );
    return null;
  }
  if (tareaProgramada) return tareaProgramada;

  tareaProgramada = schedule(
    config.expresionCron,
    () => {
      ejecutarRegistrado("servicios-renovacion", () => ejecutarCicloRenovacionesServicios()).catch(
        (error) => {
          console.error(
            "[servicios-renovacion] Error inesperado en el ciclo de renovaciones:",
            error,
          );
        },
      );
    },
    { noOverlap: true, name: "servicios-renovacion" },
  );
  registrarScheduler("servicios-renovacion", config.expresionCron, tareaProgramada);
  console.log(
    `[servicios-renovacion] Scheduler iniciado (expresión cron: "${config.expresionCron}").`,
  );
  return tareaProgramada;
}

/** Detiene el scheduler y limpia el estado — usado en shutdown ordenado y en
 * tests para no dejar tareas de node-cron corriendo entre casos. */
export function detenerSchedulerServiciosRenovacion(): void {
  tareaProgramada?.stop();
  tareaProgramada = null;
  quitarScheduler("servicios-renovacion");
}
