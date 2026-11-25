import fs from "fs";

/**
 * Configuración del adaptador CrossChex, leída de variables de entorno
 * (mismo patrón que server/src/config/siesa.ts): nada de rutas ni
 * credenciales hardcodeadas en el código.
 */
export interface CrossChexConfig {
  /** Ruta absoluta al .mdb de CrossChex. En dev conocido:
   * C:\Program Files (x86)\Anviz\CrossChex Standard\DB\CrossChex.mdb */
  mdbPath: string;
  /** Nombre exacto del driver ODBC instalado en el servidor Windows. */
  driverName: string;
  /** Segundos que se esperan al abrir la conexión antes de abortar. */
  connectTimeoutSeconds: number;
  /** Milisegundos que se esperan una consulta antes de abortar. */
  queryTimeoutMs: number;
}

const DEFAULT_DRIVER_NAME = "Microsoft Access Driver (*.mdb, *.accdb)";
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 15;
const DEFAULT_QUERY_TIMEOUT_MS = 30_000;

export class CrossChexConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossChexConfigError";
  }
}

/**
 * Lee y valida la configuración desde el entorno. No verifica que el driver
 * ODBC esté instalado (eso solo se sabe al intentar conectar) pero sí que la
 * ruta configurada exista en disco — fallar aquí, con un mensaje claro, es
 * preferible a que el error aparezca más tarde como un [odbc] genérico.
 */
export function leerConfigCrossChex(): CrossChexConfig {
  const mdbPath = process.env.CROSSCHEX_MDB_PATH;
  if (!mdbPath) {
    throw new CrossChexConfigError(
      "Falta CROSSCHEX_MDB_PATH en server/.env. Debe apuntar al archivo " +
        "CrossChex.mdb (p. ej. C:\\Program Files (x86)\\Anviz\\CrossChex Standard\\DB\\CrossChex.mdb).",
    );
  }

  if (!fs.existsSync(mdbPath)) {
    throw new CrossChexConfigError(
      `CROSSCHEX_MDB_PATH apunta a un archivo que no existe: "${mdbPath}". ` +
        "Verifica que CrossChex esté instalado en este servidor y que la ruta sea correcta.",
    );
  }

  const driverName = process.env.CROSSCHEX_ODBC_DRIVER || DEFAULT_DRIVER_NAME;

  const connectTimeoutSeconds = process.env.CROSSCHEX_CONNECT_TIMEOUT_SECONDS
    ? Number(process.env.CROSSCHEX_CONNECT_TIMEOUT_SECONDS)
    : DEFAULT_CONNECT_TIMEOUT_SECONDS;
  if (!Number.isFinite(connectTimeoutSeconds) || connectTimeoutSeconds <= 0) {
    throw new CrossChexConfigError(
      "CROSSCHEX_CONNECT_TIMEOUT_SECONDS debe ser un número positivo.",
    );
  }

  const queryTimeoutMs = process.env.CROSSCHEX_QUERY_TIMEOUT_MS
    ? Number(process.env.CROSSCHEX_QUERY_TIMEOUT_MS)
    : DEFAULT_QUERY_TIMEOUT_MS;
  if (!Number.isFinite(queryTimeoutMs) || queryTimeoutMs <= 0) {
    throw new CrossChexConfigError("CROSSCHEX_QUERY_TIMEOUT_MS debe ser un número positivo.");
  }

  return { mdbPath, driverName, connectTimeoutSeconds, queryTimeoutMs };
}

/** Construye la cadena de conexión ODBC a partir de la config ya validada. */
export function construirConnectionString(config: CrossChexConfig): string {
  return `Driver={${config.driverName}};Dbq=${config.mdbPath};ConnectTimeout=${config.connectTimeoutSeconds};`;
}

/**
 * Propietario EXPLÍCITO del CrossChex.mdb (decisión D-01, 2026-11-20). Hay un
 * solo .mdb por instalación y RicoSoft no puede deducir a qué empresa pertenece:
 * el tenant dueño se declara en el servidor con CROSSCHEX_TENANT_PROPIETARIO_ID
 * (id del Tenant). Nunca se toma del cliente ni se asume por ser la única fuente
 * activa o por tener el permiso `biometrico.configurar`.
 *
 * Devuelve null si no está configurado: en ese caso la sincronización (job,
 * manual y CLI de importación), el dry-run, los nombres de usuarios que ve un
 * tenant y el script de diagnóstico scripts/explore-crosschex.ts (SEG-01, que
 * además exige que el id sea un Tenant existente) fallan cerrados.
 */
export function leerTenantPropietarioCrossChex(): string | null {
  const valor = process.env.CROSSCHEX_TENANT_PROPIETARIO_ID?.trim();
  return valor ? valor : null;
}

/** true solo si hay propietario configurado y coincide con `tenantId`. */
export function esTenantPropietarioCrossChex(tenantId: string): boolean {
  const propietario = leerTenantPropietarioCrossChex();
  return propietario !== null && propietario.toLowerCase() === tenantId.toLowerCase();
}
