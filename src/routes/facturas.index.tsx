import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, DollarSign, Plus, Upload, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useTenant } from "@/lib/tenant-context";
import { useFacturas } from "@/hooks/use-facturas";
import { money, EstadoFactura, Prioridad } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/facturas/")({
  head: () => ({
    meta: [
      { title: "Recepción de Facturas | RicoSoft" },
      {
        name: "description",
        content: "Flujo de recepción y aprobación de facturas por estado y empresa.",
      },
    ],
  }),
  component: FacturasPage,
});

const estadosFilter: (EstadoFactura | "Todas")[] = [
  "Todas",
  "Pendiente",
  "Aprobada",
  "Pagada",
  "Rechazada",
];

function FacturasPage() {
  const { empresaActiva, empresas } = useTenant();
  const { facturas, loading, error, addFactura, updateEstadoFactura } = useFacturas();

  const [estadoSel, setEstadoSel] = useState<(typeof estadosFilter)[number]>("Todas");
  const [q, setQ] = useState("");

  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    empresaId: empresaActiva === "ALL" ? "001" : empresaActiva,
    numero: "",
    proveedor: "",
    nit: "",
    area: "Produccion",
    responsable: "",
    vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    subtotal: 1000000,
    iva: 190000,
    prioridad: "Media" as Prioridad,
    origen: "Carga manual" as const,
  });

  const filteredFacturas = useMemo(() => {
    return facturas.filter((f) => {
      const matchEmpresa = empresaActiva === "ALL" || f.empresaId === empresaActiva;
      const matchEstado = estadoSel === "Todas" || f.estado === estadoSel;
      const term = q.trim().toLowerCase();
      const matchQ =
        !term ||
        [f.numero, f.proveedor, f.nit, f.responsable, f.area].some((v) =>
          v.toLowerCase().includes(term),
        );
      return matchEmpresa && matchEstado && matchQ;
    });
  }, [facturas, empresaActiva, estadoSel, q]);

  const handleSaveFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero || !form.proveedor) return;

    try {
      await addFactura({
        empresaId: form.empresaId,
        numero: form.numero,
        proveedor: form.proveedor,
        nit: form.nit || "900.000.000-0",
        area: form.area,
        responsable: form.responsable || "Director Financiero",
        vence: form.vence,
        subtotal: Number(form.subtotal),
        iva: Number(form.iva),
        moneda: "COP",
        prioridad: form.prioridad,
        origen: form.origen,
      });
    } catch (err: any) {
      alert(err.message || "Error al registrar la factura.");
      return;
    }

    setModalOpen(false);
    setForm({
      empresaId: empresaActiva === "ALL" ? "001" : empresaActiva,
      numero: "",
      proveedor: "",
      nit: "",
      area: "Produccion",
      responsable: "",
      vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      subtotal: 1000000,
      iva: 190000,
      prioridad: "Media",
      origen: "Carga manual",
    });
  };

  return (
    <AppShell
      title="Recepción de Facturas por Estado"
      description="Control del flujo documental y financiero de facturas por estado (Pendiente, Aprobada, Pagada, Rechazada)."
      actions={
        <Button
          onClick={() => setModalOpen(true)}
          size="sm"
          className="gap-2 bg-blue-800 text-white hover:bg-blue-900 font-bold"
        >
          <Upload className="h-4 w-4" /> Recepcionar Factura
        </Button>
      }
    >
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 lg:flex lg:items-center lg:justify-between bg-slate-50/80">
          <div className="flex flex-wrap gap-2">
            {estadosFilter.map((e) => (
              <button
                key={e}
                onClick={() => setEstadoSel(e)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                  estadoSel === e
                    ? "border-blue-700 bg-blue-800 text-white shadow-2xs"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por número, proveedor, NIT..."
            className="h-9 w-full max-w-xs bg-white text-xs border-slate-300 shadow-2xs"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-4 py-3.5">Factura</th>
                <th className="px-4 py-3.5">Empresa</th>
                <th className="px-4 py-3.5">Proveedor / NIT</th>
                <th className="px-4 py-3.5">Área</th>
                <th className="px-4 py-3.5">Vencimiento</th>
                <th className="px-4 py-3.5 text-right">Total</th>
                <th className="px-4 py-3.5">Prioridad</th>
                <th className="px-4 py-3.5">Estado</th>
                <th className="px-4 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {filteredFacturas.map((f) => (
                <tr key={f.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-xs">
                    <Link
                      to="/facturas/$id"
                      params={{ id: f.id }}
                      className="text-blue-800 hover:underline"
                    >
                      {f.numero}
                    </Link>
                    <p className="text-[10px] text-slate-400 font-normal">{f.origen}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-800">
                      {f.empresaId}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900 truncate max-w-[200px]">{f.proveedor}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{f.nit}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 font-semibold">{f.area}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{f.vence}</td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-slate-900 text-xs">
                    {money(f.total, f.moneda)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{f.prioridad}</td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={f.estado} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {f.estado === "Pendiente" && (
                        <>
                          <Button
                            size="xs"
                            variant="success"
                            onClick={() =>
                              updateEstadoFactura(f.id, "Aprobada").catch((err: any) =>
                                alert(err.message || "Error al aprobar la factura."),
                              )
                            }
                            className="h-7 text-[11px] font-bold"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
                          </Button>
                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={() =>
                              updateEstadoFactura(f.id, "Rechazada").catch((err: any) =>
                                alert(err.message || "Error al rechazar la factura."),
                              )
                            }
                            className="h-7 text-[11px] font-bold"
                          >
                            <XCircle className="h-3 w-3 mr-1" /> Rechazar
                          </Button>
                        </>
                      )}
                      {f.estado === "Aprobada" && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            updateEstadoFactura(f.id, "Pagada").catch((err: any) =>
                              alert(err.message || "Error al registrar el pago."),
                            )
                          }
                          className="h-7 text-[11px] font-bold border-blue-300 text-blue-800 hover:bg-blue-50"
                        >
                          <DollarSign className="h-3 w-3 mr-1" /> Marcar Pagada
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredFacturas.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-xs text-slate-500">
                    {loading
                      ? "Cargando facturas..."
                      : error || 'No hay facturas registradas para el filtro seleccionado. Haz clic en "Recepcionar Factura".'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL REGISTRAR FACTURA */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Recepción de Nueva Factura
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Ingreso de factura a flujo de aprobación.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveFactura} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="empresaId" className="text-xs font-semibold text-slate-700">
                  Empresa Receptora *
                </Label>
                <Select
                  value={form.empresaId}
                  onValueChange={(val) => setForm({ ...form, empresaId: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id} className="text-xs">
                        {e.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="numero" className="text-xs font-semibold text-slate-700">
                  Número de Factura *
                </Label>
                <Input
                  required
                  id="numero"
                  placeholder="Ej: FE-10492"
                  value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="proveedor" className="text-xs font-semibold text-slate-700">
                  Proveedor *
                </Label>
                <Input
                  required
                  id="proveedor"
                  placeholder="Ej: Suministros Andinos S.A.S."
                  value={form.proveedor}
                  onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nit" className="text-xs font-semibold text-slate-700">
                  NIT Proveedor
                </Label>
                <Input
                  id="nit"
                  placeholder="900.123.456-1"
                  value={form.nit}
                  onChange={(e) => setForm({ ...form, nit: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="subtotal" className="text-xs font-semibold text-slate-700">
                  Subtotal (COP)
                </Label>
                <Input
                  type="number"
                  id="subtotal"
                  value={form.subtotal}
                  onChange={(e) => setForm({ ...form, subtotal: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="iva" className="text-xs font-semibold text-slate-700">
                  IVA (COP)
                </Label>
                <Input
                  type="number"
                  id="iva"
                  value={form.iva}
                  onChange={(e) => setForm({ ...form, iva: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="area" className="text-xs font-semibold text-slate-700">
                  Área Asignada
                </Label>
                <Select value={form.area} onValueChange={(val) => setForm({ ...form, area: val })}>
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
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
              <div className="space-y-1">
                <Label htmlFor="vence" className="text-xs font-semibold text-slate-700">
                  Fecha de Vencimiento
                </Label>
                <Input
                  type="date"
                  id="vence"
                  value={form.vence}
                  onChange={(e) => setForm({ ...form, vence: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-blue-800 text-white hover:bg-blue-900 font-bold"
              >
                Registrar Factura
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
