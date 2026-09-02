import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Info,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { useAnalitica, useResumenGerencial } from "@/hooks/use-analitica";
import { money } from "@/lib/data";
import { cn } from "@/lib/utils";

const BUCKET_LABELS: {
  key: "vencido" | "dias0a30" | "dias31a60" | "dias61a90" | "mas90";
  label: string;
}[] = [
  { key: "vencido", label: "Vencido" },
  { key: "dias0a30", label: "0-30 días" },
  { key: "dias31a60", label: "31-60 días" },
  { key: "dias61a90", label: "61-90 días" },
  { key: "mas90", label: "+90 días" },
];

const SEVERIDAD_ESTILO: Record<"alta" | "media", string> = {
  alta: "border-red-200 bg-red-50 text-red-700",
  media: "border-amber-200 bg-amber-50 text-amber-800",
};

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

export const Route = createFileRoute("/proyeccion")({
  head: () => ({
    meta: [
      { title: "Proyección financiera | RicoSoft" },
      {
        name: "description",
        content:
          "Cartera, cuentas por pagar, flujo proyectado y proyección de gasto calculados desde datos reales.",
      },
      { property: "og:title", content: "Proyección financiera | RicoSoft" },
      { property: "og:description", content: "Tendencias y proyecciones del gasto empresarial." },
    ],
  }),
  component: Proyeccion,
});

