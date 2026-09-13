import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight, Info, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
import { PanelColapsable } from "@/components/ui/panel-colapsable";
import {
  useHistoricoVentas,
  useVentasGerencial,
  useVentasPorVendedor,
} from "@/hooks/use-analitica";
import { compact, formatCantidad, money } from "@/lib/data";
import { AnaliticaConstructor, MisAnalisisLista } from "@/components/analitica-constructor";
import type { AnalisisGuardado, ConfiguracionAnalisis } from "@/hooks/use-analitica-constructor";

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

/** "Desde DD/MM/YYYY hasta DD/MM/YYYY" del mes calendario indicado — para que el usuario siempre sepa qué período está viendo, no solo "este mes". */
function formatearRangoMes(anio: number, mes: number): string {
  const inicio = new Date(Date.UTC(anio, mes - 1, 1));
  const fin = new Date(Date.UTC(anio, mes, 0));
  const fmt = (d: Date) =>
    d.toLocaleDateString("es-CO", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  return `Desde ${fmt(inicio)} hasta ${fmt(fin)}`;
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

type VistaAnalitica = "resumen" | "mis-analisis" | "constructor";

function Analitica() {
  const [vista, setVista] = useState<VistaAnalitica>("resumen");
  const [analisisAAbrir, setAnalisisAAbrir] = useState<{
    nombre: string;
    configuracion: ConfiguracionAnalisis;
  } | null>(null);

  function crearAnalisis() {
    setAnalisisAAbrir(null);
    setVista("constructor");
  }

  function abrirAnalisisGuardado(a: AnalisisGuardado) {
    setAnalisisAAbrir({ nombre: a.nombre, configuracion: a.configuracion });
    setVista("constructor");
  }

  return (
    <AppShell
      title="Analítica"
      description="Comparativos interactivos del gasto documental y ventas (calculado desde facturas y Siesa)"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setVista("resumen")}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              vista === "resumen" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500"
            }`}
          >
            Resumen
          </button>
          <button
            type="button"
            onClick={() => setVista("mis-analisis")}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              vista === "mis-analisis" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500"
            }`}
          >
            Mis análisis
          </button>
        </div>
        <Button onClick={crearAnalisis} className="gap-2">
          <Plus className="h-4 w-4" /> Crear análisis
        </Button>
      </div>

      {vista === "constructor" && (
        <AnaliticaConstructor
          key={analisisAAbrir ? `abierto-${analisisAAbrir.nombre}` : "nuevo"}
          nombreInicial={analisisAAbrir?.nombre}
          configuracionInicial={analisisAAbrir?.configuracion}
          onGuardado={() => setVista("mis-analisis")}
        />
      )}

      {vista === "mis-analisis" && (
        <MisAnalisisLista onAbrir={abrirAnalisisGuardado} onCrear={crearAnalisis} />
      )}

      {vista === "resumen" && <AnaliticaResumen />}
    </AppShell>
  );
}

/**
 * Contenido histórico de Analítica (los paneles fijos previos a la P0 de
 * constructor de análisis): sigue reutilizando exactamente los mismos hooks
 * y endpoints de siempre — la lógica/cálculos no se tocan, solo se movieron
 * bajo la pestaña "Resumen" (ver Analitica arriba) para dejar espacio a
 * "Mis análisis" y al constructor configurable.
 */
