import { prisma } from "../../config/prisma";
import { obtenerUsuarios } from "../../integrations/crosschex";

/**
 * Usuarios registrados EN EL BIOMÉTRICO (CrossChex `Userinfo`), no empleados de
 * RicoSoft. RicoSoft no guarda una copia de ellos: la marcación solo conserva el
 * `userid`, así que el nombre se lee del `.mdb` y se cachea unos minutos para no
 * abrir una conexión ODBC en cada listado.
 *
 * Aislamiento: el `.mdb` es único por instalación y pertenece al tenant dueño de
 * la fuente activa, así que solo se devuelven nombres a un tenant que tenga una
 * fuente biométrica ACTIVA; cualquier otro recibe un mapa vacío. Nunca se lee la
 * contraseña (`Pwd`): la consulta enumera columnas.
 *
 * Tolerante a fallos: si el `.mdb` no está disponible (ruta, driver, bloqueo) se
 * devuelve lo último cacheado o vacío; los listados siguen funcionando, solo sin
 * nombres.
 */

export interface UsuarioBiometrico {
  userid: string;
  codigo: string | null;
  nombre: string | null;
}

export interface UsuariosBiometrico {
  /** Indexados por `userid` tal como viene en Checkinout. */
  mapa: Map<string, UsuarioBiometrico>;
  /** false si la fuente no está activa o el `.mdb` no se pudo leer. */
  disponible: boolean;
  /** true si se alcanzó el tope de lectura y podrían faltar usuarios. */
  incompleto: boolean;
}

const TTL_MS = 5 * 60_000;
/** Tope de `obtenerUsuarios`; si se alcanza, el resultado se marca incompleto. */
export const MAX_USUARIOS_BIOMETRICO = 1000;

let cache: { en: number; datos: UsuariosBiometrico } | null = null;

/** Solo para pruebas. */
export function _limpiarCacheUsuariosBiometrico(): void {
  cache = null;
}

const VACIO: UsuariosBiometrico = { mapa: new Map(), disponible: false, incompleto: false };

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  return t.length > 0 ? t : null;
}

export async function usuariosDelBiometrico(tenantId: string): Promise<UsuariosBiometrico> {
  const fuentesActivas = await prisma.fuenteBiometrica.count({ where: { tenantId, activa: true } });
  if (fuentesActivas === 0) return VACIO;

  if (cache && Date.now() - cache.en < TTL_MS) return cache.datos;

  try {
    const filas = await obtenerUsuarios(MAX_USUARIOS_BIOMETRICO);
    const mapa = new Map<string, UsuarioBiometrico>();
    for (const fila of filas) {
      const userid = texto(fila.userid);
      if (!userid) continue;
      mapa.set(userid, { userid, codigo: texto(fila.UserCode), nombre: texto(fila.Name) });
    }
    const datos: UsuariosBiometrico = {
      mapa,
      disponible: true,
      incompleto: filas.length >= MAX_USUARIOS_BIOMETRICO,
    };
    cache = { en: Date.now(), datos };
    return datos;
  } catch (error) {
    console.error(
      "[biometrico] No se pudieron leer los usuarios del biométrico:",
      error instanceof Error ? error.message.split(/\r?\n/)[0] : "error desconocido",
    );
    return cache ? { ...cache.datos, disponible: false } : VACIO;
  }
}
