import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Ship, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useImportaciones, type EstadoOrdenIntl, type ItemOrdenInput } from "@/hooks/use-importaciones";
import { FilaGrupo, OPCION_SIN_AGRUPAR, SelectorAgrupacion } from "@/components/ui/selector-agrupacion";
import { agruparFilas } from "@/lib/agrupar";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money } from "@/lib/data";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/importaciones")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.IMPORTACIONES_VER),
  head: () => ({
    meta: [
      { title: "Importaciones y Exportaciones | RicoSoft" },
      {
        name: "description",
        content: "Órdenes de compra internacional, trazabilidad de lotes y costeo landed (NIC 2/21).",
      },
    ],
  }),
  component: ImportacionesPage,
});

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const MONEDAS = ["USD", "EUR", "CNY", "GBP", "JPY"];
const estadosFilter: (EstadoOrdenIntl | "Todas")[] = ["Todas", "Borrador", "Confirmada", "Cerrada", "Anulada"];

const itemVacio: ItemOrdenInput = { descripcion: "", cantidad: 1, valorUnitarioFob: 0 };

function estadoResumenLotes(orden: { lotes: { estado: string }[] }): string {
  if (orden.lotes.length === 0) return "Sin lotes";
  const prioridad = ["En tránsito", "En puerto", "En inspección", "Liberado pre-compra", "Nacionalizado"];
  const peor = orden.lotes.reduce((acc, l) => {
    const idx = prioridad.indexOf(l.estado);
    return idx < prioridad.indexOf(acc) ? l.estado : acc;
  }, orden.lotes[0].estado);
  return peor;
}

