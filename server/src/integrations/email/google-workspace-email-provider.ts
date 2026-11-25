import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import {
  EmailProviderError,
  type EmailAttachment,
  type EmailMessage,
  type EmailProvider,
  type ListNewMessagesResult,
} from "./email-provider";
import { leerConfigEmailImportaciones } from "./config";

/**
 * Gmail API vía cuenta de servicio + Domain-Wide Delegation — el mecanismo
 * OFICIAL de Google Workspace para que una aplicación backend lea un buzón
 * sin ninguna contraseña personal ni sesión de usuario (documentado en
 * https://developers.google.com/identity/protocols/oauth2/service-account
 * y https://developers.google.com/workspace/guides/create-credentials#delegate_domain-wide_authority_to_your_service_account).
 * Requisitos de configuración (ver docs/bandeja-importaciones.md):
 *   1. Cuenta de servicio creada en Google Cloud, con Domain-Wide Delegation
 *      habilitada.
 *   2. En el Admin Console de Workspace (Seguridad → Control de acceso a la
 *      API → Delegación en todo el dominio), autorizar el Client ID de esa
 *      cuenta de servicio para el scope
 *      "https://www.googleapis.com/auth/gmail.readonly".
 *   3. El JSON de la cuenta de servicio se pasa completo en
 *      IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON; `subject` (a quién
 *      impersonar) procede de la configuración del buzón.
 *
 * Sincronización incremental: V1 usa polling por `internalDate` (el cursor
 * es el internalDate en ms del último correo procesado, se pide
 * `after:<segundos>` en la query de Gmail) en vez de la History API
 * (users.history.list). Decisión deliberada: el historyId de Gmail expira
 * si no se consulta dentro de ~7 días (obligaría a un resync completo de
 * todos modos como fallback), y para el volumen esperado de un buzón de
 * Comercio Exterior (decenas de correos/día, no miles) el costo de listar
 * por fecha es insignificante. Si el volumen crece, migrar a History API es
 * un cambio interno a este archivo, no al resto de la Bandeja (por eso
 * existe la interfaz EmailProvider).
 */
const MAX_PAGINAS_LISTADO = 200;

export interface OpcionesListadoGmail {
  /** ID de etiqueta del buzón. Si no se indica, se usa la del piloto legado. */
  etiqueta?: string;
  /** Gmail IDs que el llamador ya tiene para este buzón: se omiten sin pedir su detalle. */
  omitirIds?: ReadonlySet<string>;
  signal?: AbortSignal;
}

export class GoogleWorkspaceEmailProvider implements EmailProvider {
  private gmail: gmail_v1.Gmail | null = null;

  /** Cuenta de Gmail aprobada y elegida en la configuración de RicoSoft. */
  constructor(private readonly buzon: string) {}

  private async obtenerCliente(): Promise<gmail_v1.Gmail> {
    if (this.gmail) return this.gmail;

    const config = leerConfigEmailImportaciones();
    const buzon = this.buzon;
    if (!config.serviceAccountJson || !buzon) {
      throw new EmailProviderError(
        "IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON o el buzón a leer no están configurados.",
      );
    }

    let credenciales: { client_email: string; private_key: string };
    try {
      credenciales = JSON.parse(config.serviceAccountJson);
    } catch (error) {
      throw new EmailProviderError(
        "IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON no es un JSON válido.",
        error,
      );
    }

    const auth = new google.auth.JWT({
      email: credenciales.client_email,
      key: credenciales.private_key,
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      // "subject": a quién impersona la cuenta de servicio — el buzón
      // central, nunca el usuario que disparó la petición (no hay uno: esto
      // corre desde un job, no desde una request de un humano).
      subject: buzon,
    });

    this.gmail = google.gmail({ version: "v1", auth });
    return this.gmail;
  }

