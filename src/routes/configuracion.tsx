import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { ShieldCheck, Users, Key, Building2, LayoutGrid, Truck } from "lucide-react";
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
  const { user } = useSession();

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
  ] as const;

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
