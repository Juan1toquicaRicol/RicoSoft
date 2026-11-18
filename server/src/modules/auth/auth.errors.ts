/**
 * Error CONTROLADO de autenticación: su mensaje está pensado para el usuario
 * (credenciales inválidas, cuenta inactiva, dominio no autorizado...) y el
 * controller puede devolverlo tal cual. Cualquier OTRO error (Prisma, red, base
 * de datos, bugs) es inesperado: el controller lo registra en el log interno y
 * responde un mensaje genérico, sin filtrar detalles de infraestructura.
 */
export class AuthError extends Error {
  /** `status` opcional: si se indica, reemplaza el status por defecto del endpoint
   * (p. ej. 409 registro pendiente de verificar, 429 reenvío demasiado pronto). */
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
