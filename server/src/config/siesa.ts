import sql from "mssql";

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

function leerConfigSiesa(): sql.config {
  const { SIESA_DB_HOST, SIESA_DB_PORT, SIESA_DB_NAME, SIESA_DB_USER, SIESA_DB_PASSWORD } = process.env;

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
    requestTimeout: 60000,
  };
}

/** Devuelve el pool de conexión a Siesa, reutilizándolo entre llamadas. */
export async function getSiesaPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  if (poolConectando) return poolConectando;

  poolConectando = new sql.ConnectionPool(leerConfigSiesa())
    .connect()
    .then((conectado) => {
      pool = conectado;
      return conectado;
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
  if (pool?.connected) {
    await pool.close();
    pool = null;
  }
}

export { sql };
