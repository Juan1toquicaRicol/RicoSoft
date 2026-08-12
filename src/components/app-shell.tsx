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
  type LucideIcon,
} from "lucide-react";

import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { useSession } from "@/lib/session-context";
import { hasPermission, canAccessAdmin } from "@/lib/session";
import { useModulosMenu } from "@/hooks/use-modulos";

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
  const { user, loading, logout } = useSession();
  const [adminMenuAbierto, setAdminMenuAbierto] = useState(pathname.startsWith("/configuracion"));
  const { modulos: modulosMenu } = useModulosMenu();

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
  const canVerModulos = hasPermission(user, PERMISOS_SISTEMA.MODULOS_VER);
  const canVerAuditoria = hasPermission(user, PERMISOS_SISTEMA.AUDITORIA_VER);

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex text-slate-800">
      {/* ── BARRA LATERAL (SIDEBAR) ── */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0">
        {/* Header de Marca */}
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center font-black text-white justify-center text-lg shadow-md">
            R
          </div>
          <div>
            <h1 className="font-bold text-white text-base leading-none">RicoSoft</h1>
            <p className="text-[11px] text-slate-400 mt-1">Enterprise V1.0</p>
          </div>
        </div>

        {/* Menú Principal */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto text-sm font-medium">
          {/* ── MÓDULOS PRINCIPALES, agrupados por departamento ── */}
          {gruposModulos.map((grupo) => (
            <div key={grupo.nombre} className="mb-3">
              <div className="text-[10px] uppercase font-bold text-slate-500 px-3 pb-2 tracking-wider">
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
                        ? "bg-blue-600 text-white font-semibold"
                        : "hover:bg-slate-800 text-slate-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{m.nombre}</span>
                  </Link>
                );
              })}
            </div>
          ))}

          {/* ── MI CUENTA (visible para cualquier usuario autenticado) ── */}
          <div className="pt-4 mt-2 border-t border-slate-800/80">
            <div className="text-[10px] uppercase font-bold text-slate-500 px-3 pb-2 tracking-wider">
              Mi cuenta
            </div>
            <Link
              to="/perfil"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                pathname.startsWith("/perfil")
                  ? "bg-blue-600 text-white font-semibold"
                  : "hover:bg-slate-800 text-slate-300"
              }`}
            >
              <UserCircle className="h-4 w-4" />
              <span>Mi Perfil</span>
            </Link>
          </div>

          {/* ── SECCIÓN ADMINISTRATIVA (Renderizado por Autorización Real) ── */}
          {tieneAccesoAdmin && (
            <div className="pt-4 mt-2 border-t border-slate-800/80">
              <div className="text-[10px] uppercase font-bold text-slate-500 px-3 pb-2 tracking-wider">
                Administración Global
              </div>

              {/* Botón desplegable del Módulo de Configuración */}
              <button
                onClick={() => setAdminMenuAbierto(!adminMenuAbierto)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                  pathname.startsWith("/configuracion")
                    ? "bg-slate-800 text-blue-400 font-semibold"
                    : "hover:bg-slate-800 text-slate-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Settings className="h-4 w-4 text-blue-400" />
                  <span>Configuración</span>
                </div>
                {adminMenuAbierto ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {/* Submenú con subrutas autorizadas */}
              {adminMenuAbierto && (
                <div className="mt-1 ml-4 pl-3 border-l border-slate-800 space-y-1 text-xs">
                  {canVerUsuarios && (
                    <Link
                      to="/configuracion/usuarios"
                      className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                        pathname.startsWith("/configuracion/usuarios")
                          ? "bg-blue-600/20 text-blue-300 font-semibold"
                          : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
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
                          ? "bg-blue-600/20 text-blue-300 font-semibold"
                          : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
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
                          ? "bg-blue-600/20 text-blue-300 font-semibold"
                          : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
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
                          ? "bg-blue-600/20 text-blue-300 font-semibold"
                          : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      <span>Departamentos</span>
                    </Link>
                  )}

                  {canVerModulos && (
                    <Link
                      to="/configuracion/modulos"
                      className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                        pathname.startsWith("/configuracion/modulos")
                          ? "bg-blue-600/20 text-blue-300 font-semibold"
                          : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
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
                          ? "bg-blue-600/20 text-blue-300 font-semibold"
                          : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <History className="h-3.5 w-3.5" />
                      <span>Auditoría</span>
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Perfil del Usuario en el footer del Sidebar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs shrink-0">
              {user.nombre.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.nombre}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs">
          <div>
            <h1 className="text-lg font-bold text-slate-800">{title}</h1>
            {description && <p className="text-xs text-slate-500">{description}</p>}
          </div>

          <div className="flex items-center gap-3">
            {actions}
            {user.isSuperadmin && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900">
                <ShieldAlert className="h-3.5 w-3.5" /> SuperAdmin Mode
              </span>
            )}
          </div>
        </header>

        {/* Area de Trabajo con Rutas */}
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
