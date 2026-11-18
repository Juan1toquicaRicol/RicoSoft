import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import {
  CorreoSalienteError,
  type CorreoSaliente,
  type ProveedorCorreoSaliente,
} from "../../lib/correo-saliente";

/**
 * Proveedor de ENVÍO de correo con la Gmail API (scope gmail.send) mediante una
 * cuenta de servicio con Domain-Wide Delegation. Es independiente del proveedor
 * de LECTURA de la Bandeja de Importaciones (google-workspace-email-provider.ts,
 * gmail.readonly): credencial, scope y buzón separados a propósito, para poder
 * revocar uno sin afectar al otro.
 *
 * Configuración (todo por entorno, nada hardcodeado):
 *   CORREO_SALIENTE_SERVICE_ACCOUNT_JSON  JSON completo de la cuenta de servicio.
 *   CORREO_SALIENTE_MAILBOX               Buzón REAL de Workspace que se impersona
 *                                         (el principal, p. ej. el usuario que tiene el alias).
 *   CORREO_SALIENTE_FROM                  Remitente visible (p. ej. un alias del buzón
 *                                         anterior). Si se omite, se usa el buzón.
 * En el Admin Console debe estar autorizado el Client ID de la cuenta de servicio
 * para el scope https://www.googleapis.com/auth/gmail.send.
 */

export const SCOPE_GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";

export interface ConfigCorreoSaliente {
  serviceAccountJson: string;
  mailbox: string;
  from: string;
}

/** Devuelve la configuración, o null si no está completa (el envío queda sin proveedor). */
export function leerConfigCorreoSaliente(
  env: NodeJS.ProcessEnv = process.env,
): ConfigCorreoSaliente | null {
  const serviceAccountJson = env.CORREO_SALIENTE_SERVICE_ACCOUNT_JSON?.trim();
  const mailbox = env.CORREO_SALIENTE_MAILBOX?.trim();
  if (!serviceAccountJson || !mailbox) return null;
  const from = env.CORREO_SALIENTE_FROM?.trim() || mailbox;
  return { serviceAccountJson, mailbox, from };
}

const SALTO_DE_LINEA = /[\r\n]/;

function validarDireccion(valor: string, campo: string): void {
  if (SALTO_DE_LINEA.test(valor) || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(valor)) {
    throw new CorreoSalienteError(`${campo} no es una dirección de correo válida.`);
  }
}

/** Asunto con caracteres no ASCII (tildes, ñ): RFC 2047, base64 UTF-8. */
function codificarAsunto(asunto: string): string {
  if (SALTO_DE_LINEA.test(asunto)) {
    throw new CorreoSalienteError("El asunto no puede contener saltos de línea.");
  }
  return /^[\x20-\x7e]*$/.test(asunto)
    ? asunto
    : `=?UTF-8?B?${Buffer.from(asunto, "utf-8").toString("base64")}?=`;
}

/** Mensaje RFC 2822 en texto plano UTF-8, codificado en base64url como exige Gmail. */
export function construirMensajeRaw(from: string, correo: CorreoSaliente): string {
  validarDireccion(from, "El remitente");
  validarDireccion(correo.para, "El destinatario");
  const cabeceras = [
    `From: ${from}`,
    `To: ${correo.para}`,
    `Subject: ${codificarAsunto(correo.asunto)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  const cuerpo = Buffer.from(correo.texto, "utf-8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
  return Buffer.from(`${cabeceras.join("\r\n")}\r\n\r\n${cuerpo}`, "utf-8").toString("base64url");
}

export class GoogleWorkspaceCorreoSaliente implements ProveedorCorreoSaliente {
  private gmail: gmail_v1.Gmail | null = null;

  constructor(private readonly config: ConfigCorreoSaliente) {}

  private obtenerCliente(): gmail_v1.Gmail {
    if (this.gmail) return this.gmail;

    let credenciales: { client_email: string; private_key: string };
    try {
      credenciales = JSON.parse(this.config.serviceAccountJson);
    } catch (error) {
      throw new CorreoSalienteError(
        "CORREO_SALIENTE_SERVICE_ACCOUNT_JSON no es un JSON válido.",
        error,
      );
    }

    const auth = new google.auth.JWT({
      email: credenciales.client_email,
      key: credenciales.private_key,
      scopes: [SCOPE_GMAIL_SEND],
      // Se impersona el buzón real; el alias solo cambia el "From" visible.
      subject: this.config.mailbox,
    });
    this.gmail = google.gmail({ version: "v1", auth });
    return this.gmail;
  }

  async enviar(correo: CorreoSaliente): Promise<void> {
    const raw = construirMensajeRaw(this.config.from, correo);
    try {
      await this.obtenerCliente().users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
    } catch (error) {
      if (error instanceof CorreoSalienteError) throw error;
      // El mensaje de Google no incluye secretos, pero tampoco el destinatario ni
      // el cuerpo (el código): solo se conserva como `cause` para el log interno.
      throw new CorreoSalienteError("Gmail rechazó el envío del correo.", error);
    }
  }
}

/** Crea el proveedor si la configuración está completa; si no, null. */
export function crearProveedorCorreoSalienteDesdeEntorno(
  env: NodeJS.ProcessEnv = process.env,
): GoogleWorkspaceCorreoSaliente | null {
  const config = leerConfigCorreoSaliente(env);
  return config ? new GoogleWorkspaceCorreoSaliente(config) : null;
}
