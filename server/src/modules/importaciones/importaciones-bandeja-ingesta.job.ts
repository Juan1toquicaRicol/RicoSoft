import crypto from "crypto";
import fs from "fs";
import path from "path";
import { schedule, type ScheduledTask } from "node-cron";
import type { BuzonImportaciones } from "@prisma/client";
import {
  ejecutarRegistrado,
  quitarScheduler,
  registrarScheduler,
  reportarFalloEnCorrida,
} from "../../lib/job-registry";
import { prisma } from "../../config/prisma";
import { EmailProviderError, type EmailMessage, type EmailProvider } from "../../integrations/email/email-provider";
import {
  leerConfigEmailImportaciones,
  leerConfigProcesamientoImportaciones,
} from "../../integrations/email/config";
import {
  _establecerFabricaProveedorParaTests,
  proveedorParaBuzon,
  responsableValido,
} from "./buzones-importaciones.service";
import { puedeIngerir, type EstadoBuzon } from "./buzones-importaciones.reglas";

/**
 * Job de INGESTA de la Bandeja. Recorre los buzones ACTIVOS con etiqueta en
 * secuencia dentro de cada ciclo. Cada buzón tiene su propio límite de
 * correos y adjuntos, su tiempo de espera y su estado: si uno falla o agota
 * el tiempo, se registra en ese buzón y el siguiente sigue.
 *
 * Reglas:
 * - El correo nuevo nace con el tenant del buzón y con el responsable inicial
 *   del buzón, desde el primer guardado.
 * - Un mensaje ya existente (mismo Message-ID) no se duplica: si pertenece al
 *   mismo tenant solo se agrega el origen de este buzón, sin volver a bajar
 *   adjuntos ni cambiar responsable. Si pertenece a otro tenant, se omite.
 * - Alta del correo y su primer origen en la misma transacción.
 *
 * Usa `prisma` global: el job corre sin sesión de usuario.
 */

/** Solo para tests: reemplaza el proveedor de Gmail de TODOS los buzones. */
export function _establecerProviderParaTests(p: EmailProvider): void {
  _establecerFabricaProveedorParaTests(() => p);
}

/** Solo para tests: fábrica por buzón (p. ej., un falso distinto por dirección). */
export function _establecerFabricaProveedorIngestaParaTests(
  fabrica: ((direccion: string) => EmailProvider) | null,
): void {
  _establecerFabricaProveedorParaTests(fabrica);
}

const UPLOADS_DIR_CORREOS = "importaciones-correos";

/** Mensaje seguro para guardar en el buzón: nunca detalles de la API de Google. */
function mensajeDeFallo(error: unknown): string {
  if (error instanceof EmailProviderError) return error.message.slice(0, 500);
  if (error instanceof Error && error.name === "TimeoutBuzon") return error.message;
  return "Falló la lectura del buzón.";
}

function esperarGmail<T>(promesa: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancelar = () => reject(signal.reason);
    signal.addEventListener("abort", cancelar, { once: true });
    if (signal.aborted) cancelar();
    void promesa.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancelar));
  });
}

/**
 * Un ciclo completo: cada buzón activo se lee en secuencia. Nunca lanza.
 */
export async function ejecutarCicloIngestaCorreos(): Promise<void> {
  const config = leerConfigEmailImportaciones();
  if (!config.habilitado) return;

  const buzones = await prisma.buzonImportaciones.findMany({
    where: { estado: "ACTIVO" },
    orderBy: { createdAt: "asc" },
  });
  for (const buzon of buzones) {
    if (!puedeIngerir(buzon.estado as EstadoBuzon, buzon.etiquetaId)) continue;
    try {
      await ingerirBuzon(buzon);
    } catch {
      reportarFalloEnCorrida("bandeja-ingesta", "No se pudo registrar el estado de un buzón.");
    }
  }
}

