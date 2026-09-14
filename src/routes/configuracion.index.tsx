import { createFileRoute, redirect } from "@tanstack/react-router";
import { getCachedUser, hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

// Mismo orden que las pestañas de /configuracion (ver tabs en
// configuracion.tsx) — entra directo a la primera pestaña que el usuario
// realmente tiene permiso para ver, en vez de forzar siempre /perfil (que ya
// tiene su propio enlace en el sidebar y no es parte de esta sección).
//
// getCachedUser() es un no-op en SSR/hard-refresh (no hay localStorage en el
// servidor) — en ese caso cae a /perfil como antes; una vez el cliente
// hidrata, una navegación normal a /configuracion sí resuelve la pestaña
// correcta. Mismo caveat documentado en requirePermisoGuard (route-guards.ts).
const ORDEN_PESTANAS = [
  { to: "/configuracion/usuarios", permiso: PERMISOS_SISTEMA.USUARIOS_VER },
  { to: "/configuracion/roles", permiso: PERMISOS_SISTEMA.ROLES_VER },
  { to: "/configuracion/permisos", permiso: PERMISOS_SISTEMA.PERMISOS_VER },
  { to: "/configuracion/departamentos", permiso: PERMISOS_SISTEMA.DEPARTAMENTOS_VER },
  {
    to: "/configuracion/perfiles-funcionales",
    permiso: PERMISOS_SISTEMA.PERFILES_FUNCIONALES_VER,
  },
  {
    to: "/configuracion/reglas-destinatarios",
    permiso: PERMISOS_SISTEMA.REGLAS_DESTINATARIOS_VER,
  },
  { to: "/configuracion/publicaciones", permiso: PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR },
  { to: "/configuracion/proveedores", permiso: PERMISOS_SISTEMA.PROVEEDORES_VER },
  { to: "/configuracion/modulos", permiso: PERMISOS_SISTEMA.MODULOS_VER },
  { to: "/configuracion/catalogos", permiso: PERMISOS_SISTEMA.CONFIGURACION_CATALOGOS },
  { to: "/configuracion/clasificacion-items", permiso: PERMISOS_SISTEMA.CONFIGURACION_VER },
  { to: "/configuracion/negocio", permiso: PERMISOS_SISTEMA.INVENTARIO_CONFIGURAR },
  { to: "/configuracion/integraciones-siesa", permiso: PERMISOS_SISTEMA.INTEGRACION_SIESA_VER },
] as const;

export const Route = createFileRoute("/configuracion/")({
  beforeLoad: () => {
    const user = getCachedUser();
    const primeraDisponible = ORDEN_PESTANAS.find((t) => hasPermission(user, t.permiso));
    throw redirect({ to: primeraDisponible?.to ?? "/perfil" });
  },
});