  async probarConexion() {
    const gmail = await this.obtenerCliente();
    const perfil = await gmail.users.getProfile({ userId: "me", fields: "emailAddress" });
    if (
      perfil.data.emailAddress?.toLowerCase() !==
      this.buzon.toLowerCase()
    )
      throw new EmailProviderError("El perfil no coincide con el buzón autorizado.");
    const labels = await gmail.users.labels.list({ userId: "me", fields: "labels(id,name,type)" });
    return (labels.data.labels ?? [])
      .filter((x) => x.type === "user" && x.id && x.name)
      .map((x) => ({ id: x.id!, nombre: x.name! }));
  }

  async listNewMessages(
    cursor: string | null,
    maxResults: number,
    opciones?: OpcionesListadoGmail,
  ): Promise<ListNewMessagesResult> {
    const etiqueta = opciones?.etiqueta;
    const omitirIds = opciones?.omitirIds;
    const signal = opciones?.signal;
    signal?.throwIfAborted();
    const gmail = await this.obtenerCliente();

    // cursor = internalDate (ms epoch) del correo más reciente ya
    // ingerido. Gmail's `after:` trabaja en segundos y es inclusivo del día,
    // así que el filtrado fino real (evitar reprocesar el mismo correo del
    // borde) lo hace el caller comparando internalDate exacto — ver
    // ingesta.job.ts.
    // Un segundo de margen: Gmail trabaja en segundos y el cursor está en ms,
    // así que un mensaje del mismo segundo que el último ingerido podría
    // quedar fuera; la idempotencia por messageId absorbe el solape.
    const despuesDeSegundos = cursor ? Math.floor(Number(cursor) / 1000) - 1 : null;
    const query =
      despuesDeSegundos && despuesDeSegundos > 0 ? `after:${despuesDeSegundos}` : undefined;

    // Gmail devuelve del más nuevo al más antiguo y por páginas. Se recorren
    // TODAS las páginas (con tope) y se toman los `maxResults` más ANTIGUOS:
    // así el cursor (fecha máxima ingerida) nunca salta por encima de
    // mensajes que quedaron sin traer cuando hay más mensajes que el límite.

    const idsTodos: string[] = [];
    let pageToken: string | undefined;
    let paginas = 0;
    try {
      do {
        const respuesta = await gmail.users.messages.list({
          userId: "me",
          maxResults: 100,
          q: etiqueta ? undefined : query,
          ...(etiqueta ? { labelIds: [etiqueta] } : {}),
          pageToken,
        }, ...(signal ? [{ signal, retry: false }] : []));
        for (const m of respuesta.data.messages ?? []) {
          if (m.id) idsTodos.push(m.id);
        }
        pageToken = respuesta.data.nextPageToken ?? undefined;
        paginas++;
      } while (pageToken && paginas < MAX_PAGINAS_LISTADO);
    } catch (error) {
      throw new EmailProviderError("Error al listar mensajes de Gmail.", error);
    }
    if (pageToken) {
      throw new EmailProviderError(
        "El buzón tiene más mensajes nuevos que el máximo listable en una corrida; se reintenta en la próxima sin saltar mensajes.",
      );
    }

    const ids = idsTodos.reverse();
    const conocidos = new Set<string>(omitirIds ?? []);
    if (!etiqueta) ids.splice(maxResults);

    const mensajes: EmailMessage[] = [];
    let cursorMasReciente = cursor ? Number(cursor) : 0;

    for (const id of ids) {
      if (mensajes.length >= maxResults) break;
      if (conocidos.has(id)) continue;
      let detalle: gmail_v1.Schema$Message;
      try {
        signal?.throwIfAborted();
        const respuesta = await gmail.users.messages.get({ userId: "me", id, format: "full" }, ...(signal ? [{ signal, retry: false }] : []));
        detalle = respuesta.data;
      } catch (error) {
        throw new EmailProviderError(`Error al obtener el mensaje Gmail ${id}.`, error);
      }
      const mensaje = mapearMensajeGmail(detalle);
      if (mensaje && (!etiqueta || detalle.labelIds?.includes(etiqueta))) {
        mensajes.push(mensaje);
        const internalDate = Number(detalle.internalDate ?? 0);
        if (internalDate > cursorMasReciente) cursorMasReciente = internalDate;
      }
    }

    mensajes.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      messages: mensajes,
      nextCursor: cursorMasReciente > 0 ? String(cursorMasReciente) : cursor,
    };
  }

  async getAttachmentContent(
    providerMessageId: string,
    providerAttachmentId: string,
    signal?: AbortSignal,
  ): Promise<Buffer> {
    const gmail = await this.obtenerCliente();
    try {
      signal?.throwIfAborted();
      const respuesta = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: providerMessageId,
        id: providerAttachmentId,
      }, ...(signal ? [{ signal, retry: false }] : []));
      const data = respuesta.data.data;
      if (!data) throw new Error("Gmail no devolvió contenido para el adjunto.");
      // Gmail usa base64url (RFC 4648 §5), no base64 estándar.
      return Buffer.from(data, "base64url");
    } catch (error) {
      if (error instanceof Error && error.message.includes("Gmail no devolvió")) throw error;
      throw new EmailProviderError(
        `Error al descargar el adjunto ${providerAttachmentId} del mensaje ${providerMessageId}.`,
        error,
      );
    }
  }
}

