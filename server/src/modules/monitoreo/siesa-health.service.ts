import dns from "dns";
import net from "net";
import os from "os";
import { leerConfigSiesa, sql } from "../../config/siesa";

/**
 * Sonda de salud de Siesa y de la VPN que lo separa de RicoSoft. Es SOLO
 * lectura y liviana: una conexión TCP, un `SELECT 1` y un `SELECT TOP (1)`
 * por cada tabla de Siesa que la app realmente usa.
 *
 * La VPN es infraestructura (OpenVPN en el servidor): aquí solo se OBSERVA su
 * efecto — la interfaz de túnel visible para el sistema operativo, que el
 * nombre del servidor resuelva y que el puerto responda. No se abre, cierra ni
 * reconecta ningún túnel, ni se ejecutan procesos del sistema.
 *
 * Nada que salga de aquí incluye credenciales, cadenas de conexión, nombre de
 * base de datos ni el texto crudo de un error del driver: los fallos se
 * traducen a mensajes fijos por código (ver mensajeSeguro).
 */

export type EstadoComprobacion = "OK" | "FALLO" | "DESCONOCIDO" | "OMITIDO" | "NO_CONFIGURADO";

export interface Comprobacion {
  estado: EstadoComprobacion;
  latenciaMs: number | null;
  mensaje: string | null;
}

export type EstadoGeneralSiesa = "OPERATIVO" | "DEGRADADO" | "CAIDO" | "NO_CONFIGURADO";

export interface ReporteSiesa {
  comprobadoEn: string;
  duracionTotalMs: number;
  estadoGeneral: EstadoGeneralSiesa;
  configuracion: {
    configurada: boolean;
    host: string | null;
    puerto: number | null;
    variablesFaltantes: string[];
  };
  /** Conexión TCP al puerto de SQL Server. */
  conectividad: Comprobacion;
  /** Login + `SELECT 1`. */
  sql: Comprobacion;
  /** `SELECT TOP (1)` de cada tabla usada por la aplicación. */
  vistas: (Comprobacion & { nombre: string })[];
  vpn: {
    interfazTunel: Comprobacion & { interfaces: string[] };
    rutaSiesa: Comprobacion & { direccion: string | null };
    conectividadSql: Comprobacion;
  };
}

/** Tablas de Siesa que consulta RicoSoft (ver services de integraciones-siesa). */
export const VISTAS_SIESA_MONITOREADAS = [
  "t200_mm_terceros",
  "t120_mc_items",
  "t461_cm_docto_factura_venta",
  "t430_cm_pv_docto",
] as const;

export const TIMEOUTS_SIESA_MS = { dns: 3_000, tcp: 5_000, conexionSql: 8_000, consulta: 5_000 };

const VARIABLES_REQUERIDAS = [
  "SIESA_DB_HOST",
  "SIESA_DB_NAME",
  "SIESA_DB_USER",
  "SIESA_DB_PASSWORD",
] as const;

export interface ResultadoConsulta {
  ok: boolean;
  latenciaMs: number;
  /** Código de error del driver (ELOGIN, ETIMEOUT, número SQL…), nunca el texto. */
  codigoError?: string;
}

export interface DependenciasSonda {
  env: NodeJS.ProcessEnv;
  ahoraMs: () => number;
  resolverDns: (host: string, timeoutMs: number) => Promise<string>;
  probarTcp: (host: string, puerto: number, timeoutMs: number) => Promise<void>;
  /**
   * Abre UNA conexión, ejecuta las consultas en orden y la cierra. Lanza si no
   * puede conectar/autenticar; devuelve un resultado por consulta si conectó.
   */
  ejecutarConsultas: (consultas: string[]) => Promise<ResultadoConsulta[]>;
  interfacesDeRed: () => string[];
}

