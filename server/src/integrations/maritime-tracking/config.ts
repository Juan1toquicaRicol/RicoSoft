/**
 * Configuración de Tracking Marítimo (V1) — todo por variables de entorno,
 * mismo patrón que integrations/email/config.ts.
 */
export interface ConfigTrackingMaritimo {
  habilitado: boolean;
  /** "mock" en V1 (único adapter implementado); cuando exista un adapter
   * real (VesselFinder/MarineTraffic), este valor decide cuál instanciar —
   * ver embarques-tracking.job.ts. */
  proveedor: string;
  cronSincronizacion: string;
  /** Lotes sin sincronización exitosa en más de este número de días generan
   * la excepción "ausencia de actualización" (§5 de la especificación). */
  diasSinActualizacionAlerta: number;
  /** Variación de ETA (en días, valor absoluto) a partir de la cual se
   * genera la notificación de retraso/adelanto — evita alertar por
   * fluctuaciones de horas sin relevancia operativa. */
  umbralVariacionEtaDias: number;
  /** El adapter "mock" fabrica posición, ETA y eventos a partir del
   * identificador: NUNCA debe persistirse sobre embarques reales. Solo se usa
   * si este flag es "true" (desarrollo/demos con datos de prueba). */
  permitirSimulado: boolean;
}

export function leerConfigTrackingMaritimo(): ConfigTrackingMaritimo {
  return {
    habilitado: process.env.TRACKING_MARITIMO_SYNC_ENABLED === "true",
    proveedor: process.env.TRACKING_MARITIMO_PROVIDER || "mock",
    cronSincronizacion: process.env.TRACKING_MARITIMO_SYNC_CRON || "*/30 * * * *",
    diasSinActualizacionAlerta: Number(process.env.TRACKING_MARITIMO_DIAS_SIN_ACTUALIZACION) || 3,
    umbralVariacionEtaDias: Number(process.env.TRACKING_MARITIMO_UMBRAL_VARIACION_ETA_DIAS) || 1,
    permitirSimulado: process.env.TRACKING_MARITIMO_PERMITIR_SIMULADO === "true",
  };
}