function obtenerHeader(payload: gmail_v1.Schema$MessagePart | undefined, nombre: string): string {
  return payload?.headers?.find((h) => h.name?.toLowerCase() === nombre.toLowerCase())?.value ?? "";
}

function decodificarBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

/** Recorre recursivamente las partes MIME de un mensaje (los correos
 * multipart anidan text/plain, text/html y adjuntos en distintos niveles)
 * acumulando cuerpo texto/HTML y la lista de adjuntos. */
function recorrerPartes(
  parte: gmail_v1.Schema$MessagePart | undefined,
  acc: { textoPlano: string[]; html: string[]; adjuntos: EmailAttachment[] },
): void {
  if (!parte) return;

  const esAdjunto = !!parte.filename && parte.filename.length > 0 && !!parte.body?.attachmentId;
  if (esAdjunto) {
    acc.adjuntos.push({
      providerAttachmentId: parte.body!.attachmentId!,
      filename: parte.filename!,
      mimeType: parte.mimeType || "application/octet-stream",
      size: parte.body?.size ?? 0,
    });
  } else if (parte.mimeType === "text/plain" && parte.body?.data) {
    acc.textoPlano.push(decodificarBase64Url(parte.body.data));
  } else if (parte.mimeType === "text/html" && parte.body?.data) {
    acc.html.push(decodificarBase64Url(parte.body.data));
  }

  for (const sub of parte.parts ?? []) {
    recorrerPartes(sub, acc);
  }
}

function mapearMensajeGmail(mensaje: gmail_v1.Schema$Message): EmailMessage | null {
  const payload = mensaje.payload;
  const messageId = obtenerHeader(payload, "Message-ID");
  if (!messageId || !mensaje.id) return null;

  const acc = {
    textoPlano: [] as string[],
    html: [] as string[],
    adjuntos: [] as EmailAttachment[],
  };
  recorrerPartes(payload, acc);

  const destinatariosRaw = obtenerHeader(payload, "To");
  const to = destinatariosRaw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  return {
    messageId,
    providerMessageId: mensaje.id,
    from: obtenerHeader(payload, "From"),
    to,
    subject: obtenerHeader(payload, "Subject"),
    date: new Date(Number(mensaje.internalDate ?? Date.now())),
    bodyText: acc.textoPlano.length > 0 ? acc.textoPlano.join("\n") : null,
    bodyHtml: acc.html.length > 0 ? acc.html.join("\n") : null,
    attachments: acc.adjuntos,
  };
}
