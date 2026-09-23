/* Clasificación de errores de Siesa (mssql). Sin importar mssql a propósito: el manejador global de app.ts lo usa aunque los tests mockeen config/siesa. */
/**
 * Marca de origen: solo los errores que salieron del cliente de Siesa
 * (config/siesa.ts: conexión del pool o query/batch/execute) llevan este
 * Symbol. Sin ella, un ECONNRESET/ETIMEDOUT de OTRA librería (SMTP, HTTP a un
 * tercero, Prisma...) nunca se presenta como "Siesa no disponible". Symbol.for
 * para que sobreviva a vi.resetModules()/copias del módulo.
 */
const ORIGEN_SIESA = Symbol.for("ricosoft.siesa.error");

/** Marca (in situ, no enumerable) un error como originado en Siesa y lo devuelve. */
export function marcarErrorSiesa<T>(error: T): T {
  if (typeof error === "object" && error !== null && !Object.isFrozen(error)) {
    Object.defineProperty(error, ORIGEN_SIESA, { value: true, enumerable: false });
  }
  return error;
}

export function esErrorSiesa(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as Record<symbol, unknown>)[ORIGEN_SIESA] === true;
}

/** Causa de un fallo al hablar con Siesa, para decidir si el pool se descarta. */
export type CausaFalloSiesa = "transporte" | "timeout_conexion" | "timeout_consulta";

const CODIGOS_TRANSPORTE = new Set([
  "ESOCKET",
  "ECONNRESET",
  "ECONNCLOSED",
  "ENOTOPEN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "EPIPE",
  "ELOGIN",
]);

/**
 * Clasifica un error como fallo de Siesa (o null si no lo es). Distingue el
 * timeout de CONEXIÓN (ConnectionError/ETIMEOUT — el pool no sirve) del
 * timeout de CONSULTA (RequestError/ETIMEOUT — el pool sigue sano, solo esa
 * query fue demasiado lenta) porque mssql usa el mismo código para ambos.
 */
export function clasificarErrorSiesa(error: unknown): CausaFalloSiesa | null {
  if (typeof error !== "object" || error === null) return null;
  const { name, code } = error as { name?: unknown; code?: unknown };
  if (name === "ConnectionError") {
    return code === "ETIMEOUT" ? "timeout_conexion" : "transporte";
  }
  if (name === "RequestError" && code === "ETIMEOUT") return "timeout_consulta";
  if (typeof code === "string" && CODIGOS_TRANSPORTE.has(code)) return "transporte";
  return null;
}

const MENSAJE_SIESA_NO_DISPONIBLE =
  "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.";
const MENSAJE_SIESA_LENTO = "Siesa tardó demasiado en responder. Intenta de nuevo más tarde.";

/**
 * Respuesta HTTP uniforme (502) para un error de Siesa, o null si el error no
 * está marcado como originado en Siesa (aunque su código sea de red). El mensaje es fijo: nunca incluye host, usuario ni el texto
 * original del driver. Usado por el manejador global de errores.
 */
export function respuestaErrorSiesa(error: unknown): { status: 502; message: string } | null {
  if (!esErrorSiesa(error)) return null;
  const causa = clasificarErrorSiesa(error);
  if (!causa) return null;
  return {
    status: 502,
    message: causa === "timeout_consulta" ? MENSAJE_SIESA_LENTO : MENSAJE_SIESA_NO_DISPONIBLE,
  };
}
