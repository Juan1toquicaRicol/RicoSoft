import { createFileRoute } from "@tanstack/react-router";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppShell } from "@/components/app-shell";
import { useAnalitica } from "@/hooks/use-analitica";
import { money } from "@/lib/data";

export const Route = createFileRoute("/proyeccion")({
  head: () => ({
    meta: [
      { title: "Proyección financiera | RicoSoft" },
      { name: "description", content: "Proyecciones del gasto calculadas desde el histórico real de facturas." },
      { property: "og:title", content: "Proyección financiera | RicoSoft" },
      { property: "og:description", content: "Tendencias y proyecciones del gasto empresarial." },
    ],
  }),
  component: Proyeccion,
});

function Proyeccion() {
  const { serieMensual, proyeccion, loading, error } = useAnalitica();

  const ultimoMes = serieMensual.at(-1);
  const mesAnterior = serieMensual.at(-2);
  const promedioMensual =
    serieMensual.length > 0 ? serieMensual.reduce((acc, s) => acc + s.recibido, 0) / serieMensual.length : 0;
  const deltaUltimoMes =
    ultimoMes && mesAnterior && mesAnterior.recibido > 0
      ? ((ultimoMes.recibido - mesAnterior.recibido) / mesAnterior.recibido) * 100
      : 0;
  const totalProyectado = proyeccion.reduce((acc, p) => acc + p.proyectado, 0);

  const indicadores = [
    {
      label: "Gasto último mes registrado",
      value: ultimoMes?.recibido ?? 0,
      delta: `${deltaUltimoMes >= 0 ? "+" : ""}${deltaUltimoMes.toFixed(1)}%`,
      up: deltaUltimoMes >= 0,
    },
    { label: "Promedio mensual (7 meses)", value: promedioMensual, delta: null, up: true },
    {
      label: "Proyección acumulada registrada",
      value: totalProyectado,
      delta: proyeccion.length > 0 ? `${proyeccion.length} meses` : null,
      up: true,
    },
  ];

  const serie = [
    ...serieMensual.map((s) => ({ mes: s.mes, real: s.recibido, proyectado: null as number | null })),
    ...proyeccion,
  ];

  return (
    <AppShell
      title="Proyección financiera"
      description="Histórico real de facturas y proyección registrada manualmente por Finanzas"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {indicadores.map((i) => (
          <div key={i.label} className="panel p-5">
            <p className="text-xs text-muted-foreground">{i.label}</p>
            <p className="num mt-2 text-xl font-semibold">{money(i.value)}</p>
            {i.delta && (
              <p
                className={`mt-1 inline-flex items-center gap-1 text-[11px] ${i.up ? "text-success" : "text-destructive"}`}
              >
                {i.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {i.delta}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="panel mt-4 p-5">
        <h2 className="text-sm font-semibold">Histórico y proyección</h2>
        <p className="text-xs text-muted-foreground">
          {loading
            ? "Cargando..."
            : error || "Línea sólida = facturas reales · línea punteada = proyección registrada por Finanzas"}
        </p>
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

      {proyeccion.length === 0 && !loading && (
        <div className="panel mt-4 p-5 text-sm text-muted-foreground">
          Finanzas aún no ha registrado proyecciones para los próximos meses.
        </div>
      )}
    </AppShell>
  );
}
