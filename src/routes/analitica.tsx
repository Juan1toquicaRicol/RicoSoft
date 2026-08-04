import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { compact, porArea, serieMensual, topProveedores } from "@/lib/data";

export const Route = createFileRoute("/analitica")({
  head: () => ({
    meta: [
      { title: "Analítica | Facturaflow" },
      { name: "description", content: "Dashboards interactivos y comparativos por proveedor, área, contrato y empresa." },
      { property: "og:title", content: "Analítica | Facturaflow" },
      { property: "og:description", content: "Comparativos mensuales, anuales y por centro de costos." },
    ],
  }),
  component: Analitica,
});

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

const heat = ["Operaciones", "Tecnología", "Compras", "RR. HH.", "Jurídica"];
const meses = ["Mar", "Abr", "May", "Jun", "Jul"];

function Analitica() {
  return (
    <AppShell title="Analítica" description="Comparativos interactivos del gasto documental">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Comparativo mensual</h2>
          <p className="text-xs text-muted-foreground">Recibido vs. aprobado vs. pagado (millones COP)</p>
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serieMensual}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="recibido" fill="var(--chart-1)" radius={[5, 5, 0, 0]} />
                <Bar dataKey="aprobado" fill="var(--chart-3)" radius={[5, 5, 0, 0]} />
                <Bar dataKey="pagado" fill="var(--chart-2)" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Tendencia de aprobación</h2>
          <p className="text-xs text-muted-foreground">Evolución del valor aprobado</p>
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieMensual}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="aprobado" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="pagado" stroke="var(--chart-4)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Mapa de calor por área</h2>
          <p className="text-xs text-muted-foreground">Intensidad del gasto por mes</p>
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[140px_repeat(5,minmax(0,1fr))] gap-1.5">
                <div />
                {meses.map((m) => (
                  <div key={m} className="pb-1 text-center text-[11px] text-muted-foreground">
                    {m}
                  </div>
                ))}
                {heat.map((area, r) => (
                  <div key={area} className="col-span-6 grid grid-cols-[140px_repeat(5,minmax(0,1fr))] gap-1.5">
                    <div className="truncate pr-2 text-xs text-muted-foreground">{area}</div>
                    {meses.map((m, c) => {
                      const intensity = ((r * 7 + c * 11) % 10) / 10;
                      return (
                        <div
                          key={m}
                          className="h-9 rounded-md transition-transform hover:scale-[1.04]"
                          style={{ background: `color-mix(in oklab, var(--chart-1) ${18 + intensity * 70}%, transparent)` }}
                          title={`${area} · ${m}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Top proveedores</h2>
          <ul className="mt-4 space-y-4">
            {topProveedores.map((p) => (
              <li key={p.nit}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-xs font-medium">{p.nombre}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{compact(p.valor)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(p.valor / topProveedores[0].valor) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{p.facturas} facturas</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel mt-4 p-5">
        <h2 className="text-sm font-semibold">Comparativo por centro de costos</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {porArea.map((a) => (
            <div key={a.nombre} className="rounded-xl border border-border p-4">
              <p className="truncate text-xs text-muted-foreground">{a.nombre}</p>
              <p className="num mt-1 text-lg font-semibold">{a.valor}M</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
