import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Area,
  AreaChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCatalogoAnalisis,
  useEjecutarAnalisis,
  useAnalisisGuardados,
  type ConfiguracionAnalisis,
  type DimensionKey,
  type MetricaKey,
  type OrdenDireccion,
  type ResultadoAnalisis,
  type VisualizacionKey,
  type AnalisisGuardado,
} from "@/hooks/use-analitica-constructor";
import { compact, money, formatCantidad } from "@/lib/data";

const COLORES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

function inicioMesActualISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Plantilla {
  key: string;
  nombre: string;
  descripcion: string;
  config: Partial<ConfiguracionAnalisis>;
}

const PLANTILLAS: Plantilla[] = [
  {
    key: "margen-cliente",
    nombre: "Margen por cliente",
    descripcion: "Clientes que más utilidad real dejan este mes",
    config: {
      metrica: "margen",
      dimensionPrincipal: "cliente",
      orden: "desc",
      ordenarPor: "margen",
      limite: 10,
      visualizacion: "barras",
    },
  },
  {
    key: "ventas-diarias-vendedor",
    nombre: "Ventas diarias por vendedor",
    descripcion: "Cómo va vendiendo cada vendedor este mes",
    config: {
      metrica: "ventas",
      dimensionPrincipal: "vendedor",
      orden: "desc",
      ordenarPor: "neto",
      limite: 10,
      visualizacion: "barras",
    },
  },
  {
    key: "margen-vendedor",
    nombre: "Margen por vendedor",
    descripcion: "Quién deja más utilidad real, no solo quién más vende",
    config: {
      metrica: "margen",
      dimensionPrincipal: "vendedor",
      orden: "desc",
      ordenarPor: "margen",
      limite: 10,
      visualizacion: "barras",
    },
  },
  {
    key: "analisis-clientes",
    nombre: "Análisis de clientes",
    descripcion: "Venta, margen, kilos y operaciones por cliente",
    config: {
      metrica: "clientes",
      dimensionPrincipal: "cliente",
      orden: "desc",
      ordenarPor: "neto",
      limite: 20,
      visualizacion: "tabla",
    },
  },
];

function configuracionVacia(): ConfiguracionAnalisis {
  return {
    metrica: "margen",
    dimensionPrincipal: "cliente",
    fechaInicio: inicioMesActualISO(),
    fechaFin: hoyISO(),
    orden: "desc",
    ordenarPor: "margen",
    limite: 10,
    visualizacion: "barras",
  };
}

/**
 * Constructor de análisis: formulario que arma una ConfiguracionAnalisis
 * eligiendo SIEMPRE de un catálogo cerrado (ver useCatalogoAnalisis) — nunca
 * texto libre para métrica/dimensión. El backend revalida la combinación
 * igual, así que este formulario solo evita que el usuario intente algo que
 * de todas formas será rechazado (ej. "línea" sin dimensión de fecha).
 */
