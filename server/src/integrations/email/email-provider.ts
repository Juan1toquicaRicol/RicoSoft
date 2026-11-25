/**
 * Bandeja Inteligente de Importaciones (V1) — abstracción de correo. Nunca
 * acoplar la lógica de negocio (ingesta, clasificación, matching) al SDK de
 * un proveedor concreto: toda la Bandeja programa contra esta interfaz, no
 * contra `googleapis`. V1 implementa un único proveedor (Google Workspace,
 * ver google-workspace-email-provider.ts) para el buzón central
 * "importaciones@ricol.com.co", pero la arquitectura permite agregar otros
 * proveedores (o un buzón por tenant) sin tocar el resto de la Bandeja.
 */

export interface EmailAttachment {
  /** Identificador del adjunto dentro del proveedor de correo — necesario
   * para pedirle el contenido binario por separado (Gmail no lo entrega
   * inline salvo que se pida explícitamente). */
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailMessage {
  /** Message-ID real (RFC 5322) — NUNCA el id interno del proveedor, que
   * puede cambiar entre re-sincronizaciones. Es la clave de idempotencia
   * real (ver ImportacionCorreo.messageId). */
  messageId: string;
  /** Id interno del proveedor — usado solo para pedir el contenido de un
   * adjunto concreto (getAttachmentContent), nunca persistido como
   * identidad del correo. */
  providerMessageId: string;
  from: string;
  to: string[];
  subject: string;
  date: Date;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: EmailAttachment[];
}

export interface ListNewMessagesResult {
  messages: EmailMessage[];
  /** Cursor opaco para la siguiente sincronización incremental (ej.
   * historyId de Gmail, o una fecha "after" para polling simple) — se
   * persiste externamente (ver config del job de ingesta) y se vuelve a
   * pasar en la siguiente llamada. Null si el proveedor no soporta
   * sincronización incremental y hay que repetir la ventana completa. */
  nextCursor: string | null;
}

export interface EmailProvider {
  /**
   * Lista mensajes nuevos desde el último cursor conocido. NUNCA debe
   * releer todo el buzón en cada llamada — implementaciones concretas deben
   * usar el mecanismo incremental que el proveedor real ofrezca (ver
   * comentario en GoogleWorkspaceEmailProvider sobre historyId vs. query
   * por fecha).
   */
  listNewMessages(
    cursor: string | null,
    maxResults: number,
    opciones?: { etiqueta?: string; omitirIds?: ReadonlySet<string>; signal?: AbortSignal },
  ): Promise<ListNewMessagesResult>;

  /** Contenido binario (base64 estándar, ya decodificado a Buffer) de un
   * adjunto concreto de un mensaje concreto. */
  getAttachmentContent(providerMessageId: string, providerAttachmentId: string, signal?: AbortSignal): Promise<Buffer>;
}

/** Error específico para que el llamador distinga "el proveedor de correo
 * falló" (reintentable, no debe tumbar el proceso) de un bug de la propia
 * Bandeja. */
export class EmailProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EmailProviderError";
  }
}
