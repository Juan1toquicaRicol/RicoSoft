import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Info, Loader2, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
  useInventarioGerencial,
  usePronosticoDemanda,
  useProduccionRecomendada,
  useConfiguracionInventario,
  type ClasificacionInventario,
  type PronosticoProducto,
  type ConfiguracionInventario,
  type RecomendacionProduccion,
} from "@/hooks/use-inventario";
import { useContextoProducto } from "@/hooks/use-ventas";
import { formatCantidad, money } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

export const Route = createFileRoute("/inventario")({
  head: () => ({
    meta: [
      { title: "Inventario | RicoSoft" },
      {
        name: "description",
        content:
          "Inventario real leído en vivo desde Siesa: valor total, comprometido, y clasificación por antigüedad de venta.",
      },
      { property: "og:title", content: "Inventario | RicoSoft" },
      { property: "og:description", content: "Inventario disponible, comprometido y en riesgo." },
    ],
  }),
  component: Inventario,
});

const BUCKET_INFO: {
  key: ClasificacionInventario;
  label: string;
  descripcion: string;
  color: string;
}[] = [
  {
    key: "vendible",
    label: "Vendible",
    descripcion: "Vendió en los últimos 60 días",
    color: "bg-emerald-500",
  },
  {
    key: "exceso",
    label: "Exceso",
    descripcion: "Sin venta hace 61-180 días",
    color: "bg-amber-500",
  },
  {
    key: "obsolescencia",
    label: "Riesgo de obsolescencia",
    descripcion: "Sin venta hace más de 180 días",
    color: "bg-red-500",
  },
  {
    key: "sin_movimiento",
    label: "Sin movimiento",
    descripcion: "Mercancía que nunca registró una venta",
    color: "bg-slate-400",
  },
  {
    key: "insumo",
    label: "Insumo / materia prima",
    descripcion: "De uso interno — no es mercancía para vender",
    color: "bg-slate-300",
  },
  {
    key: "repuesto",
    label: "Repuesto",
    descripcion: "Repuestos de mantenimiento/equipos",
    color: "bg-slate-300",
  },
  {
    key: "servicio",
    label: "Servicio",
    descripcion: "Fletes, bodegaje u otros cargos — no es inventario físico",
    color: "bg-slate-200",
  },
];

