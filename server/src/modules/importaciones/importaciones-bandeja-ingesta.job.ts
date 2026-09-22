import crypto from "crypto";
import fs from "fs";
import path from "path";
import { schedule, type ScheduledTask } from "node-cron";
import { ejecutarRegistrado, quitarScheduler, registrarScheduler } from "../../lib/job-registry";
import { prisma } from "../../config/prisma";
import { GoogleWorkspaceEmailProvider } from "../../integrations/email/google-workspace-email-provider";
import { EmailProviderError, type EmailProvider } from "../../integrations/email/email-provider";
import {
  leerConfigEmailImportaciones,
  leerConfigProcesamientoImportaciones,
} from "../../integrations/email/config";

/**
 * Job de INGESTA (§3 de la especificación) — SOLO trae correos+adjuntos del
 * buzón y los persiste. Deliberadamente separado del job de PROCESAMIENTO
 * (clasificar/extraer/matchear, ver .procesamiento.job.ts): un correo con
 * cientos de adjuntos nunca debe bloquear la ingesta de los demás correos
 * nuevos, y viceversa. tenantId queda NULL aquí a propósito — se resuelve
 * en el job de procesamiento (ver comentario en schema.prisma).
 *
 * Usa `prisma` global, NUNCA tenantPrisma: en este punto no hay ningún
 * tenant conocido todavía.
 */

let provider: EmailProvider = new GoogleWorkspaceEmailProvider();

/** Solo para tests: inyecta un EmailProvider falso en vez de Gmail real —
 * "usar mocks, NUNCA depender del Gmail real en tests" (spec §24). */
export function _establecerProviderParaTests(p: EmailProvider): void {
  provider = p;
}

const UPLOADS_DIR_CORREOS = "importaciones-correos";

/**
 * Un ciclo completo de ingesta: pide mensajes nuevos desde el último
 * cursor conocido, los persiste con sus adjuntos, y avanza el cursor.
 * Nunca lanza — un fallo de Gmail (rate limit, token expirado, etc.) se
 * loguea y el próximo tick lo reintenta, mismo principio que
 * crosschex-sync.job.ts.
 */