function Proyeccion() {
  const { serieMensual, proyeccion, loading, error } = useAnalitica();
  const {
    resumen: gerencial,
    loading: cargandoGerencial,
    error: errorGerencial,
  } = useResumenGerencial();
  const flujo30 = gerencial.flujo.d30;

  const ultimoMes = serieMensual.at(-1);
  const mesAnterior = serieMensual.at(-2);
  const promedioMensual =
    serieMensual.length > 0
      ? serieMensual.reduce((acc, s) => acc + s.recibido, 0) / serieMensual.length
      : 0;
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

  const serieGasto = [
    ...serieMensual.map((s) => ({
      mes: s.mes,
      real: s.recibido,
      proyectado: null as number | null,
    })),
    ...proyeccion,
  ];

  return (
    <AppShell
      title="Proyección financiera"
      description="Cartera, cuentas por pagar, flujo proyectado y proyección de gasto"
    >
      {/* ── Cartera, cuentas por pagar y flujo ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500">Cuentas por cobrar</p>
          <p className="num mt-2 text-xl font-bold text-slate-900">
            {cargandoGerencial ? "…" : money(gerencial.cartera.total)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {cargandoGerencial ? "" : `Vencido: ${money(gerencial.cartera.buckets.vencido)}`}
          </p>
        </div>
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500">Cuentas por pagar</p>
          <p className="num mt-2 text-xl font-bold text-slate-900">
            {cargandoGerencial ? "…" : money(gerencial.cuentasPorPagar.total)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {cargandoGerencial
              ? ""
              : `Vencido: ${money(gerencial.cuentasPorPagar.buckets.vencido)}`}
          </p>
        </div>
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500">Flujo proyectado (30 días)</p>
          <p
            className={cn(
              "num mt-2 flex items-center gap-1.5 text-xl font-bold",
              flujo30 && flujo30.neto < 0 ? "text-red-600" : "text-slate-900",
            )}
          >
            {!cargandoGerencial &&
              flujo30 &&
              (flujo30.neto < 0 ? (
                <ArrowDownRight className="h-4 w-4" />
              ) : (
                <ArrowUpRight className="h-4 w-4" />
              ))}
            {cargandoGerencial || !flujo30 ? "…" : money(flujo30.neto)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {cargandoGerencial || !flujo30
              ? ""
              : `Cobros ${money(flujo30.ingresosEsperados)} · Pagos ${money(flujo30.egresosEsperados)}`}
          </p>
        </div>
      </div>

      {errorGerencial && <p className="mt-2 text-xs text-red-600">{errorGerencial}</p>}

      {!cargandoGerencial && gerencial.alertas.length > 0 && (
        <div className="mt-4 space-y-2">
          {gerencial.alertas.map((a) => (
            <div
              key={a.tipo}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                SEVERIDAD_ESTILO[a.severidad],
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{a.mensaje}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Cartera por antigüedad</h2>
          <p className="text-xs text-slate-500">Cuentas por cobrar agrupadas por vencimiento</p>
          <div className="mt-4 space-y-2">
            {BUCKET_LABELS.map(({ key, label }) => {
              const valor = gerencial.cartera.buckets[key];
              const max = Math.max(1, gerencial.cartera.total);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">{label}</span>
                    <span className="num font-semibold text-slate-800">{money(valor)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        key === "vencido" ? "bg-red-500" : "bg-blue-800",
                      )}
                      style={{ width: `${(valor / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {gerencial.cartera.topClientes.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-bold text-slate-900">Top clientes</h3>
              <ul className="mt-2 space-y-1.5">
                {gerencial.cartera.topClientes.map((c) => (
                  <li key={c.cliente} className="flex items-center justify-between text-xs">
                    <span className="min-w-0 truncate text-slate-700">{c.cliente}</span>
                    <span className="num shrink-0 text-slate-500">
                      {money(c.saldo)}
                      {c.porcentaje !== null && ` · ${c.porcentaje}%`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Obligaciones por antigüedad</h2>
          <p className="text-xs text-slate-500">Cuentas por pagar agrupadas por vencimiento</p>
          <div className="mt-4 space-y-2">
            {BUCKET_LABELS.map(({ key, label }) => {
              const valor = gerencial.cuentasPorPagar.buckets[key];
              const max = Math.max(1, gerencial.cuentasPorPagar.total);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">{label}</span>
                    <span className="num font-semibold text-slate-800">{money(valor)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        key === "vencido" ? "bg-red-500" : "bg-blue-800",
                      )}
                      style={{ width: `${(valor / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {gerencial.cuentasPorPagar.topProveedores.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-bold text-slate-900">Top proveedores</h3>
              <ul className="mt-2 space-y-1.5">
                {gerencial.cuentasPorPagar.topProveedores.map((p) => (
                  <li
                    key={p.proveedorId ?? p.nombre}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="min-w-0 truncate text-slate-700">{p.nombre}</span>
                    <span className="num shrink-0 text-slate-500">
                      {money(p.saldo)}
                      {p.porcentaje !== null && ` · ${p.porcentaje}%`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {gerencial.financieroSiesa.disponible && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Cartera real (Siesa, en vivo)</h2>
            <p className="text-xs text-slate-500">
              Saldo abierto por antigüedad — leído en vivo de la contabilidad de Siesa, no de
              RicoSoft
            </p>
            <div className="mt-4 space-y-2">
              {BUCKET_LABELS.map(({ key, label }) => {
                const valor = gerencial.financieroSiesa.cartera!.buckets[key];
                const max = Math.max(1, gerencial.financieroSiesa.cartera!.total);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">{label}</span>
                      <span className="num font-semibold text-slate-800">{money(valor)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          key === "vencido" ? "bg-red-500" : "bg-blue-800",
                        )}
                        style={{ width: `${(valor / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {gerencial.financieroSiesa.cartera!.topTerceros.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-bold text-slate-900">Top clientes</h3>
                <ul className="mt-2 space-y-1.5">
                  {gerencial.financieroSiesa.cartera!.topTerceros.map((t) => (
                    <li
                      key={t.terceroRowId ?? t.nombre}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="min-w-0 truncate text-slate-700">{t.nombre}</span>
                      <span className="num shrink-0 text-slate-500">
                        {money(t.saldo)}
                        {t.porcentaje !== null && ` · ${t.porcentaje}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">
              Obligaciones reales (Siesa, en vivo)
            </h2>
            <p className="text-xs text-slate-500">
              Incluye proveedores y obligaciones financieras (bancos) — leído en vivo de la
              contabilidad de Siesa
            </p>
            <div className="mt-4 space-y-2">
              {BUCKET_LABELS.map(({ key, label }) => {
                const valor = gerencial.financieroSiesa.cuentasPorPagar!.buckets[key];
                const max = Math.max(1, gerencial.financieroSiesa.cuentasPorPagar!.total);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">{label}</span>
                      <span className="num font-semibold text-slate-800">{money(valor)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          key === "vencido" ? "bg-red-500" : "bg-blue-800",
                        )}
                        style={{ width: `${(valor / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {gerencial.financieroSiesa.cuentasPorPagar!.topTerceros.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-bold text-slate-900">Top acreedores</h3>
                <ul className="mt-2 space-y-1.5">
                  {gerencial.financieroSiesa.cuentasPorPagar!.topTerceros.map((t) => (
                    <li
                      key={t.terceroRowId ?? t.nombre}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="min-w-0 truncate text-slate-700">{t.nombre}</span>
                      <span className="num shrink-0 text-slate-500">
                        {money(t.saldo)}
                        {t.porcentaje !== null && ` · ${t.porcentaje}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Proyección de gasto (registrada manualmente por Finanzas) ── */}
      <div className="mt-6 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
        <Info className="h-3.5 w-3.5" /> Proyección de gasto (Finanzas)
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {indicadores.map((i) => (
          <div key={i.label} className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {i.label}
            </p>
            <p className="num mt-1 text-2xl font-bold text-slate-900">{money(i.value)}</p>
            {i.delta && (
              <p
                className={`mt-1 inline-flex items-center gap-1 text-[11px] ${i.up ? "text-success" : "text-destructive"}`}
              >
                {i.up ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {i.delta}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900">Histórico y proyección</h2>
        <p className="text-xs text-slate-500">
          {loading
            ? "Cargando..."
            : error ||
              "Línea sólida = facturas reales · línea punteada = proyección registrada por Finanzas"}
        </p>
        <div className="mt-4 h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serieGasto}>
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
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                stroke="var(--muted-foreground)"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={12}
                stroke="var(--muted-foreground)"
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="real"
                stroke="var(--chart-1)"
                fill="url(#pReal)"
                strokeWidth={2.5}
                connectNulls
              />
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
        <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
          Finanzas aún no ha registrado proyecciones para los próximos meses.
        </div>
      )}
    </AppShell>
  );
}
