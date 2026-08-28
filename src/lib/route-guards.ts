import { redirect } from "@tanstack/react-router";

import { getCachedUser, hasPermission } from "@/lib/session";

/**
 * Guard para `beforeLoad` de rutas administrativas: si el usuario cacheado
 * no tiene el permiso requerido, redirige antes de montar el componente en
 * vez de dejar que el layout de administración se renderice vacío mientras
 * el backend rechaza la petición de datos con 403.
 *
 * Es un no-op durante SSR (`typeof window === "undefined"`): el token de
 * sesión solo vive en localStorage, nunca llega al servidor en un hard
 * navigation/refresh, así que en SSR getCachedUser() SIEMPRE es null — sin
 * este no-op, este guard rebotaba a "/" en cada refresh de una ruta
 * protegida aunque el usuario sí tuviera el permiso. La protección real para
 * ese caso (SSR + hard nav) la da `useEnforcePermiso` una vez el cliente
 * hidrata y resuelve la sesión real contra el backend (ver configuracion.tsx);
 * este guard sigue siendo útil como atajo instantáneo en navegación
 * client-side normal (clic en el sidebar), donde el caché sí es fiable.
 */
export function requirePermisoGuard(permiso: string) {
  return () => {
    if (typeof window === "undefined") return;
    const user = getCachedUser();
    if (!user || !hasPermission(user, permiso)) {
      throw redirect({ to: "/" });
    }
  };
}