export async function ejecutarCicloIngestaCorreos(): Promise<void> {
  const config = leerConfigEmailImportaciones();
  if (!config.habilitado) return;

  const cursorActual = await obtenerCursorActual();

  let resultado;
  try {
    resultado = await provider.listNewMessages(cursorActual, config.maxEmailsPerRun);
  } catch (error) {
    console.error("[bandeja-ingesta] Error al listar mensajes nuevos:", error);
    return;
  }

  for (const mensaje of resultado.messages) {
    try {
      const yaExiste = await prisma.importacionCorreo.findUnique({
        where: { messageId: mensaje.messageId },
        select: { id: true },
      });
      if (yaExiste) continue; // idempotencia real — nunca duplica

      const correo = await prisma.importacionCorreo.create({
        data: {
          messageId: mensaje.messageId,
          remitente: mensaje.from,
          destinatarios: mensaje.to.join(", "),
          asunto: mensaje.subject,
          fechaRecibido: mensaje.date,
          cuerpoTexto: mensaje.bodyText,
          estadoProcesamiento: "PENDIENTE",
        },
      });

      const adjuntosAProcesar = mensaje.attachments.slice(0, config.maxAttachmentsPerRun);
      for (const adjunto of adjuntosAProcesar) {
        try {
          const contenido = await provider.getAttachmentContent(
            mensaje.providerMessageId,
            adjunto.providerAttachmentId,
          );
          const hash = crypto.createHash("sha256").update(contenido).digest("hex");

          const yaExisteAdjunto = await prisma.importacionCorreoAdjunto.findUnique({
            where: { correoId_hashSha256: { correoId: correo.id, hashSha256: hash } },
          });
          if (yaExisteAdjunto) continue;

          const ruta = guardarAdjuntoEnDisco(correo.id, adjunto.filename, contenido);
          await prisma.importacionCorreoAdjunto.create({
            data: {
              correoId: correo.id,
              nombreOriginal: adjunto.filename,
              mimeType: adjunto.mimeType,
              tamano: adjunto.size,
              ruta,
              hashSha256: hash,
              estadoExtraccion: "PENDIENTE",
            },
          });
        } catch (error) {
          // Un adjunto que falla no debe perder el correo entero — el
          // correo queda con los adjuntos que sí se pudieron traer, y el
          // job de procesamiento sigue con lo que hay.
          console.error(
            `[bandeja-ingesta] Error al descargar adjunto "${adjunto.filename}" del correo ${mensaje.messageId}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.error(`[bandeja-ingesta] Error al persistir el correo ${mensaje.messageId}:`, error);
    }
  }

  if (resultado.nextCursor) {
    await guardarCursor(resultado.nextCursor);
  }
}

/** Cursor persistido como el `fechaRecibido` (epoch ms) del correo más
 * reciente ya ingerido — consulta GLOBAL (sin tenantId, `prisma` directo):
 * el cursor de un buzón único no pertenece a ningún tenant. */
async function obtenerCursorActual(): Promise<string | null> {
  const ultimo = await prisma.importacionCorreo.findFirst({
    orderBy: { fechaRecibido: "desc" },
    select: { fechaRecibido: true },
  });
  return ultimo ? String(ultimo.fechaRecibido.getTime()) : null;
}

// El cursor real que usa GoogleWorkspaceEmailProvider ya se deriva de
// fechaRecibido (ver obtenerCursorActual) — este helper existe para que la
// interfaz quede simétrica si en el futuro el cursor deja de poder
// derivarse de una columna existente (ej. al migrar a la History API de
// Gmail, que si necesita un valor persistido aparte).
async function guardarCursor(_cursor: string): Promise<void> {
  // No-op en V1: ver comentario arriba.
}

function guardarAdjuntoEnDisco(
  correoId: string,
  nombreOriginal: string,
  contenido: Buffer,
): string {
  const dirDefinitivo = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "uploads",
    UPLOADS_DIR_CORREOS,
    correoId,
  );
  fs.mkdirSync(dirDefinitivo, { recursive: true });
  const nombreSeguro = `${crypto.randomUUID()}-${path.basename(nombreOriginal)}`;
  const destino = path.join(dirDefinitivo, nombreSeguro);
  fs.writeFileSync(destino, contenido);
  return path.join(correoId, nombreSeguro);
}

let tareaProgramada: ScheduledTask | null = null;

export function iniciarSchedulerIngestaCorreos(): ScheduledTask | null {
  const configEmail = leerConfigEmailImportaciones();
  const configProcesamiento = leerConfigProcesamientoImportaciones();
  if (!configEmail.habilitado) {
    console.log(
      "[bandeja-ingesta] Scheduler deshabilitado (IMPORTACIONES_EMAIL_SYNC_ENABLED distinto de 'true').",
    );
    return null;
  }
  if (tareaProgramada) return tareaProgramada;

  tareaProgramada = schedule(
    configProcesamiento.cronIngesta,
    () => {
      ejecutarRegistrado("bandeja-ingesta", () => ejecutarCicloIngestaCorreos()).catch((error) => {
        console.error("[bandeja-ingesta] Error inesperado en el ciclo de ingesta:", error);
      });
    },
    { noOverlap: true, name: "bandeja-ingesta-correos" },
  );
  registrarScheduler("bandeja-ingesta", configProcesamiento.cronIngesta, tareaProgramada);
  console.log(
    `[bandeja-ingesta] Scheduler iniciado (expresión cron: "${configProcesamiento.cronIngesta}").`,
  );
  return tareaProgramada;
}

export function detenerSchedulerIngestaCorreos(): void {
  tareaProgramada?.stop();
  tareaProgramada = null;
  quitarScheduler("bandeja-ingesta");
}
