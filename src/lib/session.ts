import { fetchApi, fetchApiUpload, fetchApiBlob } from "@/config/api";

export interface SessionUser {
  id: string;
  tenantId: string;
  nombre: string;
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

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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
export async function fetchAuth(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  return fetchApi(endpoint, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

/**
 * Wrapper de fetchApiUpload que adjunta el Bearer token, para subir
 * archivos (multipart/form-data) a endpoints protegidos.
 */
export async function fetchAuthUpload(endpoint: string, formData: FormData) {
  const token = getToken();
  return fetchApiUpload(endpoint, formData, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Wrapper de fetchApiBlob que adjunta el Bearer token, para descargar
 * archivos binarios (PDF/imágenes) de endpoints protegidos.
 */
export async function fetchAuthBlob(endpoint: string): Promise<Blob> {
  const token = getToken();
  return fetchApiBlob(endpoint, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
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
