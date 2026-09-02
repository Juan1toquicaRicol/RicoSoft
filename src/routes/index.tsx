import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock,
  FileText,
  Ship,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatCard, StatCardSkeleton } from "@/components/ui/stat-card";
import { useDashboard } from "@/hooks/use-dashboard";
import { money } from "@/lib/data";

export const Route = createFileRoute("/")({
  component: DashboardExecutive,
});

/** Barra de distribución simple (sin librería de gráficos) para "N por estado". */
function DistribucionEstados({ datos }: { datos: { etiqueta: string; valor: number }[] }) {
  const total = datos.reduce((acc, d) => acc + d.valor, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-2.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {datos.map((d, i) => (
          <div
            key={d.etiqueta}
            className={i % 2 === 0 ? "bg-blue-800" : "bg-slate-400"}
            style={{ width: `${(d.valor / total) * 100}%` }}
            title={`${d.etiqueta}: ${d.valor}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {datos.map((d, i) => (
          <span
            key={d.etiqueta}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600"
          >
            <span
              className={`h-2 w-2 rounded-full ${i % 2 === 0 ? "bg-blue-800" : "bg-slate-400"}`}
            />
            {d.etiqueta} <span className="font-bold text-slate-900">{d.valor}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DashboardExecutive() {
  const { resumen, loading, error } = useDashboard();
  const { facturas, solicitudes, creditos, importaciones } = resumen;

  const sinAccesoAIndicadores =
    !loading && !error && !facturas && !solicitudes && !creditos && !importaciones;

  return (
    <AppShell
      title="Dashboard"
      description="Estado consolidado de facturación, compras y cartera de RicoSoft."
    >
      <div className="space-y-6">
        {error && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>
              No fue posible cargar todos los indicadores: {error}
            </AlertDescription>
          </Alert>
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
                enfasis={facturas.vencidas > 0 ? "atencion" : "default"}
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
            <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <DistribucionEstados
                datos={[
                  "Pendiente",
                  "En Cotización",
                  "Aprobada",
                  "Rechazada",
                  "Comprado",
                  "Facturada",
                ].map((etiqueta) => ({
                  etiqueta,
                  valor: solicitudes.porEstado[etiqueta] ?? 0,
                }))}
              />
              <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-slate-100 pt-4">
                {[
                  "Pendiente",
                  "En Cotización",
                  "Aprobada",
                  "Rechazada",
                  "Comprado",
                  "Facturada",
                ].map((estado) => (
                  <div key={estado}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {estado}
                    </p>
                    <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                      {solicitudes.porEstado[estado] ?? 0}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {!loading && importaciones && importaciones.totalLotes > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Ship className="h-4 w-4 text-slate-400" /> Importaciones
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Lotes en tránsito"
                value={String(importaciones.enTransito)}
                hint={`De ${importaciones.totalLotes} lotes totales`}
                icon={Ship}
              />
              <StatCard
                label="Nacionalizados"
                value={String(importaciones.nacionalizados)}
                icon={TrendingUp}
              />
              <StatCard
                label="Pendientes de documentación (DIM)"
                value={String(importaciones.pendientesDocumentacion)}
                icon={AlertTriangle}
                enfasis={importaciones.pendientesDocumentacion > 0 ? "atencion" : "default"}
              />
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
                enfasis={creditos.pendientes > 0 ? "atencion" : "default"}
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
                  <div className="p-3 bg-blue-50 text-blue-700 rounded-lg">
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
                  <div className="p-3 bg-blue-50 text-blue-700 rounded-lg">
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