function AnaliticaResumen() {
  const { ventas, loading: cargandoVentas } = useVentasGerencial();
  const vendedoresVentas = useVentasPorVendedor();
  const cargandoVendedores = vendedoresVentas.loading;

  const [historicoBusqueda, setHistoricoBusqueda] = useState("");
  const [historicoBusquedaDebounced, setHistoricoBusquedaDebounced] = useState("");
  const [historicoDesde, setHistoricoDesde] = useState("");
  const [historicoHasta, setHistoricoHasta] = useState("");
  const [historicoPage, setHistoricoPage] = useState(1);

  // Drill-down (P0 Comercial): KPI/gráfico -> cliente/vendedor/producto ->
  // documento Siesa. Clic en una fila de cualquiera de las tablas de
  // "Inteligencia" filtra el histórico de abajo a esa entidad exacta —
  // nunca texto libre, siempre el rowid ya resuelto por el backend.
  const [drillDown, setDrillDown] = useState<{
    tipo: "cliente" | "vendedor" | "producto";
    id: number;
    nombre: string;
  } | null>(null);

  // El histórico puede ser pesado (85.000+ documentos) y no debe competir
  // con la información operacional del día — se carga solo cuando el
  // usuario lo pide explícitamente, o cuando hace drill-down desde otra
  // sección (eso también cuenta como pedirlo).
  const [historicoCargado, setHistoricoCargado] = useState(false);

  const historico = useHistoricoVentas(
    {
      desde: historicoDesde || undefined,
      hasta: historicoHasta || undefined,
      search: historicoBusquedaDebounced || undefined,
      page: historicoPage,
      pageSize: HISTORICO_PAGE_SIZE,
      clienteRowId: drillDown?.tipo === "cliente" ? drillDown.id : undefined,
      vendedorRowId: drillDown?.tipo === "vendedor" ? drillDown.id : undefined,
      itemRowId: drillDown?.tipo === "producto" ? drillDown.id : undefined,
    },
    historicoCargado,
  );

  useEffect(() => {
    setHistoricoPage(1);
  }, [drillDown]);

  useEffect(() => {
    if (drillDown) setHistoricoCargado(true);
  }, [drillDown]);

  useEffect(() => {
    const t = setTimeout(() => setHistoricoBusquedaDebounced(historicoBusqueda), 300);
    return () => clearTimeout(t);
  }, [historicoBusqueda]);
  useEffect(() => {
    setHistoricoPage(1);
  }, [historicoDesde, historicoHasta, historicoBusquedaDebounced]);

  return (
    <>
      {ventas.disponible && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
          <span>
            Clientes en riesgo (inactivos y con caídas fuertes) ahora vive en{" "}
            <Link to="/oportunidades" className="font-semibold text-blue-700 hover:underline">
              Oportunidades
            </Link>
            .
          </span>
        </div>
      )}

      {ventas.disponible && ventas.periodoActual && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/* "¿Qué está pasando AHORA?" primero — actividad de hoy antes
              que cualquier corte mensual/histórico. */}
          <div className="panel p-4 bg-white border-slate-200 shadow-2xs sm:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total de ventas hoy
            </p>
            <p className="num mt-1 text-3xl font-bold text-slate-900">
              {vendedoresVentas.resumenHoy ? money(vendedoresVentas.resumenHoy.neto) : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {vendedoresVentas.resumenHoy
                ? `${vendedoresVentas.resumenHoy.documentos} documentos hoy`
                : "Sin datos de hoy"}
            </p>
          </div>
          <div className="panel p-4 bg-white border-slate-200 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Ventas hoy · kg/Toneladas
            </p>
            <p className="num mt-1 text-lg font-bold text-slate-900">
              {vendedoresVentas.resumenHoy
                ? formatCantidad(vendedoresVentas.resumenHoy.kilos, "KG")
                : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Solo productos vendidos por kilo (Siesa)
            </p>
          </div>
          <div className="panel p-4 bg-white border-slate-200 shadow-2xs sm:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Venta del mes
            </p>
            <p className="num mt-1 text-lg font-bold text-slate-900">
              {money(ventas.periodoActual.neto)}
            </p>
            {ventas.variacionNetaPct !== null && ventas.variacionNetaPct !== undefined && (
              <p
                className={`mt-0.5 text-[11px] font-semibold ${ventas.variacionNetaPct >= 0 ? "text-blue-700" : "text-slate-500"}`}
              >
                {ventas.variacionNetaPct >= 0 ? "+" : ""}
                {ventas.variacionNetaPct}% vs. mes anterior
              </p>
            )}
          </div>
          <div className="panel p-4 bg-white border-slate-200 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Ventas mes · kg/Toneladas
            </p>
            <p className="num mt-1 text-lg font-bold text-slate-900">
              {vendedoresVentas.resumenMes
                ? formatCantidad(vendedoresVentas.resumenMes.kilos, "KG")
                : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Solo productos vendidos por kilo (Siesa)
            </p>
          </div>
        </div>
      )}

      {ventas.disponible && (
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
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
      )}

      {!cargandoVentas && !ventas.disponible && (
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
          {ventas.motivo ?? "Ventas no disponibles."}
        </div>
      )}

      {/* "¿Cómo van las ventas de HOY?" — prioridad visual inmediatamente
          debajo de la evolución mensual: la actividad del día pesa más que
          cualquier análisis histórico (jerarquía: ahora > atención > acción
          > por qué > histórico). */}
      {ventas.disponible &&
        vendedoresVentas.disponible &&
        vendedoresVentas.detalleHoy.length > 0 && (
          <PanelColapsable
            className="mt-4"
            title="Detalle de hoy, por hora"
            description="Ritmo de venta del día — ayuda a detectar horas fuertes y horas débiles"
          >
            <div className="max-h-80 overflow-y-auto overflow-x-auto">
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
          </PanelColapsable>
        )}

      {ventas.disponible &&
        vendedoresVentas.disponible &&
        vendedoresVentas.vendedores.length > 0 && (
          <PanelColapsable
            className="mt-4"
            title="Ventas diarias por vendedor"
            description={`Ranking por venta · ${ventas.periodoActual ? formatearRangoMes(ventas.periodoActual.anio, ventas.periodoActual.mes) : "mes actual"} (Siesa)${cargandoVendedores ? " · cargando…" : ""}`}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-100/80">
                  <TableRow className="hover:bg-slate-100/80">
                    <TableHead className="w-8" />
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
                    <FilaVendedor
                      key={v.vendedorRowId ?? v.vendedorNombre}
                      vendedor={v}
                      detalleHoy={vendedoresVentas.detalleHoy}
                      onVerHistorico={() =>
                        v.vendedorRowId &&
                        setDrillDown({
                          tipo: "vendedor",
                          id: v.vendedorRowId,
                          nombre: v.vendedorNombre ?? "Vendedor",
                        })
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </PanelColapsable>
        )}

      <div className="mt-6 mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Info className="h-3.5 w-3.5" /> Histórico de ventas (Siesa)
        </div>
        {drillDown && (
          <button
            onClick={() => setDrillDown(null)}
            className="cursor-pointer rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
            title="Quitar filtro"
          >
            Filtrado por {drillDown.tipo}: {drillDown.nombre} ✕
          </button>
        )}
      </div>

      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        {!historicoCargado ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="max-w-md text-xs text-slate-500">
              El histórico completo de documentos de venta puede ser pesado — se carga solo cuando
              lo pides, para no competir con la información operacional del día.
            </p>
            <Button onClick={() => setHistoricoCargado(true)} className="gap-2">
              Cargar ventas históricas
            </Button>
          </div>
        ) : !historico.disponible && !historico.loading ? (
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

            <p className="border-b border-slate-200 bg-slate-50/80 px-4 pb-3 text-[11px] text-slate-500">
              Mostrando {historicoDesde || "los últimos 12 meses"}
              {historicoDesde ? "" : " (por defecto)"}
              {historicoHasta ? ` hasta ${historicoHasta}` : ""}.
            </p>

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
    </>
  );
}

interface VendedorRanking {
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  hoy: number;
  ayer: number;
  ultimos7Dias: number;
  mesActual: number;
  documentosMesActual: number;
}

interface VentaDeHoyItem {
  id: number;
  hora: string;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  clienteRowId: number | null;
  clienteNombre: string | null;
  neto: number;
}

/**
 * Fila expandible de "Ventas diarias por vendedor": al desplegar, muestra
 * las ventas de HOY de ese vendedor (filtrado en cliente sobre el
 * detalleHoy ya traído por el backend — no es un cálculo nuevo, es un
 * filtro sobre datos ya agregados). Para el histórico completo del
 * período, un link reutiliza el drill-down ya existente hacia la tabla de
 * abajo, en vez de duplicar la consulta aquí.
 */
function FilaVendedor({
  vendedor: v,
  detalleHoy,
  onVerHistorico,
}: {
  vendedor: VendedorRanking;
  detalleHoy: VentaDeHoyItem[];
  onVerHistorico: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ventasDeHoy = detalleHoy.filter((d) => d.vendedorRowId === v.vendedorRowId);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setAbierto((a) => !a)}>
        <TableCell className="w-8">
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`}
          />
        </TableCell>
        <TableCell className="text-xs font-semibold text-slate-800">
          {v.vendedorNombre ?? "Sin nombre"}
        </TableCell>
        <TableCell className="num text-right text-xs text-slate-600">{money(v.hoy)}</TableCell>
        <TableCell className="num text-right text-xs text-slate-600">{money(v.ayer)}</TableCell>
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
      {abierto && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={7} className="bg-slate-50/60 px-6 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Ventas de hoy de {v.vendedorNombre ?? "este vendedor"}
            </p>
            {ventasDeHoy.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">Sin ventas registradas hoy todavía.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {ventasDeHoy.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-500">
                      {new Date(d.hora).toLocaleTimeString("es-CO", {
                        timeZone: "UTC",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {d.clienteNombre ?? "Sin cliente"}
                    </span>
                    <span className="num shrink-0 font-semibold text-slate-900">
                      {money(d.neto)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onVerHistorico();
              }}
              className="mt-3 cursor-pointer text-[11px] font-semibold text-blue-700 hover:underline"
            >
              Ver histórico completo de este vendedor ↓
            </button>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
