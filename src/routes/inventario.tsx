import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Info, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  useCobertura,
  useAbastecimiento,
  useConfiguracionInventario,
  useDecisionesPlaneacion,
  type ClasificacionInventario,
  type PronosticoProducto,
  type ConfiguracionInventario,
  type DecisionPlaneacion,
  type TipoDecision,
} from "@/hooks/use-inventario";
import { usePlanesProduccion } from "@/hooks/use-plan-produccion";
import { useGestionesLiquidacion } from "@/hooks/use-gestion-liquidacion";
import { compact, formatCantidad, money } from "@/lib/data";
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

function FilaProducto({ p }: { p: PronosticoProducto }) {
  return (
    <TableRow key={p.itemRowId} className="hover:bg-slate-50/80">
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
  );
}

function TablaProductos({ productos }: { productos: PronosticoProducto[] }) {
  return (
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
          <FilaProducto key={p.itemRowId} p={p} />
        ))}
      </TableBody>
    </Table>
  );
}

const DECISION_INFO: Record<
  TipoDecision,
  { emoji: string; label: string; border: string; bg: string; text: string }
> = {
  producir: {
    emoji: "✓",
    label: "Producir",
    border: "border-blue-200",
    bg: "bg-blue-50",
    text: "text-blue-700",
  },
  comprar: {
    emoji: "⛏︎",
    label: "Comprar",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
  },
  liquidar: {
    emoji: "♻︎",
    label: "Liquidar",
    border: "border-red-200",
    bg: "bg-red-50",
    text: "text-red-700",
  },
  no_producir: {
    emoji: "✖︎",
    label: "No producir",
    border: "border-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-700",
  },
  riesgo_quiebre: {
    emoji: "⚠︎",
    label: "Riesgo de quiebre",
    border: "border-orange-200",
    bg: "bg-orange-50",
    text: "text-orange-700",
  },
};

const CONFIANZA_LABEL: Record<string, string> = {
  alta: "Confianza alta",
  media: "Confianza media",
  baja: "Confianza baja",
};

/**
 * Crear plan de producción — Fase G, acción "producir". El diálogo NO
 * recalcula nada: cantidad, capacidad y material limitante vienen tal cual
 * del motor (DecisionPlaneacion.detalle). El usuario puede ajustar la
 * cantidad antes de confirmar (el negocio puede decidir producir menos, ej.
 * por capacidad de planta) — el plan solo se crea al confirmar.
 */