/** Lee un buzón. Nunca lanza: el error queda registrado en el propio buzón. */
export async function ingerirBuzon(buzon: BuzonImportaciones): Promise<void> {
  const provider = proveedorParaBuzon(buzon.direccion);
  const cancelacion = new AbortController();
  const errorTiempo = new Error("El buzón no respondió en el tiempo permitido.");
  errorTiempo.name = "TimeoutBuzon";
  const temporizador = setTimeout(() => cancelacion.abort(errorTiempo), buzon.timeoutSegundos * 1000);
  const { signal } = cancelacion;
  try {
    const conocidos = await prisma.importacionCorreoOrigen.findMany({
      where: { buzonId: buzon.id, gmailId: { not: null } },
      select: { gmailId: true },
    });
    const omitirIds = new Set(conocidos.map((f) => f.gmailId!));

    const omitidos = await prisma.importacionMensajeOmitido.findMany({
      where: { buzonId: buzon.id }, select: { gmailId: true },
    });
    for (const omision of omitidos) omitirIds.add(omision.gmailId);
    const resultado = await esperarGmail(provider.listNewMessages(null, buzon.correosPorCiclo, {
      etiqueta: buzon.etiquetaId!, omitirIds, signal,
    }), signal);
    signal.throwIfAborted();

    const responsableVigente = await responsableVigenteDelBuzon(buzon);
    let adjuntosDeLaCorrida = 0;
    for (const mensaje of resultado.messages) {
      const cantidad = mensaje.attachments.length;
      // Tope de adjuntos por ciclo: un correo nunca se trunca; si no cabe,
      // queda para el próximo ciclo (no está en omitirIds).
      if (adjuntosDeLaCorrida > 0 && adjuntosDeLaCorrida + cantidad > buzon.adjuntosPorCiclo) break;
      adjuntosDeLaCorrida += cantidad;
      signal.throwIfAborted();
      await persistirMensajeDeBuzon(buzon, provider, mensaje, responsableVigente, signal);
    }

    await prisma.buzonImportaciones.update({
      where: { id: buzon.id },
      data: { ultimaEjecucion: new Date(), ultimoError: null },
    });
  } catch (error) {
    console.error(`[bandeja-ingesta] Buzón ${buzon.direccion}:`, error instanceof Error ? error.name : "error");
    reportarFalloEnCorrida("bandeja-ingesta", "Falló la lectura de un buzón.");
    await prisma.buzonImportaciones.update({
      where: { id: buzon.id },
      data: { ultimaEjecucion: new Date(), ultimoError: mensajeDeFallo(signal.aborted ? signal.reason : error) },
    });
  } finally {
    clearTimeout(temporizador);
  }
}

/** El responsable del buzón solo se usa si sigue activo y es de la empresa del buzón. */
async function responsableVigenteDelBuzon(buzon: BuzonImportaciones): Promise<string | null> {
  if (!buzon.responsableUsuarioId) return null;
  return await responsableValido(buzon.tenantId, buzon.responsableUsuarioId)
    ? buzon.responsableUsuarioId : null;
}

async function persistirMensajeDeBuzon(
  buzon: BuzonImportaciones,
  provider: EmailProvider,
  mensaje: EmailMessage,
  responsableVigente: string | null,
  signal: AbortSignal,
): Promise<void> {
  const existente = await prisma.importacionCorreo.findUnique({
    where: { messageId: mensaje.messageId },
    select: { id: true, tenantId: true },
  });

  if (existente) {
    if (existente.tenantId !== buzon.tenantId) {
      // Otro tenant ya tiene este correo: no se agrega origen ni se cambia de empresa.
      await registrarOmitido(buzon.id, mensaje.providerMessageId);
      console.warn(`[bandeja-ingesta] Correo ${mensaje.messageId} pertenece a otra empresa; omitido en ${buzon.direccion}.`);
      return;
    }
    await agregarOrigen(existente.id, buzon, mensaje);
    return;
  }

  let correoId: string;
  try {
    correoId = await prisma.$transaction(async (tx) => {
      const correo = await tx.importacionCorreo.create({
        data: {
          tenantId: buzon.tenantId,
          responsableUsuarioId: responsableVigente,
          etiquetaPiloto: buzon.etiquetaId,
          gmailId: mensaje.providerMessageId,
          messageId: mensaje.messageId,
          remitente: mensaje.from,
          destinatarios: mensaje.to.join(", "),
          asunto: mensaje.subject,
          fechaRecibido: mensaje.date,
          cuerpoTexto: mensaje.bodyText,
          estadoProcesamiento: "PENDIENTE",
          ingestaCompleta: mensaje.attachments.length === 0,
        },
      });
      await tx.importacionCorreoOrigen.create({
        data: {
          correoId: correo.id,
          buzonId: buzon.id,
          gmailId: mensaje.providerMessageId,
          etiquetaId: buzon.etiquetaId,
        },
      });
      return correo.id;
    });
  } catch (error) {
    if (esViolacionUnica(error)) {
      // Otro ciclo o instancia lo guardó entre la consulta y el alta: queda como origen.
      const ganador = await prisma.importacionCorreo.findUnique({
        where: { messageId: mensaje.messageId },
        select: { id: true, tenantId: true },
      });
      if (ganador?.tenantId === buzon.tenantId) await agregarOrigen(ganador.id, buzon, mensaje);
      else if (ganador) await registrarOmitido(buzon.id, mensaje.providerMessageId);
      return;
    }
    throw error;
  }

  if (mensaje.attachments.length) await guardarAdjuntos(correoId, provider, mensaje, signal);
}

