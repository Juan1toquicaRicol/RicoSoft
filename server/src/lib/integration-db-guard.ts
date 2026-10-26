/**
 * Guard del runner de pruebas de integración: impide que la suite corra contra
 * una base que no sea explícitamente aprobada (p. ej. `saas_dev` o la base
 * SIESA `UnoEE_Ricol_Real`). Ver vitest.integration.global-setup.mts.
 *
 * Nunca incluye contraseñas ni la cadena de conexión completa en sus mensajes.
 */

/** Bases que NUNCA pueden ser destino de la suite de integración. */
export const BASES_PROHIBIDAS = ["saas_dev", "UnoEE_Ricol_Real"] as const;

/** Base QA aislada aprobada para ejecución local contra el servidor de pruebas. */
export const BASE_QA_APROBADA = "saas_dev_qa";

/** Base efímera del job `backend-integration` de CI (SQL Server en contenedor local). */
export const BASE_CI_EFIMERA = "ricosoft_integration";

/** Host aprobado del servidor de pruebas PC-RC-SV-PR para saas_dev_qa. */
export const HOST_QA_APROBADO = "192.168.0.234";

/** Puerto TCP de la instancia predeterminada (MSSQLSERVER) de PC-RC-SV-PR; sin nombre de instancia. */
export const PUERTO_QA_APROBADO = 1433;

/** Logins aprobados por rol: migraciones (DDL) vs. pruebas (datos). */
export const LOGIN_QA = { migrador: "saas_dev_qa_migrador", runner: "saas_dev_qa_runner" } as const;

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1"]);

export interface DestinoIntegracion {
  host: string;
  /** Puerto explícito, o 1433 si la URL no lo indica. */
  port: number;
  /** Nombre de instancia (`host\INSTANCIA`), vacío si no hay. */
  instance: string;
  database: string;
  user: string;
}

/** Extrae host/base/usuario de una URL `sqlserver://host:puerto;database=..;user=..;...`. */
export function parsearDatabaseUrl(url: string): DestinoIntegracion {
  const m = /^sqlserver:\/\/([^:;\\]+)(?:\\([^:;]+))?(?::(\d+))?;(.*)$/i.exec(url.trim());
  if (!m) {
    throw new Error(
      "DATABASE_URL no tiene el formato sqlserver://host:puerto;database=...;user=...",
    );
  }
  const pares = new Map<string, string>();
  for (const parte of m[4].split(";")) {
    const i = parte.indexOf("=");
    if (i > 0) pares.set(parte.slice(0, i).trim().toLowerCase(), parte.slice(i + 1).trim());
  }
  return {
    host: m[1].toLowerCase(),
    port: m[3] ? Number(m[3]) : 1433,
    instance: m[2] ?? "",
    database: pares.get("database") ?? pares.get("initial catalog") ?? "",
    user: pares.get("user") ?? pares.get("username") ?? pares.get("user id") ?? "",
  };
}

/** Lanza si el destino no es una base de integración aprobada. */
export function validarDestinoIntegracion(
  databaseUrl: string | undefined,
  rolQa: keyof typeof LOGIN_QA = "runner",
): DestinoIntegracion {
  if (!databaseUrl) {
    // Sin DATABASE_URL en el entorno, Prisma caería a server/.env (saas_dev).
    throw new Error(
      "Suite de integración bloqueada: DATABASE_URL no está definida en el entorno del runner. " +
        "Usa `npm run test:integration:qa` (carga server/.env.integration.qa) para apuntar a saas_dev_qa.",
    );
  }
  const destino = parsearDatabaseUrl(databaseUrl);
  const db = destino.database.toLowerCase();

  if (BASES_PROHIBIDAS.some((b) => b.toLowerCase() === db)) {
    throw new Error(
      `Suite de integración bloqueada: la base "${destino.database}" está prohibida como destino de pruebas.`,
    );
  }
  if (db === BASE_QA_APROBADA) {
    if (destino.host !== HOST_QA_APROBADO) {
      throw new Error(
        `Suite de integración bloqueada: saas_dev_qa solo se acepta en ${HOST_QA_APROBADO}, no en "${destino.host}".`,
      );
    }
    if (destino.port !== PUERTO_QA_APROBADO || destino.instance !== "") {
      throw new Error(
        `Suite de integración bloqueada: saas_dev_qa solo se acepta en el puerto ${PUERTO_QA_APROBADO} sin nombre de instancia.`,
      );
    }
    if (destino.user.toLowerCase() === "sa") {
      throw new Error(
        'Suite de integración bloqueada: no se permite el usuario "sa" contra saas_dev_qa; usa el login de mínimo privilegio.',
      );
    }
    if (destino.user.toLowerCase() !== LOGIN_QA[rolQa]) {
      throw new Error(
        `Suite de integración bloqueada: para saas_dev_qa se exige el login ${LOGIN_QA[rolQa]} en este comando.`,
      );
    }
    return destino;
  }
  if (db === BASE_CI_EFIMERA && HOSTS_LOCALES.has(destino.host)) {
    return destino;
  }
  throw new Error(
    `Suite de integración bloqueada: la base "${destino.database}" en "${destino.host}" no está aprobada. ` +
      `Aprobadas: ${BASE_QA_APROBADA} en ${HOST_QA_APROBADO}, o ${BASE_CI_EFIMERA} solo en localhost (CI).`,
  );
}

/**
 * Como validarDestinoIntegracion, pero exige que el destino sea saas_dev_qa Y que
 * el login corresponda al rol del comando: `migrador` (deploy/status) o `runner` (pruebas).
 */
export function validarDestinoQa(
  databaseUrl: string | undefined,
  rol: keyof typeof LOGIN_QA,
): DestinoIntegracion {
  const destino = validarDestinoIntegracion(databaseUrl, rol);
  if (destino.database.toLowerCase() !== BASE_QA_APROBADA) {
    throw new Error(
      `Bloqueado: este comando solo opera sobre ${BASE_QA_APROBADA}, no sobre "${destino.database}".`,
    );
  }
  if (destino.user.toLowerCase() !== LOGIN_QA[rol]) {
    throw new Error(
      `Bloqueado: para el rol "${rol}" se exige el login ${LOGIN_QA[rol]}, no "${destino.user}".`,
    );
  }
  return destino;
}
