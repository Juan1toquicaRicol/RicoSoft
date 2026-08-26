import { redirect } from "@tanstack/react-router";

import { getCachedUser, hasPermission } from "@/lib/session";

/**
 * Guard para `beforeLoad` de rutas administrativas: si el usuario cacheado
 * no tiene el permiso requerido, redirige antes de montar el componente en
 * vez de dejar que el layout de administración se renderice vacío mientras
 * el backend rechaza la petición de datos con 403.
 */
export function requirePermisoGuard(permiso: string) {
  return () => {
    const user = getCachedUser();
    if (!user || !hasPermission(user, permiso)) {
      throw redirect({ to: "/" });
    }
  };
}
