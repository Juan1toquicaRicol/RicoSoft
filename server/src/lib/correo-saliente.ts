/**
 * Envío de correo saliente (notificaciones transaccionales, p. ej. el código de
 * verificación del autoregistro). Es independiente del proveedor: el resto de
 * RicoSoft solo conoce esta interfaz.
 *
 * Todavía NO hay proveedor real (Gmail API o SMTP está pendiente de decisión):
 * mientras no se registre uno con `configurarProveedorCorreoSaliente`,
 * `obtenerProveedorCorreoSaliente()` devuelve null y quien lo use debe fallar
 * cerrado (no simular que el correo se envió).
 *
 * No confundir con integrations/email: esa carpeta es la LECTURA del buzón de la
 * Bandeja de Importaciones (gmail.readonly), no el envío.
 */

export interface CorreoSaliente {
  para: string;
  asunto: string;
  texto: string;
}

export interface ProveedorCorreoSaliente {
  enviar(correo: CorreoSaliente): Promise<void>;
}

export class CorreoSalienteError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CorreoSalienteError";
  }
}

let proveedorActual: ProveedorCorreoSaliente | null = null;

/** Registra el proveedor de envío (al arrancar el servidor, o en tests). null lo quita. */
export function configurarProveedorCorreoSaliente(proveedor: ProveedorCorreoSaliente | null): void {
  proveedorActual = proveedor;
}

export function obtenerProveedorCorreoSaliente(): ProveedorCorreoSaliente | null {
  return proveedorActual;
}
