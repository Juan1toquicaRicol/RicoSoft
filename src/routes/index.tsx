import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  Clock,
  FileText,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/hooks/use-dashboard";
import { money } from "@/lib/data";

export const Route = createFileRoute("/")({
  component: DashboardExecutive,
});

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "success";
}

function StatCard({ label, value, hint, icon: Icon, tone = "default" }: StatCardProps) {
  const toneClasses =
    tone === "warning"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : tone === "success"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        <div className={`shrink-0 rounded-lg border p-2.5 ${toneClasses}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

function DashboardExecutive() {
  const { resumen, loading, error } = useDashboard();
  const { facturas, solicitudes, creditos } = resumen;

  const sinAccesoAIndicadores = !loading && !error && !facturas && !solicitudes && !creditos;

  return (
    <AppShell
      title="Dashboard"
      description="Estado consolidado de facturación, compras y cartera de RicoSoft."
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
            No fue posible cargar todos los indicadores: {error}
          </div>
        )}

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && facturas && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" /> Facturas
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Pendientes"
                value={String(facturas.porEstado["Pendiente"] ?? 0)}
                hint={money(facturas.valorPendiente)}
                icon={Clock}
              />
              <StatCard
                label="Aprobadas"
                value={String(facturas.porEstado["Aprobada"] ?? 0)}
                hint={money(facturas.valorAprobado)}
                icon={TrendingUp}
                tone="success"
              />
              <StatCard
                label="Pagadas"
                value={String(facturas.porEstado["Pagada"] ?? 0)}
                hint={money(facturas.valorPagado)}
                icon={Wallet}
              />
              <StatCard
                label="Vencidas"
                value={String(facturas.vencidas)}
                hint="Pendientes o aprobadas con fecha de vencimiento superada"
                icon={AlertTriangle}
                tone={facturas.vencidas > 0 ? "warning" : "default"}
              />
            </div>

            {facturas.topProveedores.length > 0 && (
              <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">
                  Proveedores por valor facturado
                </h3>
                <ul className="space-y-2">
                  {facturas.topProveedores.map((p, i) => (
                    <li key={p.nombre} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-slate-400 w-4">{i + 1}</span>
                        <span className="truncate font-medium text-slate-800">{p.nombre}</span>
                      </span>
                      <span className="num font-semibold text-slate-900 shrink-0">
                        {money(p.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {!loading && solicitudes && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-slate-400" /> Solicitudes de compra
            </h2>
            <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {["Pendiente", "En Cotización", "Aprobada", "Rechazada", "Comprado"].map(
                  (estado) => (
                    <div key={estado}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {estado}
                      </p>
                      <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                        {solicitudes.porEstado[estado] ?? 0}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          </section>
        )}

        {!loading && creditos && creditos.total > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-slate-400" /> Créditos de clientes
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Saldo total en cartera"
                value={money(creditos.totalSaldo)}
                hint={`${creditos.total} clientes con crédito activo`}
                icon={Wallet}
              />
              <StatCard
                label="Créditos por vencer / vencidos"
                value={String(creditos.pendientes)}
                icon={AlertTriangle}
                tone={creditos.pendientes > 0 ? "warning" : "default"}
              />
            </div>
            {creditos.topDeudores.length > 0 && (
              <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">
                  Clientes con mayor deuda
                </h3>
                <ul className="space-y-2">
                  {creditos.topDeudores.map((c, i) => (
                    <li key={c.cliente} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-slate-400 w-4">{i + 1}</span>
                        <span className="truncate font-medium text-slate-800">{c.cliente}</span>
                      </span>
                      <span className="num font-semibold text-slate-900 shrink-0">
                        {money(c.saldo)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {sinAccesoAIndicadores && (
          <div className="panel bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
            Tu cuenta no tiene acceso a indicadores de facturas, solicitudes o créditos. Usa los
            accesos rápidos a continuación para navegar a tus módulos disponibles.
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-700">Accesos rápidos</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link to="/gestion-humana" className="block">
              <div className="panel p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-500 transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 text-blue-700 rounded-lg">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Gestión Humana</h3>
                    <p className="text-xs text-slate-500">Directorio, novedades y personal</p>
                  </div>
                </div>
              </div>
            </Link>

            <Link to="/facturas" className="block">
              <div className="panel p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-500 transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-slate-100 text-slate-700 rounded-lg">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Recepción de Facturas</h3>
                    <p className="text-xs text-slate-500">Gestión de facturas y contabilidad</p>
                  </div>
                </div>
              </div>
            </Link>

            <Link to="/solicitudes-compra" className="block">
              <div className="panel p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-500 transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-slate-900 text-white rounded-lg">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Solicitudes de Compra</h3>
                    <p className="text-xs text-slate-500">Aprobación y control de compras</p>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
