import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAnalitica,
  useHistoricoVentas,
  useVentasGerencial,
  useVentasPorVendedor,
} from "@/hooks/use-analitica";
import { compact, money } from "@/lib/data";

const HISTORICO_PAGE_SIZE = 20;

const MESES_CORTOS_VENTAS = [
  "",
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export const Route = createFileRoute("/analitica")({
  head: () => ({
    meta: [
      { title: "Analítica | RicoSoft" },
      {
        name: "description",
        content: "Dashboards interactivos y comparativos por proveedor, área, contrato y empresa.",
      },
      { property: "og:title", content: "Analítica | RicoSoft" },
      {
        property: "og:description",
        content: "Comparativos mensuales, anuales y por centro de costos.",
      },
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

function Analitica() {
  const { serieMensual, topProveedores, porArea, loading, error } = useAnalitica();
  const { ventas, loading: cargandoVentas } = useVentasGerencial();
  const vendedoresVentas = useVentasPorVendedor();
  const cargandoVendedores = vendedoresVentas.loading;

  const [historicoBusqueda, setHistoricoBusqueda] = useState("");
  const [historicoBusquedaDebounced, setHistoricoBusquedaDebounced] = useState("");
  const [historicoDesde, setHistoricoDesde] = useState("");
  const [historicoHasta, setHistoricoHasta] = useState("");
  const [historicoPage, setHistoricoPage] = useState(1);
  const historico = useHistoricoVentas({
    desde: historicoDesde || undefined,
    hasta: historicoHasta || undefined,
    search: historicoBusquedaDebounced || undefined,
    page: historicoPage,
    pageSize: HISTORICO_PAGE_SIZE,
  });

  useEffect(() => {
    const t = setTimeout(() => setHistoricoBusquedaDebounced(historicoBusqueda), 300);
    return () => clearTimeout(t);
  }, [historicoBusqueda]);
  useEffect(() => {
    setHistoricoPage(1);
  }, [historicoDesde, historicoHasta, historicoBusquedaDebounced]);

  return (
    <AppShell
      title="Analítica"
      description="Comparativos interactivos del gasto documental y ventas (calculado desde facturas y Siesa)"
    >
      {ventas.disponible && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
          <span>
            Clientes en riesgo (inactivos y con caídas fuertes) ahora vive en{" "}
            <Link to="/ventas" className="font-semibold text-blue-700 hover:underline">
              Ventas
            </Link>
            , el centro operativo comercial.
          </span>
        </div>
      )}

      {ventas.disponible && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs lg:col-span-2">
            <h2 className="text-sm font-bold text-slate-900">Evolución de ventas</h2>
            <p className="text-xs text-slate-500">Ventas netas mensuales (Siesa)</p>
            <div className="mt-4 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(ventas.serieMensual ?? []).map((m) => ({
                    mes: MESES_CORTOS_VENTAS[m.mes],
                    neto: m.neto,
                  }))}
                >
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
                    tickFormatter={(v) => compact(v)}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
                  <Bar dataKey="neto" fill="var(--chart-1)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Top clientes del mes</h2>
            {(ventas.topClientes ?? []).length === 0 && (
              <p className="mt-4 text-xs text-slate-500">Sin ventas registradas este mes.</p>
            )}
            <ul className="mt-4 space-y-4">
              {(ventas.topClientes ?? []).map((c) => (
                <li key={c.clienteRowId ?? c.clienteNombre}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs font-semibold text-slate-800">
                      {c.clienteNombre ?? "Cliente sin nombre"}
                    </span>
                    <span className="num shrink-0 text-xs text-slate-500">{compact(c.neto)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-800"
                      style={{
                        width: `${(c.neto / (ventas.topClientes?.[0]?.neto ?? 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{c.documentos} documentos</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!cargandoVentas && !ventas.disponible && (
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
          {ventas.motivo ?? "Ventas no disponibles."}
        </div>
      )}

      {ventas.disponible && (ventas.topProductosKilos ?? []).length > 0 && (
        <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Top en kilos</h2>
          <p className="text-xs text-slate-500">
            Productos con más kilos vendidos este mes (Siesa) · cantidad, referencia y
            margen/utilidad
          </p>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow className="hover:bg-slate-100/80">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Referencia
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Producto
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Kilos
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Venta neta
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Margen/utilidad
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ventas.topProductosKilos ?? []).map((p) => (
                  <TableRow key={p.itemRowId} className="hover:bg-slate-50/80">
                    <TableCell className="text-xs text-slate-600">{p.referencia ?? "—"}</TableCell>
                    <TableCell className="text-xs font-semibold text-slate-800">
                      {p.descripcion ?? "Producto sin descripción"}
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-700">
                      {compact(p.kilos)} kg
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-700">
                      {money(p.neto)}
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-700">
                      {money(p.margen)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {ventas.disponible && (ventas.topClientesPorMargen ?? []).length > 0 && (
        <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Top clientes por margen</h2>
          <p className="text-xs text-slate-500">
            Clientes que más utilidad real dejan este mes (Siesa) — no necesariamente los que más
            compran
          </p>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow className="hover:bg-slate-100/80">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Cliente
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Venta neta
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Costo
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Margen/utilidad
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Margen %
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ventas.topClientesPorMargen ?? []).map((c) => (
                  <TableRow
                    key={c.clienteRowId ?? c.clienteNombre}
                    className="hover:bg-slate-50/80"
                  >
                    <TableCell className="text-xs font-semibold text-slate-800">
                      {c.clienteNombre ?? "Cliente sin nombre"}
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-700">
                      {money(c.neto)}
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-700">
                      {money(c.costo)}
                    </TableCell>
                    <TableCell className="num text-right text-xs font-bold text-slate-900">
                      {money(c.margen)}
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-500">
                      {c.neto > 0 ? `${((c.margen / c.neto) * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {ventas.disponible &&
        vendedoresVentas.disponible &&
        vendedoresVentas.vendedores.length > 0 && (
          <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Ventas diarias por vendedor</h2>
            <p className="text-xs text-slate-500">
              Ranking por venta del mes actual (Siesa) · {cargandoVendedores ? "cargando…" : null}
            </p>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-100/80">
                  <TableRow className="hover:bg-slate-100/80">
                    <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Vendedor
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Hoy
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Ayer
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Últimos 7 días
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Mes actual
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Documentos
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendedoresVentas.vendedores.map((v) => (
                    <TableRow key={v.vendedorRowId ?? v.vendedorNombre}>
                      <TableCell className="text-xs font-semibold text-slate-800">
                        {v.vendedorNombre ?? "Sin nombre"}
                      </TableCell>
                      <TableCell className="num text-right text-xs text-slate-600">
                        {money(v.hoy)}
                      </TableCell>
                      <TableCell className="num text-right text-xs text-slate-600">
                        {money(v.ayer)}
                      </TableCell>
                      <TableCell className="num text-right text-xs text-slate-600">
                        {money(v.ultimos7Dias)}
                      </TableCell>
                      <TableCell className="num text-right text-xs font-bold text-slate-900">
                        {money(v.mesActual)}
                      </TableCell>
                      <TableCell className="num text-right text-xs text-slate-500">
                        {v.documentosMesActual}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {vendedoresVentas.detalleHoy.length > 0 && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h3 className="text-xs font-bold text-slate-900">Detalle de hoy, por hora</h3>
                <div className="mt-2 max-h-72 overflow-y-auto overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/80">
                      <TableRow className="hover:bg-slate-100/80">
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Hora
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Vendedor
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Cliente
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Neto
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendedoresVentas.detalleHoy.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="num text-xs text-slate-600">
                            {new Date(v.hora).toLocaleTimeString("es-CO", {
                              timeZone: "UTC",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">
                            {v.vendedorNombre ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">
                            <div className="min-w-0 truncate max-w-[220px]">
                              {v.clienteNombre ?? "Sin cliente"}
                            </div>
                          </TableCell>
                          <TableCell className="num text-right text-xs font-semibold text-slate-900">
                            {money(v.neto)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {vendedoresVentas.topVendedoresPorMargen.length > 0 && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h3 className="text-xs font-bold text-slate-900">Vendedores por margen</h3>
                <p className="text-[11px] text-slate-500">
                  Quién deja más utilidad real este mes, no solo quién más vende
                </p>
                <div className="mt-2 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/80">
                      <TableRow className="hover:bg-slate-100/80">
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Vendedor
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Venta neta
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Costo
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Margen/utilidad
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Margen %
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendedoresVentas.topVendedoresPorMargen.map((v) => (
                        <TableRow
                          key={v.vendedorRowId ?? v.vendedorNombre}
                          className="hover:bg-slate-50/80"
                        >
                          <TableCell className="text-xs font-semibold text-slate-800">
                            {v.vendedorNombre ?? "Sin nombre"}
                          </TableCell>
                          <TableCell className="num text-right text-xs text-slate-600">
                            {money(v.neto)}
                          </TableCell>
                          <TableCell className="num text-right text-xs text-slate-600">
                            {money(v.costo)}
                          </TableCell>
                          <TableCell className="num text-right text-xs font-bold text-slate-900">
                            {money(v.margen)}
                          </TableCell>
                          <TableCell className="num text-right text-xs text-slate-500">
                            {v.neto > 0 ? `${((v.margen / v.neto) * 100).toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

      <div className="mt-6 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
        <Info className="h-3.5 w-3.5" /> Histórico de ventas (Siesa)
      </div>

      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        {!historico.disponible && !historico.loading ? (
          <div className="p-5 text-xs text-slate-500">{historico.motivo ?? "No disponible."}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:flex lg:items-end lg:justify-between bg-slate-50/80">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-500 uppercase">
                    Desde
                  </Label>
                  <Input
                    type="date"
                    value={historicoDesde}
                    onChange={(e) => setHistoricoDesde(e.target.value)}
                    className="h-9 text-xs border-slate-300 bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-500 uppercase">
                    Hasta
                  </Label>
                  <Input
                    type="date"
                    value={historicoHasta}
                    onChange={(e) => setHistoricoHasta(e.target.value)}
                    className="h-9 text-xs border-slate-300 bg-white"
                  />
                </div>
              </div>
              <Input
                value={historicoBusqueda}
                onChange={(e) => setHistoricoBusqueda(e.target.value)}
                placeholder="Buscar por cliente, NIT o vendedor..."
                className="h-9 w-full max-w-xs bg-white text-xs border-slate-300 shadow-2xs"
              />
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-100/80">
                  <TableRow className="hover:bg-slate-100/80">
                    <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Fecha
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Cliente
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Vendedor
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Referencia
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Neto
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.loading && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-xs text-slate-500">
                        Cargando...
                      </TableCell>
                    </TableRow>
                  )}
                  {!historico.loading && historico.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-xs text-slate-500">
                        {historico.error || "No hay ventas registradas para estos filtros."}
                      </TableCell>
                    </TableRow>
                  )}
                  {historico.items.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="text-xs text-slate-600">
                        {new Date(doc.fecha).toLocaleDateString("es-CO", { timeZone: "UTC" })}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-800">
                        <div className="min-w-0 truncate max-w-[220px]">
                          {doc.clienteNombre ?? "Sin cliente"}
                        </div>
                        {doc.clienteNit && (
                          <div className="text-[11px] text-slate-400">{doc.clienteNit}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {doc.vendedorNombre ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {doc.referencia || "—"}
                      </TableCell>
                      <TableCell className="num text-right text-xs font-bold text-slate-900">
                        {money(doc.neto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {historico.total > 0 && (
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-500">
                <p>
                  {historico.items.length} de {historico.total} documentos — página {historicoPage}{" "}
                  de {historico.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={historicoPage <= 1 || historico.loading}
                    onClick={() => setHistoricoPage((p) => Math.max(1, p - 1))}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={historicoPage >= historico.totalPages || historico.loading}
                    onClick={() => setHistoricoPage((p) => Math.min(historico.totalPages, p + 1))}
                    className="gap-1"
                  >
                    Siguiente <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-6 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
        <Info className="h-3.5 w-3.5" /> Gasto documental (Facturas de Proveedores)
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Comparativo mensual</h2>
          <p className="text-xs text-slate-500">Recibido vs. aprobado vs. pagado (millones COP)</p>
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serieMensual}>
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
                <Bar dataKey="recibido" fill="var(--chart-1)" radius={[5, 5, 0, 0]} />
                <Bar dataKey="aprobado" fill="var(--chart-3)" radius={[5, 5, 0, 0]} />
                <Bar dataKey="pagado" fill="var(--chart-2)" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Tendencia de aprobación</h2>
          <p className="text-xs text-slate-500">Evolución del valor aprobado</p>
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieMensual}>
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
                <Line
                  type="monotone"
                  dataKey="aprobado"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="pagado"
                  stroke="var(--chart-4)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900">Top proveedores</h2>
        {topProveedores.length === 0 && (
          <p className="mt-4 text-xs text-slate-500">
            {loading ? "Cargando..." : error || "Aún no hay facturas registradas."}
          </p>
        )}
        <ul className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {topProveedores.map((p) => (
            <li key={p.nit}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-xs font-semibold text-slate-800">
                  {p.nombre}
                </span>
                <span className="num shrink-0 text-xs text-slate-500">{compact(p.valor)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-800"
                  style={{ width: `${(p.valor / (topProveedores[0]?.valor ?? 1)) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{p.facturas} facturas</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900">Comparativo por centro de costos</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {porArea.map((a) => (
            <div key={a.nombre} className="rounded-xl border border-slate-200 p-4">
              <p className="truncate text-xs text-slate-500">{a.nombre}</p>
              <p className="num mt-1 text-lg font-bold text-slate-900">{a.valor}M</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
