import { listarEstadoJobs, resumirError, type JobEstado } from "../../lib/job-registry";

/**
 * Vista unificada de los procesos en background para la pantalla de
 * monitoreo. Tres orígenes, todos reales:
 *  - SCHEDULER: crons in-process (registro en memoria, lib/job-registry.ts);
 *  - BAJO_DEMANDA: procesos que dispara un usuario y dejan su propio log en BD
 *    (sincronización de proveedores desde Siesa: SincronizacionSiesaLog);
 *  - NO_EXISTE: funciones que se esperaría ver como job pero que hoy NO tienen
 *    ningún proceso en background. Se muestran como "No configurado" en vez de
 *    inventar una ejecución.
 */

export type OrigenJob = "SCHEDULER" | "BAJO_DEMANDA" | "NO_EXISTE";

export type JobMonitoreado = JobEstado & { origen: OrigenJob };

export interface LogSincronizacionResumen {
  estado: string;
  iniciadoEn: Date;
  finalizadoEn: Date | null;
  mensajeError: string | null;
}

const iso = (f: Date | null | undefined) => (f ? f.toISOString() : null);

const duracion = (log: LogSincronizacionResumen | null) =>
  log?.finalizadoEn ? log.finalizadoEn.getTime() - log.iniciadoEn.getTime() : null;

/**
 * Estado de la sincronización de proveedores a partir de los logs DEL TENANT:
 * el último de cualquier estado, el último COMPLETADO y el último FALLIDO.
 */
export function estadoSincronizacionProveedores(logs: {
  ultimo: LogSincronizacionResumen | null;
  ultimoCompletado: LogSincronizacionResumen | null;
  ultimoFallido: LogSincronizacionResumen | null;
}): JobMonitoreado {
  const { ultimo, ultimoCompletado, ultimoFallido } = logs;

  let estado: JobEstado["estado"] = "PROGRAMADO";
  if (ultimo) {
    if (["EN_COLA", "EN_CURSO"].includes(ultimo.estado)) estado = "EN_EJECUCION";
    else if (ultimo.estado === "COMPLETADO") estado = "OK";
    else if (ultimo.estado === "FALLIDO") estado = "FALLIDO";
    else estado = "OK"; // CANCELADO: la detuvo una persona, no es un fallo del proceso.
  }

  return {
    id: "siesa-sync-proveedores",
    nombre: "Sincronización de proveedores desde Siesa",
    descripcion:
      "Se inicia a demanda desde Integración Siesa; el historial es de esta empresa y persiste entre reinicios.",
    origen: "BAJO_DEMANDA",
    estado,
    motivo: ultimo ? null : "Aún no se ha ejecutado para esta empresa.",
    cron: null,
    ultimaEjecucion: iso(ultimo?.iniciadoEn),
    ultimaEjecucionExitosa: iso(ultimoCompletado?.iniciadoEn),
    ultimaEjecucionFallida: iso(ultimoFallido?.iniciadoEn),
    duracionUltimaMs: duracion(ultimo),
    mensajeUltimoError:
      ultimo?.estado === "FALLIDO" && ultimo.mensajeError
        ? resumirError(ultimo.mensajeError)
        : null,
    proximaEjecucion: null,
  };
}

const noExiste = (
  id: string,
  nombre: string,
  descripcion: string,
  motivo: string,
): JobMonitoreado => ({
  id,
  nombre,
  descripcion,
  origen: "NO_EXISTE",
  estado: "NO_CONFIGURADO",
  motivo,
  cron: null,
  ultimaEjecucion: null,
  ultimaEjecucionExitosa: null,
  ultimaEjecucionFallida: null,
  duracionUltimaMs: null,
  mensajeUltimoError: null,
  proximaEjecucion: null,
});

export function funcionesSinProceso(): JobMonitoreado[] {
  return [
    noExiste(
      "sincronizacion-catalogos",
      "Sincronización automática de catálogos",
      "Los catálogos son datos propios de RicoSoft (CatalogoValor): no se sincronizan desde ningún sistema externo.",
      "No existe un proceso en background para esta función.",
    ),
    noExiste(
      "cola-notificaciones",
      "Cola de notificaciones",
      "Las notificaciones se crean y guardan en línea cuando ocurre el evento; no hay una cola ni un worker.",
      "No existe una cola en background: las notificaciones no se procesan de forma diferida.",
    ),
  ];
}

export function componerJobsMonitoreados(
  sincronizacionProveedores: JobMonitoreado,
): JobMonitoreado[] {
  return [
    ...listarEstadoJobs().map((j): JobMonitoreado => ({ ...j, origen: "SCHEDULER" })),
    sincronizacionProveedores,
    ...funcionesSinProceso(),
  ];
}
