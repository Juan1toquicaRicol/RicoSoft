import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  ChevronLeft,
  FileText,
  Gauge,
  GitBranch,
  Inbox,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const nav = [
  { section: "Operación", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/bandeja", label: "Bandeja de entrada", icon: Inbox },
    { to: "/facturas", label: "Facturas", icon: FileText },
    { to: "/contratos", label: "Contratos", icon: ShieldCheck },
  ] },
  { section: "Automatización", items: [
    { to: "/reglas", label: "Motor de reglas", icon: GitBranch },
  ] },
  { section: "Inteligencia", items: [
    { to: "/analitica", label: "Analítica", icon: BarChart3 },
    { to: "/proyeccion", label: "Proyección financiera", icon: TrendingUp },
    { to: "/creditos", label: "Créditos de clientes", icon: Wallet },
    { to: "/auditoria", label: "Auditoría", icon: Gauge },
  ] },
];

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    const isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      window.localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  };
  return { dark, toggle };
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { dark, toggle } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 md:flex",
          collapsed ? "w-[72px]" : "w-[262px]",
        )}
      >
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="h-[18px] w-[18px]" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">Facturaflow</p>
              <p className="truncate text-[11px] text-muted-foreground">Holding Central S.A.</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {nav.map((group) => (
            <div key={group.section} className="space-y-1">
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {group.section}
                </p>
              )}
              {group.items.map((item) => {
                const active = pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-sidebar-primary")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed((v) => !v)}
            className="w-full justify-start gap-3 text-muted-foreground"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span>Colapsar</span>}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 lg:px-8">
            <div className="relative min-w-0 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar factura, proveedor, NIT, contrato…"
                className="h-9 rounded-lg border-border bg-muted/50 pl-9 text-sm"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Cambiar tema">
                {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Notificaciones" className="relative">
                <Bell className="h-[18px] w-[18px]" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
              </Button>
              <Link to="/configuracion">
                <Button variant="ghost" size="icon" aria-label="Configuración">
                  <Settings className="h-[18px] w-[18px]" />
                </Button>
              </Link>
              <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
              <div className="hidden items-center gap-3 pl-1 sm:flex">
                <div className="text-right">
                  <p className="text-xs font-semibold leading-tight">Laura Restrepo</p>
                  <p className="text-[11px] leading-tight text-muted-foreground">Director Financiero</p>
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  LR
                </div>
              </div>
              <Link to="/login">
                <Button variant="ghost" size="icon" aria-label="Cerrar sesión">
                  <LogOut className="h-[18px] w-[18px]" />
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 pb-6 sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
                {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
              </div>
              {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    Aprobada: "bg-success/12 text-success border-success/25",
    Pagada: "bg-info/12 text-info border-info/25",
    Rechazada: "bg-destructive/12 text-destructive border-destructive/25",
    Pendiente: "bg-warning/15 text-warning-foreground border-warning/35 dark:text-warning",
    "En revisión": "bg-primary/12 text-primary border-primary/25",
    Recibida: "bg-muted text-muted-foreground border-border",
    Devuelta: "bg-destructive/10 text-destructive border-destructive/20",
    Archivada: "bg-muted text-muted-foreground border-border",
    Vigente: "bg-success/12 text-success border-success/25",
    "Por vencer": "bg-warning/15 text-warning-foreground border-warning/35 dark:text-warning",
    Finalizado: "bg-muted text-muted-foreground border-border",
    Activo: "bg-success/12 text-success border-success/25",
    Vencido: "bg-destructive/12 text-destructive border-destructive/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        map[estado] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {estado}
    </span>
  );
}
