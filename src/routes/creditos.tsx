import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cloud,
  DollarSign,
  Plus,
  ShieldCheck,
  Trash2,
  Wallet,
  AlertTriangle,
  Clock,
  Users,
} from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FilaGrupo,
  OPCION_SIN_AGRUPAR,
  SelectorAgrupacion,
} from "@/components/ui/selector-agrupacion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { agruparFilas } from "@/lib/agrupar";
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
import { useCreditos, useResumenCreditos, useCarteraSiesa } from "@/hooks/use-creditos";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { CreditoCliente } from "@/lib/data";
import { PLAZO_CREDITO_DIAS_DEFECTO } from "@/lib/constantes-negocio";

const OPCIONES_ESTADO_CREDITO = ["Todos", "Al día", "Por vencer", "Vencido", "Paz y Salvo"];
const OPCIONES_ESTADO_SIESA = ["Todos", "Al día", "Por vencer", "Vencido"];

export const Route = createFileRoute("/creditos")({
  head: () => ({
    meta: [
      { title: "Créditos de clientes | RicoSoft" },
      {
        name: "description",
        content: "Cupos, saldos y vencimientos de crédito por cliente con historial de pagos.",
      },
      { property: "og:title", content: "Créditos de clientes | RicoSoft" },
      {
        property: "og:description",
        content: "Créditos activos, pendientes y vencidos en un solo panel.",
      },
    ],
  }),
  component: Creditos,
});

