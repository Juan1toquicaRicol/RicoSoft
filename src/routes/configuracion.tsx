import { useEffect } from "react";
import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ShieldCheck,
  Users,
  Key,
  Building2,
  Award,
  Bell,
  LayoutGrid,
  Truck,
  Cloud,
  ListChecks,
  SlidersHorizontal,
  Tags,
  Megaphone,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración y Administración | RicoSoft" },
      {
        name: "description",
        content: "Perfil, gestión de usuarios, roles y permisos de RicoSoft.",
      },
    ],
  }),
  component: Configuracion,
});

function Configuracion() {
  const { user, loading } = useSession();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();

  const tabs = [
    {
      to: "/configuracion/usuarios",
      label: "Usuarios",
      icon: Users,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.USUARIOS_VER),
    },
    {
      to: "/configuracion/roles",
      label: "Roles",
      icon: ShieldCheck,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.ROLES_VER),
    },
    {
      to: "/configuracion/permisos",
      label: "Permisos",
      icon: Key,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.PERMISOS_VER),
    },
    {
      to: "/configuracion/departamentos",
      label: "Departamentos",
      icon: Building2,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.DEPARTAMENTOS_VER),
    },
    {
      to: "/configuracion/perfiles-funcionales",
      label: "Perfiles Funcionales",
      icon: Award,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.PERFILES_FUNCIONALES_VER),
    },
    {
      to: "/configuracion/reglas-destinatarios",
      label: "Reglas de Destinatarios",
      icon: Bell,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.REGLAS_DESTINATARIOS_VER),
    },
    {
      to: "/configuracion/publicaciones",
      label: "Publicaciones",
      icon: Megaphone,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR),
    },
    {
      to: "/configuracion/proveedores",
      label: "Proveedores",
      icon: Truck,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.PROVEEDORES_VER),
    },
    {
      to: "/configuracion/modulos",
      label: "Módulos",
      icon: LayoutGrid,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.MODULOS_VER),
    },
    {
      to: "/configuracion/catalogos",
      label: "Catálogos",
      icon: ListChecks,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.CONFIGURACION_CATALOGOS),
    },
    {
      to: "/configuracion/clasificacion-items",
      label: "Clasificación de Items",
      icon: Tags,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.CONFIGURACION_VER),
    },
    {
      to: "/configuracion/negocio",
      label: "Config. de negocio",
      icon: SlidersHorizontal,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.INVENTARIO_CONFIGURAR),
    },
    {
      to: "/configuracion/integraciones-siesa",
      label: "Integraciones",
      icon: Cloud,
      exact: false,
      show: hasPermission(user, PERMISOS_SISTEMA.INTEGRACION_SIESA_VER),
    },
  ] as const;

  // Enforcement real de permiso por sub-ruta, contra la sesión ya verificada
  // por el backend (useSession, no localStorage cacheado): el guard SSR de
  // `beforeLoad` (requirePermisoGuard) no puede proteger un hard-refresh
  // porque el servidor no tiene acceso al token guardado en localStorage.
  // Este efecto es lo que de verdad cierra ese hueco una vez el cliente
  // hidrata y resuelve /auth/me. No actúa mientras la sesión está cargando,
  // y deja el caso "no autenticado en absoluto" en manos de AppShell (que ya
  // redirige a /login) para no competir con esa redirección.
  useEffect(() => {
    if (loading || !user) return;
    const tabActual = tabs.find((t) => pathname.startsWith(t.to));
    if (tabActual && !tabActual.show) {
      navigate({ to: "/" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, pathname]);

  return (
    <AppShell
      title="Configuración"
      description="Perfil, administración de usuarios y control de accesos"
    >
      {/* ── Navegación por Pestañas con TanStack Router ── */}
      <div className="flex flex-wrap border-b border-slate-200 mb-6 gap-1">
        {tabs
          .filter((tab) => tab.show)
          .map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: tab.exact }}
              activeProps={{
                className: "border-blue-700 text-blue-700 font-semibold",
              }}
              inactiveProps={{
                className: "border-transparent text-slate-500 hover:text-slate-800",
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all",
              )}
            >
              <tab.icon className="h-4 w-4" /> {tab.label}
            </Link>
          ))}
      </div>

      {/* ── Renderizado Dinámico de las Sub-Rutas ── */}
      <div className="w-full">
        <Outlet />
      </div>
    </AppShell>
  );
}
