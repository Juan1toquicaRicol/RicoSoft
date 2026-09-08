/** Errores propios del adaptador CrossChex. El resto de RicoSoft debe poder
 * capturar estas clases sin conocer nada de ODBC ni de errores de Access. */

export class CrossChexConnectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CrossChexConnectionError";
  }
}

export class CrossChexQueryError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CrossChexQueryError";
  }
}

export class CrossChexTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossChexTimeoutError";
  }
}

/** Traduce errores crudos del driver ODBC (bloqueo de archivo, driver
 * inexistente, ruta inválida) a un mensaje entendible sin exponer el detalle
 * interno de ODBC a quien llama. El error original queda en `cause` para
 * quien sí necesite el detalle (logging). */
export function traducirErrorConexion(error: unknown): CrossChexConnectionError {
  const odbcErrors = (error as { odbcErrors?: Array<{ message?: string; code?: number }> })
    ?.odbcErrors;
  const detalle = odbcErrors?.map((e) => e.message).join("; ") || (error as Error)?.message;

  if (detalle && /no se pudo encontrar el archivo|file does not exist|could not find file/i.test(detalle)) {
    return new CrossChexConnectionError(
      "No se pudo abrir CrossChex.mdb: el archivo no existe o no es accesible desde este proceso.",
      error,
    );
  }
  if (detalle && /driver de administrador de datos|data source name not found|no default driver/i.test(detalle)) {
    return new CrossChexConnectionError(
      "El driver ODBC de Microsoft Access no está instalado o no coincide en arquitectura (32/64 bits) con este proceso Node.",
      error,
    );
  }
  if (
    detalle &&
    /uso compartido de archivos|file already in use|already opened exclusively|ya (que )?(está|esta) (siendo utilizado|en uso)/i.test(
      detalle,
    )
  ) {
    return new CrossChexConnectionError(
      "CrossChex.mdb está bloqueado exclusivamente por otro proceso en este momento (probablemente CrossChex compactando o con un candado temporal). Reintentar más tarde.",
      error,
    );
  }

  return new CrossChexConnectionError(`No se pudo conectar a CrossChex.mdb: ${detalle ?? "error desconocido"}`, error);
}