/** Traduce un error a un mensaje fijo y seguro según su código. */
export function mensajeSeguro(error: unknown): string {
  const e = (error ?? {}) as { code?: unknown; number?: unknown; name?: unknown };
  const codigo = typeof e.code === "string" ? e.code : "";
  switch (codigo) {
    case "ETIMEOUT":
    case "ETIMEDOUT":
    case "ESOCKETTIMEDOUT":
      return "Tiempo de espera agotado.";
    case "ECONNREFUSED":
      return "Conexión rechazada por el servidor.";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "No se pudo resolver el nombre del servidor.";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "Servidor inalcanzable (¿túnel VPN caído?).";
    case "ELOGIN":
      return "El servidor rechazó la autenticación.";
    case "ESOCKET":
    case "ECONNRESET":
    case "ECONNCLOSED":
      return "Error de red al conectar con el servidor.";
    case "EREQUEST":
      return "El servidor rechazó la consulta (¿la tabla existe y hay permiso?).";
    default:
      break;
  }
  if (typeof e.number === "number") return "El servidor rechazó la consulta.";
  return "No se pudo completar la comprobación.";
}

function codigoDe(error: unknown): string | undefined {
  const e = (error ?? {}) as { code?: unknown; number?: unknown };
  if (typeof e.code === "string") return e.code;
  if (typeof e.number === "number") return "EREQUEST";
  return undefined;
}

const NOMBRES_INTERFAZ_TUNEL = /^(tun|tap|ppp|wg|utun)\d*$|openvpn|tap-windows|wintun|wireguard/i;

/** Nombres de interfaz que parecen un túnel VPN (heurística por nombre). */
export function detectarInterfacesTunel(nombres: string[]): string[] {
  return nombres.filter((n) => NOMBRES_INTERFAZ_TUNEL.test(n));
}

/** El túnel es "observable" solo por nombre: sin coincidencia no se concluye que esté caído. */
function comprobarInterfazTunel(nombres: string[]): Comprobacion & { interfaces: string[] } {
  const interfaces = detectarInterfacesTunel(nombres);
  return interfaces.length > 0
    ? { estado: "OK", latenciaMs: null, mensaje: null, interfaces }
    : {
        estado: "DESCONOCIDO",
        latenciaMs: null,
        mensaje:
          "No se detectó una interfaz de túnel por nombre. No es concluyente: el adaptador puede tener otro nombre; la conectividad al servidor Siesa es la señal definitiva.",
        interfaces: [],
      };
}

async function medir<T>(
  deps: DependenciasSonda,
  accion: () => Promise<T>,
): Promise<{ valor?: T; error?: unknown; ms: number }> {
  const inicio = deps.ahoraMs();
  try {
    const valor = await accion();
    return { valor, ms: deps.ahoraMs() - inicio };
  } catch (error) {
    return { error, ms: deps.ahoraMs() - inicio };
  }
}

const omitido = (mensaje: string): Comprobacion => ({
  estado: "OMITIDO",
  latenciaMs: null,
  mensaje,
});