async function registrarOmitido(buzonId: string, gmailId: string): Promise<void> {
  try {
    await prisma.importacionMensajeOmitido.create({ data: { buzonId, gmailId } });
  } catch (error) {
    if (!esViolacionUnica(error)) throw error;
  }
}

async function agregarOrigen(correoId: string, buzon: BuzonImportaciones, mensaje: EmailMessage): Promise<void> {
  try {
    await prisma.importacionCorreoOrigen.create({
      data: {
        correoId,
        buzonId: buzon.id,
        gmailId: mensaje.providerMessageId,
        etiquetaId: buzon.etiquetaId,
      },
    });
  } catch (error) {
    // Ya existía este origen (carrera entre instancias): no es un fallo.
    if (!esViolacionUnica(error)) throw error;
  }
}

function esViolacionUnica(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

async function guardarAdjuntos(correoId: string, provider: EmailProvider, mensaje: EmailMessage, signal: AbortSignal): Promise<void> {
  const adjuntosFallidos: string[] = [];
  for (const adjunto of mensaje.attachments) {
    try {
      const contenido = await esperarGmail(provider.getAttachmentContent(
        mensaje.providerMessageId,
        adjunto.providerAttachmentId,
        signal,
      ), signal);
      signal.throwIfAborted();
      const hash = crypto.createHash("sha256").update(contenido).digest("hex");

      const yaExisteAdjunto = await prisma.importacionCorreoAdjunto.findUnique({
        where: { correoId_hashSha256: { correoId, hashSha256: hash } },
      });
      if (yaExisteAdjunto) continue;

      const ruta = guardarAdjuntoEnDisco(correoId, adjunto.filename, contenido);
      await prisma.importacionCorreoAdjunto.create({
        data: {
          correoId,
          nombreOriginal: adjunto.filename,
          mimeType: adjunto.mimeType,
          tamano: adjunto.size,
          ruta,
          hashSha256: hash,
          estadoExtraccion: "PENDIENTE",
        },
      });
    } catch (error) {
      console.error(`[bandeja-ingesta] Error al descargar adjunto "${adjunto.filename}" del correo ${mensaje.messageId}:`, error);
      adjuntosFallidos.push(adjunto.filename);
      if (signal.aborted) break;
    }
  }

  if (adjuntosFallidos.length > 0) {
    reportarFalloEnCorrida("bandeja-ingesta", "Falló la descarga de un adjunto.");
    // El correo queda guardado pero NO se procesa como si estuviera completo.
    await prisma.importacionCorreo.update({
      where: { id: correoId },
      data: {
        estadoProcesamiento: "ERROR",
        ultimoError:
          `No se pudieron descargar ${adjuntosFallidos.length} adjunto(s): ${adjuntosFallidos.join(", ")}. Revisar el correo original en el buzón.`.slice(
            0,
            2000,
          ),
      },
    });
    signal.throwIfAborted();
  } else {
    await prisma.importacionCorreo.update({ where: { id: correoId }, data: { ingestaCompleta: true } });
  }
}

function guardarAdjuntoEnDisco(correoId: string, nombreOriginal: string, contenido: Buffer): string {
  const dirDefinitivo = path.join(__dirname, "..", "..", "..", "uploads", UPLOADS_DIR_CORREOS, correoId);
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
    console.log("[bandeja-ingesta] Scheduler deshabilitado (lectura de la Bandeja apagada).");
    return null;
  }
  if (tareaProgramada) return tareaProgramada;

  tareaProgramada = schedule(
    configProcesamiento.cronIngesta,
    async () => {
      if (cicloEnCurso) return; // omite el disparo si el ciclo anterior sigue corriendo
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
  console.log(`[bandeja-ingesta] Scheduler iniciado (expresión cron: "${configProcesamiento.cronIngesta}").`);
  return tareaProgramada;
}

export function detenerSchedulerIngestaCorreos(): void {
  tareaProgramada?.stop();
  tareaProgramada = null;
  quitarScheduler("bandeja-ingesta");
}
