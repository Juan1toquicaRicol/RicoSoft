import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronDown,
  Info,
  Loader2,
  Search,
  TrendingDown,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  useCentroComercial,
  useDisponibilidadComercial,
  useBusquedaProductos,
  useContextoProducto,
  useHistoricoComprasCliente,
  type DisponibilidadComercial,
  type ItemBusqueda,
  type ContextoProducto,
  type ClienteEnRiesgo,
} from "@/hooks/use-ventas";
import { compact, formatCantidad, money } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ventas")({
  head: () => ({
    meta: [
      { title: "Ventas | RicoSoft" },
      {
        name: "description",
        content:
          "Centro Operativo Comercial: disponibilidad real, riesgo de quiebre y clientes que requieren seguimiento hoy.",
      },
      { property: "og:title", content: "Ventas | RicoSoft" },
      { property: "og:description", content: "¿Qué debo atender hoy en ventas?" },
    ],
  }),
  component: Ventas,
});

const ESTADO_INFO: Record<DisponibilidadComercial["estado"], { label: string; classes: string }> = {
  disponible: {
    label: "Disponible para venta",
    classes: "bg-emerald-50 border-emerald-200 text-emerald-700",
  },
  requiere_produccion: {
    label: "Requiere producción",
    classes: "bg-blue-50 border-blue-200 text-blue-700",
  },
  requiere_produccion_y_compra: {
    label: "Requiere producción y compra",
    classes: "bg-amber-50 border-amber-200 text-amber-700",
  },
  requiere_compra_directa: {
    label: "Requiere compra directa",
    classes: "bg-red-50 border-red-200 text-red-700",
  },
};

