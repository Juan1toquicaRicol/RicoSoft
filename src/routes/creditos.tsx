import { createFileRoute } from "@tanstack/react-router";
import { DollarSign, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { BarraVencimiento } from "@/components/ui/barra-vencimiento";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilaGrupo, OPCION_SIN_AGRUPAR, SelectorAgrupacion } from "@/components/ui/selector-agrupacion";
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
import { useCreditos } from "@/hooks/use-creditos";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money } from "@/lib/data";
import type { CreditoCliente } from "@/lib/data";

export const Route = createFileRoute("/creditos")({
  head: () => ({
    meta: [
      { title: "Créditos de clientes | RicoSoft" },
      { name: "description", content: "Cupos, saldos y vencimientos de crédito por cliente con historial de pagos." },
      { property: "og:title", content: "Créditos de clientes | RicoSoft" },
      { property: "og:description", content: "Créditos activos, pendientes y vencidos en un solo panel." },
    ],
  }),
  component: Creditos,
});

function Creditos() {
  const { creditos, loading, error, addCredito, registrarPago, marcarPazYSalvo, eliminarCredito } = useCreditos();
  const { user } = useSession();
  const puedeGestionar = hasPermission(user, PERMISOS_SISTEMA.CREDITOS_GESTIONAR);
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.CREDITOS_ELIMINAR);

  const total = creditos.reduce((acc, c) => acc + c.cupo, 0);
  const saldo = creditos.reduce((acc, c) => acc + c.saldo, 0);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    cliente: "",
    cupo: 5000000,
    saldo: 0,
    vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
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

  const gruposCreditos = useMemo(() => agruparFilas(creditos, claveDeAgrupacion), [creditos, claveDeAgrupacion]);

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
    } catch (err: any) {
      toast.error(err.message || "Error al registrar el crédito.");
      return;
    }
    setModalOpen(false);
    setForm({
      cliente: "",
      cupo: 5000000,
      saldo: 0,
      vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
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
    } catch (err: any) {
      toast.error(err.message || "No fue posible registrar el pago.");
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
    } catch (err: any) {
      toast.error(err.message || "No fue posible marcar paz y salvo.");
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
    } catch (err: any) {
      toast.error(err.message || "No fue posible eliminar el crédito.");
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
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cupo total otorgado</p>
          <p className="num mt-1 text-2xl font-bold text-blue-900">{money(total)}</p>
        </div>
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Saldo por recaudar</p>
          <p className="num mt-1 text-2xl font-bold text-slate-900">{money(saldo)}</p>
        </div>
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Utilización del cupo</p>
          <p className="num mt-1 text-2xl font-bold text-slate-900">{total > 0 ? Math.round((saldo / total) * 100) : 0}%</p>
        </div>
      </div>

      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="flex justify-end border-b border-slate-200 bg-slate-50/80 p-3">
          <SelectorAgrupacion
            value={agrupacion}
            onChange={setAgrupacion}
            opciones={[OPCION_SIN_AGRUPAR, { value: "estado", label: "Estado" }]}
          />
        </div>
        <Table>
          <TableHeader className="bg-slate-100/80">
            <TableRow className="hover:bg-slate-100/80">
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Cliente</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">Cupo</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">Saldo</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Vence</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Estado</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-slate-800 font-medium">
            {gruposCreditos.map((grupo) => (
              <Fragment key={grupo.clave || "sin-grupo"}>
                {grupo.clave && <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={6} />}
                {grupo.filas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-4 py-3 font-bold text-xs text-slate-900">{c.cliente}</TableCell>
                    <TableCell className="num px-4 py-3 text-right text-xs text-slate-600">{money(c.cupo)}</TableCell>
                    <TableCell className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">{money(c.saldo)}</TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-500">
                      <p className="font-mono">{new Date(c.vence).toLocaleDateString("es-CO")}</p>
                      {c.estado !== "Paz y Salvo" && (
                        <BarraVencimiento fecha={c.vence} etiquetaVencido="Vencido" className="mt-1" />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <EstadoBadge estado={c.estado} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {puedeGestionar && c.estado !== "Paz y Salvo" && c.saldo > 0 && (
                          <Button size="xs" variant="outline" onClick={() => abrirPago(c)} className="h-7 gap-1 text-[11px]">
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
                ))}
              </Fragment>
            ))}
            {creditos.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="p-0">
                  {loading ? (
                    <div className="py-12 text-center text-xs text-slate-500">Cargando créditos...</div>
                  ) : error ? (
                    <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                  ) : (
                    <EmptyState icon={DollarSign} title="No hay créditos registrados" description='Haz clic en "Nuevo Crédito" para registrar el primero.' />
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
            <DialogDescription className="text-slate-500">Cupo y saldo inicial otorgados al cliente.</DialogDescription>
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
            <Button type="button" variant="outline" size="sm" onClick={() => setCreditoAPagar(null)} disabled={aplicandoPago}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleRegistrarPago} disabled={aplicandoPago}>
              {aplicandoPago ? "Registrando..." : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAR PAZ Y SALVO */}
      <AlertDialog open={!!creditoAPazYSalvo} onOpenChange={(open) => !open && setCreditoAPazYSalvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar paz y salvo para {creditoAPazYSalvo?.cliente}?</AlertDialogTitle>
            <AlertDialogDescription>
              El saldo pendiente quedará en $0 y el crédito se marcará como "Paz y Salvo". Esta acción
              queda registrada con tu usuario y la hora actual.
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
      <AlertDialog open={!!creditoAEliminar} onOpenChange={(open) => !open && setCreditoAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el crédito de {creditoAEliminar?.cliente}?</AlertDialogTitle>
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
