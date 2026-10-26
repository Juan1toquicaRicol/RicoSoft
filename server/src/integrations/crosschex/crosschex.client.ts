import odbc, { type Connection } from "odbc";
import {
  construirConnectionString,
  leerConfigCrossChex,
  type CrossChexConfig,
} from "./crosschex.config";
import {
  CrossChexQueryError,
  CrossChexTimeoutError,
  traducirErrorConexion,
} from "./crosschex.errors";

/**
 * Cliente ODBC de bajo nivel para CrossChex.mdb. Solo este archivo (y
 * crosschex.queries.ts, que lo usa) conocen `odbc` y la cadena de conexión.
 * Nada fuera de esta carpeta debe importar el paquete `odbc` directamente.
 *
 * Estrategia de conexión: abrir una conexión corta por operación y cerrarla
 * siempre en `finally`, en vez de mantener un pool persistente. CrossChex
 * (la app de escritorio) sigue escribiendo sobre el mismo .mdb todo el
 * tiempo; una conexión ODBC de solo lectura que se abre y cierra rápido
 * minimiza el riesgo de contribuir a un bloqueo de archivo Jet/ACE.
 */

function withTimeout<T>(promise: Promise<T>, ms: number, mensaje: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CrossChexTimeoutError(mensaje)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function abrirConexion(config: CrossChexConfig): Promise<Connection> {
  const connectionString = construirConnectionString(config);
  try {
    return await withTimeout(
      odbc.connect(connectionString),
      config.connectTimeoutSeconds * 1000,
      `Tiempo de espera agotado (${config.connectTimeoutSeconds}s) abriendo conexión a CrossChex.mdb.`,
    );
  } catch (error) {
    if (error instanceof CrossChexTimeoutError) throw error;
    throw traducirErrorConexion(error);
  }
}

/**
 * Abre una conexión, ejecuta `fn` con ella, y la cierra siempre —
 * éxito o error. Es el único punto de entrada para hablar con el MDB;
 * crosschex.queries.ts nunca abre conexiones por su cuenta.
 */
export async function conCrossChex<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  const config = leerConfigCrossChex();
  const conn = await abrirConexion(config);
  try {
    return await fn(conn);
  } finally {
    try {
      await conn.close();
    } catch (closeError) {
      // No relanzar: si la consulta ya tuvo éxito o ya falló por su cuenta,
      // un error al cerrar no debe enmascarar el resultado real. Se deja
      // constancia en consola porque una conexión que no cierra bien podría
      // indicar un candado quedando abierto sobre el .mdb.
      console.error("[crosschex] Error cerrando conexión ODBC:", closeError);
    }
  }
}

/** Ejecuta una consulta de solo lectura contra CrossChex.mdb, con timeout.
 * No expone el objeto Connection: quien llama solo ve filas o un error.
 * `params` usa parámetros ODBC (?) en vez de interpolar valores en el SQL,
 * para las consultas que reciben un valor externo (p. ej. el cursor Logid). */
export async function ejecutarConsulta<T>(
  sqlText: string,
  params?: (string | number)[],
): Promise<T[]> {
  const config = leerConfigCrossChex();
  return conCrossChex(async (conn) => {
    try {
      const resultado = params
        ? await withTimeout(
            conn.query(sqlText, params),
            config.queryTimeoutMs,
            `Tiempo de espera agotado (${config.queryTimeoutMs}ms) ejecutando consulta contra CrossChex.mdb.`,
          )
        : await withTimeout(
            conn.query(sqlText),
            config.queryTimeoutMs,
            `Tiempo de espera agotado (${config.queryTimeoutMs}ms) ejecutando consulta contra CrossChex.mdb.`,
          );
      return resultado as unknown as T[];
    } catch (error) {
      if (error instanceof CrossChexTimeoutError) throw error;
      throw new CrossChexQueryError(
        `Falló la consulta contra CrossChex.mdb: ${(error as Error)?.message}`,
        error,
      );
    }
  });
}

/** Verifica que se puede abrir y cerrar una conexión, sin ejecutar ninguna
 * consulta. Útil para un healthcheck (Fase 6) sin tocar datos. */
export async function verificarConexion(): Promise<{ ok: true }> {
  await conCrossChex(async () => undefined);
  return { ok: true };
}