export async function comprobarSiesa(deps: DependenciasSonda): Promise<ReporteSiesa> {
  const inicio = deps.ahoraMs();
  const faltantes = VARIABLES_REQUERIDAS.filter((v) => !deps.env[v]);
  const host = deps.env.SIESA_DB_HOST ?? null;
  const puertoCrudo = Number(deps.env.SIESA_DB_PORT ?? 1433);
  const puerto = Number.isInteger(puertoCrudo) && puertoCrudo > 0 ? puertoCrudo : 1433;
  const interfazTunel = comprobarInterfazTunel(deps.interfacesDeRed());

  if (faltantes.length > 0 || !host) {
    const noConfigurado: Comprobacion = {
      estado: "NO_CONFIGURADO",
      latenciaMs: null,
      mensaje: "Faltan variables de conexión a Siesa en el servidor.",
    };
    return {
      comprobadoEn: new Date().toISOString(),
      duracionTotalMs: deps.ahoraMs() - inicio,
      estadoGeneral: "NO_CONFIGURADO",
      configuracion: {
        configurada: false,
        host: null,
        puerto: null,
        variablesFaltantes: [...faltantes],
      },
      conectividad: noConfigurado,
      sql: noConfigurado,
      vistas: VISTAS_SIESA_MONITOREADAS.map((nombre) => ({ nombre, ...noConfigurado })),
      vpn: {
        interfazTunel,
        rutaSiesa: { ...noConfigurado, direccion: null },
        conectividadSql: noConfigurado,
      },
    };
  }

  // 1) Ruta: el nombre del servidor debe resolver (dentro de la VPN, el DNS interno).
  const dnsMedido = await medir(deps, () => deps.resolverDns(host, TIMEOUTS_SIESA_MS.dns));
  const direccion = dnsMedido.error === undefined ? (dnsMedido.valor ?? null) : null;
  const rutaSiesa: Comprobacion & { direccion: string | null } =
    dnsMedido.error === undefined
      ? { estado: "OK", latenciaMs: dnsMedido.ms, mensaje: null, direccion }
      : {
          estado: "FALLO",
          latenciaMs: dnsMedido.ms,
          mensaje: mensajeSeguro(dnsMedido.error),
          direccion: null,
        };

  // 2) TCP al puerto de SQL Server.
  let conectividad: Comprobacion;
  if (rutaSiesa.estado === "FALLO") {
    conectividad = omitido("No se probó: el nombre del servidor no resuelve.");
  } else {
    const tcp = await medir(deps, () => deps.probarTcp(host, puerto, TIMEOUTS_SIESA_MS.tcp));
    conectividad =
      tcp.error === undefined
        ? { estado: "OK", latenciaMs: tcp.ms, mensaje: null }
        : { estado: "FALLO", latenciaMs: tcp.ms, mensaje: mensajeSeguro(tcp.error) };
  }

  // 3) SQL (SELECT 1) y las tablas usadas — una sola conexión.
  let sqlComprobacion: Comprobacion;
  let vistas: (Comprobacion & { nombre: string })[];
  if (conectividad.estado !== "OK") {
    sqlComprobacion = omitido("No se probó: sin conectividad al servidor.");
    vistas = VISTAS_SIESA_MONITOREADAS.map((nombre) => ({
      nombre,
      ...omitido("No se probó: sin conectividad al servidor."),
    }));
  } else {
    const consultas = [
      "SELECT 1 AS ok",
      ...VISTAS_SIESA_MONITOREADAS.map((n) => `SELECT TOP (1) 1 AS ok FROM ${n} WITH (NOLOCK)`),
    ];
    const ejecucion = await medir(deps, () => deps.ejecutarConsultas(consultas));
    if (ejecucion.error !== undefined || !ejecucion.valor) {
      const mensaje = mensajeSeguro(ejecucion.error);
      sqlComprobacion = { estado: "FALLO", latenciaMs: ejecucion.ms, mensaje };
      vistas = VISTAS_SIESA_MONITOREADAS.map((nombre) => ({
        nombre,
        ...omitido("No se probó: falló la conexión SQL."),
      }));
    } else {
      const [selectUno, ...porVista] = ejecucion.valor;
      const aComprobacion = (r: ResultadoConsulta | undefined): Comprobacion =>
        r?.ok
          ? { estado: "OK", latenciaMs: r.latenciaMs, mensaje: null }
          : {
              estado: "FALLO",
              latenciaMs: r?.latenciaMs ?? null,
              mensaje: mensajeSeguro({ code: r?.codigoError }),
            };
      sqlComprobacion = aComprobacion(selectUno);
      vistas = VISTAS_SIESA_MONITOREADAS.map((nombre, i) => ({
        nombre,
        ...aComprobacion(porVista[i]),
      }));
    }
  }

  const estadoGeneral: EstadoGeneralSiesa =
    conectividad.estado !== "OK" || sqlComprobacion.estado !== "OK"
      ? "CAIDO"
      : vistas.some((v) => v.estado !== "OK")
        ? "DEGRADADO"
        : "OPERATIVO";

  return {
    comprobadoEn: new Date().toISOString(),
    duracionTotalMs: deps.ahoraMs() - inicio,
    estadoGeneral,
    configuracion: { configurada: true, host, puerto, variablesFaltantes: [] },
    conectividad,
    sql: sqlComprobacion,
    vistas,
    vpn: { interfazTunel, rutaSiesa, conectividadSql: sqlComprobacion },
  };
}