function Creditos() {
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const { creditos, loading, error, addCredito, registrarPago, marcarPazYSalvo, eliminarCredito } =
    useCreditos({
      estado: estadoFiltro,
    });
  const { resumen, loading: cargandoResumen } = useResumenCreditos();
  const { user } = useSession();
  const puedeGestionar = hasPermission(user, PERMISOS_SISTEMA.CREDITOS_GESTIONAR);
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.CREDITOS_ELIMINAR);

  const [clienteExpandido, setClienteExpandido] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    cliente: "",
    cupo: 5000000,
    saldo: 0,
    vence: new Date(Date.now() + PLAZO_CREDITO_DIAS_DEFECTO * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
  });

  const [creditoAPagar, setCreditoAPagar] = useState<CreditoCliente | null>(null);
  const [montoPago, setMontoPago] = useState(0);
  const [aplicandoPago, setAplicandoPago] = useState(false);

  const [creditoAPazYSalvo, setCreditoAPazYSalvo] = useState<CreditoCliente | null>(null);
  const [aplicandoPazYSalvo, setAplicandoPazYSalvo] = useState(false);

  const [creditoAEliminar, setCreditoAEliminar] = useState<CreditoCliente | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);

  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "estado":
        return (c: CreditoCliente) => c.estado;
      default:
        return null;
    }
  }, [agrupacion]);

  const gruposCreditos = useMemo(
    () => agruparFilas(creditos, claveDeAgrupacion),
    [creditos, claveDeAgrupacion],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cliente) return;
    if (Number(form.saldo) > Number(form.cupo)) {
      toast.error("El saldo no puede ser mayor al cupo otorgado.");
      return;
    }
    try {
      await addCredito({
        cliente: form.cliente,
        cupo: Number(form.cupo),
        saldo: Number(form.saldo),
        vence: form.vence,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar el crédito.");
      return;
    }
    setModalOpen(false);
    setForm({
      cliente: "",
      cupo: 5000000,
      saldo: 0,
      vence: new Date(Date.now() + PLAZO_CREDITO_DIAS_DEFECTO * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    });
  };

  const abrirPago = (credito: CreditoCliente) => {
    setMontoPago(credito.saldo);
    setCreditoAPagar(credito);
  };

  const handleRegistrarPago = async () => {
    if (!creditoAPagar) return;
    if (!Number.isFinite(montoPago) || montoPago <= 0) {
      toast.error("Ingresa un monto válido.");
      return;
    }
    if (montoPago > creditoAPagar.saldo) {
      toast.error("El monto no puede ser mayor al saldo pendiente.");
      return;
    }
    setAplicandoPago(true);
    try {
      await registrarPago(creditoAPagar.id, montoPago);
      toast.success(`Pago de ${money(montoPago)} registrado para ${creditoAPagar.cliente}.`);
      setCreditoAPagar(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible registrar el pago.");
    } finally {
      setAplicandoPago(false);
    }
  };

  const handlePazYSalvo = async () => {
    if (!creditoAPazYSalvo) return;
    setAplicandoPazYSalvo(true);
    try {
      await marcarPazYSalvo(creditoAPazYSalvo.id);
      toast.success(`${creditoAPazYSalvo.cliente} quedó en paz y salvo.`);
      setCreditoAPazYSalvo(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible marcar paz y salvo.");
    } finally {
      setAplicandoPazYSalvo(false);
    }
  };

  const handleEliminar = async () => {
    if (!creditoAEliminar) return;
    setEliminando(true);
    try {
      await eliminarCredito(creditoAEliminar.id);
      toast.success(`Crédito de ${creditoAEliminar.cliente} eliminado.`);
      setCreditoAEliminar(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar el crédito.");
    } finally {
      setEliminando(false);
    }
  };

  return (
    <AppShell
      title="Créditos de clientes"
      description="Cupos otorgados y saldos vigentes"
      actions={
        puedeGestionar && (
          <Button onClick={() => setModalOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> Nuevo Crédito
          </Button>
        )
      }
    >
      {/* Cartera Siesa es la fuente real (créditos manuales suele estar en
          $0 en tenants reales) — va primero y con jerarquía visual
          superior. Ver PanelCarteraSiesa más abajo. */}
      <PanelCarteraSiesa />

      {/* Créditos manuales de RicoSoft: sección secundaria, deliberadamente
          compacta (sin StatCard) para no competir en peso visual con la
          cartera real cuando está vacía — sigue teniendo toda su función. */}
      <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Créditos manuales (RicoSoft)
        </h2>
        {!cargandoResumen && resumen && (
          <p className="text-[11px] text-slate-500">
            Por recaudar{" "}
            <span className="font-semibold text-slate-700">{money(resumen.porRecaudar)}</span> ·
            Vencido{" "}
            <span
              className={cn(
                "font-semibold",
                resumen.vencido > 0 ? "text-slate-900" : "text-slate-700",
              )}
            >
              {money(resumen.vencido)}
            </span>{" "}
            · Por vencer{" "}
            <span className="font-semibold text-slate-700">{money(resumen.porVencer)}</span> · Al
            día <span className="font-semibold text-slate-700">{money(resumen.alDia)}</span> ·
            Clientes en mora{" "}
            <span className="font-semibold text-slate-700">{resumen.clientesEnMora}</span> · Cupo
            total <span className="font-semibold text-slate-700">{money(resumen.cupoTotal)}</span> ·
            Utilización{" "}
            <span className="font-semibold text-slate-700">{resumen.utilizacionPct}%</span>
          </p>
        )}
      </div>

      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs mb-6">
        <div className="flex flex-wrap justify-end gap-2 border-b border-slate-200 bg-slate-50/80 p-3">
          <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
            <SelectTrigger className="h-9 w-40 text-xs bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPCIONES_ESTADO_CREDITO.map((op) => (
                <SelectItem key={op} value={op} className="text-xs">
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SelectorAgrupacion
            value={agrupacion}
            onChange={setAgrupacion}
            opciones={[OPCION_SIN_AGRUPAR, { value: "estado", label: "Estado" }]}
          />
        </div>
        <Table>
          <TableHeader className="bg-slate-100/80">
            <TableRow className="hover:bg-slate-100/80">
              <TableHead className="w-8 px-2 py-3.5" />
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Cliente
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Saldo por recaudar
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Saldo vencido
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Próximo vencimiento
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Días de mora
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Estado
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-slate-800 font-medium">
            {gruposCreditos.map((grupo) => (
              <Fragment key={grupo.clave || "sin-grupo"}>
                {grupo.clave && (
                  <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={8} />
                )}
                {grupo.filas.map((c) => {
                  const expandido = clienteExpandido === c.id;
                  return (
                    <Fragment key={c.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setClienteExpandido(expandido ? null : c.id)}
                      >
                        <TableCell className="px-2 py-3 text-slate-400">
                          {expandido ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-bold text-xs text-slate-900">
                          {c.cliente}
                        </TableCell>
                        <TableCell className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">
                          {money(c.saldo)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "num px-4 py-3 text-right text-xs",
                            c.vencido > 0 ? "font-bold text-slate-900" : "text-slate-400",
                          )}
                        >
                          {c.vencido > 0 ? money(c.vencido) : "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-xs text-slate-500">
                          <p className="font-mono">
                            {new Date(c.vence).toLocaleDateString("es-CO")}
                          </p>
                          {c.estado !== "Paz y Salvo" && (
                            <p className="text-[10px] text-slate-400">{c.estado}</p>
                          )}
                        </TableCell>
                        <TableCell className="num px-4 py-3 text-right text-xs text-slate-600">
                          {c.diasMora > 0 ? `${c.diasMora} días` : "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <EstadoBadge estado={c.estado} />
                        </TableCell>
                        <TableCell
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end gap-1.5">
                            {puedeGestionar && c.estado !== "Paz y Salvo" && c.saldo > 0 && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => abrirPago(c)}
                                className="h-7 gap-1 text-[11px]"
                              >
                                <DollarSign className="h-3 w-3" /> Registrar Pago
                              </Button>
                            )}
                            {puedeGestionar && c.estado !== "Paz y Salvo" && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => setCreditoAPazYSalvo(c)}
                                className="h-7 gap-1 text-[11px] border-blue-300 text-blue-800 hover:bg-blue-50"
                              >
                                <ShieldCheck className="h-3 w-3" /> Paz y Salvo
                              </Button>
                            )}
                            {puedeEliminar && (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => setCreditoAEliminar(c)}
                                className="h-7 text-[11px] text-slate-500 hover:text-slate-900"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandido && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={8} className="bg-slate-50/80 px-4 py-4">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Desglose de cartera
                            </p>
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  Total por recaudar
                                </p>
                                <p className="num mt-0.5 text-sm font-bold text-slate-900">
                                  {money(c.saldo)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  Vencido
                                </p>
                                <p className="num mt-0.5 text-sm font-bold text-slate-900">
                                  {money(c.vencido)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  Por vencer
                                </p>
                                <p className="num mt-0.5 text-sm font-bold text-slate-900">
                                  {money(c.porVencer)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  Al día
                                </p>
                                <p className="num mt-0.5 text-sm font-bold text-slate-900">
                                  {money(c.alDia)}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
            {creditos.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="p-0">
                  {loading ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      Cargando créditos...
                    </div>
                  ) : error ? (
                    <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                  ) : (
                    <EmptyState
                      icon={DollarSign}
                      title="No hay créditos registrados"
                      description='Haz clic en "Nuevo Crédito" para registrar el primero.'
                    />
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* MODAL NUEVO CRÉDITO */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Nuevo crédito de cliente</DialogTitle>
            <DialogDescription className="text-slate-500">
              Cupo y saldo inicial otorgados al cliente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="cliente" className="text-xs font-semibold">
                Cliente *
              </Label>
              <Input
                required
                id="cliente"
                placeholder="Ej: Almacenes Rico S.A.S."
                value={form.cliente}
                onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cupo" className="text-xs font-semibold">
                  Cupo otorgado (COP)
                </Label>
                <Input
                  type="number"
                  id="cupo"
                  value={form.cupo}
                  onChange={(e) => setForm({ ...form, cupo: Number(e.target.value) })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="saldo" className="text-xs font-semibold">
                  Saldo inicial (COP)
                </Label>
                <Input
                  type="number"
                  id="saldo"
                  value={form.saldo}
                  onChange={(e) => setForm({ ...form, saldo: Number(e.target.value) })}
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="vence" className="text-xs font-semibold">
                Fecha de vencimiento
              </Label>
              <Input
                type="date"
                id="vence"
                value={form.vence}
                onChange={(e) => setForm({ ...form, vence: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Registrar Crédito
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL REGISTRAR PAGO */}
      <Dialog open={!!creditoAPagar} onOpenChange={(open) => !open && setCreditoAPagar(null)}>
        <DialogContent className="sm:max-w-sm bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Registrar pago</DialogTitle>
            <DialogDescription className="text-slate-500">
              Abono al saldo de <strong>{creditoAPagar?.cliente}</strong>. Saldo pendiente actual:{" "}
              {creditoAPagar ? money(creditoAPagar.saldo) : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-2">
            <Label htmlFor="montoPago" className="text-xs font-semibold">
              Monto del pago (COP)
            </Label>
            <Input
              type="number"
              id="montoPago"
              value={montoPago}
              onChange={(e) => setMontoPago(Number(e.target.value))}
              className="h-9 text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreditoAPagar(null)}
              disabled={aplicandoPago}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleRegistrarPago} disabled={aplicandoPago}>
              {aplicandoPago ? "Registrando..." : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAR PAZ Y SALVO */}
      <AlertDialog
        open={!!creditoAPazYSalvo}
        onOpenChange={(open) => !open && setCreditoAPazYSalvo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Marcar paz y salvo para {creditoAPazYSalvo?.cliente}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              El saldo pendiente quedará en $0 y el crédito se marcará como "Paz y Salvo". Esta
              acción queda registrada con tu usuario y la hora actual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aplicandoPazYSalvo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePazYSalvo} disabled={aplicandoPazYSalvo}>
              {aplicandoPazYSalvo ? "Aplicando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRMAR ELIMINACIÓN */}
      <AlertDialog
        open={!!creditoAEliminar}
        onOpenChange={(open) => !open && setCreditoAEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar el crédito de {creditoAEliminar?.cliente}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. El crédito dejará de aparecer en el listado, pero queda
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

/**
 * Cartera real por cliente, en vivo desde Siesa — de solo lectura. A
 * diferencia de la tabla de arriba (cupos/saldos llevados a mano en
 * RicoSoft), esto es la cartera de verdad, calculada de los saldos
 * abiertos reales; por eso no tiene botones de "Registrar pago" ni "Paz y
 * salvo" — esas acciones se hacen en Siesa, RicoSoft nunca le escribe.
 */
function PanelCarteraSiesa() {
  const { items, resumen, disponible, motivo, total, page, totalPages, loading, refresh } =
    useCarteraSiesa();
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [clienteExpandido, setClienteExpandido] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBuscar = (valor: string) => {
    setSearch(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => refresh({ search: valor, estado: estadoFiltro, page: 1 }),
      300,
    );
  };

  const handleEstadoFiltro = (valor: string) => {
    setEstadoFiltro(valor);
    refresh({ search, estado: valor, page: 1 });
  };

  if (!disponible) {
    return (
      <div className="mt-6 panel bg-white border-slate-200 rounded-lg shadow-2xs p-6 text-center text-xs text-slate-500">
        {motivo || "No fue posible conectar con Siesa en este momento."}
      </div>
    );
  }

  const totalDistribucion = resumen ? resumen.vencido + resumen.porVencer + resumen.alDia : 0;
  const pctVencido = totalDistribucion > 0 ? (resumen!.vencido / totalDistribucion) * 100 : 0;
  const pctPorVencer = totalDistribucion > 0 ? (resumen!.porVencer / totalDistribucion) * 100 : 0;
  const pctAlDia = totalDistribucion > 0 ? (resumen!.alDia / totalDistribucion) * 100 : 0;

  return (
    <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <Cloud className="h-4 w-4 text-blue-600" />
        <div>
          <h2 className="text-sm font-bold text-slate-900">Cartera Siesa — tiempo real</h2>
          <p className="text-[11px] text-slate-500">
            Cifras reales leídas directamente de Siesa. Solo lectura.
          </p>
        </div>
      </div>

      {/* KPIs: siempre reflejan TODA la cartera (no la página ni el filtro
          actual) — cálculo 100% backend, ver GET /creditos/cartera-siesa. */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 p-4">
        <StatCard label="Por recaudar" value={money(resumen?.porRecaudar ?? 0)} icon={Wallet} />
        <StatCard
          label="Vencido"
          value={money(resumen?.vencido ?? 0)}
          icon={AlertTriangle}
          enfasis={(resumen?.vencido ?? 0) > 0 ? "atencion" : "default"}
        />
        <StatCard label="Por vencer" value={money(resumen?.porVencer ?? 0)} icon={Clock} />
        <StatCard label="Al día" value={money(resumen?.alDia ?? 0)} icon={DollarSign} />
        <StatCard
          label="Clientes en mora"
          value={String(resumen?.clientesEnMora ?? 0)}
          icon={Users}
          enfasis={(resumen?.clientesEnMora ?? 0) > 0 ? "atencion" : "default"}
        />
      </div>

      {/* Barra de distribución: hace evidente que Por recaudar = Vencido +
          Por vencer + Al día, sin fórmula ni gráfica. */}
      {totalDistribucion > 0 && (
        <div className="px-4 pb-4">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-slate-900"
              style={{ width: `${pctVencido}%` }}
              title="Vencido"
            />
            <div
              className="h-full bg-slate-400"
              style={{ width: `${pctPorVencer}%` }}
              title="Por vencer"
            />
            <div className="h-full bg-slate-200" style={{ width: `${pctAlDia}%` }} title="Al día" />
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            Vencido {Math.round(pctVencido)}% · Por vencer {Math.round(pctPorVencer)}% · Al día{" "}
            {Math.round(pctAlDia)}% del total por recaudar
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-200 bg-slate-50/60 px-4 py-2">
        <div className="flex flex-wrap gap-2">
          <Select value={estadoFiltro} onValueChange={handleEstadoFiltro}>
            <SelectTrigger className="h-8 w-36 text-xs bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPCIONES_ESTADO_SIESA.map((op) => (
                <SelectItem key={op} value={op} className="text-xs">
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Buscar por cliente o NIT..."
            value={search}
            onChange={(e) => handleBuscar(e.target.value)}
            className="h-8 w-full max-w-xs bg-white text-xs border-slate-300 shadow-2xs"
          />
        </div>
        <p className="text-[10px] text-slate-400">
          El filtro y la búsqueda afectan solo la tabla, no los KPIs de arriba.
        </p>
      </div>

      <Table>
        <TableHeader className="bg-slate-100/80">
          <TableRow className="hover:bg-slate-100/80">
            <TableHead className="w-8 px-2 py-3.5" />
            <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
              Cliente
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
              Saldo por recaudar
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
              Saldo vencido
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
              Próximo vencimiento
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
              Días de mora
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
              Estado
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-slate-800 font-medium">
          {items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="p-0">
                <div className="py-12 text-center text-xs text-slate-500">
                  {loading ? "Cargando cartera..." : "No hay clientes con saldo pendiente."}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            items.map((c) => {
              const clave = `${c.cliente}-${c.nit}`;
              const expandido = clienteExpandido === clave;
              return (
                <Fragment key={clave}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setClienteExpandido(expandido ? null : clave)}
                  >
                    <TableCell className="px-2 py-3 text-slate-400">
                      {expandido ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <p className="font-bold text-xs text-slate-900">{c.cliente}</p>
                      {c.nit && <p className="text-[11px] font-mono text-slate-500">NIT {c.nit}</p>}
                    </TableCell>
                    <TableCell className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">
                      {money(c.saldo)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "num px-4 py-3 text-right text-xs",
                        c.vencido > 0 ? "font-bold text-slate-900" : "text-slate-400",
                      )}
                    >
                      {c.vencido > 0 ? money(c.vencido) : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <p className="font-mono text-xs text-slate-500">
                        {new Date(c.vence).toLocaleDateString("es-CO")}
                      </p>
                      <p className="text-[10px] text-slate-400">{c.estado}</p>
                    </TableCell>
                    <TableCell className="num px-4 py-3 text-right text-xs text-slate-600">
                      {c.diasMora > 0 ? `${c.diasMora} días` : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <EstadoBadge estado={c.estado} />
                    </TableCell>
                  </TableRow>
                  {expandido && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="bg-slate-50/80 px-4 py-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Desglose de cartera
                        </p>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Total por recaudar
                            </p>
                            <p className="num mt-0.5 text-sm font-bold text-slate-900">
                              {money(c.saldo)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Vencido
                            </p>
                            <p className="num mt-0.5 text-sm font-bold text-slate-900">
                              {money(c.vencido)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Por vencer
                            </p>
                            <p className="num mt-0.5 text-sm font-bold text-slate-900">
                              {money(c.porVencer)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Al día
                            </p>
                            <p className="num mt-0.5 text-sm font-bold text-slate-900">
                              {money(c.alDia)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 text-[11px] text-slate-500">
                          Detalle documento por documento (facturas individuales de Siesa) no
                          disponible todavía en esta vista — pendiente de un endpoint dedicado.
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>

      {total > 0 && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3">
          <p className="text-[11px] font-semibold text-slate-500">
            {items.length} de {total} clientes con cartera pendiente — página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => refresh({ search, estado: estadoFiltro, page: page - 1 })}
              className="h-7 gap-1 text-[11px] font-bold"
            >
              <ChevronLeft className="h-3 w-3" /> Anterior
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => refresh({ search, estado: estadoFiltro, page: page + 1 })}
              className="h-7 gap-1 text-[11px] font-bold"
            >
              Siguiente <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
