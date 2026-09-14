import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCatalogo } from "@/hooks/use-catalogos";
import { useProveedorBusqueda } from "@/hooks/use-proveedores";
import {
  useImportacionesAnalitica,
  type OperacionAnalitica,
} from "@/hooks/use-importaciones-analitica";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/importaciones/analitica")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.IMPORTACIONES_VER),
  head: () => ({
    meta: [
      { title: "Analítica de Importaciones | RicoSoft" },
      {
        name: "description",
        content: "Lead Time, tiempo de desaduanamiento y factor de incremento logístico.",
      },
    ],
  }),
  component: ImportacionesAnaliticaPage,
});

function formatoDias(valor: number | null): string {
  if (valor === null) return "Datos insuficientes";
  return `${valor.toFixed(1)} días`;
}

function formatoPct(valor: number | null): string {
  if (valor === null) return "Datos insuficientes";
  return `${valor.toFixed(1)}%`;
}

function formatoFecha(valor: string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function VariacionBadge({ variacionPorcentual }: { variacionPorcentual: number | null }) {
  if (variacionPorcentual === null) {
    return <span className="text-[11px] text-slate-400">Sin referencia</span>;
  }
  const subio = variacionPorcentual > 0;
  const color = subio ? "text-rose-600" : "text-emerald-600";
  const signo = subio ? "+" : "";
  return (
    <span className={`text-[11px] font-medium ${color}`}>
      {signo}
      {variacionPorcentual.toFixed(1)}% vs período de referencia
    </span>
  );
}

function TarjetaKpi({
  titulo,
  valor,
  variacionPorcentual,
  cantidadAnalizada,
  cantidadExcluida,
}: {
  titulo: string;
  valor: string;
  variacionPorcentual: number | null;
  cantidadAnalizada: number;
  cantidadExcluida: number;
}) {
  return (
    <div className="panel p-5 bg-white border-slate-200 shadow-2xs flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{titulo}</span>
      <span className="text-2xl font-semibold text-slate-900">{valor}</span>
      <VariacionBadge variacionPorcentual={variacionPorcentual} />
      <span className="text-[11px] text-slate-400">
        {cantidadAnalizada} operación(es) analizada(s)
        {cantidadExcluida > 0 ? ` · ${cantidadExcluida} excluida(s) por datos insuficientes` : ""}
      </span>
    </div>
  );
}

/** Insight determinístico (sin IA): 2-3 frases generadas por reglas simples
 * comparando el valor actual contra el período de referencia — nunca inventa
 * un dato que no esté ya en el resumen calculado por el backend. */
function generarInsights(
  resumen: NonNullable<ReturnType<typeof useImportacionesAnalitica>["resumen"]>,
): string[] {
  const frases: string[] = [];
  const lt = resumen.leadTime;
  if (lt.agregado.promedio !== null && lt.tendencia.variacionPorcentual !== null) {
    const direccion = lt.tendencia.variacionPorcentual > 0 ? "por encima" : "por debajo";
    frases.push(
      `El Lead Time promedio actual es ${lt.agregado.promedio.toFixed(1)} días, ${Math.abs(
        lt.tendencia.variacionPorcentual,
      ).toFixed(
        1,
      )}% ${direccion} del período de referencia (${lt.tendencia.referencia?.toFixed(1)} días).`,
    );
  }
  const td = resumen.tiempoDesaduanamiento;
  if (td.agregado.promedio !== null && td.tendencia.variacionPorcentual !== null) {
    const direccion = td.tendencia.variacionPorcentual > 0 ? "por encima" : "por debajo";
    frases.push(
      `El tiempo de desaduanamiento está ${Math.abs(td.tendencia.variacionPorcentual).toFixed(
        1,
      )}% ${direccion} del promedio histórico de referencia.`,
    );
  }
  const fl = resumen.factorIncrementoLogistico;
  if (fl.agregado.promedio !== null) {
    frases.push(
      `El costo landed final supera en promedio ${fl.agregado.promedio.toFixed(
        1,
      )}% el valor FOB de las órdenes liquidadas en el período.`,
    );
  }
  if (frases.length === 0) {
    frases.push(
      "Datos insuficientes para generar comparativos: no hay suficientes operaciones liquidadas en el período seleccionado.",
    );
  }
  return frases;
}

function FilaOperacion({ op }: { op: OperacionAnalitica }) {
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/importaciones/$id"
          params={{ id: op.ordenCompraId }}
          className="text-blue-700 hover:underline font-medium"
        >
          {op.codigo ?? op.numeroOrden}
        </Link>
      </TableCell>
      <TableCell>{op.proveedorNombre}</TableCell>
      <TableCell>{op.paisOrigen}</TableCell>
      <TableCell>{op.puertoDestino ?? "—"}</TableCell>
      <TableCell>
        <TooltipProvider>
          <UiTooltip>
            <TooltipTrigger asChild>
              <span className={op.excluidoLeadTime ? "text-slate-400" : ""}>
                {formatoDias(op.leadTimeDias)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              Orden: {formatoFecha(op.fechaOrden)} → Disponible en bodega:{" "}
              {formatoFecha(op.fechaDisponibleBodega)}
              {op.fechaDisponibleBodegaOrigen ? ` (${op.fechaDisponibleBodegaOrigen})` : ""}
            </TooltipContent>
          </UiTooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell>
        <TooltipProvider>
          <UiTooltip>
            <TooltipTrigger asChild>
              <span className={op.excluidoDesaduanamiento ? "text-slate-400" : ""}>
                {formatoDias(op.tiempoDesaduanamientoDias)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              Llegada: {formatoFecha(op.fechaLlegadaPuerto)} → Nacionalizado:{" "}
              {formatoFecha(op.fechaNacionalizado)}
              {op.fechaNacionalizadoOrigen ? ` (${op.fechaNacionalizadoOrigen})` : ""}
            </TooltipContent>
          </UiTooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell>
        <TooltipProvider>
          <UiTooltip>
            <TooltipTrigger asChild>
              <span className={op.excluidoFactorLogistico ? "text-slate-400" : ""}>
                {formatoPct(op.factorIncrementoLogisticoPct)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              FOB: {op.valorFobTotalCop?.toLocaleString("es-CO") ?? "—"} COP → Landed final:{" "}
              {op.costoLandedFinalCop?.toLocaleString("es-CO") ?? "—"} COP
            </TooltipContent>
          </UiTooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
}

function ImportacionesAnaliticaPage() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [paisOrigen, setPaisOrigen] = useState("");
  const [puerto, setPuerto] = useState("");

  const { opciones: proveedorOpciones, buscar: buscarProveedor } = useProveedorBusqueda();
  const { data: paises } = useCatalogo("PAIS_ORIGEN");

  const filtros = useMemo(
    () => ({
      desde: desde || undefined,
      hasta: hasta || undefined,
      proveedorId: proveedorId || undefined,
      paisOrigen: paisOrigen || undefined,
      puerto: puerto || undefined,
    }),
    [desde, hasta, proveedorId, paisOrigen, puerto],
  );

  const { resumen, operaciones, loading, error } = useImportacionesAnalitica(filtros);

  const graficoTendenciaLeadTime = useMemo(() => {
    if (!resumen) return [];
    return [
      { periodo: "Referencia", leadTime: resumen.leadTime.tendencia.referencia },
      { periodo: "Actual", leadTime: resumen.leadTime.tendencia.actual },
    ];
  }, [resumen]);

  const graficoTendenciaDesaduanamiento = useMemo(() => {
    if (!resumen) return [];
    return [
      { periodo: "Referencia", tiempo: resumen.tiempoDesaduanamiento.tendencia.referencia },
      { periodo: "Actual", tiempo: resumen.tiempoDesaduanamiento.tendencia.actual },
    ];
  }, [resumen]);

  const graficoTendenciaFactor = useMemo(() => {
    if (!resumen) return [];
    return [
      { periodo: "Referencia", factor: resumen.factorIncrementoLogistico.tendencia.referencia },
      { periodo: "Actual", factor: resumen.factorIncrementoLogistico.tendencia.actual },
    ];
  }, [resumen]);

  const graficoPorProveedorLeadTime = useMemo(
    () =>
      resumen?.leadTime.desglosePorProveedor.map((d) => ({
        proveedor: d.clave,
        dias: d.agregado.promedio,
      })) ?? [],
    [resumen],
  );

  const graficoPorPuertoDesaduanamiento = useMemo(
    () =>
      resumen?.tiempoDesaduanamiento.desglosePorPuerto.map((d) => ({
        puerto: d.clave,
        dias: d.agregado.promedio,
      })) ?? [],
    [resumen],
  );

  return (
    <AppShell
      title="Analítica de Importaciones"
      description="Lead Time, tiempo de desaduanamiento y factor de incremento logístico, calculados sobre datos reales de órdenes, embarques y costeo landed."
      actions={
        <Link to="/importaciones" className="text-sm text-blue-700 hover:underline">
          ← Volver a Importaciones
        </Link>
      }
    >
      <div className="flex flex-col gap-6 p-6">
        <div className="panel p-4 bg-white border-slate-200 shadow-2xs flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Desde</Label>
            <Input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Hasta</Label>
            <Input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Proveedor</Label>
            <Combobox
              className="w-56"
              value={proveedorId}
              onValueChange={setProveedorId}
              onSearchChange={buscarProveedor}
              options={proveedorOpciones.map((p) => ({ value: p.id, label: p.nombre }))}
              placeholder="Todos"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Origen</Label>
            <Combobox
              className="w-48"
              value={paisOrigen}
              onValueChange={setPaisOrigen}
              options={paises.map((p) => ({ value: p.clave, label: p.etiqueta }))}
              placeholder="Todos"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Puerto</Label>
            <Input
              value={puerto}
              onChange={(e) => setPuerto(e.target.value)}
              placeholder="Ej. Cartagena"
              className="w-40"
            />
          </div>
        </div>

        {error && (
          <div className="panel p-4 bg-rose-50 border-rose-200 text-sm text-rose-700">{error}</div>
        )}

        {loading && !resumen && !error && (
          <div className="panel p-8 bg-white border-slate-200 shadow-2xs text-center text-sm text-slate-500">
            Cargando analítica de importaciones…
          </div>
        )}

        {resumen && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TarjetaKpi
                titulo="Lead Time (orden → bodega)"
                valor={formatoDias(resumen.leadTime.agregado.promedio)}
                variacionPorcentual={resumen.leadTime.tendencia.variacionPorcentual}
                cantidadAnalizada={resumen.leadTime.agregado.cantidadAnalizada}
                cantidadExcluida={resumen.leadTime.agregado.cantidadExcluida}
              />
              <TarjetaKpi
                titulo="Tiempo de desaduanamiento"
                valor={formatoDias(resumen.tiempoDesaduanamiento.agregado.promedio)}
                variacionPorcentual={resumen.tiempoDesaduanamiento.tendencia.variacionPorcentual}
                cantidadAnalizada={resumen.tiempoDesaduanamiento.agregado.cantidadAnalizada}
                cantidadExcluida={resumen.tiempoDesaduanamiento.agregado.cantidadExcluida}
              />
              <TarjetaKpi
                titulo="Factor de incremento logístico"
                valor={formatoPct(resumen.factorIncrementoLogistico.agregado.promedio)}
                variacionPorcentual={
                  resumen.factorIncrementoLogistico.tendencia.variacionPorcentual
                }
                cantidadAnalizada={resumen.factorIncrementoLogistico.agregado.cantidadAnalizada}
                cantidadExcluida={resumen.factorIncrementoLogistico.agregado.cantidadExcluida}
              />
            </div>

            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <h2 className="text-sm font-medium text-slate-700 mb-2">Insights</h2>
              <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
                {generarInsights(resumen).map((frase, i) => (
                  <li key={i}>{frase}</li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="panel p-5 bg-white border-slate-200 shadow-2xs h-64">
                <h3 className="text-xs font-medium text-slate-500 mb-2">
                  Tendencia Lead Time (días)
                </h3>
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart data={graficoTendenciaLeadTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodo" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line type="monotone" dataKey="leadTime" stroke="#2563eb" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="panel p-5 bg-white border-slate-200 shadow-2xs h-64">
                <h3 className="text-xs font-medium text-slate-500 mb-2">
                  Tendencia Tiempo de Desaduanamiento (días)
                </h3>
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart data={graficoTendenciaDesaduanamiento}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodo" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line type="monotone" dataKey="tiempo" stroke="#2563eb" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="panel p-5 bg-white border-slate-200 shadow-2xs h-64">
                <h3 className="text-xs font-medium text-slate-500 mb-2">
                  Tendencia Factor de Incremento Logístico (%)
                </h3>
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart data={graficoTendenciaFactor}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodo" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line type="monotone" dataKey="factor" stroke="#2563eb" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="panel p-5 bg-white border-slate-200 shadow-2xs h-64">
                <h3 className="text-xs font-medium text-slate-500 mb-2">
                  Lead Time promedio por proveedor
                </h3>
                {graficoPorProveedorLeadTime.length === 0 ? (
                  <p className="text-xs text-slate-400">Sin datos suficientes por proveedor.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart data={graficoPorProveedorLeadTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="proveedor" fontSize={10} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="dias" name="Lead Time (días)" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="panel p-5 bg-white border-slate-200 shadow-2xs h-64">
                <h3 className="text-xs font-medium text-slate-500 mb-2">
                  Tiempo de desaduanamiento promedio por puerto
                </h3>
                {graficoPorPuertoDesaduanamiento.length === 0 ? (
                  <p className="text-xs text-slate-400">Sin datos suficientes por puerto.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart data={graficoPorPuertoDesaduanamiento}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="puerto" fontSize={10} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="dias" name="Tiempo en desaduanamiento (días)" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="panel p-0 bg-white border-slate-200 shadow-2xs overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Orden</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Puerto</TableHead>
                    <TableHead>Lead Time</TableHead>
                    <TableHead>Tiempo Puerto</TableHead>
                    <TableHead>Factor Logístico</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operaciones.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-slate-400 py-8">
                        No hay operaciones que coincidan con los filtros seleccionados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    operaciones.map((op) => <FilaOperacion key={op.ordenCompraId} op={op} />)
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
