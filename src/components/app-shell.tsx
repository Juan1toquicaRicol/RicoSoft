import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Users,
  ShieldCheck,
  Key,
  Building2,
  History,
  Settings,
  LayoutDashboard,
  LayoutGrid,
  FileText,
  Briefcase,
  ShoppingCart,
  Repeat,
  FileSignature,
  Workflow,
  CreditCard,
  BarChart3,
  TrendingUp,
  Inbox,
  LogOut,
  Loader2,
  UserCircle,
  Menu,
  X,
  Truck,
  Ship,
  Check,
  Package,
  ClipboardList,
  Factory,
  Target,
  Gauge,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { useSession } from "@/lib/session-context";
import { hasPermission, canAccessAdmin } from "@/lib/session";
import { useModulosMenu } from "@/hooks/use-modulos";
import { useTenantsAccesibles } from "@/hooks/use-tenants-accesibles";
import { NotificationBell } from "@/components/notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Traduce el nombre de ícono guardado en Modulo.icono al componente lucide correspondiente.
const ICONOS_MODULO: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Repeat,
  FileSignature,
  Workflow,
  CreditCard,
  Briefcase,
  BarChart3,
  TrendingUp,
  Inbox,
  History,
  Ship,
  Package,
  ClipboardList,
  Factory,
  Target,
  Gauge,
  ShoppingBag,
  Truck,
};

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function AppShell({ children, title, description, actions }: AppShellProps) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const { user, loading, logout, switchTenant } = useSession();
  const [adminMenuAbierto, setAdminMenuAbierto] = useState(pathname.startsWith("/configuracion"));
  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  const { modulos: modulosMenu } = useModulosMenu();
  // El id/nombre de la empresa ACTIVA siempre se lee de `user` (SessionContext,
  // recién refrescado tras cada login/switch) — nunca del propio estado
  // interno de este hook, que solo se pide una vez al montar AppShell (que no
  // se desmonta al cambiar de empresa) y quedaría desactualizado.
  const { tenants: tenantsAccesibles, loading: cargandoTenants } = useTenantsAccesibles();
  const [cambiandoTenant, setCambiandoTenant] = useState(false);

  const handleCambiarEmpresa = async (tenantId: string) => {
    if (tenantId === user?.tenantId || cambiandoTenant) return;
    setCambiandoTenant(true);
    try {
      await switchTenant(tenantId);
      toast.success("Empresa cambiada correctamente.");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message || "No fue posible cambiar de empresa.");
    } finally {
      setCambiandoTenant(false);
    }
  };

  // Cierra el sidebar móvil automáticamente al navegar a otra ruta.
  useEffect(() => {
    setSidebarAbierto(false);
  }, [pathname]);

  const gruposModulos = useMemo(() => {
    const grupos = new Map<string, { nombre: string; modulos: typeof modulosMenu }>();
    for (const m of modulosMenu) {
      const clave = m.departamento?.id ?? "__general__";
      const nombre = m.departamento?.nombre ?? "Módulos Principales";
      if (!grupos.has(clave)) grupos.set(clave, { nombre, modulos: [] });
      grupos.get(clave)!.modulos.push(m);
    }
    return Array.from(grupos.values());
  }, [modulosMenu]);

  // Guarda de ruta: sin sesión válida no se renderiza contenido protegido.
  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  // Verificación de autorización real para la barra lateral (permisos efectivos del backend)
  const tieneAccesoAdmin = canAccessAdmin(user);

  // Permisos específicos para subopciones
  const canVerUsuarios = hasPermission(user, PERMISOS_SISTEMA.USUARIOS_VER);
  const canVerRoles = hasPermission(user, PERMISOS_SISTEMA.ROLES_VER);
  const canVerPermisos = hasPermission(user, PERMISOS_SISTEMA.PERMISOS_VER);
  const canVerDepartamentos = hasPermission(user, PERMISOS_SISTEMA.DEPARTAMENTOS_VER);
  const canVerProveedores = hasPermission(user, PERMISOS_SISTEMA.PROVEEDORES_VER);
  const canVerModulos = hasPermission(user, PERMISOS_SISTEMA.MODULOS_VER);
  const canVerAuditoria = hasPermission(user, PERMISOS_SISTEMA.AUDITORIA_VER);

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex text-slate-800">
      {/* Fondo oscuro detrás del sidebar en móvil, cierra al tocarlo */}
      {sidebarAbierto && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarAbierto(false)}
          aria-hidden="true"
        />
      )}

      {/* ── BARRA LATERAL (SIDEBAR) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white text-black flex flex-col border-r border-slate-200 shrink-0 transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          sidebarAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header de Marca */}
        <div className="p-5 border-b border-slate-200 flex items-center gap-3">
          <img
            src="/gruporicol-icono.png"
            alt="Grupo Ricol"
            className="h-12 w-12 shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-black text-base leading-none">RicoSoft</h1>
            <p className="text-[11px] text-black mt-1">Enterprise V1.0</p>
          </div>
          <button
            onClick={() => setSidebarAbierto(false)}
            className="shrink-0 p-1.5 rounded-md text-black hover:bg-slate-100 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Menú Principal */}
        <nav className="flex-1 p-4 overflow-y-auto text-sm font-medium">
          {/* ── MÓDULOS PRINCIPALES, agrupados por departamento (separados por línea degradada) ── */}
          {gruposModulos.map((grupo, i) => (
            <div key={grupo.nombre}>
              {i > 0 && (
                <div className="my-3 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
              )}
              <div className="mb-3 space-y-1">
                <div className="text-[10px] uppercase font-bold text-black px-3 pb-2 tracking-wider">
                  {grupo.nombre}
                </div>
                {grupo.modulos.map((m) => {
                  const Icon = ICONOS_MODULO[m.icono] ?? LayoutGrid;
                  const activa = m.ruta === "/" ? pathname === "/" : pathname.startsWith(m.ruta);
                  return (
                    <Link
                      key={m.id}
                      to={m.ruta}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        activa
                          ? "bg-blue-50 text-blue-800 font-semibold border border-blue-100"
                          : "hover:bg-slate-100 text-black border border-transparent"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{m.nombre}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── MI CUENTA (visible para cualquier usuario autenticado) ── */}
          <div className="my-3 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
          <div className="mb-3 space-y-1">
            <div className="text-[10px] uppercase font-bold text-black px-3 pb-2 tracking-wider">
              Mi cuenta
            </div>
            <Link
              to="/perfil"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                pathname.startsWith("/perfil")
                  ? "bg-blue-50 text-blue-800 font-semibold border border-blue-100"
                  : "hover:bg-slate-100 text-black border border-transparent"
              }`}
            >
              <UserCircle className="h-4 w-4" />
              <span>Mi Perfil</span>
            </Link>
          </div>

          {/* ── SECCIÓN ADMINISTRATIVA (Renderizado por Autorización Real) ── */}
          {tieneAccesoAdmin && (
            <>
              <div className="my-3 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
              <div>
                <div className="text-[10px] uppercase font-bold text-black px-3 pb-2 tracking-wider">
                  Administración Global
                </div>

                {/* Botón desplegable del Módulo de Configuración */}
                <button
                  onClick={() => setAdminMenuAbierto(!adminMenuAbierto)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                    pathname.startsWith("/configuracion")
                      ? "bg-slate-100 text-black font-semibold"
                      : "hover:bg-slate-100 text-black"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Settings className="h-4 w-4 text-black" />
                    <span>Configuración</span>
                  </div>
                  {adminMenuAbierto ? (
                    <ChevronDown className="h-4 w-4 text-black" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-black" />
                  )}
                </button>

                {/* Submenú con subrutas autorizadas */}
                {adminMenuAbierto && (
                  <div className="mt-1 ml-4 pl-3 border-l border-slate-200 space-y-1 text-xs">
                    {canVerUsuarios && (
                      <Link
                        to="/configuracion/usuarios"
                        className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                          pathname.startsWith("/configuracion/usuarios")
                            ? "bg-blue-50 text-blue-800 font-semibold"
                            : "hover:bg-slate-100 text-black"
                        }`}
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span>Usuarios</span>
                      </Link>
                    )}

                    {canVerRoles && (
                      <Link
                        to="/configuracion/roles"
                        className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                          pathname.startsWith("/configuracion/roles")
                            ? "bg-blue-50 text-blue-800 font-semibold"
                            : "hover:bg-slate-100 text-black"
                        }`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Roles</span>
                      </Link>
                    )}

                    {canVerPermisos && (
                      <Link
                        to="/configuracion/permisos"
                        className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                          pathname.startsWith("/configuracion/permisos")
                            ? "bg-blue-50 text-blue-800 font-semibold"
                            : "hover:bg-slate-100 text-black"
                        }`}
                      >
                        <Key className="h-3.5 w-3.5" />
                        <span>Permisos</span>
                      </Link>
                    )}

                    {canVerDepartamentos && (
                      <Link
                        to="/configuracion/departamentos"
                        className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                          pathname.startsWith("/configuracion/departamentos")
                            ? "bg-blue-50 text-blue-800 font-semibold"
                            : "hover:bg-slate-100 text-black"
                        }`}
                      >
                        <Building2 className="h-3.5 w-3.5" />
                        <span>Departamentos</span>
                      </Link>
                    )}

                    {canVerProveedores && (
                      <Link
                        to="/configuracion/proveedores"
                        className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                          pathname.startsWith("/configuracion/proveedores")
                            ? "bg-blue-50 text-blue-800 font-semibold"
                            : "hover:bg-slate-100 text-black"
                        }`}
                      >
                        <Truck className="h-3.5 w-3.5" />
                        <span>Proveedores</span>
                      </Link>
                    )}

                    {canVerModulos && (
                      <Link
                        to="/configuracion/modulos"
                        className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                          pathname.startsWith("/configuracion/modulos")
                            ? "bg-blue-50 text-blue-800 font-semibold"
                            : "hover:bg-slate-100 text-black"
                        }`}
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        <span>Módulos</span>
                      </Link>
                    )}

                    {canVerAuditoria && (
                      <Link
                        to="/auditoria"
                        className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                          pathname.startsWith("/auditoria")
                            ? "bg-blue-50 text-blue-800 font-semibold"
                            : "hover:bg-slate-100 text-black"
                        }`}
                      >
                        <History className="h-3.5 w-3.5" />
                        <span>Auditoría</span>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </nav>

        {/* Perfil del Usuario en el footer del Sidebar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold text-xs shrink-0">
              {user.nombre.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-black truncate">{user.nombre}</p>
              <p className="text-[10px] text-black truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="shrink-0 p-2 rounded-lg text-black hover:bg-slate-100 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-xs gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarAbierto(true)}
              className="shrink-0 p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <img
              src="/GRUPORICOL_LogoPrincipal-Photoroom.png"
              alt="Grupo Ricol"
              className="h-7 w-auto shrink-0 hidden lg:block"
            />
            <div className="hidden lg:block h-6 w-px bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-800 truncate">{title}</h1>
              {description && <p className="text-xs text-slate-500 truncate">{description}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {actions}
            {tenantsAccesibles.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={cambiandoTenant}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 disabled:opacity-60"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {cambiandoTenant ? "Cambiando..." : `Estás en: ${user.tenantNombre}`}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Cambiar de empresa</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {tenantsAccesibles.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={() => handleCambiarEmpresa(t.id)}
                      className="flex items-center justify-between gap-2 text-xs font-semibold"
                    >
                      {t.nombre}
                      {t.id === user.tenantId && <Check className="h-3.5 w-3.5 text-blue-700" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              !cargandoTenants && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  <Building2 className="h-3.5 w-3.5" /> Estás en: {user.tenantNombre}
                </span>
              )
            )}
            <NotificationBell />
            {user.isSuperadmin && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900">
                <ShieldAlert className="h-3.5 w-3.5" /> SuperAdmin
              </span>
            )}
          </div>
        </header>

        {/* Area de Trabajo con Rutas */}
        {/* key=tenantId: fuerza a React a desmontar y remontar por completo
            la página actual cuando cambia la empresa activa. AppShell mismo
            nunca se desmonta entre rutas, así que sin esto cualquier hook de
            una página ya montada (useFacturas, useSolicitudes, useDashboard,
            etc.) seguiría con datos de la empresa anterior hasta un refresh
            manual — este remount reinicia TODOS sus estados/efectos de una
            sola vez, sin tener que tocar cada hook de la app uno por uno. */}
        <main key={user.tenantId} className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