export function AnaliticaConstructor({
  configuracionInicial,
  nombreInicial,
  onGuardado,
}: {
  configuracionInicial?: ConfiguracionAnalisis;
  nombreInicial?: string;
  onGuardado?: () => void;
}) {
  const { catalogo, loading: cargandoCatalogo } = useCatalogoAnalisis();
  const { ejecutar, loading: ejecutando, error: errorEjecucion } = useEjecutarAnalisis();
  const { guardar } = useAnalisisGuardados();

  const [nombre, setNombre] = useState(nombreInicial ?? "");
  const [config, setConfig] = useState<ConfiguracionAnalisis>(
    configuracionInicial ?? configuracionVacia(),
  );
  const [resultado, setResultado] = useState<ResultadoAnalisis | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensajeGuardado, setMensajeGuardado] = useState("");

  const metricaActual = catalogo?.metricas.find((m) => m.key === config.metrica);
  const dimensionesPermitidas = metricaActual?.allowedDimensions ?? [];
  const visualizacionesPermitidas =
    catalogo?.visualizacionesPorDimension[config.dimensionPrincipal] ?? [];

  function aplicarPlantilla(p: Plantilla) {
    setNombre(p.nombre);
    setConfig({ ...configuracionVacia(), ...p.config });
    setResultado(null);
  }

  function cambiarMetrica(metrica: MetricaKey) {
    const m = catalogo?.metricas.find((x) => x.key === metrica);
    const dimensionPrincipal = m?.allowedDimensions[0] ?? "cliente";
    setConfig((c) => ({
      ...c,
      metrica,
      dimensionPrincipal,
      ordenarPor: m?.camposOrdenables[0]?.key,
      visualizacion: "tabla",
    }));
  }

  function cambiarDimension(dimensionPrincipal: DimensionKey) {
    setConfig((c) => ({ ...c, dimensionPrincipal, visualizacion: "tabla" }));
  }

  async function ejecutarAhora() {
    setMensajeGuardado("");
    const data = await ejecutar(config).catch(() => null);
    if (data) setResultado(data);
  }

  async function guardarAnalisis() {
    if (!nombre.trim()) {
      setMensajeGuardado("Ponle un nombre al análisis antes de guardarlo.");
      return;
    }
    setGuardando(true);
    setMensajeGuardado("");
    try {
      await guardar(nombre.trim(), config);
      setMensajeGuardado("Análisis guardado.");
      onGuardado?.();
    } catch (err: unknown) {
      setMensajeGuardado(err instanceof Error ? err.message : "Error al guardar el análisis.");
    } finally {
      setGuardando(false);
    }
  }

  if (cargandoCatalogo || !catalogo) {
    return (
      <div className="flex items-center gap-2 p-6 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogo de análisis...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4 bg-white border-slate-200 shadow-2xs">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Plantillas rápidas
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLANTILLAS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => aplicarPlantilla(p)}
              title={p.descripcion}
              className="cursor-pointer rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Margen por cliente — este mes"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Métrica</Label>
            <Select value={config.metrica} onValueChange={(v) => cambiarMetrica(v as MetricaKey)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalogo.metricas.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">
              Agrupar por
            </Label>
            <Select
              value={config.dimensionPrincipal}
              onValueChange={(v) => cambiarDimension(v as DimensionKey)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalogo.dimensiones
                  .filter((d) => dimensionesPermitidas.includes(d.key))
                  .map((d) => (
                    <SelectItem key={d.key} value={d.key}>
                      {d.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Desde</Label>
            <Input
              type="date"
              value={config.fechaInicio}
              onChange={(e) => setConfig((c) => ({ ...c, fechaInicio: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Hasta</Label>
            <Input
              type="date"
              value={config.fechaFin}
              onChange={(e) => setConfig((c) => ({ ...c, fechaFin: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">
              Ordenar por
            </Label>
            <Select
              value={config.ordenarPor ?? metricaActual?.camposOrdenables[0]?.key}
              onValueChange={(v) => setConfig((c) => ({ ...c, ordenarPor: v }))}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(metricaActual?.camposOrdenables ?? []).map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Orden</Label>
            <Select
              value={config.orden ?? "desc"}
              onValueChange={(v) => setConfig((c) => ({ ...c, orden: v as OrdenDireccion }))}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Mayor a menor</SelectItem>
                <SelectItem value="asc">Menor a mayor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Límite</Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={config.limite ?? 10}
              onChange={(e) => setConfig((c) => ({ ...c, limite: Number(e.target.value) || 10 }))}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">
              Visualización
            </Label>
            <Select
              value={config.visualizacion ?? "tabla"}
              onValueChange={(v) =>
                setConfig((c) => ({ ...c, visualizacion: v as VisualizacionKey }))
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visualizacionesPermitidas.map((v) => (
                  <SelectItem key={v} value={v}>
                    {ETIQUETA_VISUALIZACION[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={ejecutarAhora} disabled={ejecutando} className="gap-2">
            {ejecutando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Ejecutar análisis
          </Button>
          <Button
            variant="outline"
            onClick={guardarAnalisis}
            disabled={guardando || !resultado}
            className="gap-2"
          >
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar análisis
          </Button>
          {mensajeGuardado && <p className="text-xs text-slate-500">{mensajeGuardado}</p>}
        </div>
        {errorEjecucion && <p className="mt-2 text-xs text-red-600">{errorEjecucion}</p>}
      </div>

      {resultado && (
        <ResultadoAnalisisVista resultado={resultado} config={config} nombre={nombre} />
      )}
    </div>
  );
}

const ETIQUETA_VISUALIZACION: Record<VisualizacionKey, string> = {
  tabla: "Tabla",
  barras: "Barras",
  linea: "Línea",
  area: "Área",
  dona: "Dona",
};

function formatearValor(valor: number | undefined, campo: string): string {
  if (valor === undefined) return "—";
  if (campo === "kilos") return formatCantidad(valor, "KG");
  if (campo === "documentos") return String(valor);
  return money(valor);
}

function ResultadoAnalisisVista({
  resultado,
  config,
  nombre,
}: {
  resultado: ResultadoAnalisis;
  config: ConfiguracionAnalisis;
  nombre: string;
}) {
  const campoValor: keyof ResultadoAnalisis["totales"] =
    config.metrica === "margen" ? "margen" : config.metrica === "clientes" ? "neto" : "neto";

  const datosGrafico = useMemo(
    () => resultado.filas.map((f) => ({ etiqueta: f.etiqueta, valor: f[campoValor] ?? 0 })),
    [resultado.filas, campoValor],
  );

  if (!resultado.disponible) {
    return (
      <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
        {resultado.motivo ?? "Análisis no disponible."}
      </div>
    );
  }

  if (resultado.filas.length === 0) {
    return (
      <div className="panel p-8 bg-white border-slate-200 shadow-2xs text-center text-xs text-slate-500">
        Sin datos para el período y los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
      <h2 className="text-sm font-bold text-slate-900">{nombre || "Resultado del análisis"}</h2>
      <p className="text-xs text-slate-500">
        {config.fechaInicio} a {config.fechaFin} · {resultado.filas.length} filas
      </p>

      <div className="mt-3 flex flex-wrap gap-4">
        {resultado.totales.neto !== undefined && (
          <Indicador label="Total venta neta" valor={money(resultado.totales.neto)} />
        )}
        {resultado.totales.margen !== undefined &&
          (config.metrica === "margen" || config.metrica === "clientes") && (
            <Indicador label="Total margen" valor={money(resultado.totales.margen ?? 0)} />
          )}
        {resultado.totales.kilos !== undefined && config.metrica === "clientes" && (
          <Indicador
            label="Total kilos"
            valor={formatCantidad(resultado.totales.kilos ?? 0, "KG")}
          />
        )}
        <Indicador label="Filas" valor={String(resultado.filas.length)} />
      </div>

      {config.visualizacion !== "tabla" && (
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            {config.visualizacion === "linea" ? (
              <LineChart data={datosGrafico}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(v) => compact(v)}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            ) : config.visualizacion === "area" ? (
              <AreaChart data={datosGrafico}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(v) => compact(v)}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
                <Area
                  type="monotone"
                  dataKey="valor"
                  stroke="var(--chart-1)"
                  fill="var(--chart-1)"
                  fillOpacity={0.25}
                />
              </AreaChart>
            ) : config.visualizacion === "dona" ? (
              <PieChart>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Pie
                  data={datosGrafico}
                  dataKey="valor"
                  nameKey="etiqueta"
                  innerRadius={50}
                  outerRadius={90}
                >
                  {datosGrafico.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <BarChart data={datosGrafico}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(v) => compact(v)}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
                <Bar dataKey="valor" fill="var(--chart-1)" radius={[5, 5, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-100/80">
            <TableRow className="hover:bg-slate-100/80">
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                {config.dimensionPrincipal === "fecha" ? "Fecha" : "Nombre"}
              </TableHead>
              {resultado.filas[0]?.neto !== undefined && (
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                  Venta neta
                </TableHead>
              )}
              {resultado.filas[0]?.costo !== undefined && (
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                  Costo
                </TableHead>
              )}
              {resultado.filas[0]?.margen !== undefined && (
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                  Margen
                </TableHead>
              )}
              {resultado.filas[0]?.kilos !== undefined && (
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                  Kilos
                </TableHead>
              )}
              {resultado.filas[0]?.documentos !== undefined && (
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                  Documentos
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.filas.map((f, i) => (
              <TableRow key={f.id ?? `${f.etiqueta}-${i}`}>
                <TableCell className="text-xs font-semibold text-slate-800">{f.etiqueta}</TableCell>
                {f.neto !== undefined && (
                  <TableCell className="num text-right text-xs text-slate-700">
                    {formatearValor(f.neto, "neto")}
                  </TableCell>
                )}
                {f.costo !== undefined && (
                  <TableCell className="num text-right text-xs text-slate-700">
                    {formatearValor(f.costo, "costo")}
                  </TableCell>
                )}
                {f.margen !== undefined && (
                  <TableCell className="num text-right text-xs font-bold text-slate-900">
                    {formatearValor(f.margen, "margen")}
                  </TableCell>
                )}
                {f.kilos !== undefined && (
                  <TableCell className="num text-right text-xs text-slate-700">
                    {formatearValor(f.kilos, "kilos")}
                  </TableCell>
                )}
                {f.documentos !== undefined && (
                  <TableCell className="num text-right text-xs text-slate-500">
                    {formatearValor(f.documentos, "documentos")}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Indicador({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="num text-base font-bold text-slate-900">{valor}</p>
    </div>
  );
}

/** "Mis análisis": tarjetas de análisis guardados + estado vacío con CTA. */
export function MisAnalisisLista({
  onAbrir,
  onCrear,
}: {
  onAbrir: (a: AnalisisGuardado) => void;
  onCrear: () => void;
}) {
  const { analisis, loading, eliminar } = useAnalisisGuardados();

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando tus análisis...
      </div>
    );
  }

  if (analisis.length === 0) {
    return (
      <div className="panel flex flex-col items-center gap-3 p-10 text-center bg-white border-slate-200 shadow-2xs">
        <p className="text-xs text-slate-500">
          Todavía no has guardado ningún análisis. Crea uno desde el constructor y aparecerá aquí.
        </p>
        <Button onClick={onCrear} className="gap-2">
          <Plus className="h-4 w-4" /> Crear mi primer análisis
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {analisis.map((a) => (
        <div key={a.id} className="panel p-4 bg-white border-slate-200 shadow-2xs">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">{a.nombre}</h3>
            <button
              type="button"
              onClick={() => eliminar(a.id)}
              title="Eliminar"
              className="cursor-pointer text-slate-400 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {a.configuracion.fechaInicio} a {a.configuracion.fechaFin}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {ETIQUETA_VISUALIZACION[a.configuracion.visualizacion ?? "tabla"]} ·{" "}
            {a.configuracion.dimensionPrincipal}
          </p>
          <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onAbrir(a)}>
            Abrir
          </Button>
        </div>
      ))}
    </div>
  );
}
