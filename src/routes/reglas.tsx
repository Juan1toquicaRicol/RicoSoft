import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
import { useReglas } from "@/hooks/use-reglas";

export const Route = createFileRoute("/reglas")({
  head: () => ({
    meta: [
      { title: "Motor de reglas | RicoSoft" },
      { name: "description", content: "Constructor visual de reglas SI/ENTONCES para enrutar y priorizar facturas." },
      { property: "og:title", content: "Motor de reglas | RicoSoft" },
      { property: "og:description", content: "Automatiza la distribución de facturas según proveedor, monto o contrato." },
    ],
  }),
  component: Reglas,
});

function Reglas() {
  const { reglas, loading, error, toggleActiva, addRegla } = useReglas();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ nombre: "", prioridad: 1, condicion: "", accion: "" });

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
    } catch (err: any) {
      alert(err.message || "Error al crear la regla.");
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
          <div key={r.id} className="panel p-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="num shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {r.id.slice(0, 8)}
                  </span>
                  <h2 className="truncate text-sm font-semibold">{r.nombre}</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Prioridad {r.prioridad} · {r.ejecuciones.toLocaleString("es-CO")} ejecuciones
                </p>
              </div>
              <Switch
                checked={r.activa}
                onCheckedChange={() =>
                  toggleActiva(r).catch((err: any) => alert(err.message || "Error al actualizar la regla."))
                }
                aria-label={`Activar ${r.nombre}`}
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Si</p>
                <ul className="mt-2 space-y-1.5">
                  {r.condiciones.map((c) => (
                    <li key={c} className="text-sm">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="hidden justify-center lg:flex">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="rounded-xl border border-primary/25 bg-primary/8 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Entonces</p>
                <ul className="mt-2 space-y-1.5">
                  {r.acciones.map((a) => (
                    <li key={a} className="text-sm">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
        {reglas.length === 0 && (
          <div className="panel p-12 text-center text-sm text-muted-foreground">
            {loading ? "Cargando reglas..." : error || 'No hay reglas configuradas. Haz clic en "Nueva regla".'}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva regla de enrutamiento</DialogTitle>
            <DialogDescription>Define una condición y la acción a ejecutar cuando se cumpla.</DialogDescription>
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
    </AppShell>
  );
}