function DialogoCrearPlanDesdeDecision({
  decision,
  abierto,
  onOpenChange,
}: {
  decision: DecisionPlaneacion;
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { crear } = usePlanesProduccion();
  const [cantidad, setCantidad] = useState(decision.cantidad ?? 0);
  const [creando, setCreando] = useState(false);

  const handleCrear = async () => {
    setCreando(true);
    try {
      const notas =
        `Generado desde el Centro de Decisiones. ${decision.motivo} ` +
        `Capacidad real: ${decision.detalle.capacidadMaxima !== undefined && decision.detalle.capacidadMaxima !== null ? formatCantidad(decision.detalle.capacidadMaxima, decision.unidadMedida) : "sin restricción de materiales"}` +
        `${decision.detalle.materialLimitante ? ` (limitada por ${decision.detalle.materialLimitante})` : ""}. ` +
        `Impacto estimado: ${money(decision.impacto)}. Confianza: ${decision.confianza}.`;
      await crear({
        itemRowId: decision.itemRowId,
        descripcion: decision.titulo,
        referencia: decision.referencia,
        unidadMedida: decision.unidadMedida,
        cantidadPlaneada: cantidad,
        fechaPlaneada: new Date().toISOString().slice(0, 10),
        notas: notas.slice(0, 500),
      });
      toast.success("Plan de producción creado.");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "No se pudo crear el plan de producción.");
    } finally {
      setCreando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear plan de producción</DialogTitle>
          <DialogDescription>
            {decision.titulo} — revisa la cantidad antes de confirmar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
            <p>{decision.motivo}</p>
            {decision.detalle.deficitProductivo !== undefined &&
              decision.detalle.deficitProductivo > 0 && (
                <p className="mt-1 font-semibold text-amber-700">
                  Déficit de materia prima: {formatCantidad(decision.detalle.deficitProductivo, decision.unidadMedida)}
                  no se podrán producir con el inventario actual.
                </p>
              )}
            <p className="mt-1">
              Impacto estimado: <span className="font-semibold">{money(decision.impacto)}</span> ·
              Confianza: <span className="font-semibold">{decision.confianza}</span>
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">
              Cantidad a producir
            </Label>
            <Input
              type="number"
              min={0}
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              className="h-9 text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCrear} disabled={!cantidad || creando}>
            {creando ? "Creando..." : "Confirmar y crear plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Gestionar liquidación — Fase G, acción "liquidar". Persiste el snapshot
 * (score/categoría/motivo/valor) que YA calculó el motor — nunca recalcula.
 * RicoSoft no toca Siesa: esto registra la decisión empresarial, no un
 * ajuste real de inventario.
 */
function DialogoGestionarLiquidacionDesdeDecision({
  decision,
  abierto,
  onOpenChange,
}: {
  decision: DecisionPlaneacion;
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { crear } = useGestionesLiquidacion();
  const [creando, setCreando] = useState(false);

  const handleCrear = async () => {
    setCreando(true);
    try {
      await crear({
        itemRowId: decision.itemRowId,
        descripcion: decision.titulo,
        referencia: decision.referencia,
        cantidadExistente: decision.detalle.cantidadExistente ?? decision.cantidad ?? 0,
        valorTotal: decision.impacto,
        score: decision.detalle.score ?? 0,
        categoria: decision.detalle.categoriaLiquidacion ?? "MEDIA",
        motivo: decision.motivo.slice(0, 500),
      });
      toast.success("Gestión de liquidación creada.");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "No se pudo crear la gestión de liquidación.");
    } finally {
      setCreando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gestionar liquidación</DialogTitle>
          <DialogDescription>
            {decision.titulo} — registra la decisión para hacerle seguimiento. RicoSoft NO modifica
            el inventario en Siesa: el ajuste real, si corresponde, se hace allá manualmente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p>{decision.motivo}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Existencia:{" "}
              <span className="num font-semibold">
                {formatCantidad(decision.detalle.cantidadExistente ?? decision.cantidad ?? 0, decision.unidadMedida)}
              </span>
            </span>
            <span>
              Score: <span className="font-semibold">{decision.detalle.score}/100</span>
            </span>
            <span>
              Categoría:{" "}
              <span className="font-semibold">{decision.detalle.categoriaLiquidacion}</span>
            </span>
            <span>
              Capital inmovilizado: <span className="font-semibold">{money(decision.impacto)}</span>
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCrear} disabled={creando}>
            {creando ? "Creando..." : "Confirmar y gestionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Detalle expandible (sin navegar) para "no_producir" y "riesgo_quiebre" — solo lectura de decision.detalle, ningún cálculo nuevo. */
function DetalleDecisionExpandible({ decision }: { decision: DecisionPlaneacion }) {
  const [abierto, setAbierto] = useState(false);
  const d = decision.detalle;

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
      >
        {abierto ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {decision.tipo === "no_producir" ? "Ver por qué no producir" : "Ver detalle"}
      </button>
      {abierto && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-white/60 p-2 text-[11px] text-slate-600">
          {d.cantidadExistente !== undefined && (
            <span>
              Stock disponible:{" "}
              <span className="num font-semibold">
                {formatCantidad(d.cantidadExistente, decision.unidadMedida)}
              </span>
            </span>
          )}
          {d.ventaPromedioMensual !== undefined && (
            <span>
              Demanda reciente:{" "}
              <span className="num font-semibold">
                {formatCantidad(d.ventaPromedioMensual, decision.unidadMedida)}/mes
              </span>
            </span>
          )}
          {d.diasSinVenta !== undefined && (
            <span>
              Antigüedad:{" "}
              <span className="font-semibold">
                {d.diasSinVenta === null ? "nunca vendió" : `${d.diasSinVenta} días sin vender`}
              </span>
            </span>
          )}
          {d.diasCobertura !== undefined && (
            <span>
              Cobertura:{" "}
              <span className="font-semibold">
                {d.diasCobertura === null ? "sin datos" : `${d.diasCobertura} días`}
              </span>
            </span>
          )}
          {d.ventas30d !== undefined && (
            <span>
              Venta últimos 30 días:{" "}
              <span className="num font-semibold">{formatCantidad(d.ventas30d, decision.unidadMedida)}</span>
            </span>
          )}
          {d.ventas90d !== undefined && (
            <span>
              Venta últimos 90 días:{" "}
              <span className="num font-semibold">{formatCantidad(d.ventas90d, decision.unidadMedida)}</span>
            </span>
          )}
          {d.stockObjetivo !== undefined && (
            <span>
              Inventario objetivo:{" "}
              <span className="num font-semibold">{formatCantidad(d.stockObjetivo, decision.unidadMedida)}</span>
            </span>
          )}
          {d.excedenteSobreObjetivo !== undefined && d.excedenteSobreObjetivo > 0 && (
            <span>
              Excedente sobre objetivo:{" "}
              <span className="num font-semibold text-amber-700">
                {formatCantidad(d.excedenteSobreObjetivo, decision.unidadMedida)}
              </span>
            </span>
          )}
          <span>
            Valor inmovilizado: <span className="font-semibold">{money(decision.impacto)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function AccionDecision({
  decision,
  puedeProducir,
  puedeLiquidar,
}: {
  decision: DecisionPlaneacion;
  puedeProducir: boolean;
  puedeLiquidar: boolean;
}) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const { accion } = decision;

  if (accion.tipo === "plan-produccion") {
    if (!puedeProducir) return <span className="text-slate-400">—</span>;
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setDialogoAbierto(true)}>
          Crear plan de producción
        </Button>
        <DialogoCrearPlanDesdeDecision
          decision={decision}
          abierto={dialogoAbierto}
          onOpenChange={setDialogoAbierto}
        />
      </>
    );
  }

  if (accion.tipo === "solicitud-compra") {
    return (
      <Link
        to="/solicitudes-compra"
        search={{ item: accion.descripcion ?? "Insumo sin descripción", cantidad: accion.cantidad }}
        className="font-semibold text-blue-700 hover:underline"
      >
        {decision.tipo === "riesgo_quiebre" ? "Revisar abastecimiento" : "Generar solicitud"}
      </Link>
    );
  }

  if (accion.tipo === "gestion-liquidacion") {
    if (!puedeLiquidar) return <span className="text-slate-400">—</span>;
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setDialogoAbierto(true)}>
          Gestionar liquidación
        </Button>
        <DialogoGestionarLiquidacionDesdeDecision
          decision={decision}
          abierto={dialogoAbierto}
          onOpenChange={setDialogoAbierto}
        />
      </>
    );
  }

  return null;
}

function TarjetaDecision({
  decision,
  puedeProducir,
  puedeLiquidar,
}: {
  decision: DecisionPlaneacion;
  puedeProducir: boolean;
  puedeLiquidar: boolean;
}) {
  const info = DECISION_INFO[decision.tipo];
  const muestraDetalleExpandible =
    decision.tipo === "no_producir" || decision.tipo === "riesgo_quiebre";
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", info.border, info.bg)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-xs font-bold", info.text)}>
            {info.emoji} {decision.titulo}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">{decision.motivo}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
            {decision.cantidad !== null && (
              <span className="num">
                Cantidad: {formatCantidad(decision.cantidad, decision.unidadMedida)}
              </span>
            )}
            {decision.impacto > 0 && (
              <span className="num font-semibold text-slate-700">{money(decision.impacto)}</span>
            )}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-semibold",
                decision.confianza === "alta"
                  ? "bg-emerald-100 text-emerald-700"
                  : decision.confianza === "media"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-200 text-slate-600",
              )}
            >
              {CONFIANZA_LABEL[decision.confianza]}
            </span>
          </div>
          {muestraDetalleExpandible && (
            <div className="mt-1.5">
              <DetalleDecisionExpandible decision={decision} />
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-slate-400">
            Fuente: {decision.fuente}
            {decision.detalle.calidadDatos && (
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.5 font-semibold",
                  decision.detalle.calidadDatos === "ALTA"
                    ? "bg-emerald-100 text-emerald-700"
                    : decision.detalle.calidadDatos === "MEDIA"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-200 text-slate-600",
                )}
              >
                Calidad de datos: {decision.detalle.calidadDatos}
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right text-xs">
          <AccionDecision
            decision={decision}
            puedeProducir={puedeProducir}
            puedeLiquidar={puedeLiquidar}
          />
        </div>
      </div>
    </div>
  );
}

function PanelDecisiones() {
  const { user: sesion } = useSession();
  const puedeProducir = hasPermission(sesion, PERMISOS_SISTEMA.PLAN_PRODUCCION_GESTIONAR);
  const puedeLiquidar = hasPermission(sesion, PERMISOS_SISTEMA.GESTION_LIQUIDACION_GESTIONAR);
  const { decisiones, loading } = useDecisionesPlaneacion();

  if (loading) return <p className="text-xs text-slate-500">Cargando el Centro de Decisiones...</p>;
  if (!decisiones.disponible) {
    return (
      <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
        {decisiones.motivo ?? "Centro de Decisiones no disponible."}
      </div>
    );
  }

  const grupos = decisiones.resumen
    ? (Object.keys(DECISION_INFO) as TipoDecision[]).map((tipo) => ({
        tipo,
        info: DECISION_INFO[tipo],
        resumen: decisiones.resumen![tipo],
      }))
    : [];

  // Prioridad "alta" primero, ordenado dentro de cada grupo por impacto — así
  // Gerencia ve arriba lo más urgente y de mayor valor sin tener que filtrar.
  const prioridades = [...(decisiones.decisiones ?? [])].sort((a, b) => {
    const pesoPrioridad = { alta: 0, media: 1, baja: 2 };
    if (pesoPrioridad[a.prioridad] !== pesoPrioridad[b.prioridad]) {
      return pesoPrioridad[a.prioridad] - pesoPrioridad[b.prioridad];
    }
    return b.impacto - a.impacto;
  });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {grupos.map(({ tipo, info, resumen }) => (
          <div key={tipo} className="panel p-4 bg-white border-slate-200 shadow-2xs">
            <p className={cn("text-xs font-bold", info.text)}>
              {info.emoji} {info.label}
            </p>
            <p className="num mt-1 text-lg font-bold text-slate-900">{resumen.cantidad}</p>
            <p className="text-[11px] text-slate-500">
              {resumen.impacto > 0 ? money(resumen.impacto) : "—"}
            </p>
          </div>
        ))}
      </div>

      {prioridades.length > 0 && (
        <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Prioridades</h2>
          <p className="text-xs text-slate-500">
            Cada recomendación explica qué, cuánto, por qué, el impacto en pesos y qué tan confiable
            es — ninguna se ejecuta sola, siempre requiere tu confirmación explícita
          </p>
          <div className="mt-4 space-y-2">
            {prioridades.slice(0, 15).map((d) => (
              <TarjetaDecision
                key={`${d.tipo}-${d.itemRowId}`}
                decision={d}
                puedeProducir={puedeProducir}
                puedeLiquidar={puedeLiquidar}
              />
            ))}
          </div>
        </div>
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
    } catch (err: any) {
      toast.error(err.message || "No se pudo guardar la configuración.");
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

function Inventario() {
  const { user: sesion } = useSession();
  const puedeConfigurar = hasPermission(sesion, PERMISOS_SISTEMA.INVENTARIO_CONFIGURAR);
  const { inventario, loading } = useInventarioGerencial();
  const { pronostico, loading: cargandoPronostico } = usePronosticoDemanda();
  const { produccion, loading: cargandoProduccion } = useProduccionRecomendada();
  const { cobertura, loading: cargandoCobertura } = useCobertura();
  const { abastecimiento, loading: cargandoAbastecimiento } = useAbastecimiento();

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
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <p className="text-xs font-semibold text-slate-500">Comprometido (estimado)</p>
              <p className="num mt-2 text-xl font-bold text-slate-900">
                {money(inventario.totalComprometidoValor ?? 0)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Ya destinado a pedidos</p>
            </div>
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

          <div className="mt-6 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Info className="h-3.5 w-3.5" /> Centro de decisiones
          </div>
          <PanelDecisiones />

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

          {(inventario.topRiesgo ?? []).length > 0 && (
            <div className="panel mt-4 p-5 bg-white border-slate-200 shadow-2xs">
              <h2 className="text-sm font-bold text-slate-900">Recomendación de liquidación</h2>
              <p className="text-xs text-slate-500">
                Ítems en exceso u obsolescencia, ordenados por capital que se libera al liquidar —
                no incluye un "ahorro" en pesos: eso requeriría asumir una tasa de costo de capital
                que Siesa no reporta
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
                        Existencia
                      </TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Sin vender hace
                      </TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Capital atrapado
                      </TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Acción
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(inventario.topRiesgo ?? []).map((it) => (
                      <TableRow key={it.itemRowId} className="hover:bg-slate-50/80">
                        <TableCell className="text-xs text-slate-600">
                          {it.referencia ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-slate-800">
                          {it.descripcion ?? "Producto sin descripción"}
                        </TableCell>
                        <TableCell className="num text-right text-xs text-slate-700">
                          {formatCantidad(it.cantidadExistente, it.unidadMedida)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <span
                            className={cn(
                              "num font-semibold",
                              it.clasificacion === "obsolescencia"
                                ? "text-red-600"
                                : "text-amber-600",
                            )}
                          >
                            {it.diasSinVenta} días
                          </span>
                        </TableCell>
                        <TableCell className="num text-right text-xs font-bold text-slate-900">
                          {money(it.valorTotal)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {it.accionRecomendada && (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                it.accionRecomendada === "liquidar"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700",
                              )}
                            >
                              {it.accionRecomendada === "liquidar" ? "Liquidar" : "Revisar"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

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
              {(pronostico.topDemanda ?? []).length > 0 && (
                <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
                  <h2 className="text-sm font-bold text-slate-900">Top demanda</h2>
                  <p className="text-xs text-slate-500">
                    Los productos que más se venden en promedio por mes — el núcleo de la demanda
                  </p>
                  <div className="mt-4 overflow-x-auto">
                    <TablaProductos productos={pronostico.topDemanda ?? []} />
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
                    <TablaProductos productos={pronostico.perdiendoRotacion ?? []} />
                  </div>
                </div>
              )}

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
            </>
          )}

          <div className="mt-6 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Info className="h-3.5 w-3.5" /> Cobertura de inventario
          </div>

          {cargandoCobertura && <p className="text-xs text-slate-500">Cargando...</p>}

          {!cargandoCobertura && !cobertura.disponible && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
              {cobertura.motivo ?? "Cobertura no disponible."}
            </div>
          )}

          {!cargandoCobertura && cobertura.disponible && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="panel p-5 bg-white border-slate-200 shadow-2xs lg:col-span-2">
                <p className="text-xs font-semibold text-slate-500">Cobertura promedio</p>
                <p className="num mt-2 text-xl font-bold text-slate-900">
                  {cobertura.coberturaPromedioDias !== null &&
                  cobertura.coberturaPromedioDias !== undefined
                    ? `${cobertura.coberturaPromedioDias} días`
                    : "Sin datos suficientes"}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Existencia disponible ÷ venta diaria promedio, solo mercancía con demanda
                  calculada
                </p>
              </div>

              {(cobertura.riesgoRuptura ?? []).length > 0 && (
                <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
                  <h2 className="text-sm font-bold text-slate-900">Riesgo de ruptura</h2>
                  <p className="text-xs text-slate-500">Menos de 15 días de cobertura</p>
                  <ul className="mt-3 space-y-2">
                    {(cobertura.riesgoRuptura ?? []).map((it) => (
                      <li key={it.itemRowId} className="flex items-center justify-between text-xs">
                        <span className="min-w-0 truncate text-slate-700">
                          {it.descripcion ?? "Producto sin descripción"}
                        </span>
                        <span className="num shrink-0 font-semibold text-red-600">
                          {it.diasCobertura} días
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(cobertura.sobreCobertura ?? []).length > 0 && (
                <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
                  <h2 className="text-sm font-bold text-slate-900">Sobre-cobertura</h2>
                  <p className="text-xs text-slate-500">Más de 180 días de cobertura</p>
                  <ul className="mt-3 space-y-2">
                    {(cobertura.sobreCobertura ?? []).map((it) => (
                      <li key={it.itemRowId} className="flex items-center justify-between text-xs">
                        <span className="min-w-0 truncate text-slate-700">
                          {it.descripcion ?? "Producto sin descripción"}
                        </span>
                        <span className="num shrink-0 font-semibold text-amber-600">
                          {compact(it.diasCobertura ?? 0)} días
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
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
              <h2 className="text-sm font-bold text-slate-900">Qué producir</h2>
              <p className="text-xs text-slate-500">
                Demanda proyectada + comprometidos − disponible − ya en camino. Solo se muestran
                productos donde realmente hace falta producir (los demás ya están cubiertos).
              </p>
              {(produccion.recomendaciones ?? []).length === 0 ? (
                <p className="mt-4 text-xs text-slate-500">
                  Ningún producto necesita producción adicional en este momento.
                </p>
              ) : (
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(produccion.recomendaciones ?? []).map((r) => (
                        <TableRow key={r.itemRowId} className="hover:bg-slate-50/80">
                          <TableCell className="text-xs text-slate-600">
                            {r.referencia ?? "—"}
                          </TableCell>
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Info className="h-3.5 w-3.5" /> Necesidades de abastecimiento
          </div>

          {cargandoAbastecimiento && <p className="text-xs text-slate-500">Cargando...</p>}

          {!cargandoAbastecimiento && !abastecimiento.disponible && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
              {abastecimiento.motivo ?? "Necesidades de abastecimiento no disponibles."}
            </div>
          )}

          {!cargandoAbastecimiento && abastecimiento.disponible && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <h2 className="text-sm font-bold text-slate-900">Qué comprar</h2>
              <p className="text-xs text-slate-500">
                Materias primas/insumos que faltan para cubrir la producción recomendada, según la
                receta real (BOM) de cada producto
              </p>
              {(abastecimiento.necesidades ?? []).length === 0 ? (
                <p className="mt-4 text-xs text-slate-500">
                  No hay déficit de materias primas para la producción recomendada actual.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/80">
                      <TableRow className="hover:bg-slate-100/80">
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Referencia
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Materia prima / insumo
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Necesario
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Disponible
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Déficit
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Acción
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(abastecimiento.necesidades ?? []).map((n) => (
                        <TableRow key={n.componenteRowId} className="hover:bg-slate-50/80">
                          <TableCell className="text-xs text-slate-600">
                            {n.referencia ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-slate-800">
                            {n.descripcion ?? "Insumo sin descripción"}
                          </TableCell>
                          <TableCell className="num text-right text-xs text-slate-600">
                            {compact(n.cantidadNecesaria)}
                          </TableCell>
                          <TableCell className="num text-right text-xs text-slate-600">
                            {compact(n.cantidadDisponible)}
                          </TableCell>
                          <TableCell className="num text-right text-xs font-bold text-red-600">
                            {compact(n.deficit)}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <Link
                              to="/solicitudes-compra"
                              search={{
                                item: n.descripcion ?? n.referencia ?? "Insumo sin descripción",
                                cantidad: n.deficit,
                              }}
                              className="font-semibold text-blue-700 hover:underline"
                            >
                              Generar solicitud
                            </Link>
                          </TableCell>
                        </TableRow>
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
              de Decisiones, cobertura, demanda, producción recomendada y abastecimiento (vía receta
              real/BOM). La producción recomendada NO incluye stock de seguridad ni producción en
              proceso: Siesa no tiene esos datos configurados (verificado en vivo — 0 de 8.175 ítems
              con nivel mínimo, 0 órdenes de producción abiertas). El "CUÁNDO" de cada decisión
              queda vacío: Siesa no reporta una fecha de necesidad calculable con los datos
              actuales. El score de liquidación no incluye un "ahorro" en pesos: requeriría asumir
              una tasa de costo de capital que Siesa no reporta. La redistribución de inventario
              entre empresas del grupo (multi-tenant) todavía no está implementada: requiere definir
              con el equipo qué información puede compartirse entre tenants sin violar el
              aislamiento actual. Toma física, Plan de producción y Oportunidades comerciales viven
              en sus propios módulos (ver menú lateral).
            </span>
          </div>
        </>
      )}
    </AppShell>
  );
}
