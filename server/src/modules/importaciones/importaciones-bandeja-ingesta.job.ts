import crypto from "crypto";
import fs from "fs";
import path from "path";
import { schedule, type ScheduledTask } from "node-cron";
import {
  ejecutarRegistrado,
  quitarScheduler,
  registrarScheduler,
  reportarFalloEnCorrida,
} from "../../lib/job-registry";
import { prisma } from "../../config/prisma";
import { GoogleWorkspaceEmailProvider } from "../../integrations/email/google-workspace-email-provider";
import { EmailProviderError, type EmailProvider } from "../../integrations/email/email-provider";
import {
  etiquetaPiloto,
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

  const etiqueta = etiquetaPiloto();
  const cursorActual = etiqueta ? null : await obtenerCursorActual();

  let resultado;
  try {
    resultado = await provider.listNewMessages(cursorActual, config.maxEmailsPerRun);
  } catch (error) {
    reportarFalloEnCorrida("bandeja-ingesta", "No se pudo leer la bandeja de Gmail.");
    console.error(
      "[bandeja-ingesta] Error al listar mensajes nuevos:",
      error instanceof Error ? error.message : "Error de Gmail",
    );
    return;
  }

  // Los mensajes llegan del más antiguo al más nuevo (ver el proveedor): si
  // la corrida se corta, el cursor (fecha máxima persistida) nunca queda por
  // encima de un mensaje que no se llegó a guardar.
  if (etiqueta !== etiquetaPiloto() || !leerConfigEmailImportaciones().habilitado) return;
  let adjuntosDeLaCorrida = 0;
  for (const mensaje of resultado.messages) {
    try {
      const yaExiste = await prisma.importacionCorreo.findUnique({
        where: { messageId: mensaje.messageId },
        select: { id: true },
      });
      if (yaExiste) continue; // idempotencia real — nunca duplica

      // maxAttachmentsPerRun es un tope POR CORRIDA: un correo nunca se
      // trunca (se perderían adjuntos); si no cabe, queda para la próxima.
      const cantidad = mensaje.attachments.length;
      if (adjuntosDeLaCorrida > 0 && adjuntosDeLaCorrida + cantidad > config.maxAttachmentsPerRun) {
        break;
      }
      adjuntosDeLaCorrida += cantidad;

      const correo = await prisma.importacionCorreo.create({
        data: {
          ...(etiqueta ? { etiquetaPiloto: etiqueta, gmailId: mensaje.providerMessageId } : {}),
          messageId: mensaje.messageId,
          remitente: mensaje.from,
          destinatarios: mensaje.to.join(", "),
          asunto: mensaje.subject,
          fechaRecibido: mensaje.date,
          cuerpoTexto: mensaje.bodyText,
          estadoProcesamiento: "PENDIENTE",
        },
      });

      const adjuntosFallidos: string[] = [];
      for (const adjunto of mensaje.attachments) {
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
          console.error(
            `[bandeja-ingesta] Error al descargar adjunto "${adjunto.filename}" del correo ${mensaje.messageId}:`,
            error,
          );
          adjuntosFallidos.push(adjunto.filename);
        }
      }

      if (adjuntosFallidos.length > 0) {
        reportarFalloEnCorrida("bandeja-ingesta", "Falló la descarga de un adjunto.");
        // El correo queda guardado pero NO se procesa como si estuviera
        // completo: pasa a ERROR con la lista de adjuntos que faltan, visible
        // para una persona, en vez de omitirse en silencio en la siguiente
        // corrida (el correo ya existe y se saltaría por idempotencia).
        await prisma.importacionCorreo.update({
          where: { id: correo.id },
          data: {
            estadoProcesamiento: "ERROR",
            ultimoError:
              `No se pudieron descargar ${adjuntosFallidos.length} adjunto(s): ${adjuntosFallidos.join(", ")}. Revisar el correo original en el buzón.`.slice(
                0,
                2000,
              ),
          },
        });
      }
    } catch (error) {
      // Fallo al persistir el correo mismo: se corta la corrida. Continuar
      // con mensajes más nuevos dejaría el cursor por encima de este.
      reportarFalloEnCorrida("bandeja-ingesta", "Falló el guardado del correo.");
      console.error(`[bandeja-ingesta] Error al persistir el correo ${mensaje.messageId}:`, error);
      break;
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
let cicloEnCurso = false;

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
    async () => {
      if (cicloEnCurso) return;
      cicloEnCurso = true;
      try {
        await ejecutarRegistrado("bandeja-ingesta", ejecutarCicloIngestaCorreos);
      } catch {
        console.error("Falló el ciclo de ingesta de correos.");
      } finally {
        cicloEnCurso = false;
      }
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
