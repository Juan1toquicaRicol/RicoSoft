import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { useReglas } from "@/hooks/use-reglas";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

export const Route = createFileRoute("/reglas")({
  head: () => ({
    meta: [
      { title: "Motor de reglas | RicoSoft" },
      {
        name: "description",
        content: "Constructor visual de reglas SI/ENTONCES para enrutar y priorizar facturas.",
      },
      { property: "og:title", content: "Motor de reglas | RicoSoft" },
      {
        property: "og:description",
        content: "Automatiza la distribución de facturas según proveedor, monto o contrato.",
      },
    ],
  }),
  component: Reglas,
});

function Reglas() {
  const { reglas, loading, error, toggleActiva, addRegla, eliminarRegla } = useReglas();
  const { user } = useSession();
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.REGLAS_ELIMINAR);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ nombre: "", prioridad: 1, condicion: "", accion: "" });
  const [reglaAEliminar, setReglaAEliminar] = useState<{ id: string; nombre: string } | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const handleEliminarRegla = async () => {
    if (!reglaAEliminar) return;
    setEliminando(true);
    try {
      await eliminarRegla(reglaAEliminar.id);
      toast.success(`Regla "${reglaAEliminar.nombre}" eliminada.`);
      setReglaAEliminar(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar la regla.");
    } finally {
      setEliminando(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.condicion || !form.accion) return;
    try {
      await addRegla({
        nombre: form.nombre,
        prioridad: Number(form.prioridad),
        condiciones: [form.condicion],
        acciones: [form.accion],
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear la regla.");
      return;
    }
    setModalOpen(false);
    setForm({ nombre: "", prioridad: 1, condicion: "", accion: "" });
  };

  return (
    <AppShell
      title="Motor de reglas"
      description="Distribución automática de facturas según condiciones de negocio"
      actions={
        <Button size="sm" className="gap-2" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva regla
        </Button>
      }
    >
      <div className="space-y-4">
        {reglas.map((r) => (
          <div key={r.id} className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="num shrink-0 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {r.id.slice(0, 8)}
                  </span>
                  <h2 className="truncate text-sm font-bold text-slate-900">{r.nombre}</h2>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Prioridad {r.prioridad} · {r.ejecuciones.toLocaleString("es-CO")} ejecuciones
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={r.activa}
                  onCheckedChange={() =>
                    toggleActiva(r).catch((err: unknown) =>
                      toast.error(
                        err instanceof Error ? err.message : "Error al actualizar la regla.",
                      ),
                    )
                  }
                  aria-label={`Activar ${r.nombre}`}
                />
                {puedeEliminar && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setReglaAEliminar({ id: r.id, nombre: r.nombre })}
                    className="h-7 text-[11px] text-slate-500 hover:text-slate-900"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Si
                </p>
                <ul className="mt-2 space-y-1.5">
                  {r.condiciones.map((c) => (
                    <li key={c} className="text-sm text-slate-800">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="hidden justify-center lg:flex">
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-800">
                  Entonces
                </p>
                <ul className="mt-2 space-y-1.5">
                  {r.acciones.map((a) => (
                    <li key={a} className="text-sm text-slate-800">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
        {reglas.length === 0 && (
          <div className="panel bg-white border-slate-200">
            {loading ? (
              <p className="p-12 text-center text-xs text-slate-500">Cargando reglas...</p>
            ) : error ? (
              <p className="p-12 text-center text-xs text-slate-500">{error}</p>
            ) : (
              <EmptyState
                icon={ArrowRight}
                title="No hay reglas configuradas"
                description='Haz clic en "Nueva regla" para automatizar la distribución de facturas.'
                action={
                  <Button size="sm" onClick={() => setModalOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" /> Nueva regla
                  </Button>
                }
              />
            )}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Nueva regla de enrutamiento
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Define una condición y la acción a ejecutar cuando se cumpla.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="nombre" className="text-xs font-semibold">
                Nombre de la regla *
              </Label>
              <Input
                required
                id="nombre"
                placeholder="Ej: Facturas de alto valor a Gerencia"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prioridad" className="text-xs font-semibold">
                Prioridad
              </Label>
              <Input
                type="number"
                id="prioridad"
                min={1}
                value={form.prioridad}
                onChange={(e) => setForm({ ...form, prioridad: Number(e.target.value) })}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="condicion" className="text-xs font-semibold">
                Condición (SI) *
              </Label>
              <Input
                required
                id="condicion"
                placeholder="Ej: Monto > $20.000.000"
                value={form.condicion}
                onChange={(e) => setForm({ ...form, condicion: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="accion" className="text-xs font-semibold">
                Acción (ENTONCES) *
              </Label>
              <Input
                required
                id="accion"
                placeholder="Ej: Enviar a Gerencia"
                value={form.accion}
                onChange={(e) => setForm({ ...form, accion: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Crear regla
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!reglaAEliminar}
        onOpenChange={(open) => !open && setReglaAEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la regla "{reglaAEliminar?.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente y no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={handleEliminarRegla}
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