function FilaProducto({ p, expandible = false }: { p: PronosticoProducto; expandible?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const { consultar, loading } = useContextoProducto();
  const [contexto, setContexto] = useState<Awaited<ReturnType<typeof consultar>> | null>(null);

  const handleToggle = async () => {
    if (!expandible) return;
    const next = !abierto;
    setAbierto(next);
    if (next && !contexto) {
      try {
        setContexto(await consultar(p.itemRowId));
      } catch {
        // El hook ya expone `error`; el detalle simplemente no se llena.
      }
    }
  };

  return (
    <>
      <TableRow
        key={p.itemRowId}
        className={cn("hover:bg-slate-50/80", expandible && "cursor-pointer")}
        onClick={handleToggle}
      >
        {expandible && (
          <TableCell className="w-8">
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-slate-400 transition-transform",
                abierto && "rotate-180",
              )}
            />
          </TableCell>
        )}
        <TableCell className="text-xs text-slate-600">{p.referencia ?? "—"}</TableCell>
        <TableCell className="text-xs font-semibold text-slate-800">
          {p.descripcion ?? "Producto sin descripción"}
        </TableCell>
        <TableCell className="num text-right text-xs text-slate-700">
          {formatCantidad(p.ventaPromedioMensual, p.unidadMedida)}/mes
        </TableCell>
        <TableCell className="text-right text-xs">
          {p.tendenciaPct === null ? (
            <span className="text-slate-400">—</span>
          ) : (
            <span
              className={cn(
                "num font-semibold",
                p.tendenciaPct >= 0 ? "text-emerald-600" : "text-red-600",
              )}
            >
              {p.tendenciaPct >= 0 ? "+" : ""}
              {p.tendenciaPct}%
            </span>
          )}
        </TableCell>
        <TableCell className="text-right text-xs">
          {p.demandaIrregular && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Irregular
            </span>
          )}
        </TableCell>
      </TableRow>
      {expandible && abierto && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="bg-slate-50/60 px-6 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Registro histórico de ventas
            </p>
            {loading && !contexto && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando historial de ventas...
              </p>
            )}
            {contexto && !contexto.disponible && (
              <p className="mt-2 text-xs text-slate-500">
                {contexto.motivo ?? "Sin datos disponibles."}
              </p>
            )}
            {contexto?.disponible && (
              <div className="mt-2 space-y-2 text-xs text-slate-700">
                <p>
                  Precio promedio de venta últimos {contexto.ventanaPrecioDias ?? 90} días:{" "}
                  <span className="num font-semibold">
                    {contexto.precioPromedioVenta != null
                      ? money(contexto.precioPromedioVenta)
                      : "sin ventas recientes"}
                  </span>{" "}
                  ({contexto.lineasVentaRecientes ?? 0} líneas de venta)
                </p>
                <div>
                  <p className="font-semibold text-slate-500">Clientes que lo compraban:</p>
                  {(contexto.clientes ?? []).length === 0 ? (
                    <p className="mt-1 text-slate-500">
                      Sin compradores registrados recientemente.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {(contexto.clientes ?? []).map((c) => (
                        <li
                          key={c.clienteRowId ?? c.clienteNombre}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="min-w-0 truncate">
                            {c.clienteNombre ?? "Cliente sin nombre"}
                          </span>
                          <span className="num shrink-0 text-slate-500">
                            {formatCantidad(c.cantidadHistorica, p.unidadMedida)} ·{" "}
                            {money(c.netoHistorico)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <p className="text-slate-500">
                  Responsable comercial: no asignado en el sistema (RicoSoft todavía no tiene ese
                  dato por producto).
                </p>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function TablaProductos({
  productos,
  expandible = false,
}: {
  productos: PronosticoProducto[];
  expandible?: boolean;
}) {
  return (
    <Table>
      <TableHeader className="bg-slate-100/80">
        <TableRow className="hover:bg-slate-100/80">
          {expandible && <TableHead className="w-8" />}
          <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
            Referencia
          </TableHead>
          <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
            Producto
          </TableHead>
          <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
            Venta promedio
          </TableHead>
          <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
            Tendencia
          </TableHead>
          <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
            Demanda
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {productos.map((p) => (
          <FilaProducto key={p.itemRowId} p={p} expandible={expandible} />
        ))}
      </TableBody>
    </Table>
  );
}

const CONFIANZA_BADGE: Record<RecomendacionProduccion["confianza"], string> = {
  alta: "bg-emerald-100 text-emerald-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-slate-200 text-slate-600",
};

/**
 * Fila de "Qué producir" con el "por qué" expandible — la fórmula
 * (demanda proyectada + comprometido − disponible − en camino) ya se ve en
 * las columnas; el detalle explica de dónde sale la demanda proyectada
 * (venta promedio real, tendencia aplicada) y qué tan confiable es esa cifra
 * (meses reales de venta detrás), para que la confianza no sea una etiqueta
 * sin sustento.
 */
function FilaProduccionRecomendada({ r }: { r: RecomendacionProduccion }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-slate-50/80"
        onClick={() => setAbierto((a) => !a)}
      >
        <TableCell className="w-8">
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-slate-400 transition-transform",
              abierto && "rotate-180",
            )}
          />
        </TableCell>
        <TableCell className="text-xs text-slate-600">{r.referencia ?? "—"}</TableCell>
        <TableCell className="text-xs font-semibold text-slate-800">
          {r.descripcion ?? "Producto sin descripción"}
        </TableCell>
        <TableCell className="num text-right text-xs text-slate-600">
          {formatCantidad(r.demandaProyectada, r.unidadMedida)}
        </TableCell>
        <TableCell className="num text-right text-xs text-slate-600">
          {formatCantidad(r.pedidosComprometidos, r.unidadMedida)}
        </TableCell>
        <TableCell className="num text-right text-xs text-slate-600">
          {formatCantidad(r.inventarioDisponible, r.unidadMedida)}
        </TableCell>
        <TableCell className="num text-right text-xs text-slate-600">
          {formatCantidad(r.cantidadPendienteEntrar, r.unidadMedida)}
        </TableCell>
        <TableCell className="num text-right text-xs font-bold text-slate-900">
          {formatCantidad(r.produccionRecomendada, r.unidadMedida)}
        </TableCell>
        <TableCell className="text-right text-xs">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              CONFIANZA_BADGE[r.confianza],
            )}
          >
            {r.confianza === "alta" ? "Alta" : r.confianza === "media" ? "Media" : "Baja"}
          </span>
        </TableCell>
      </TableRow>
      {abierto && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={9} className="bg-slate-50/60 px-6 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Por qué se recomienda producir esto
            </p>
            <div className="mt-2 space-y-1.5 text-xs text-slate-700">
              <p>
                La demanda proyectada ({formatCantidad(r.demandaProyectada, r.unidadMedida)}/mes) se
                calcula desde una venta promedio real de{" "}
                <span className="num font-semibold">
                  {formatCantidad(r.ventaPromedioMensual, r.unidadMedida)}/mes
                </span>
                {r.tendenciaPct !== null && (
                  <>
                    , ajustada por una tendencia reciente de{" "}
                    <span
                      className={cn(
                        "num font-semibold",
                        r.tendenciaPct >= 0 ? "text-emerald-600" : "text-red-600",
                      )}
                    >
                      {r.tendenciaPct >= 0 ? "+" : ""}
                      {r.tendenciaPct}%
                    </span>
                  </>
                )}
                .
              </p>
              <p>
                Esa venta promedio está respaldada por{" "}
                <span className="font-semibold">{r.mesesConVenta} de los últimos 12 meses</span> con
                venta real registrada — por eso la confianza es{" "}
                <span className="font-semibold">
                  {r.confianza === "alta" ? "alta" : r.confianza === "media" ? "media" : "baja"}
                </span>
                {r.confianza !== "alta" &&
                  " (pocos meses de historia real todavía respaldan esta proyección)."}
              </p>
              <p className="text-slate-500">
                Cuenta de vuelta: demanda proyectada (
                {formatCantidad(r.demandaProyectada, r.unidadMedida)}) + comprometido (
                {formatCantidad(r.pedidosComprometidos, r.unidadMedida)}) − disponible (
                {formatCantidad(r.inventarioDisponible, r.unidadMedida)}) − ya en camino (
                {formatCantidad(r.cantidadPendienteEntrar, r.unidadMedida)}) ={" "}
                <span className="font-semibold text-slate-900">
                  {formatCantidad(r.produccionRecomendada, r.unidadMedida)} a producir
                </span>
                .
              </p>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function PanelConfiguracion() {
  const { configuracion, loading, guardar } = useConfiguracionInventario();
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<ConfiguracionInventario | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (configuracion) setValores(configuracion);
  }, [configuracion]);

  const campo = (
    clave: keyof ConfiguracionInventario,
    label: string,
    descripcion: string,
    opciones: { min: number; max: number; step?: number } = { min: 1, max: 3650 },
  ) => (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-slate-500 uppercase">{label}</Label>
      <Input
        type="number"
        min={opciones.min}
        max={opciones.max}
        step={opciones.step ?? 1}
        value={valores?.[clave] ?? ""}
        onChange={(e) => setValores((v) => (v ? { ...v, [clave]: Number(e.target.value) } : v))}
        className="h-9 text-xs border-slate-300 bg-white"
      />
      <p className="text-[10px] text-slate-400">{descripcion}</p>
    </div>
  );

  const handleGuardar = async () => {
    if (!valores) return;
    setGuardando(true);
    try {
      await guardar(valores);
      toast.success("Umbrales actualizados.");
      setAbierto(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar la configuración.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="panel mb-4 p-5 bg-white border-slate-200 shadow-2xs">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex items-center gap-2 text-sm font-bold text-slate-900"
      >
        <Settings className="h-4 w-4" /> Umbrales del módulo
      </button>
      {!abierto && (
        <p className="mt-1 text-xs text-slate-500">
          Días de vendible/exceso/ruptura/sobre-cobertura — click para ajustar
        </p>
      )}
      {abierto && (
        <div className="mt-4">
          {loading || !valores ? (
            <p className="text-xs text-slate-500">Cargando...</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {campo("diasVendible", "Días vendible", "≤ este valor: rotación sana")}
                {campo("diasExceso", "Días exceso/obsolescencia", "≤: exceso; >: obsolescencia")}
                {campo(
                  "diasRupturaCobertura",
                  "Días riesgo de ruptura",
                  "< este valor de cobertura",
                )}
                {campo("diasSobreCobertura", "Días sobre-cobertura", "> este valor de cobertura")}
                {campo(
                  "coberturaObjetivoDias",
                  "Cobertura objetivo (días)",
                  "Inventario que el negocio quiere mantener",
                )}
                {campo(
                  "factorSeguridad",
                  "Factor de seguridad",
                  "1 = sin colchón extra; 1.2 = 20% adicional",
                  { min: 1, max: 5, step: 0.1 },
                )}
              </div>
              <Button size="sm" className="mt-4" onClick={handleGuardar} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Cuerpo de la tarjeta resumen "Comprometido en Siesa". El detalle vive en
 * Gestión Comercial → Pedidos → pestaña "Comprometido en Siesa". */
function TarjetaComprometidoSiesa({ valor, conEnlace }: { valor: number; conEnlace?: boolean }) {
  return (
    <>
      <p className="text-xs font-semibold text-slate-500">Comprometido en Siesa</p>
      <p className="num mt-2 text-xl font-bold text-slate-900">{money(valor)}</p>
      <p className="mt-1 text-[11px] text-slate-500">
        {conEnlace
          ? "Ya destinado a pedidos — clic para ver el estado de cada pedido en Gestión Comercial → Pedidos"
          : "Ya destinado a pedidos en Siesa"}
      </p>
    </>
  );
}

function Inventario() {
  const { user: sesion } = useSession();
  const puedeConfigurar = hasPermission(sesion, PERMISOS_SISTEMA.INVENTARIO_CONFIGURAR);
  // El detalle vive en Gestión Comercial → pestaña Pedidos (estado operativo de
  // Siesa por pedido): el enlace solo aparece con pedidos_comerciales.ver; sin
  // él la tarjeta sigue siendo informativa (sin enlace).
  const puedeVerComprometidoEnPedidos = hasPermission(
    sesion,
    PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER,
  );
  const { inventario, loading } = useInventarioGerencial();
  const { pronostico, loading: cargandoPronostico } = usePronosticoDemanda();
  const { produccion, loading: cargandoProduccion } = useProduccionRecomendada();

  return (
    <AppShell
      title="Inventario"
      description="Inventario real leído en vivo desde Siesa — valor, comprometido y clasificación por antigüedad de venta"
    >
      {puedeConfigurar && <PanelConfiguracion />}

      {loading && <p className="text-xs text-slate-500">Cargando...</p>}

      {!loading && !inventario.disponible && (
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
          {inventario.motivo ?? "Inventario no disponible."}
        </div>
      )}

      {!loading && inventario.disponible && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <p className="text-xs font-semibold text-slate-500">Inventario total</p>
              <p className="num mt-2 text-xl font-bold text-slate-900">
                {money(inventario.totalValor ?? 0)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {money(inventario.totalValorVendible ?? 0)} es mercancía vendible
              </p>
            </div>
            {puedeVerComprometidoEnPedidos ? (
              <Link
                to="/comercial/gestion"
                search={{ tab: "pedidos" }}
                className="panel p-5 bg-white border-slate-200 shadow-2xs text-left cursor-pointer transition hover:border-slate-300 hover:shadow-md"
              >
                <TarjetaComprometidoSiesa valor={inventario.totalComprometidoValor ?? 0} conEnlace />
              </Link>
            ) : (
              <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-left">
                <TarjetaComprometidoSiesa valor={inventario.totalComprometidoValor ?? 0} />
              </div>
            )}
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <p className="text-xs font-semibold text-slate-500">Vendible</p>
              <p className="num mt-2 text-xl font-bold text-emerald-600">
                {money(inventario.buckets?.vendible.valor ?? 0)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {inventario.buckets?.vendible.items ?? 0} ítems
              </p>
            </div>
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <p className="text-xs font-semibold text-slate-500">En riesgo</p>
              <p className="num mt-2 text-xl font-bold text-red-600">
                {money(
                  (inventario.buckets?.exceso.valor ?? 0) +
                    (inventario.buckets?.obsolescencia.valor ?? 0),
                )}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Exceso + riesgo de obsolescencia</p>
            </div>
          </div>

          {/* "Top demanda" priorizado más arriba en la jerarquía visual —
              representa demanda real y orienta decisiones comerciales/
              operativas antes que el detalle de antigüedad/liquidación. */}
          {!cargandoPronostico &&
            pronostico.disponible &&
            (pronostico.topDemanda ?? []).length > 0 && (
              <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
                <h2 className="text-sm font-bold text-slate-900">Top demanda</h2>
                <p className="text-xs text-slate-500">
                  Los productos que más se venden en promedio por mes — el núcleo de la demanda. Haz
                  clic en un producto para ver su registro histórico de ventas (clientes y monto).
                </p>
                <div className="mt-4 overflow-x-auto">
                  <TablaProductos productos={pronostico.topDemanda ?? []} expandible />
                </div>
              </div>
            )}

          <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Inventario por antigüedad de venta</h2>
            <p className="text-xs text-slate-500">
              Clasificación v1 — basada solo en días desde la última venta registrada en Siesa
            </p>
            <div className="mt-4 space-y-3">
              {BUCKET_INFO.map(({ key, label, descripcion, color }) => {
                const bucket = inventario.buckets?.[key] ?? { valor: 0, items: 0 };
                const max = Math.max(1, inventario.totalValor ?? 1);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{label}</span>
                      <span className="num text-slate-600">
                        {money(bucket.valor)} · {bucket.items} ítems
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{descripcion}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn("h-full rounded-full", color)}
                        style={{ width: `${(bucket.valor / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Info className="h-3.5 w-3.5" /> Pronóstico de demanda (últimos 12 meses completos)
          </div>

          {cargandoPronostico && <p className="text-xs text-slate-500">Cargando...</p>}

          {!cargandoPronostico && !pronostico.disponible && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
              {pronostico.motivo ?? "Pronóstico de demanda no disponible."}
            </div>
          )}

          {!cargandoPronostico && pronostico.disponible && (
            <>
              {(pronostico.tendenciaFuerte ?? []).length > 0 && (
                <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
                  <h2 className="text-sm font-bold text-slate-900">Tendencia fuerte</h2>
                  <p className="text-xs text-slate-500">
                    Productos con variación de 20% o más entre los últimos 3 meses y los 3
                    anteriores — crecimiento u caída marcada
                  </p>
                  <div className="mt-4 overflow-x-auto">
                    <TablaProductos productos={pronostico.tendenciaFuerte ?? []} />
                  </div>
                </div>
              )}

              {(pronostico.perdiendoRotacion ?? []).length > 0 && (
                <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
                  <h2 className="text-sm font-bold text-slate-900">Perdiendo rotación</h2>
                  <p className="text-xs text-slate-500">
                    Productos cuyos últimos 3 meses cayeron a menos de la mitad de su promedio
                    anterior — revisar antes de volver a producir/comprar
                  </p>
                  <div className="mt-4 overflow-x-auto">
                    <TablaProductos productos={pronostico.perdiendoRotacion ?? []} expandible />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="mt-6 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Info className="h-3.5 w-3.5" /> Producción recomendada
          </div>

          {cargandoProduccion && <p className="text-xs text-slate-500">Cargando...</p>}

          {!cargandoProduccion && !produccion.disponible && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
              {produccion.motivo ?? "Producción recomendada no disponible."}
            </div>
          )}

          {!cargandoProduccion && produccion.disponible && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Qué producir</h2>
                  <p className="text-xs text-slate-500">
                    Demanda proyectada + comprometidos − disponible − ya en camino. Solo se muestran
                    productos donde realmente hace falta producir (los demás ya están cubiertos).
                  </p>
                </div>
                <Link to="/plan-produccion">
                  <Button size="sm" variant="outline">
                    Ir a Plan de producción
                  </Button>
                </Link>
              </div>
              {(produccion.recomendaciones ?? []).length === 0 ? (
                <p className="mt-4 text-xs text-slate-500">
                  Ningún producto necesita producción adicional en este momento.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/80">
                      <TableRow className="hover:bg-slate-100/80">
                        <TableHead className="w-8" />
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Referencia
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Producto
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Demanda proy.
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Comprometido
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Disponible
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          En camino
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Producir
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Confianza
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(produccion.recomendaciones ?? []).map((r) => (
                        <FilaProduccionRecomendada key={r.itemRowId} r={r} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Producción &amp; Planeación (motor determinístico, sin IA todavía): inventario, Centro
              de Decisiones, demanda y producción recomendada (vía receta real/BOM). La producción
              recomendada NO incluye stock de seguridad ni producción en proceso: Siesa no tiene
              esos datos configurados (verificado en vivo — 0 de 8.175 ítems con nivel mínimo, 0
              órdenes de producción abiertas). El "CUÁNDO" de cada decisión queda vacío: Siesa no
              reporta una fecha de necesidad calculable con los datos actuales. El score de
              liquidación no incluye un "ahorro" en pesos: requeriría asumir una tasa de costo de
              capital que Siesa no reporta. La redistribución de inventario entre empresas del grupo
              (multi-tenant) todavía no está implementada: requiere definir con el equipo qué
              información puede compartirse entre tenants sin violar el aislamiento actual. Toma
              física, Plan de producción y Oportunidades comerciales viven en sus propios módulos
              (ver menú lateral).
            </span>
          </div>
        </>
      )}
    </AppShell>
  );
}
