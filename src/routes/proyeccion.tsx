import { createFileRoute } from "@tanstack/react-router";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppShell } from "@/components/app-shell";
import { money, proyeccion, serieMensual } from "@/lib/data";

export const Route = createFileRoute("/proyeccion")({
  head: () => ({
    meta: [
      { title: "Proyección financiera | Facturaflow" },
      { name: "description", content: "Proyecciones trimestrales, semestrales y anuales del gasto con alertas de sobrecosto." },
      { property: "og:title", content: "Proyección financiera | Facturaflow" },
      { property: "og:description", content: "Tendencias, variaciones y predicciones del gasto empresarial." },
    ],
  }),
  component: Proyeccion,
});

const indicadores = [
  { label: "Gasto mensual", value: 4820500000, delta: "+7,6%", up: true },
  { label: "Promedio mensual", value: 3805000000, delta: "+3,1%", up: true },
  { label: "Proyección trimestral", value: 15730000000, delta: "+9,2%", up: true },
  { label: "Proyección anual", value: 58940000000, delta: "-1,4%", up: false },
];

const serie = [
  ...serieMensual.map((s) => ({ mes: s.mes, real: s.recibido, proyectado: null as number | null })),
  ...proyeccion,
];

function Proyeccion() {
  return (
    <AppShell title="Proyección financiera" description="Modelo de tendencia sobre histórico de 7 meses">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indicadores.map((i) => (
          <div key={i.label} className="panel p-5">
            <p className="text-xs text-muted-foreground">{i.label}</p>
            <p className="num mt-2 text-xl font-semibold">{money(i.value)}</p>
            <p className={`mt-1 inline-flex items-center gap-1 text-[11px] ${i.up ? "text-destructive" : "text-success"}`}>
              {i.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {i.delta} vs. periodo anterior
            </p>
          </div>
        ))}
      </div>

      <div className="panel mt-4 p-5">
        <h2 className="text-sm font-semibold">Histórico y proyección</h2>
        <p className="text-xs text-muted-foreground">Millones COP · línea punteada = proyección</p>
        <div className="mt-4 h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serie}>
              <defs>
                <linearGradient id="pReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pProy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
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
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="real" stroke="var(--chart-1)" fill="url(#pReal)" strokeWidth={2.5} connectNulls />
              <Area
                type="monotone"
                dataKey="proyectado"
                stroke="var(--chart-4)"
                fill="url(#pProy)"
                strokeWidth={2.5}
                strokeDasharray="6 5"
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel mt-4 border-warning/30 bg-warning/8 p-5">
        <h2 className="text-sm font-semibold">Alertas de sobrecosto</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>El contrato C-2041 alcanzaría el 100% de ejecución en septiembre de 2026.</li>
          <li>El área de Tecnología supera en 18% su promedio histórico mensual.</li>
          <li>La proyección anual excede el presupuesto aprobado en $2.140 millones.</li>
        </ul>
      </div>
    </AppShell>
  );
}
