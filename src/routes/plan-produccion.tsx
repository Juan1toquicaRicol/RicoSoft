import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  usePlanesProduccion,
  type CrearPlanProduccionInput,
  type EstadoPlanProduccion,
} from "@/hooks/use-plan-produccion";
import { useProduccionRecomendada } from "@/hooks/use-inventario";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { formatCantidad } from "@/lib/data";

export const Route = createFileRoute("/plan-produccion")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.PLAN_PRODUCCION_VER),
  head: () => ({
    meta: [
      { title: "Plan de Producción | RicoSoft" },
      {
        name: "description",
        content: "Seguimiento del plan de producción por estados — Planificada a Terminada.",
      },
    ],
  }),
  component: PlanProduccionPage,
});

const SIGUIENTES_ESTADOS: Record<EstadoPlanProduccion, EstadoPlanProduccion[]> = {
  Planificada: ["Aprobada", "Cancelada"],
  Aprobada: ["En producción", "Cancelada"],
  "En producción": ["Parcial", "Terminada", "Cancelada"],
  Parcial: ["Terminada", "Cancelada"],
  Terminada: [],
  Cancelada: [],
};

const PLAN_VACIO: CrearPlanProduccionInput = {
  itemRowId: 0,
  descripcion: "",
  referencia: "",
  unidadMedida: "",
  cantidadPlaneada: 0,
  fechaPlaneada: new Date().toISOString().slice(0, 10),
  notas: "",
};

function DialogoNuevoPlan({
  abierto,
  onOpenChange,
  onCreado,
  prellenado,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  onCreado: () => void;
  prellenado: CrearPlanProduccionInput | null;
}) {
  const { crear } = usePlanesProduccion();
  const [form, setForm] = useState<CrearPlanProduccionInput>(prellenado ?? PLAN_VACIO);
  const [creando, setCreando] = useState(false);

  const abrir = (v: boolean) => {
    if (v) setForm(prellenado ?? PLAN_VACIO);
    onOpenChange(v);
  };

  const handleCrear = async () => {
    if (!form.itemRowId || !form.cantidadPlaneada || !form.fechaPlaneada) return;
    setCreando(true);
    try {
      await crear(form);
      toast.success("Plan de producción creado.");
      onOpenChange(false);
      onCreado();
    } catch (err: any) {
      toast.error(err.message || "No se pudo crear el plan de producción.");
    } finally {
      setCreando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo plan de producción</DialogTitle>
          <DialogDescription>
            Seguimiento interno de RicoSoft — no crea una orden real en Siesa.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">
              Referencia (item Siesa)
            </Label>
            <Input
              type="number"
              value={form.itemRowId || ""}
              onChange={(e) => setForm((f) => ({ ...f, itemRowId: Number(e.target.value) }))}
              className="h-9 text-xs"
              placeholder="itemRowId"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Producto</Label>
            <Input
              value={form.descripcion ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase">
                Cantidad planeada
              </Label>
              <Input
                type="number"
                value={form.cantidadPlaneada || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cantidadPlaneada: Number(e.target.value) }))
                }
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase">
                Fecha planeada
              </Label>
              <Input
                type="date"
                value={form.fechaPlaneada.slice(0, 10)}
                onChange={(e) => setForm((f) => ({ ...f, fechaPlaneada: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Notas</Label>
            <Input
              value={form.notas ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleCrear}
            disabled={!form.itemRowId || !form.cantidadPlaneada || creando}
          >
            {creando ? "Creando..." : "Crear plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanProduccionPage() {
  const { user: sesion } = useSession();
  const puedeGestionar = hasPermission(sesion, PERMISOS_SISTEMA.PLAN_PRODUCCION_GESTIONAR);
  const { planes, loading, refresh, actualizarEstado } = usePlanesProduccion();
  const { produccion } = useProduccionRecomendada();
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [prellenado, setPrellenado] = useState<CrearPlanProduccionInput | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

  const abrirDesdeRecomendacion = (r: {
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    unidadMedida: string | null;
    produccionRecomendada: number;
  }) => {
    setPrellenado({
      itemRowId: r.itemRowId,
      descripcion: r.descripcion,
      referencia: r.referencia,
      unidadMedida: r.unidadMedida,
      cantidadPlaneada: r.produccionRecomendada,
      fechaPlaneada: new Date().toISOString().slice(0, 10),
      notas: "",
    });
    setDialogoAbierto(true);
  };

  const handleCambiarEstado = async (id: string, estado: EstadoPlanProduccion) => {
    setCambiandoId(id);
    try {
      await actualizarEstado(id, estado);
      toast.success(`Estado actualizado a "${estado}".`);
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar el estado.");
    } finally {
      setCambiandoId(null);
    }
  };

  return (
    <AppShell
      title="Plan de Producción"
      description="Seguimiento del plan de producción por estados — registro interno de RicoSoft, no se escribe en Siesa"
    >
      {puedeGestionar && (
        <div className="mb-4 flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              setPrellenado(null);
              setDialogoAbierto(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Nuevo plan
          </Button>
        </div>
      )}

      <DialogoNuevoPlan
        abierto={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        onCreado={() => refresh()}
        prellenado={prellenado}
      />

      {puedeGestionar && (produccion.recomendaciones ?? []).length > 0 && (
        <div className="panel mb-4 p-5 bg-white border-slate-200 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Producción recomendada</h2>
          <p className="text-xs text-slate-500">
            Del cálculo en vivo (Bloque 4) — crea un plan de seguimiento a partir de una
            recomendación
          </p>
          <ul className="mt-3 space-y-2">
            {(produccion.recomendaciones ?? []).slice(0, 5).map((r) => (
              <li key={r.itemRowId} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-slate-700">
                  {r.descripcion ?? "Producto sin descripción"}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="num text-slate-500">
                    {formatCantidad(r.produccionRecomendada, r.unidadMedida)}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => abrirDesdeRecomendacion(r)}>
                    Planear
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900">Planes de producción</h2>
        {loading && <p className="mt-3 text-xs text-slate-500">Cargando...</p>}
        {!loading && planes.length === 0 && (
          <p className="mt-3 text-xs text-slate-500">Todavía no se ha creado ningún plan.</p>
        )}
        {!loading && planes.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow className="hover:bg-slate-100/80">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Producto
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Cantidad
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Fecha planeada
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Responsable
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Estado
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {planes.map((p) => (
                  <TableRow key={p.id} className="hover:bg-slate-50/80">
                    <TableCell className="text-xs font-semibold text-slate-800">
                      {p.descripcion ?? "Producto sin descripción"}
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-600">
                      {formatCantidad(p.cantidadPlaneada, p.unidadMedida)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {new Date(p.fechaPlaneada).toLocaleDateString("es-CO")}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{p.responsable}</TableCell>
                    <TableCell>
                      <EstadoBadge estado={p.estado} />
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {puedeGestionar && SIGUIENTES_ESTADOS[p.estado].length > 0 && (
                        <Select
                          value=""
                          onValueChange={(v) => handleCambiarEstado(p.id, v as EstadoPlanProduccion)}
                          disabled={cambiandoId === p.id}
                        >
                          <SelectTrigger className="h-8 w-40 text-xs">
                            <SelectValue placeholder="Cambiar estado" />
                          </SelectTrigger>
                          <SelectContent>
                            {SIGUIENTES_ESTADOS[p.estado].map((e) => (
                              <SelectItem key={e} value={e}>
                                {e}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
