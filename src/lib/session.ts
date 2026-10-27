import { fetchApi, fetchApiUpload, fetchApiBlob } from "@/config/api";

export interface SessionUser {
  id: string;
  tenantId: string;
  tenantNombre: string;
  nombre: string;
  /** null/ausentes en cuentas antiguas aún sin completar (nombre sigue siendo el nombre completo). */
  nombres?: string | null;
  apellidos?: string | null;
  email: string;
  telefono: string | null;
  rol: string | null;
  isSuperadmin: boolean;
  activo: boolean;
  permisos: string[];
}

const TOKEN_KEY = "token";
const USER_KEY = "user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Reemplaza el token de sesión (login, o al cambiar la contraseña propia:
 * el backend invalida el token anterior e incluye uno nuevo en la respuesta
 * para que la sesión actual siga viva sin tener que volver a iniciar sesión).
 */
export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Lee de forma síncrona el último usuario conocido (cacheado en localStorage
 * tras fetchCurrentUser). Pensado para guards de ruta (beforeLoad), que
 * corren antes de montar React y no pueden esperar una petición async.
 * No es la fuente de verdad de permisos: el backend revalida cada endpoint
 * de todas formas, esto solo evita que el layout de administración se
 * renderice para alguien sin el permiso correspondiente.
 */
export function getCachedUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

const ULTIMA_EMPRESA_KEY = "ultima_empresa_tenant_id";

/**
 * Recuerda la última empresa con la que el usuario trabajó, SOLO como
 * comodidad de UX (preseleccionarla en el selector de login). Nunca se usa
 * para decidir acceso: cada login/cambio de empresa revalida contra el
 * backend igual, y si el usuario ya no tiene acceso a esta empresa, la
 * preferencia simplemente se ignora (no aparecerá en la lista real que
 * manda el servidor).
 */
export function setUltimaEmpresaPreferida(tenantId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ULTIMA_EMPRESA_KEY, tenantId);
}

export function getUltimaEmpresaPreferida(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ULTIMA_EMPRESA_KEY);
}

/**
 * Pide al backend la sesión actual a partir del token guardado. Es la única
 * fuente de verdad del usuario autenticado: nunca se confía en datos de
 * localStorage para decidir permisos, solo se usan para hidratar la UI
 * mientras llega la respuesta real del servidor.
 */
export async function fetchCurrentUser(): Promise<SessionUser | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const data = await fetchApi("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (data.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    return (data.user as SessionUser) ?? null;
  } catch {
    clearSession();
    return null;
  }
}

/**
 * Wrapper de fetchApi que adjunta el Bearer token de la sesión activa.
 * Úsalo para cualquier llamada a un endpoint protegido del backend.
 */
export async function fetchAuth(endpoint: string, options: RequestInit = {}, timeoutMs?: number) {
  const token = getToken();
  return fetchApi(
    endpoint,
    {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    },
    timeoutMs,
  );
}

/**
 * Wrapper de fetchApiUpload que adjunta el Bearer token, para subir
 * archivos (multipart/form-data) a endpoints protegidos.
 */
export async function fetchAuthUpload(endpoint: string, formData: FormData, timeoutMs?: number) {
  const token = getToken();
  return fetchApiUpload(
    endpoint,
    formData,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    timeoutMs,
  );
}

/**
 * Wrapper de fetchApiBlob que adjunta el Bearer token, para descargar
 * archivos binarios (PDF/imágenes) de endpoints protegidos.
 */
export async function fetchAuthBlob(endpoint: string, timeoutMs?: number): Promise<Blob> {
  const token = getToken();
  return fetchApiBlob(
    endpoint,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    timeoutMs,
  );
}

export function hasPermission(user: SessionUser | null, permiso: string): boolean {
  if (!user || !user.activo) return false;
  return user.isSuperadmin || user.permisos.includes(permiso);
}

export function canAccessAdmin(user: SessionUser | null): boolean {
  if (!user || !user.activo) return false;
  return (
    user.isSuperadmin ||
    hasPermission(user, "configuracion.ver") ||
    hasPermission(user, "usuarios.ver")
  );
}
