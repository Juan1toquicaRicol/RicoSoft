/**
 * Configuración del buzón central de Importaciones (V1: un solo buzón para
 * todo el despliegue, no por tenant — ver auditoría, decisión de alcance).
 * Todo por variables de entorno, mismo patrón que config/siesa.ts: nunca se
 * hardcodea la dirección de correo ni ninguna credencial en el código de
 * negocio.
 */

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
export function etiquetaPiloto() {
  return piloto?.etiqueta || undefined;
}

export interface ConfigEmailImportaciones {
  habilitado: boolean;
  /** Dirección del buzón a impersonar (ej. "importaciones@ricol.com.co") —
   * requiere Domain-Wide Delegation configurada en el Admin Console de
   * Google Workspace para el client_id de la cuenta de servicio, con el
   * scope https://www.googleapis.com/auth/gmail.readonly (o modify si en el
   * futuro se necesita marcar como leído). Ver docs/bandeja-importaciones.md. */
  mailboxEmail: string;
  /** JSON completo de la cuenta de servicio de Google (el mismo archivo que
   * se descarga del Admin Console), como string — NUNCA el archivo en el
   * repo. En producción, inyectado como secreto de la plataforma; en
   * desarrollo, vía server/.env (que ya está en .gitignore). */
  serviceAccountJson: string | null;
  maxEmailsPerRun: number;
  maxAttachmentsPerRun: number;
}

export function leerConfigEmailImportaciones(): ConfigEmailImportaciones {
  return {
    habilitado: piloto?.lectura ?? process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED === "true",
    mailboxEmail: process.env.IMPORTACIONES_EMAIL_MAILBOX || "",
    serviceAccountJson: process.env.IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON || null,
    maxEmailsPerRun:
      piloto?.correos ?? (Number(process.env.IMPORTACIONES_MAX_EMAILS_PER_RUN) || 25),
    maxAttachmentsPerRun:
      piloto?.adjuntos ?? (Number(process.env.IMPORTACIONES_MAX_ATTACHMENTS_PER_RUN) || 50),
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
