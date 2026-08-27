import sql from "mssql";

/**
 * Crea (si no existe) la base de datos SQL Server efímera usada por la suite
 * de integración de CI (ver vitest.integration.config.mts). Se ejecuta como
 * paso previo a `prisma migrate deploy` en el job "backend-integration" de
 * ci.yml — Prisma no crea la base de datos de destino por sí solo con el
 * provider sqlserver, y DATABASE_URL ya apunta a una base que en este punto
 * todavía no existe, así que hay que conectarse primero a `master`.
 *
 * Reintenta la conexión varias veces en vez de fallar al primer intento: el
 * contenedor de SQL Server en un runner de GitHub Actions suele tardar
 * 15-30s en aceptar conexiones tras arrancar, y depender del health-check
 * propio del contenedor (cuya ruta de sqlcmd varía entre versiones de la
 * imagen) es más frágil que reintentar aquí directamente.
 */
async function conectarConReintentos(config: sql.config, intentos = 20, esperaMs = 3000): Promise<sql.ConnectionPool> {
  let ultimoError: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await new sql.ConnectionPool(config).connect();
    } catch (err) {
      ultimoError = err;
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
  throw new Error(`No fue posible conectar a SQL Server tras ${intentos} intentos: ${ultimoError}`);
}

async function main() {
  const server = process.env.MSSQL_HOST ?? "localhost";
  const port = Number(process.env.MSSQL_PORT ?? 1433);
  const user = process.env.MSSQL_SA_USER ?? "sa";
  const password = process.env.MSSQL_SA_PASSWORD;
  const database = process.env.MSSQL_INTEGRATION_DB ?? "ricosoft_integration";

  if (!password) {
    throw new Error("Falta MSSQL_SA_PASSWORD para conectarse al SQL Server efímero de CI.");
  }
  // El nombre de la base viene de una variable de entorno controlada por el
  // propio workflow de CI (nunca de input externo), no de una petición HTTP:
  // mismo nivel de confianza que el resto de scripts CLI de este proyecto.
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Nombre de base de datos de integración inválido: "${database}".`);
  }

  console.log(`Conectando a SQL Server en ${server}:${port}...`);
  const pool = await conectarConReintentos({
    server,
    port,
    user,
    password,
    database: "master",
    options: { encrypt: true, trustServerCertificate: true },
  });

  try {
    await pool.request().query(`IF DB_ID(N'${database}') IS NULL CREATE DATABASE [${database}];`);
    console.log(`Base de datos "${database}" lista.`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error("Error preparando la base de datos de integración:", err);
  process.exit(1);
});
