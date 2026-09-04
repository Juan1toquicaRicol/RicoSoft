import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Users,
  Package,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useObjetivos,
  useResumenObjetivo,
  useVendedoresObjetivo,
  useCatalogoVendedores,
  type Objetivo,
  type NivelObjetivo,
  type TipoPeriodoObjetivo,
} from "@/hooks/use-objetivos";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money } from "@/lib/data";
import { cn } from "@/lib/utils";

/** Siempre se guarda en KG (mismo criterio que el backend); se muestra en
 * TON cuando el valor es grande, para no mostrar cifras de 6+ dígitos. */
function formatVolumen(kg: number): string {
  if (Math.abs(kg) >= 1000) {
    return `${(kg / 1000).toLocaleString("es-CO", { maximumFractionDigits: 2 })} TON`;
  }
  return `${kg.toLocaleString("es-CO")} KG`;
}

export const Route = createFileRoute("/comercial/objetivos")({
  head: () => ({
    meta: [
      { title: "Objetivos | RicoSoft" },
      {
        name: "description",
        content:
          "Metas comerciales de empresa y por vendedor, cumplimiento, ritmo y comparativo interanual.",
      },
    ],
  }),
  component: ComercialObjetivosPage,
});

function ComercialObjetivosPage() {
  const anioActual = new Date().getFullYear();
  const {
    objetivos: objetivosEmpresa,
    loading: cargandoEmpresa,
    crearObjetivo,
    actualizarObjetivo,
    eliminarObjetivo,
    refresh: refreshEmpresa,
  } = useObjetivos({ nivel: "EMPRESA", anio: anioActual });
  const {
    objetivos: objetivosVendedor,
    loading: cargandoVendedores,
    crearObjetivo: crearObjetivoVendedor,
    actualizarObjetivo: actualizarObjetivoVendedor,
    eliminarObjetivo: eliminarObjetivoVendedor,
    refresh: refreshVendedores,
  } = useObjetivos({ nivel: "VENDEDOR", anio: anioActual });

  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [objetivoEditar, setObjetivoEditar] = useState<Objetivo | null>(null);
  const [objetivoEliminar, setObjetivoEliminar] = useState<Objetivo | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const { user } = useSession();
  const puedeCrear = hasPermission(user, PERMISOS_SISTEMA.OBJETIVOS_CREAR);
  const puedeEditar = hasPermission(user, PERMISOS_SISTEMA.OBJETIVOS_EDITAR);
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.OBJETIVOS_ELIMINAR);

  const objetivoActivo = seleccionadoId ?? objetivosEmpresa[0]?.id ?? null;

  const refreshAmbos = async () => {
    await Promise.all([refreshEmpresa(), refreshVendedores()]);
    setRefreshToken((t) => t + 1);
  };

  const handleEliminar = async () => {
    if (!objetivoEliminar) return;
    setEliminando(true);
    try {
      if (objetivoEliminar.nivel === "EMPRESA") {
        await eliminarObjetivo(objetivoEliminar.id);
      } else {
        await eliminarObjetivoVendedor(objetivoEliminar.id);
      }
      toast.success("Objetivo eliminado.");
      if (objetivoEliminar.id === seleccionadoId) setSeleccionadoId(null);
      setObjetivoEliminar(null);
      setRefreshToken((t) => t + 1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar el objetivo.");
    } finally {
      setEliminando(false);
    }
  };

  return (
    <AppShell
      title="Comercial · Objetivos"
      description="Meta comercial vs. venta real de Siesa — cumplimiento, ritmo y comparativo contra el año anterior."
      actions={
        puedeCrear && (
          <Button size="sm" className="gap-2" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo objetivo
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {!cargandoEmpresa && objetivosEmpresa.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {objetivosEmpresa.map((o) => (
              <button
                key={o.id}
                onClick={() => setSeleccionadoId(o.id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  o.id === objetivoActivo
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                {o.tipoPeriodo} · {new Date(o.fechaInicio).toLocaleDateString("es-CO")}
              </button>
            ))}
          </div>
        )}

        {!cargandoEmpresa && objetivosEmpresa.length === 0 && (
          <div className="panel bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
            No hay objetivos comerciales de empresa registrados para {anioActual}.
            {puedeCrear && ' Usa "Nuevo objetivo" para crear el primero.'}
          </div>
        )}

        {objetivoActivo && (
          <ObjetivoDetalle
            key={`${objetivoActivo}-${refreshToken}`}
            id={objetivoActivo}
            puedeEditar={puedeEditar}
            puedeEliminar={puedeEliminar}
            onEditar={(o) => setObjetivoEditar(o)}
            onEliminar={(o) => setObjetivoEliminar(o)}
          />
        )}

        <ObjetivosVendedorSeccion
          objetivos={objetivosVendedor}
          loading={cargandoVendedores}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          onEditar={(o) => setObjetivoEditar(o)}
          onEliminar={(o) => setObjetivoEliminar(o)}
        />
      </div>

      <NuevoObjetivoDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCrear={async (data) => {
          if (data.nivel === "EMPRESA") await crearObjetivo(data);
          else await crearObjetivoVendedor(data);
          await refreshAmbos();
        }}
      />

      <EditarObjetivoDialog
        objetivo={objetivoEditar}
        onOpenChange={(open) => !open && setObjetivoEditar(null)}
        onGuardar={async (id, nivel, data) => {
          if (nivel === "EMPRESA") await actualizarObjetivo(id, data);
          else await actualizarObjetivoVendedor(id, data);
          await refreshAmbos();
        }}
      />

      <AlertDialog
        open={!!objetivoEliminar}
        onOpenChange={(open) => !open && setObjetivoEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este objetivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. El objetivo dejará de aparecer en el listado, pero queda
              registrado en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={handleEliminar}
              disabled={eliminando}
            >
              {eliminando ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ObjetivoDetalle({
  id,
  puedeEditar,
  puedeEliminar,
  onEditar,
  onEliminar,
}: {
  id: string;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  onEditar: (o: Objetivo) => void;
  onEliminar: (o: Objetivo) => void;
}) {
  const { resumen, loading } = useResumenObjetivo(id);
  const {
    vendedores,
    disponible: vendedoresDisponible,
    loading: cargandoVendedores,
  } = useVendedoresObjetivo(id);

  if (loading) return <p className="text-xs text-slate-500">Cargando...</p>;
  if (!resumen.disponible) {
    return (
      <div className="panel bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
        {resumen.motivo ?? "No disponible."}
      </div>
    );
  }

  const { objetivo, cumplimiento, comparativo, ritmo } = resumen;
  if (!objetivo || !cumplimiento) return null;

  const fInicio = new Date(objetivo.fechaInicio).toLocaleDateString("es-CO");
  const fFin = new Date(objetivo.fechaFin).toLocaleDateString("es-CO");

  return (
    <div className="space-y-4">
      <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Target className="h-4 w-4 text-slate-500" /> Objetivo{" "}
              {objetivo.tipoPeriodo.toLowerCase()}
            </h2>
            <p className="text-xs text-slate-500">
              Empresa · {fInicio} → {fFin}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-bold",
                objetivo.estadoDerivado === "CERRADO"
                  ? "bg-slate-100 text-slate-600"
                  : objetivo.estadoDerivado === "CANCELADO"
                    ? "bg-slate-100 text-slate-400"
                    : "bg-blue-50 text-blue-700",
              )}
            >
              {objetivo.estadoDerivado}
            </span>
            {puedeEditar && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onEditar(objetivo)}
                className="h-7 text-[11px] text-slate-500 hover:text-slate-900"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {puedeEliminar && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onEliminar(objetivo)}
                className="h-7 text-[11px] text-slate-500 hover:text-slate-900"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {cumplimiento.metaValor != null && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Meta" value={money(cumplimiento.metaValor)} icon={Target} />
            <Link to="/analitica" className="block">
              <StatCard
                label="Venta"
                value={money(cumplimiento.ventaRealValor ?? 0)}
                icon={TrendingUp}
                className="cursor-pointer transition-all hover:border-blue-400"
              />
            </Link>
            <StatCard
              label="Cumplimiento"
              value={`${cumplimiento.cumplimientoValorPct ?? 0}%`}
              icon={TrendingUp}
              enfasis={(cumplimiento.cumplimientoValorPct ?? 0) < 100 ? "default" : "atencion"}
            />
            <StatCard
              label="Faltante"
              value={money(cumplimiento.faltanteValor ?? 0)}
              icon={TrendingDown}
            />
          </div>

          <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${Math.min(cumplimiento.cumplimientoValorPct ?? 0, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-600">
              {cumplimiento.cumplimientoValorPct ?? 0}% cumplido
            </p>

            {ritmo && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Tiempo</p>
                  <p className="num text-sm font-bold text-slate-900">
                    {ritmo.pctTiempoTranscurrido}%
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Meta cumplida
                  </p>
                  <p className="num text-sm font-bold text-slate-900">{ritmo.pctMetaCumplida}%</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Ritmo</p>
                  <p
                    className={cn(
                      "text-sm font-bold",
                      ritmo.ritmo === "ADELANTADO" ? "text-blue-700" : "text-slate-600",
                    )}
                  >
                    {ritmo.ritmo}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Proyección</p>
                  <p className="num text-sm font-bold text-slate-900">
                    {money(ritmo.proyeccionLineal)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {cumplimiento.metaVolumenKg != null && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Meta volumen"
              value={formatVolumen(cumplimiento.metaVolumenKg)}
              icon={Package}
            />
            <Link to="/analitica" className="block">
              <StatCard
                label="Volumen vendido"
                value={formatVolumen(cumplimiento.volumenRealKg ?? 0)}
                icon={TrendingUp}
                className="cursor-pointer transition-all hover:border-blue-400"
              />
            </Link>
            <StatCard
              label="Cumplimiento volumen"
              value={`${cumplimiento.cumplimientoVolumenPct ?? 0}%`}
              icon={TrendingUp}
              enfasis={(cumplimiento.cumplimientoVolumenPct ?? 0) < 100 ? "default" : "atencion"}
            />
            <StatCard
              label="Faltante volumen"
              value={formatVolumen(cumplimiento.faltanteVolumenKg ?? 0)}
              icon={TrendingDown}
            />
          </div>

          <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${Math.min(cumplimiento.cumplimientoVolumenPct ?? 0, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-600">
              {cumplimiento.cumplimientoVolumenPct ?? 0}% del volumen cumplido
            </p>
          </div>
        </>
      )}

      {comparativo && (
        <Link to="/analitica" className="block group">
          <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm cursor-pointer transition-all group-hover:border-blue-400">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Comparativo · mismo período año anterior
            </h3>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <div>
                <p className="text-[11px] text-slate-500">Este año</p>
                <p className="num text-lg font-bold text-slate-900">
                  {money(comparativo.ventaActual)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Año anterior</p>
                <p className="num text-lg font-bold text-slate-500">
                  {money(comparativo.ventaAnterior)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Variación</p>
                <p
                  className={cn(
                    "num text-lg font-bold",
                    comparativo.variacionAbsoluta >= 0 ? "text-blue-700" : "text-slate-600",
                  )}
                >
                  {comparativo.variacionAbsoluta >= 0 ? "+" : ""}
                  {money(comparativo.variacionAbsoluta)}
                  {comparativo.variacionPct != null && (
                    <span className="ml-1 text-sm font-semibold">
                      ({comparativo.variacionPct >= 0 ? "+" : ""}
                      {comparativo.variacionPct}%)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </Link>
      )}

      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Users className="h-4 w-4 text-slate-500" /> Aporte por vendedor
          </h3>
        </div>
        {cargandoVendedores && <p className="p-5 text-xs text-slate-500">Cargando...</p>}
        {!cargandoVendedores && !vendedoresDisponible && (
          <p className="p-5 text-xs text-slate-500">Desglose por vendedor no disponible.</p>
        )}
        {!cargandoVendedores && vendedoresDisponible && vendedores.length === 0 && (
          <p className="p-5 text-xs text-slate-500">Sin ventas registradas en este período.</p>
        )}
        {!cargandoVendedores && vendedoresDisponible && vendedores.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow className="hover:bg-slate-100/80">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Vendedor
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Venta
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Participación
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Volumen
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Meta individual
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Cumplimiento
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendedores.map((v) => (
                  <TableRow
                    key={v.vendedorRowId ?? v.vendedorNombre}
                    className="hover:bg-slate-50/80"
                  >
                    <TableCell className="text-xs font-semibold text-slate-800">
                      {v.vendedorNombre}
                    </TableCell>
                    <TableCell className="num text-right text-xs font-bold text-slate-900">
                      <Link to="/analitica" className="hover:text-blue-700 hover:underline">
                        {money(v.venta)}
                      </Link>
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-600">
                      {v.pctParticipacion != null ? `${v.pctParticipacion}%` : "—"}
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-600">
                      {formatVolumen(v.kilos)}
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-600">
                      {v.metaIndividual != null ? money(v.metaIndividual) : "—"}
                    </TableCell>
                    <TableCell className="num text-right text-xs font-semibold text-slate-800">
                      {v.cumplimientoIndividualPct != null
                        ? `${v.cumplimientoIndividualPct}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function ObjetivosVendedorSeccion({
  objetivos,
  loading,
  puedeEditar,
  puedeEliminar,
  onEditar,
  onEliminar,
}: {
  objetivos: Objetivo[];
  loading: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  onEditar: (o: Objetivo) => void;
  onEliminar: (o: Objetivo) => void;
}) {
  if (loading) return null;
  if (objetivos.length === 0) return null;

  return (
    <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <Users className="h-4 w-4 text-slate-500" /> Objetivos individuales por vendedor
        </h3>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-100/80">
            <TableRow className="hover:bg-slate-100/80">
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                Vendedor
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                Período
              </TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                Meta valor
              </TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                Meta volumen
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                Estado
              </TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {objetivos.map((o) => (
              <TableRow key={o.id} className="hover:bg-slate-50/80">
                <TableCell className="text-xs font-semibold text-slate-800">
                  {o.vendedorSiesaNombre ?? "Sin nombre"}
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  {o.tipoPeriodo} · {new Date(o.fechaInicio).toLocaleDateString("es-CO")} –{" "}
                  {new Date(o.fechaFin).toLocaleDateString("es-CO")}
                </TableCell>
                <TableCell className="num text-right text-xs text-slate-800">
                  {o.metaValor != null ? money(o.metaValor) : "—"}
                </TableCell>
                <TableCell className="num text-right text-xs text-slate-800">
                  {o.metaVolumenKg != null ? formatVolumen(o.metaVolumenKg) : "—"}
                </TableCell>
                <TableCell className="text-xs">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      o.estadoDerivado === "CERRADO"
                        ? "bg-slate-100 text-slate-600"
                        : o.estadoDerivado === "CANCELADO"
                          ? "bg-slate-100 text-slate-400"
                          : "bg-blue-50 text-blue-700",
                    )}
                  >
                    {o.estadoDerivado}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {puedeEditar && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => onEditar(o)}
                      className="h-7 text-[11px] text-slate-500 hover:text-slate-900"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                  {puedeEliminar && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => onEliminar(o)}
                      className="h-7 text-[11px] text-slate-500 hover:text-slate-900"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function fechaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Rango sugerido según tipoPeriodo, en UTC (mismo criterio que el resto de la app) — el usuario puede sobreescribirlo antes de guardar. */
function rangoSugerido(tipo: TipoPeriodoObjetivo): { fechaInicio: string; fechaFin: string } {
  const ahora = new Date();
  const anio = ahora.getUTCFullYear();
  const mes = ahora.getUTCMonth();

  if (tipo === "MENSUAL") {
    return {
      fechaInicio: fechaISO(new Date(Date.UTC(anio, mes, 1))),
      fechaFin: fechaISO(new Date(Date.UTC(anio, mes + 1, 0))),
    };
  }
  if (tipo === "TRIMESTRAL") {
    const inicioTrimestre = Math.floor(mes / 3) * 3;
    return {
      fechaInicio: fechaISO(new Date(Date.UTC(anio, inicioTrimestre, 1))),
      fechaFin: fechaISO(new Date(Date.UTC(anio, inicioTrimestre + 3, 0))),
    };
  }
  if (tipo === "ANUAL") {
    return {
      fechaInicio: fechaISO(new Date(Date.UTC(anio, 0, 1))),
      fechaFin: fechaISO(new Date(Date.UTC(anio, 11, 31))),
    };
  }
  // PERSONALIZADO: conserva lo que el usuario ya tenga escrito.
  return { fechaInicio: fechaISO(ahora), fechaFin: fechaISO(ahora) };
}

interface NuevoObjetivoPayload {
  nivel: NivelObjetivo;
  vendedorSiesaRowId?: number;
  vendedorSiesaNombre?: string;
  tipoPeriodo: TipoPeriodoObjetivo;
  fechaInicio: string;
  fechaFin: string;
  metaValor?: number;
  metaVolumenKg?: number;
  descripcion?: string;
}

function NuevoObjetivoDialog({
  open,
  onOpenChange,
  onCrear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCrear: (data: NuevoObjetivoPayload) => Promise<void>;
}) {
  const inicial = rangoSugerido("MENSUAL");
  const [nivel, setNivel] = useState<NivelObjetivo>("EMPRESA");
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodoObjetivo>("MENSUAL");
  const [vendedorSiesaRowId, setVendedorSiesaRowId] = useState<string>("");
  const [fechaInicio, setFechaInicio] = useState(inicial.fechaInicio);
  const [fechaFin, setFechaFin] = useState(inicial.fechaFin);
  const [metaValor, setMetaValor] = useState("");
  const [volumen, setVolumen] = useState("");
  const [unidadVolumen, setUnidadVolumen] = useState<"KG" | "TON">("TON");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const { vendedores, loading: cargandoVendedores } = useCatalogoVendedores();

  const resetForm = () => {
    const r = rangoSugerido("MENSUAL");
    setNivel("EMPRESA");
    setTipoPeriodo("MENSUAL");
    setVendedorSiesaRowId("");
    setFechaInicio(r.fechaInicio);
    setFechaFin(r.fechaFin);
    setMetaValor("");
    setVolumen("");
    setUnidadVolumen("TON");
    setDescripcion("");
  };

  const handleTipoPeriodoChange = (val: TipoPeriodoObjetivo) => {
    setTipoPeriodo(val);
    if (val !== "PERSONALIZADO") {
      const r = rangoSugerido(val);
      setFechaInicio(r.fechaInicio);
      setFechaFin(r.fechaFin);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaValor && !volumen) {
      toast.error("La meta debe incluir al menos un valor monetario o un volumen.");
      return;
    }
    if (nivel === "VENDEDOR" && !vendedorSiesaRowId) {
      toast.error("Selecciona un vendedor para un objetivo individual.");
      return;
    }
    const vendedorElegido = vendedores.find((v) => String(v.vendedorRowId) === vendedorSiesaRowId);

    setGuardando(true);
    try {
      await onCrear({
        nivel,
        tipoPeriodo,
        fechaInicio,
        fechaFin,
        metaValor: metaValor ? Number(metaValor) : undefined,
        metaVolumenKg: volumen ? Number(volumen) * (unidadVolumen === "TON" ? 1000 : 1) : undefined,
        descripcion: descripcion || undefined,
        ...(nivel === "VENDEDOR"
          ? {
              vendedorSiesaRowId: Number(vendedorSiesaRowId),
              vendedorSiesaNombre: vendedorElegido?.vendedorNombre ?? undefined,
            }
          : {}),
      });
      toast.success("Objetivo creado.");
      onOpenChange(false);
      resetForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible crear el objetivo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white border-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-900 font-bold">Nuevo objetivo comercial</DialogTitle>
          <DialogDescription className="text-slate-500">
            La venta real se calcula en vivo desde Siesa — aquí solo defines la meta.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nivel</Label>
              <Select value={nivel} onValueChange={(val) => setNivel(val as NivelObjetivo)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPRESA" className="text-xs">
                    Empresa
                  </SelectItem>
                  <SelectItem value="VENDEDOR" className="text-xs">
                    Vendedor
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Período</Label>
              <Select
                value={tipoPeriodo}
                onValueChange={(val) => handleTipoPeriodoChange(val as TipoPeriodoObjetivo)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MENSUAL" className="text-xs">
                    Mensual
                  </SelectItem>
                  <SelectItem value="TRIMESTRAL" className="text-xs">
                    Trimestral
                  </SelectItem>
                  <SelectItem value="ANUAL" className="text-xs">
                    Anual
                  </SelectItem>
                  <SelectItem value="PERSONALIZADO" className="text-xs">
                    Personalizado
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {nivel === "VENDEDOR" && (
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Vendedor *</Label>
              <Select value={vendedorSiesaRowId} onValueChange={setVendedorSiesaRowId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue
                    placeholder={
                      cargandoVendedores ? "Cargando vendedores..." : "Selecciona un vendedor"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem
                      key={v.vendedorRowId}
                      value={String(v.vendedorRowId)}
                      className="text-xs"
                    >
                      {v.vendedorNombre ?? `Vendedor ${v.vendedorRowId}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!cargandoVendedores && vendedores.length === 0 && (
                <p className="text-[11px] font-semibold text-slate-600">
                  No hay vendedores con ventas recientes en Siesa (últimos 12 meses).
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha inicio</Label>
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha fin</Label>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Meta en valor (COP)</Label>
              <Input
                type="number"
                min={0}
                value={metaValor}
                onChange={(e) => setMetaValor(e.target.value)}
                placeholder="Ej. 5000000000"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Meta en volumen</Label>
              <div className="flex gap-1.5">
                <Input
                  type="number"
                  min={0}
                  value={volumen}
                  onChange={(e) => setVolumen(e.target.value)}
                  placeholder={unidadVolumen === "TON" ? "Ej. 500" : "Ej. 500000"}
                  className="h-9 text-xs"
                />
                <Select
                  value={unidadVolumen}
                  onValueChange={(val) => setUnidadVolumen(val as "KG" | "TON")}
                >
                  <SelectTrigger className="h-9 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TON" className="text-xs">
                      TON
                    </SelectItem>
                    <SelectItem value="KG" className="text-xs">
                      KG
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-slate-500">
            Incluye al menos uno de los dos: valor y/o volumen.
          </p>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Descripción (opcional)</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              className="text-xs"
            />
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={guardando}>
              {guardando ? "Guardando..." : "Crear objetivo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EditarObjetivoPayload {
  fechaInicio?: string;
  fechaFin?: string;
  metaValor?: number | null;
  metaVolumenKg?: number | null;
  descripcion?: string;
  estado?: "BORRADOR" | "ACTIVO" | "CANCELADO";
}

function EditarObjetivoDialog({
  objetivo,
  onOpenChange,
  onGuardar,
}: {
  objetivo: Objetivo | null;
  onOpenChange: (open: boolean) => void;
  onGuardar: (id: string, nivel: NivelObjetivo, data: EditarObjetivoPayload) => Promise<void>;
}) {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [metaValor, setMetaValor] = useState("");
  const [volumen, setVolumen] = useState("");
  const [unidadVolumen, setUnidadVolumen] = useState<"KG" | "TON">("TON");
  const [descripcion, setDescripcion] = useState("");
  const [estado, setEstado] = useState<"BORRADOR" | "ACTIVO" | "CANCELADO">("ACTIVO");
  const [guardando, setGuardando] = useState(false);
  const [cargadoParaId, setCargadoParaId] = useState<string | null>(null);

  // Precarga el formulario cuando cambia el objetivo a editar (sin useEffect:
  // se compara contra el id ya cargado, patrón "derived state during render").
  if (objetivo && objetivo.id !== cargadoParaId) {
    setFechaInicio(objetivo.fechaInicio.slice(0, 10));
    setFechaFin(objetivo.fechaFin.slice(0, 10));
    setMetaValor(objetivo.metaValor != null ? String(objetivo.metaValor) : "");
    // El valor guardado siempre está en KG; se muestra en TON cuando es
    // grande (>= 1000 KG), igual que el resto de la pantalla, y se
    // reconvierte a KG al guardar.
    if (objetivo.metaVolumenKg != null && objetivo.metaVolumenKg >= 1000) {
      setVolumen(String(objetivo.metaVolumenKg / 1000));
      setUnidadVolumen("TON");
    } else {
      setVolumen(objetivo.metaVolumenKg != null ? String(objetivo.metaVolumenKg) : "");
      setUnidadVolumen("KG");
    }
    setDescripcion(objetivo.descripcion ?? "");
    setEstado(objetivo.estado);
    setCargadoParaId(objetivo.id);
  }

  if (!objetivo) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaValor && !volumen) {
      toast.error("La meta debe incluir al menos un valor monetario o un volumen.");
      return;
    }
    setGuardando(true);
    try {
      await onGuardar(objetivo.id, objetivo.nivel, {
        fechaInicio,
        fechaFin,
        metaValor: metaValor ? Number(metaValor) : null,
        metaVolumenKg: volumen ? Number(volumen) * (unidadVolumen === "TON" ? 1000 : 1) : null,
        descripcion: descripcion || undefined,
        estado,
      });
      toast.success("Objetivo actualizado.");
      setCargadoParaId(null);
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible actualizar el objetivo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!objetivo} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white border-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-900 font-bold">
            Editar objetivo{" "}
            {objetivo.nivel === "VENDEDOR"
              ? `· ${objetivo.vendedorSiesaNombre ?? ""}`
              : "de empresa"}
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            El nivel y el vendedor no se pueden cambiar — elimina y crea uno nuevo si necesitas otro
            nivel.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha inicio</Label>
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha fin</Label>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Meta en valor (COP)</Label>
              <Input
                type="number"
                min={0}
                value={metaValor}
                onChange={(e) => setMetaValor(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Meta en volumen</Label>
              <div className="flex gap-1.5">
                <Input
                  type="number"
                  min={0}
                  value={volumen}
                  onChange={(e) => setVolumen(e.target.value)}
                  className="h-9 text-xs"
                />
                <Select
                  value={unidadVolumen}
                  onValueChange={(val) => setUnidadVolumen(val as "KG" | "TON")}
                >
                  <SelectTrigger className="h-9 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TON" className="text-xs">
                      TON
                    </SelectItem>
                    <SelectItem value="KG" className="text-xs">
                      KG
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Estado</Label>
            <Select value={estado} onValueChange={(val) => setEstado(val as typeof estado)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BORRADOR" className="text-xs">
                  Borrador
                </SelectItem>
                <SelectItem value="ACTIVO" className="text-xs">
                  Activo
                </SelectItem>
                <SelectItem value="CANCELADO" className="text-xs">
                  Cancelado
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Descripción (opcional)</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              className="text-xs"
            />
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