// ── Dependencias reales ──────────────────────────────────────────────────────

function conTimeout<T>(promesa: Promise<T>, ms: number, codigo = "ETIMEOUT"): Promise<T> {
  let temporizador: NodeJS.Timeout;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(Object.assign(new Error("timeout"), { code: codigo })),
      ms,
    );
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

export const dependenciasReales: DependenciasSonda = {
  env: process.env,
  ahoraMs: () => Date.now(),
  resolverDns: (host, timeoutMs) =>
    conTimeout(
      new Promise<string>((resolver, rechazar) => {
        dns.lookup(host, (error, direccion) => (error ? rechazar(error) : resolver(direccion)));
      }),
      timeoutMs,
    ),
  probarTcp: (host, puerto, timeoutMs) =>
    new Promise<void>((resolver, rechazar) => {
      const socket = net.createConnection({ host, port: puerto });
      const terminar = (error?: Error & { code?: string }) => {
        socket.destroy();
        if (error) rechazar(error);
        else resolver();
      };
      socket.setTimeout(timeoutMs, () =>
        terminar(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })),
      );
      socket.once("connect", () => terminar());
      socket.once("error", (error) => terminar(error));
    }),
  ejecutarConsultas: async (consultas) => {
    const pool = new sql.ConnectionPool({
      ...leerConfigSiesa(),
      connectionTimeout: TIMEOUTS_SIESA_MS.conexionSql,
      requestTimeout: TIMEOUTS_SIESA_MS.consulta,
      pool: { max: 1, min: 0, idleTimeoutMillis: 1_000 },
    });
    try {
      await pool.connect();
      const resultados: ResultadoConsulta[] = [];
      for (const consulta of consultas) {
        const inicio = Date.now();
        try {
          await pool.request().query(consulta);
          resultados.push({ ok: true, latenciaMs: Date.now() - inicio });
        } catch (error) {
          resultados.push({
            ok: false,
            latenciaMs: Date.now() - inicio,
            codigoError: codigoDe(error),
          });
        }
      }
      return resultados;
    } finally {
      await pool.close().catch(() => undefined);
    }
  },
  interfacesDeRed: () => Object.keys(os.networkInterfaces()),
};

// ── Caché corta + deduplicación ──────────────────────────────────────────────
// Varias personas mirando la pantalla no deben multiplicar las consultas a una
// base de producción: se reutiliza el último resultado unos segundos y las
// peticiones simultáneas comparten una sola comprobación.

const TTL_REPORTE_MS = 10_000;
let ultimo: { en: number; reporte: ReporteSiesa } | null = null;
let enVuelo: Promise<ReporteSiesa> | null = null;

export async function obtenerReporteSiesa(
  opciones: { forzar?: boolean } = {},
  deps: DependenciasSonda = dependenciasReales,
): Promise<{ reporte: ReporteSiesa; desdeCache: boolean }> {
  if (!opciones.forzar && ultimo && deps.ahoraMs() - ultimo.en < TTL_REPORTE_MS) {
    return { reporte: ultimo.reporte, desdeCache: true };
  }
  if (!enVuelo) {
    enVuelo = comprobarSiesa(deps)
      .then((reporte) => {
        ultimo = { en: deps.ahoraMs(), reporte };
        return reporte;
      })
      .finally(() => {
        enVuelo = null;
      });
  }
  return { reporte: await enVuelo, desdeCache: false };
}

/** Solo para tests. */
export function reiniciarCacheSiesa(): void {
  ultimo = null;
  enVuelo = null;
}
