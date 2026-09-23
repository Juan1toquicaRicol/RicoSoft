import sql from "mssql";
import { clasificarErrorSiesa, marcarErrorSiesa } from "../lib/siesa-errores";

// Conexión de solo lectura a la base transaccional de Siesa (UnoEE), separada
// del DATABASE_URL interno de Prisma. Vive detrás del túnel OpenVPN, así que
// esta conexión solo puede establecerse desde una máquina/servidor con el
// túnel activo hacia db06.siesacloud.local.
let pool: sql.ConnectionPool | null = null;
// M-05 (hardening 2026-09-02): sin esto, dos llamadas a getSiesaPool()
// mientras la primera conexión todavía está en curso (pool no nulo pero
// tampoco conectado todavía) veían ambas `pool?.connected` como falso y
// cada una abría su propio ConnectionPool — la segunda quedaba huérfana
// (nunca se cierra, nunca se reutiliza). Memoiza la PROMESA de conexión en
// vuelo: la primera llamada la crea, las siguientes esperan la misma.
let poolConectando: Promise<sql.ConnectionPool> | null = null;

export function leerConfigSiesa(): sql.config {
  const { SIESA_DB_HOST, SIESA_DB_PORT, SIESA_DB_NAME, SIESA_DB_USER, SIESA_DB_PASSWORD } =
    process.env;

  if (!SIESA_DB_HOST || !SIESA_DB_NAME || !SIESA_DB_USER || !SIESA_DB_PASSWORD) {
    throw new Error(
      "Faltan variables SIESA_DB_* en server/.env. Configura SIESA_DB_HOST, SIESA_DB_PORT, " +
        "SIESA_DB_NAME, SIESA_DB_USER y SIESA_DB_PASSWORD antes de sincronizar con Siesa.",
    );
  }

  return {
    server: SIESA_DB_HOST,
    port: Number(SIESA_DB_PORT ?? 1433),
    database: SIESA_DB_NAME,
    user: SIESA_DB_USER,
    password: SIESA_DB_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: true, // certificado interno de Siesa Cloud, no público
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    // Timeout de CONEXIÓN (establecer el socket/login) separado del de
    // CONSULTA: sin un tope explícito, una VPN caída deja getSiesaPool()
    // esperando el default de mssql (15 s) sin que sea una decisión nuestra.
    connectionTimeout: 15000,
    requestTimeout: 60000,
  };
}

/**
 * Descarta el pool para que la SIGUIENTE petición reconecte. Si se pasa
 * `candidato` y ya no es el pool vigente (otro fallo antes ya lo reemplazó),
 * no hace nada: un error tardío de un pool viejo no debe matar al nuevo.
 */
export function invalidarSiesaPool(candidato?: sql.ConnectionPool): void {
  if (candidato && pool !== candidato) return;
  const viejo = pool;
  pool = null;
  if (viejo) {
    // Cierre best-effort: el socket ya puede estar destruido.
    Promise.resolve()
      .then(() => viejo.close())
      .catch(() => undefined);
  }
}

/**
 * Engancha la invalidación al pool recién conectado:
 *  - 'error' del pool (socket caído entre consultas). Sin listener, un
 *    'error' de un EventEmitter tumba el proceso.
 *  - cualquier query/batch/execute que falle por transporte o timeout de
 *    conexión invalida el pool y relanza el MISMO error (los llamadores
 *    conservan su manejo actual). Un timeout de consulta NO invalida.
 * Se hace aquí y no en cada servicio porque todos los siesa-*.service.ts
 * consumen el pool directamente con pool.request().
 */
function instrumentarPool(conectado: sql.ConnectionPool): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = conectado as any;
  if (typeof p.on === "function") {
    p.on("error", (error: unknown) => {
      console.error("Error de transporte en el pool de Siesa:", clasificarErrorSiesa(error));
      invalidarSiesaPool(conectado);
    });
  }
  if (typeof p.request !== "function") return;
  const requestOriginal = p.request.bind(p);
  p.request = (...args: unknown[]) => {
    const req = requestOriginal(...args);
    for (const metodo of ["query", "batch", "execute"]) {
      const original = req[metodo];
      if (typeof original !== "function") continue;
      req[metodo] = (...a: unknown[]) => {
        const resultado = original.apply(req, a);
        if (!resultado || typeof resultado.catch !== "function") return resultado;
        return resultado.catch((error: unknown) => {
          marcarErrorSiesa(error);
          const causa = clasificarErrorSiesa(error);
          if (causa === "transporte" || causa === "timeout_conexion") {
            invalidarSiesaPool(conectado);
          }
          throw error;
        });
      };
    }
    return req;
  };
}

/** Devuelve el pool de conexión a Siesa, reutilizándolo entre llamadas. */
export async function getSiesaPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  // Pool existente pero ya no conectado (socket destruido): se descarta en
  // vez de quedar como estado degradado permanente.
  if (pool) invalidarSiesaPool(pool);
  if (poolConectando) return poolConectando;

  poolConectando = new sql.ConnectionPool(leerConfigSiesa())
    .connect()
    .then((conectado) => {
      pool = conectado;
      instrumentarPool(conectado);
      return conectado;
    })
    .catch((error: unknown) => {
      throw marcarErrorSiesa(error);
    })
    .finally(() => {
      // Se limpia siempre (éxito o error) para que una conexión fallida no
      // deje a todas las llamadas futuras esperando para siempre la misma
      // promesa rechazada — la siguiente llamada reintenta desde cero.
      poolConectando = null;
    });

  return poolConectando;
}

export async function cerrarSiesaPool(): Promise<void> {
  const actual = pool;
  pool = null;
  if (actual?.connected) await actual.close();
}

export { sql };
export { clasificarErrorSiesa, respuestaErrorSiesa, marcarErrorSiesa, esErrorSiesa } from "../lib/siesa-errores";
export type { CausaFalloSiesa } from "../lib/siesa-errores";