function ImportacionesPage() {
  const { ordenes, loading, error, addOrden, anularOrden } = useImportaciones();
  const { user } = useSession();

  const puedeCrear = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_CREAR);
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_ELIMINAR);

  const [estadoSel, setEstadoSel] = useState<(typeof estadosFilter)[number]>("Todas");
  const [q, setQ] = useState("");
  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);
  const [modalOpen, setModalOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ordenAAnular, setOrdenAAnular] = useState<{ id: string; numeroOrden: string } | null>(null);
  const [anulando, setAnulando] = useState(false);

  const [form, setForm] = useState({
    numeroOrden: "",
    incoterm: "FOB",
    proveedorExtranjero: "",
    paisOrigen: "",
    moneda: "USD",
    trmPactada: 4000,
    observaciones: "",
  });
  const [items, setItems] = useState<ItemOrdenInput[]>([{ ...itemVacio }]);

  const fobTotal = useMemo(
    () => items.reduce((acc, it) => acc + Number(it.cantidad || 0) * Number(it.valorUnitarioFob || 0), 0),
    [items],
  );
  const estimadoCop = fobTotal * Number(form.trmPactada || 0);

  const filteredOrdenes = useMemo(() => {
    return ordenes.filter((o) => {
      const matchEstado = estadoSel === "Todas" || o.estado === estadoSel;
      const term = q.trim().toLowerCase();
      const matchQ = !term || [o.numeroOrden, o.proveedorExtranjero, o.paisOrigen].some((v) => v.toLowerCase().includes(term));
      return matchEstado && matchQ;
    });
  }, [ordenes, estadoSel, q]);

  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "estado":
        return (o: (typeof filteredOrdenes)[number]) => o.estado;
      case "pais":
        return (o: (typeof filteredOrdenes)[number]) => o.paisOrigen;
      case "incoterm":
        return (o: (typeof filteredOrdenes)[number]) => o.incoterm;
      default:
        return null;
    }
  }, [agrupacion]);

  const gruposOrdenes = useMemo(
    () => agruparFilas(filteredOrdenes, claveDeAgrupacion),
    [filteredOrdenes, claveDeAgrupacion],
  );

  const resetForm = () => {
    setForm({ numeroOrden: "", incoterm: "FOB", proveedorExtranjero: "", paisOrigen: "", moneda: "USD", trmPactada: 4000, observaciones: "" });
    setItems([{ ...itemVacio }]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numeroOrden || !form.proveedorExtranjero || !form.paisOrigen) return;
    if (items.some((it) => !it.descripcion || Number(it.cantidad) <= 0 || Number(it.valorUnitarioFob) <= 0)) {
      toast.error("Cada ítem necesita descripción, cantidad y valor unitario FOB mayores a cero.");
      return;
    }

    setGuardando(true);
    try {
      await addOrden({ ...form, items });
      toast.success(`Orden ${form.numeroOrden} registrada.`);
      setModalOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Error al registrar la orden de compra internacional.");
    } finally {
      setGuardando(false);
    }
  };

  const handleAnular = async () => {
    if (!ordenAAnular) return;
    setAnulando(true);
    try {
      await anularOrden(ordenAAnular.id);
      toast.success(`Orden ${ordenAAnular.numeroOrden} anulada.`);
      setOrdenAAnular(null);
    } catch (err: any) {
      toast.error(err.message || "No fue posible anular la orden.");
    } finally {
      setAnulando(false);
    }
  };

  return (
    <AppShell
      title="Importaciones y Exportaciones"
      description="Órdenes de compra internacional, trazabilidad de lotes por BL/AWB y costeo landed bajo NIC 2/21."
      actions={
        puedeCrear && (
          <Button onClick={() => setModalOpen(true)} size="sm" className="gap-2 bg-blue-800 text-white hover:bg-blue-900 font-bold">
            <Plus className="h-4 w-4" /> Nueva Orden de Compra Internacional
          </Button>
        )
      }
    >
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 lg:flex lg:items-center lg:justify-between bg-slate-50/80">
          <div className="flex flex-wrap gap-2">
            {estadosFilter.map((e) => (
              <button
                key={e}
                onClick={() => setEstadoSel(e)}
                className={`rounded-md border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  estadoSel === e
                    ? "border-blue-700 bg-blue-800 text-white shadow-2xs"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <SelectorAgrupacion
              value={agrupacion}
              onChange={setAgrupacion}
              opciones={[
                OPCION_SIN_AGRUPAR,
                { value: "estado", label: "Estado" },
                { value: "pais", label: "País de origen" },
                { value: "incoterm", label: "Incoterm" },
              ]}
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por orden, proveedor o país..."
              className="h-9 w-full max-w-xs bg-white text-xs border-slate-300 shadow-2xs"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-4 py-3.5">Orden</th>
                <th className="px-4 py-3.5">Proveedor / País</th>
                <th className="px-4 py-3.5">Incoterm</th>
                <th className="px-4 py-3.5 text-right">FOB estimado</th>
                <th className="px-4 py-3.5">Estado orden</th>
                <th className="px-4 py-3.5">Estado mercancía</th>
                <th className="px-4 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {gruposOrdenes.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && (
                    <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={7} />
                  )}
                  {grupo.filas.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-xs">
                    <Link to="/importaciones/$id" params={{ id: o.id }} className="text-blue-800 hover:underline">
                      {o.numeroOrden}
                    </Link>
                    <p className="text-[10px] text-slate-400 font-normal">{o.lotes.length} lote(s)</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900 truncate max-w-[220px]">{o.proveedorExtranjero}</p>
                    <p className="text-[10px] text-slate-500">{o.paisOrigen}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-800">
                      {o.incoterm}
                    </span>
                  </td>
                  <td className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">
                    {money(o.valorEstimadoTotal, "COP")}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={o.estado} />
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={estadoResumenLotes(o)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Link to="/importaciones/$id" params={{ id: o.id }}>
                        <Button size="xs" variant="outline" className="h-7 text-[11px] font-bold border-blue-300 text-blue-800 hover:bg-blue-50">
                          Ver detalle
                        </Button>
                      </Link>
                      {puedeEliminar && o.estado !== "Anulada" && (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setOrdenAAnular({ id: o.id, numeroOrden: o.numeroOrden })}
                          className="h-7 text-[11px] font-bold text-red-700 hover:bg-red-50 hover:text-red-800"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
              {filteredOrdenes.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-xs text-slate-500">
                    {loading
                      ? "Cargando órdenes de compra internacionales..."
                      : error || 'No hay órdenes registradas para el filtro seleccionado. Haz clic en "Nueva Orden de Compra Internacional".'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL NUEVA ORDEN */}
      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-2xl bg-white border-slate-200 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
              <Ship className="h-4 w-4" /> Nueva Orden de Compra Internacional
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Registra el acuerdo comercial con el proveedor extranjero. El landed cost definitivo se calcula al liquidar cada lote.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Número de Orden *</Label>
                <Input
                  required
                  placeholder="Ej: OCI-2026-001"
                  value={form.numeroOrden}
                  onChange={(e) => setForm({ ...form, numeroOrden: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Incoterm *</Label>
                <Select value={form.incoterm} onValueChange={(val) => setForm({ ...form, incoterm: val })}>
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {INCOTERMS.map((i) => (
                      <SelectItem key={i} value={i} className="text-xs">{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Proveedor Extranjero *</Label>
                <Input
                  required
                  value={form.proveedorExtranjero}
                  onChange={(e) => setForm({ ...form, proveedorExtranjero: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">País de Origen *</Label>
                <Input
                  required
                  value={form.paisOrigen}
                  onChange={(e) => setForm({ ...form, paisOrigen: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Moneda *</Label>
                <Select value={form.moneda} onValueChange={(val) => setForm({ ...form, moneda: val })}>
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {MONEDAS.map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">TRM Pactada (COP) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={form.trmPactada}
                  onChange={(e) => setForm({ ...form, trmPactada: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">Ítems de la Orden *</Label>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setItems([...items, { ...itemVacio }])}
                  className="h-7 text-[11px] font-bold"
                >
                  <Plus className="h-3 w-3 mr-1" /> Agregar ítem
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-bold">
                    <tr>
                      <th className="px-2 py-2">Descripción</th>
                      <th className="px-2 py-2 w-24">Cantidad</th>
                      <th className="px-2 py-2 w-28">Valor FOB unit.</th>
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1.5">
                          <Input
                            required
                            value={item.descripcion}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], descripcion: e.target.value };
                              setItems(next);
                            }}
                            className="h-8 text-[11px] border-slate-300"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            required
                            value={item.cantidad}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], cantidad: Number(e.target.value) };
                              setItems(next);
                            }}
                            className="h-8 text-[11px] border-slate-300"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            required
                            value={item.valorUnitarioFob}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], valorUnitarioFob: Number(e.target.value) };
                              setItems(next);
                            }}
                            className="h-8 text-[11px] border-slate-300"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setItems(items.filter((_, i) => i !== idx))}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500">
                FOB total: <strong>{money(fobTotal, form.moneda)}</strong> · Estimado en COP (FOB × TRM, sin arancel/flete aún): <strong>{money(estimadoCop, "COP")}</strong>
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Observaciones</Label>
              <Textarea
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                className="text-xs border-slate-300"
                rows={2}
              />
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="bg-blue-800 text-white hover:bg-blue-900 font-bold" disabled={guardando}>
                {guardando ? "Guardando..." : "Registrar Orden"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!ordenAAnular} onOpenChange={(open) => !open && setOrdenAAnular(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular la orden {ordenAAnular?.numeroOrden}?</AlertDialogTitle>
            <AlertDialogDescription>
              La orden dejará de aparecer en el listado activo, pero queda registrada en el historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={anulando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleAnular} disabled={anulando}>
              {anulando ? "Anulando..." : "Anular"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
