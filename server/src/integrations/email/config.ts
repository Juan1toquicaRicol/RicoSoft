/** Programación general de Importaciones. Las direcciones y etiquetas se administran por buzón en RicoSoft. */
export interface AjustesBandeja {
  lectura: boolean;
  procesamiento: boolean;
  etiqueta: string;
  minutos: number;
  correos: number;
  adjuntos: number;
}
export const pilotoInicial: AjustesBandeja = {
  lectura: false,
  procesamiento: false,
  etiqueta: "",
  minutos: 5,
  correos: 25,
  adjuntos: 50,
};
let piloto: AjustesBandeja | null = null;
export function aplicarPiloto(valor: AjustesBandeja | null) {
  piloto = valor;
}
export interface ConfigEmailImportaciones {
  habilitado: boolean;
  /** JSON completo de la cuenta de servicio de Google (el mismo archivo que
   * se descarga del Admin Console), como string — NUNCA el archivo en el
   * repo. En producción, inyectado como secreto de la plataforma; en
   * desarrollo, vía server/.env (que ya está en .gitignore). */
  serviceAccountJson: string | null;
}

export function leerConfigEmailImportaciones(): ConfigEmailImportaciones {
  return {
    habilitado: piloto?.lectura ?? process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED === "true",
    serviceAccountJson: process.env.IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON || null,
  };
}

export interface ConfigProcesamientoImportaciones {
  habilitado: boolean;
  cronIngesta: string;
  cronProcesamiento: string;
}

export function leerConfigProcesamientoImportaciones(): ConfigProcesamientoImportaciones {
  return {
    habilitado: piloto?.procesamiento ?? process.env.IMPORTACIONES_PROCESSING_ENABLED === "true",
    cronIngesta: piloto
      ? "*/" + piloto.minutos + " * * * *"
      : process.env.IMPORTACIONES_EMAIL_SYNC_CRON || "*/5 * * * *",
    cronProcesamiento: piloto
      ? "*/" + piloto.minutos + " * * * *"
      : process.env.IMPORTACIONES_PROCESSING_CRON || "*/5 * * * *",
  };
}
