import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, History, Plus, ShoppingBag, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTenant } from "@/lib/tenant-context";
import { useSolicitudes } from "@/hooks/use-solicitudes";
import { money, Prioridad, AreaEmpresa } from "@/lib/data";

export const Route = createFileRoute("/solicitudes-compra")({
  head: () => ({
    meta: [
      { title: "Solicitudes de Compra | RicoSoft" },
      { name: "description", content: "Requerimientos y solicitudes internas de compra por área y empresa." },
    ],
  }),
  component: SolicitudesCompraPage,
});

function SolicitudesCompraPage() {
  const { empresaActiva, empresas } = useTenant();
  const { solicitudesCompra, loading, error, addSolicitudCompra, updateEstadoSolicitudCompra } = useSolicitudes();

  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    empresaId: empresaActiva === "ALL" ? "001" : empresaActiva,
    area: "Sistemas" as AreaEmpresa,
    solicitante: "",
    item: "",
    descripcion: "",
    cantidad: 1,
    valorEstimado: 500000,
    prioridad: "Media" as Prioridad,
  });

  const filteredSolicitudes = useMemo(() => {
    if (empresaActiva === "ALL") return solicitudesCompra;
    return solicitudesCompra.filter((s) => s.empresaId === empresaActiva);
  }, [solicitudesCompra, empresaActiva]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item || !form.solicitante) return;
    try {
      await addSolicitudCompra({
        empresaId: form.empresaId,
        area: form.area,
        solicitante: form.solicitante,
        item: form.item,
        descripcion: form.descripcion,
        cantidad: Number(form.cantidad),
        valorEstimado: Number(form.valorEstimado),
        prioridad: form.prioridad,
      });
    } catch (err: any) {
      alert(err.message || "Error al registrar la solicitud.");
      return;
    }
    setModalOpen(false);
    setForm({
      empresaId: empresaActiva === "ALL" ? "001" : empresaActiva,
      area: "Sistemas",
      solicitante: "",
      item: "",
      descripcion: "",
      cantidad: 1,
      valorEstimado: 500000,
      prioridad: "Media",
    });
  };

  return (
    <AppShell
      title="Solicitudes de Compra Internas"
      description="Solicitudes activas pendientes de gestión. Al aprobar o rechazar, la solicitud pasa a Historia de Compras."
      actions={
        <>
          <Link to="/historia-compras">
            <Button variant="outline" size="sm" className="gap-2">
              <History className="h-4 w-4" /> Ver Historia de Compras
            </Button>
          </Link>
          <Button onClick={() => setModalOpen(true)} size="sm" className="gap-2 bg-blue-800 text-white hover:bg-blue-900 font-bold">
            <Plus className="h-4 w-4" /> Crear Solicitud de Compra
          </Button>
        </>
      }
    >
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/80">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Listado de Solicitudes Internas</h3>
            <p className="text-xs text-slate-500 font-medium">Flujo de aprobación para compras de insumos y servicios.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-4 py-3.5">Fecha</th>
                <th className="px-4 py-3.5">Empresa</th>
                <th className="px-4 py-3.5">Ítem Solicitado</th>
                <th className="px-4 py-3.5">Área / Solicitante</th>
                <th className="px-4 py-3.5 text-center">Cant.</th>
                <th className="px-4 py-3.5 text-right">Valor Estimado</th>
                <th className="px-4 py-3.5">Prioridad</th>
                <th className="px-4 py-3.5">Estado</th>
                <th className="px-4 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {filteredSolicitudes.map((sol) => (
                <tr key={sol.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{sol.fechaSolicitud}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-800">{sol.empresaId}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900 text-xs">{sol.item}</p>
                    <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{sol.descripcion || "-"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{sol.solicitante}</p>
                    <p className="text-[11px] text-slate-500">{sol.area}</p>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-xs text-slate-900">{sol.cantidad}</td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-slate-900 text-xs">{money(sol.valorEstimado)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{sol.prioridad}</td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={sol.estado} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(sol.estado === "Pendiente" || sol.estado === "En Cotización") && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="xs"
                          variant="success"
                          onClick={() =>
                            updateEstadoSolicitudCompra(sol.id, "Aprobada").catch((err: any) =>
                              alert(err.message || "Error al aprobar."),
                            )
                          }
                          className="h-7 text-[11px] font-bold"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
                        </Button>
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={() => {
                            const motivo = window.prompt("Motivo del rechazo (opcional):") ?? undefined;
                            updateEstadoSolicitudCompra(sol.id, "Rechazada", motivo).catch((err: any) =>
                              alert(err.message || "Error al rechazar."),
                            );
                          }}
                          className="h-7 text-[11px] font-bold"
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Rechazar
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredSolicitudes.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-xs text-slate-500">
                    <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-30 text-slate-400" />
                    {loading
                      ? "Cargando solicitudes..."
                      : error || 'No hay solicitudes de compra en esta empresa. Haz clic en "Crear Solicitud de Compra".'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR SOLICITUD DE COMPRA */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Nueva Solicitud de Compra Interna</DialogTitle>
            <DialogDescription className="text-slate-500">Requerimiento de compra por área empresarial.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="empresaId" className="text-xs font-semibold text-slate-700">Empresa</Label>
                <Select value={form.empresaId} onValueChange={(val) => setForm({ ...form, empresaId: val })}>
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id} className="text-xs">{e.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="area" className="text-xs font-semibold text-slate-700">Área Solicitante</Label>
                <Select value={form.area} onValueChange={(val) => setForm({ ...form, area: val as AreaEmpresa })}>
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="Sistemas">Sistemas</SelectItem>
                    <SelectItem value="Comercial">Comercial</SelectItem>
                    <SelectItem value="Produccion">Producción</SelectItem>
                    <SelectItem value="Gestion Humana">Gestión Humana</SelectItem>
                    <SelectItem value="Contabilidad">Contabilidad</SelectItem>
                    <SelectItem value="Mantenimiento">Mantenimiento</SelectItem>
                    <SelectItem value="Compras">Compras</SelectItem>
                    <SelectItem value="Logistica">Logística</SelectItem>
                    <SelectItem value="Gerencia">Gerencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="solicitante" className="text-xs font-semibold text-slate-700">Solicitante (Nombre) *</Label>
                <Input
                  required
                  id="solicitante"
                  placeholder="Ej: Andrés Gómez"
                  value={form.solicitante}
                  onChange={(e) => setForm({ ...form, solicitante: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="item" className="text-xs font-semibold text-slate-700">Ítem / Producto Solicitado *</Label>
                <Input
                  required
                  id="item"
                  placeholder="Ej: Servidor NAS 16TB"
                  value={form.item}
                  onChange={(e) => setForm({ ...form, item: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cantidad" className="text-xs font-semibold text-slate-700">Cantidad</Label>
                <Input
                  type="number"
                  id="cantidad"
                  value={form.cantidad}
                  onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label htmlFor="valorEstimado" className="text-xs font-semibold text-slate-700">Valor Estimado Total (COP)</Label>
                <Input
                  type="number"
                  id="valorEstimado"
                  value={form.valorEstimado}
                  onChange={(e) => setForm({ ...form, valorEstimado: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="descripcion" className="text-xs font-semibold text-slate-700">Justificación de la Compra</Label>
              <Input
                id="descripcion"
                placeholder="Explicación del uso o necesidad corporativa..."
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" size="sm" className="bg-blue-800 text-white hover:bg-blue-900 font-bold">Registrar Solicitud</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
