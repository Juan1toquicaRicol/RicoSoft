import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Clock, Download, Plus, TriangleAlert } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell, EstadoBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { alertas, compact, facturas, kpis, money, porArea, serieMensual, topProveedores } from "@/lib/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard ejecutivo | Facturaflow" },
      { name: "description", content: "Indicadores en tiempo real de recepción, aprobación y pago de facturas empresariales." },
      { property: "og:title", content: "Dashboard ejecutivo | Facturaflow" },
      { property: "og:description", content: "Control total del flujo documental y financiero de facturas." },
    ],
  }),
  component: Dashboard,
});

const kpiCards = [
  { label: "Facturas recibidas", value: kpis.recibidas, delta: "+12,4%" },
  { label: "Pendientes", value: kpis.pendientes, delta: "-3,1%" },
  { label: "Aprobadas", value: kpis.aprobadas, delta: "+8,7%" },
  { label: "Rechazadas", value: kpis.rechazadas, delta: "-1,2%" },
  { label: "Pagadas", value: kpis.pagadas, delta: "+6,3%" },
  { label: "Vencidas", value: kpis.vencidas, delta: "+2 vs. mes anterior" },
];

const valorCards = [
  { label: "Valor total del mes", value: kpis.valorMes },
  { label: "Valor aprobado", value: kpis.valorAprobado },
  { label: "Valor pendiente", value: kpis.valorPendiente },
  { label: "Valor pagado", value: kpis.valorPagado },
];

const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Dashboard() {
  return (
    <AppShell
      title="Dashboard ejecutivo"
      description="Julio 2026 · Consolidado multiempresa"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Link to="/facturas">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Cargar facturas
            </Button>
          </Link>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((k) => (
          <div key={k.label} className="panel p-4 transition-shadow hover:shadow-[var(--shadow-lift)]">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className="num mt-2 text-2xl font-semibold">{k.value.toLocaleString("es-CO")}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{k.delta}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {valorCards.map((v) => (
          <div key={v.label} className="panel p-5">
            <p className="text-xs font-medium text-muted-foreground">{v.label}</p>
            <p className="num mt-2 text-xl font-semibold">{money(v.value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h2 className="text-sm font-semibold">Flujo de facturación</h2>
              <p className="text-xs text-muted-foreground">Millones COP · últimos 7 meses</p>
            </div>
          </div>
          <div className="h-[268px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serieMensual}>
                <defs>
                  <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gApr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Area type="monotone" dataKey="recibido" stroke="var(--chart-1)" fill="url(#gRec)" strokeWidth={2} />
                <Area type="monotone" dataKey="aprobado" stroke="var(--chart-3)" fill="url(#gApr)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Distribución por área</h2>
          <p className="text-xs text-muted-foreground">Participación del gasto</p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={porArea} dataKey="valor" nameKey="nombre" innerRadius={52} outerRadius={82} paddingAngle={3} stroke="none">
                  {porArea.map((_, i) => (
                    <Cell key={i} fill={chartColors[i % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                    color: "var(--popover-foreground)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2">
            {porArea.map((a, i) => (
              <li key={a.nombre} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: chartColors[i % chartColors.length] }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{a.nombre}</span>
                <span className="num font-medium">{compact(a.valor)}M</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Tiempos de ciclo</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <Clock className="h-4 w-4 text-primary" />
              <div>
                <p className="num text-lg font-semibold">{kpis.tiempoAprobacion}</p>
                <p className="text-xs text-muted-foreground">Tiempo promedio de aprobación</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <Clock className="h-4 w-4 text-primary" />
              <div>
                <p className="num text-lg font-semibold">{kpis.tiempoRespuesta}</p>
                <p className="text-xs text-muted-foreground">Tiempo promedio de respuesta</p>
              </div>
            </div>
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
              <p className="num text-lg font-semibold">{kpis.proximasVencer}</p>
              <p className="text-xs text-muted-foreground">Facturas próximas a vencer (7 días)</p>
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Top proveedores</h2>
          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProveedores.map((p) => ({ nombre: p.nombre.split(" ")[0], valor: p.valor / 1_000_000 }))}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="nombre" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Bar dataKey="valor" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold">Alertas importantes</h2>
          </div>
          <ul className="mt-4 space-y-3">
            {alertas.map((a) => (
              <li key={a.titulo} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium leading-snug">{a.titulo}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{a.tipo}</span>
                  <span className="text-[11px] text-muted-foreground">Nivel {a.nivel}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Actividad reciente</h2>
          <Link to="/facturas" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Ver todas <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Factura</th>
                <th className="px-5 py-3 font-medium">Proveedor</th>
                <th className="px-5 py-3 font-medium">Área</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {facturas.slice(0, 5).map((f) => (
                <tr key={f.id} className="border-t border-border transition-colors hover:bg-muted/40">
                  <td className="px-5 py-3 font-medium">
                    <Link to="/facturas/$id" params={{ id: f.id }} className="hover:text-primary hover:underline">
                      {f.numero}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{f.proveedor}</td>
                  <td className="px-5 py-3 text-muted-foreground">{f.area}</td>
                  <td className="num px-5 py-3 text-right font-medium">{money(f.total)}</td>
                  <td className="px-5 py-3">
                    <EstadoBadge estado={f.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