/** Autocompletado de producto por descripción/referencia — busca en vivo contra el maestro de Siesa (debounce 300ms). */
function AutocompletadoProducto({
  seleccionado,
  onSeleccionar,
}: {
  seleccionado: ItemBusqueda | null;
  onSeleccionar: (item: ItemBusqueda | null) => void;
}) {
  const { buscar, loading } = useBusquedaProductos();
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<ItemBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (seleccionado) return; // no re-buscar mientras hay uno elegido
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < 2) {
      setSugerencias([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await buscar(texto);
      if (!res.disponible) {
        setMotivo(res.motivo ?? "No disponible.");
        setSugerencias([]);
      } else {
        setMotivo(null);
        setSugerencias(res.items ?? []);
      }
      setAbierto(true);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, seleccionado]);

  return (
    <div className="relative space-y-1">
      <Label className="text-[11px] font-semibold text-slate-500 uppercase">
        Referencia o producto
      </Label>
      {seleccionado ? (
        <div className="flex h-9 w-64 items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-2 text-xs">
          <span className="truncate font-semibold text-slate-800">
            {seleccionado.descripcion ?? seleccionado.referencia}
          </span>
          <button
            type="button"
            className="ml-2 shrink-0 text-slate-400 hover:text-slate-700"
            onClick={() => {
              onSeleccionar(null);
              setTexto("");
            }}
          >
            ×
          </button>
        </div>
      ) : (
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => sugerencias.length > 0 && setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          className="h-9 w-64 text-xs"
          placeholder="Escribe para buscar (ej. duoplock, PET JADE...)"
        />
      )}
      {!seleccionado && abierto && (loading || sugerencias.length > 0 || motivo) && (
        <div className="absolute z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white shadow-lg">
          {loading && <p className="p-2 text-xs text-slate-400">Buscando...</p>}
          {!loading && motivo && <p className="p-2 text-xs text-slate-400">{motivo}</p>}
          {!loading &&
            sugerencias.map((item) => (
              <button
                key={item.itemRowId}
                type="button"
                className="block w-full truncate px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSeleccionar(item);
                  setAbierto(false);
                }}
              >
                <span className="font-semibold text-slate-800">{item.descripcion}</span>
                {item.referencia && <span className="text-slate-400"> · {item.referencia}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** "¿Cuánto cuesta?" y "¿a quién se le vende?" — se muestra apenas se elige un producto en el autocompletado. */
function PanelContextoProducto({ contexto }: { contexto: ContextoProducto }) {
  if (!contexto.disponible) {
    return <p className="mt-3 text-xs text-slate-500">{contexto.motivo}</p>;
  }
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
        <span>
          Costo actual:{" "}
          <span className="num font-semibold">
            {contexto.costoUnitario !== null ? money(contexto.costoUnitario ?? 0) : "sin dato"}
          </span>
        </span>
        <span>
          Precio promedio ({contexto.ventanaPrecioDias}d):{" "}
          <span className="num font-semibold">
            {contexto.precioPromedioVenta !== null
              ? money(contexto.precioPromedioVenta ?? 0)
              : "sin ventas recientes"}
          </span>
        </span>
        <span>
          Margen promedio:{" "}
          <span className="num font-semibold">
            {contexto.margenPromedioPct !== null ? `${contexto.margenPromedioPct}%` : "—"}
          </span>
        </span>
      </div>
      {(contexto.clientes ?? []).length > 0 && (
        <div className="mt-2 border-t border-slate-200 pt-2">
          <p className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
            <Users className="h-3 w-3" /> A quién se le vende
          </p>
          <ul className="mt-1 space-y-0.5">
            {(contexto.clientes ?? []).slice(0, 5).map((c) => (
              <li
                key={c.clienteRowId ?? c.clienteNombre}
                className="flex items-center justify-between text-[11px]"
              >
                <span className="min-w-0 truncate text-slate-600">
                  {c.clienteNombre ?? "Cliente sin nombre"}
                </span>
                <span className="num shrink-0 text-slate-500">{compact(c.cantidadHistorica)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(contexto.clientes ?? []).length === 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          Sin clientes con compras recientes de este producto.
        </p>
      )}
    </div>
  );
}

function PanelDisponibilidad() {
  const { consultar, loading } = useDisponibilidadComercial();
  const { consultar: consultarContexto } = useContextoProducto();
  const [itemSeleccionado, setItemSeleccionado] = useState<ItemBusqueda | null>(null);
  const [contexto, setContexto] = useState<ContextoProducto | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [resultado, setResultado] = useState<DisponibilidadComercial | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  const handleSeleccionar = async (item: ItemBusqueda | null) => {
    setItemSeleccionado(item);
    setResultado(null);
    setContexto(null);
    if (item) {
      const ctx = await consultarContexto(item.itemRowId);
      setContexto(ctx);
    }
  };

  const handleConsultar = async () => {
    if (!itemSeleccionado || !cantidad) return;
    setMotivo(null);
    setResultado(null);
    try {
      const res = await consultar(itemSeleccionado.itemRowId, Number(cantidad));
      if (!res.disponible) {
        setMotivo(res.motivo ?? "No disponible.");
      } else {
        setResultado(res.resultado ?? null);
      }
    } catch {
      // el hook ya deja el error en su propio estado; nada más que hacer aquí.
    }
  };

  return (
    <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
      <h2 className="text-sm font-bold text-slate-900">¿Puedo vender esto?</h2>
      <p className="text-xs text-slate-500">
        Busca el producto, revisa costo/precio/margen y a quién se le vende, y consulta
        disponibilidad real antes de comprometer un pedido.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <AutocompletadoProducto seleccionado={itemSeleccionado} onSeleccionar={handleSeleccionar} />
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase">
            Cantidad solicitada
          </Label>
          <Input
            type="number"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="h-9 w-40 text-xs"
          />
        </div>
        <Button
          size="sm"
          onClick={handleConsultar}
          disabled={!itemSeleccionado || !cantidad || loading}
        >
          <Search className="mr-1 h-3.5 w-3.5" /> {loading ? "Consultando..." : "Consultar"}
        </Button>
      </div>

      {itemSeleccionado && contexto && <PanelContextoProducto contexto={contexto} />}

      {motivo && <p className="mt-4 text-xs text-slate-500">{motivo}</p>}

      {resultado && (
        <div className={cn("mt-4 rounded-lg border p-4", ESTADO_INFO[resultado.estado].classes)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold">
                {resultado.descripcion ?? `Ítem ${resultado.itemRowId}`}
              </p>
              <p className="text-[11px] opacity-80">{resultado.referencia}</p>
            </div>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold">
              {ESTADO_INFO[resultado.estado].label}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
            <span>
              Solicitado:{" "}
              <span className="num font-semibold">
                {formatCantidad(resultado.cantidadSolicitada, resultado.unidadMedida)}
              </span>
            </span>
            <span>
              Existencia:{" "}
              <span className="num font-semibold">
                {formatCantidad(resultado.cantidadExistente, resultado.unidadMedida)}
              </span>
            </span>
            <span>
              Comprometido:{" "}
              <span className="num font-semibold">
                {formatCantidad(resultado.cantidadComprometida, resultado.unidadMedida)}
              </span>
            </span>
            <span>
              Disponible libre:{" "}
              <span className="num font-semibold">
                {formatCantidad(resultado.disponibleLibre, resultado.unidadMedida)}
              </span>
            </span>
            {resultado.deficit > 0 && (
              <span>
                Déficit:{" "}
                <span className="num font-semibold">
                  {formatCantidad(resultado.deficit, resultado.unidadMedida)}
                </span>
              </span>
            )}
            {resultado.capacidadProductiva !== null && (
              <span>
                Capacidad productiva:{" "}
                <span className="num font-semibold">
                  {formatCantidad(resultado.capacidadProductiva, resultado.unidadMedida)}
                </span>
              </span>
            )}
            {resultado.materialLimitante && (
              <span>
                Material limitante:{" "}
                <span className="font-semibold">{resultado.materialLimitante}</span>
              </span>
            )}
          </div>

          {resultado.necesidadesCompra.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-[11px] font-bold">Materias primas a comprar:</p>
              {resultado.necesidadesCompra.map((n) => (
                <p key={n.componenteRowId} className="text-[11px]">
                  {n.descripcion ?? `Ítem ${n.componenteRowId}`} — faltan {compact(n.deficit)}
                </p>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {(resultado.estado === "requiere_produccion" ||
              resultado.estado === "requiere_produccion_y_compra") && (
              <Link
                to="/plan-produccion"
                className="rounded-md bg-white/80 px-3 py-1.5 text-[11px] font-bold hover:bg-white"
              >
                Crear plan de producción
              </Link>
            )}
            {(resultado.estado === "requiere_produccion_y_compra" ||
              resultado.estado === "requiere_compra_directa") && (
              <Link
                to="/solicitudes-compra"
                search={{
                  item:
                    resultado.necesidadesCompra[0]?.descripcion ??
                    resultado.descripcion ??
                    "Insumo sin descripción",
                  cantidad: resultado.necesidadesCompra[0]?.deficit ?? resultado.deficit,
                }}
                className="rounded-md bg-white/80 px-3 py-1.5 text-[11px] font-bold hover:bg-white"
              >
                Generar solicitud de compra
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Fila expandible de "Clientes en riesgo": al desplegar, responde "¿qué
 * dejó de comprar este cliente?" y "¿cuánto compraba antes?" sin sacar al
 * vendedor de Ventas. Reutiliza GET /ventas/clientes/:id/historico (carga
 * perezosa, solo al abrir) — ningún cálculo nuevo en frontend.
 */
function FilaClienteEnRiesgo({ cliente: c }: { cliente: ClienteEnRiesgo }) {
  const [abierto, setAbierto] = useState(false);
  const { consultar, loading } = useHistoricoComprasCliente();
  const [historico, setHistorico] = useState<Awaited<ReturnType<typeof consultar>> | null>(null);

  const handleToggle = async () => {
    const next = !abierto;
    setAbierto(next);
    if (next && !historico) {
      try {
        setHistorico(await consultar(c.clienteRowId));
      } catch {
        // El hook ya expone `error`; el detalle simplemente no se llena.
      }
    }
  };

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-slate-50/80" onClick={handleToggle}>
        <TableCell className="w-8">
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`}
          />
        </TableCell>
        <TableCell className="text-xs font-semibold text-slate-800">
          {c.clienteNombre ?? "Cliente sin nombre"}
        </TableCell>
        <TableCell className="text-right text-xs">
          <span
            className={cn(
              "num font-semibold",
              c.severidad === "alta" ? "text-red-600" : "text-amber-600",
            )}
          >
            {c.diasInactivo} días
          </span>
        </TableCell>
        <TableCell className="num text-right text-xs text-slate-600">
          {money(c.promedioMensualNeto)}
        </TableCell>
        <TableCell className="num text-right text-xs font-bold text-slate-900">
          {money(c.ventaEstimadaPerdida)}
        </TableCell>
        <TableCell className="num text-right text-xs text-slate-600">
          {c.kilosEstimadosPerdidos > 0 ? formatCantidad(c.kilosEstimadosPerdidos, "KG") : "—"}
        </TableCell>
      </TableRow>
      {abierto && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="bg-slate-50/60 px-6 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Qué le compraba este cliente (últimos 12 meses)
            </p>
            {loading && !historico && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando historial de compras...
              </p>
            )}
            {historico && !historico.disponible && (
              <p className="mt-2 text-xs text-slate-500">
                {historico.motivo ?? "Sin datos disponibles."}
              </p>
            )}
            {historico?.disponible &&
              ((historico.productos ?? []).length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Sin compras registradas en el período.
                </p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100">
                      <TableRow className="hover:bg-slate-100">
                        <TableHead className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                          Producto
                        </TableHead>
                        <TableHead className="text-right text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                          Cantidad
                        </TableHead>
                        <TableHead className="text-right text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                          Valor histórico
                        </TableHead>
                        <TableHead className="text-right text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                          Veces comprado
                        </TableHead>
                        <TableHead className="text-right text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                          Última compra
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(historico.productos ?? []).map((p) => (
                        <TableRow key={p.itemRowId}>
                          <TableCell className="text-xs text-slate-700">
                            {p.descripcion ?? p.referencia ?? "Producto sin descripción"}
                          </TableCell>
                          <TableCell className="num text-right text-xs text-slate-600">
                            {formatCantidad(p.cantidadHistorica, p.unidadMedida)}
                          </TableCell>
                          <TableCell className="num text-right text-xs text-slate-600">
                            {money(p.netoHistorico)}
                          </TableCell>
                          <TableCell className="num text-right text-xs text-slate-600">
                            {p.numCompras}
                          </TableCell>
                          <TableCell className="text-right text-xs text-slate-500">
                            {new Date(p.ultimaCompra).toLocaleDateString("es-CO", {
                              timeZone: "UTC",
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function Ventas() {
  const { centro, loading } = useCentroComercial();

  return (
    <AppShell
      title="Ventas"
      description="Centro Operativo Comercial — qué puedo vender, qué no puedo comprometer y qué cliente requiere atención hoy"
    >
      <PanelDisponibilidad />

      {loading && <p className="mt-4 text-xs text-slate-500">Cargando...</p>}

      {!loading && !centro.disponible && (
        <div className="mt-4 panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
          {centro.motivo ?? "Centro Comercial no disponible."}
        </div>
      )}

      {!loading && centro.disponible && (
        <>
          {(centro.productosEnRiesgoQuiebre ?? []).length > 0 && (
            <PanelColapsable
              className="mt-4"
              defaultOpen={false}
              title={
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" /> No comprometer sin revisar
                </span>
              }
              description="Productos con riesgo real de quedarse sin stock — revisa antes de prometer una fecha de entrega"
              actions={
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">
                  {(centro.productosEnRiesgoQuiebre ?? []).length}
                </span>
              }
            >
              <div className="space-y-2">
                {(centro.productosEnRiesgoQuiebre ?? []).slice(0, 10).map((p) => (
                  <div
                    key={p.itemRowId}
                    className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2"
                  >
                    <p className="text-xs font-bold text-orange-800">{p.titulo}</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">{p.motivo}</p>
                  </div>
                ))}
              </div>
              <Link
                to="/inventario"
                className="mt-3 inline-block text-[11px] font-semibold text-blue-700 hover:underline"
              >
                Ver Centro de Decisiones
              </Link>
            </PanelColapsable>
          )}

          {((centro.clientesInactivos ?? []).length > 0 ||
            (centro.caidasClientesTop ?? []).length > 0) && (
            <div className="mt-4 panel p-5 bg-white border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                <h2 className="text-sm font-bold text-slate-900">Clientes en riesgo</h2>
              </div>
              <p className="text-xs text-slate-500">
                Clientes recurrentes que dejaron de comprar y caídas fuertes en clientes top —
                estimado a partir del histórico de compras (Siesa)
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">
                    Venta estimada en riesgo
                  </p>
                  <p className="num mt-1 text-xl font-bold text-red-700">
                    {money(centro.totalVentaEnRiesgo ?? 0)}
                  </p>
                  <p className="mt-1 text-[11px] text-red-600">
                    Estimado: promedio mensual histórico × días de inactividad
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                    Material estimado en riesgo
                  </p>
                  <p className="num mt-1 text-xl font-bold text-amber-700">
                    {formatCantidad(centro.totalKilosEnRiesgo ?? 0, "KG")}
                  </p>
                  <p className="mt-1 text-[11px] text-amber-600">
                    Solo productos vendidos por kilo
                  </p>
                </div>
              </div>

              {(centro.clientesInactivos ?? []).length > 0 && (
                <div className="mt-5 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/80">
                      <TableRow className="hover:bg-slate-100/80">
                        <TableHead className="w-8" />
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Cliente
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Inactivo hace
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Promedio mensual
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Venta estimada perdida
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Kilos estimados
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(centro.clientesInactivos ?? []).map((c) => (
                        <FilaClienteEnRiesgo key={c.clienteRowId} cliente={c} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {(centro.caidasClientesTop ?? []).length > 0 && (
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <h3 className="text-xs font-bold text-slate-900">Caídas fuertes este mes</h3>
                  <ul className="mt-2 space-y-1.5">
                    {(centro.caidasClientesTop ?? []).map((c) => (
                      <li
                        key={c.clienteRowId ?? c.clienteNombre}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="min-w-0 truncate text-slate-700">
                          {c.clienteNombre ?? "Cliente sin nombre"}
                        </span>
                        <span className="num shrink-0 font-semibold text-red-600">
                          -{c.caidaPct}% ({money(c.netoMesAnterior)} → {money(c.netoUltimoMes)})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {(centro.productosEnRiesgoQuiebre ?? []).length === 0 &&
            (centro.clientesInactivos ?? []).length === 0 && (
              <div className="mt-4 panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
                Nada urgente que atender hoy — sin productos en riesgo de quiebre ni clientes
                inactivos recientes.
              </div>
            )}

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Ventas es el centro operativo comercial — para tendencias, márgenes, top clientes/
              productos y evolución mensual, usa{" "}
              <Link to="/analitica" className="font-semibold text-blue-700 hover:underline">
                Analítica
              </Link>
              . RicoSoft todavía no tiene un modelo propio de Pedido/Cotización de venta — el
              histórico y las cifras de este módulo vienen en vivo de Siesa (v470_ventas +
              t461_cm_docto_factura_venta), igual que el resto del sistema.
            </span>
          </div>
        </>
      )}
    </AppShell>
  );
}
