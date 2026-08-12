import { createFileRoute } from "@tanstack/react-router";
import { FileSignature, Plus } from "lucide-react";
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
import { useContratos } from "@/hooks/use-contratos";
import { money } from "@/lib/data";

export const Route = createFileRoute("/contratos")({
  head: () => ({
    meta: [
      { title: "Contratos de Proveedores | RicoSoft" },
      { name: "description", content: "Administración de contratos de proveedores y centros de costos por empresa." },
    ],
  }),
  component: Contratos,
});

function Contratos() {
  const { empresaActiva, empresas } = useTenant();
  const { contratos, loading, error, addContrato } = useContratos();
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    empresaId: empresaActiva === "ALL" ? "001" : empresaActiva,
    proveedor: "",
    responsable: "",
    area: "Compras",
    valorContratado: 10000000,
    fechaInicio: new Date().toISOString().split("T")[0],
    fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });

  const filteredContratos = useMemo(() => {
    if (empresaActiva === "ALL") return contratos;
    return contratos.filter((c) => c.empresaId === empresaActiva);
  }, [contratos, empresaActiva]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.proveedor || !form.responsable) return;
    try {
      await addContrato(form);
    } catch (err: any) {
      alert(err.message || "Error al registrar el contrato.");
      return;
    }
    setModalOpen(false);
    setForm({
      empresaId: empresaActiva === "ALL" ? "001" : empresaActiva,
      proveedor: "",
      responsable: "",
      area: "Compras",
      valorContratado: 10000000,
      fechaInicio: new Date().toISOString().split("T")[0],
      fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    });
  };

  return (
    <AppShell
      title="Contratos de Proveedores"
      description="Supervisión de vigencias, centros de costo y montos contractuales por empresa."
      actions={
        <Button size="sm" className="gap-2" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo Contrato
        </Button>
      }
    >
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Proveedor</th>
                <th className="px-5 py-3 font-medium">Empresa</th>
                <th className="px-5 py-3 font-medium">Responsable</th>
                <th className="px-5 py-3 font-medium">Área</th>
                <th className="px-5 py-3 text-right font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Vigencia</th>
                <th className="px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredContratos.map((c) => (
                <tr key={c.id} className="border-t border-border transition-colors hover:bg-muted/40">
                  <td className="px-5 py-3 font-semibold">{c.proveedor}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                      {c.empresaId}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{c.responsable}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.area}</td>
                  <td className="num px-5 py-3 text-right font-semibold">{money(c.valorContratado)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {new Date(c.fechaInicio).toLocaleDateString("es-CO")} –{" "}
                    {new Date(c.fechaFin).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-5 py-3">
                    <EstadoBadge estado={c.estado} />
                  </td>
                </tr>
              ))}
              {filteredContratos.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-sm text-muted-foreground">
                    <FileSignature className="mx-auto h-10 w-10 text-primary opacity-50 mb-3" />
                    {loading
                      ? "Cargando contratos..."
                      : error || 'No hay contratos registrados. Haz clic en "Nuevo Contrato".'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Contrato de Proveedor</DialogTitle>
            <DialogDescription>Registro de vigencia, responsable y valor contractual.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="empresaId" className="text-xs font-semibold">
                  Empresa
                </Label>
                <Select value={form.empresaId} onValueChange={(val) => setForm({ ...form, empresaId: val })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id} className="text-xs">
                        {e.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="proveedor" className="text-xs font-semibold">
                  Proveedor *
                </Label>
                <Input
                  required
                  id="proveedor"
                  value={form.proveedor}
                  onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="responsable" className="text-xs font-semibold">
                  Responsable *
                </Label>
                <Input
                  required
                  id="responsable"
                  value={form.responsable}
                  onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="area" className="text-xs font-semibold">
                  Área
                </Label>
                <Input
                  id="area"
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="valorContratado" className="text-xs font-semibold">
                Valor Contratado (COP)
              </Label>
              <Input
                type="number"
                id="valorContratado"
                value={form.valorContratado}
                onChange={(e) => setForm({ ...form, valorContratado: Number(e.target.value) })}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fechaInicio" className="text-xs font-semibold">
                  Fecha Inicio
                </Label>
                <Input
                  type="date"
                  id="fechaInicio"
                  value={form.fechaInicio}
                  onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fechaFin" className="text-xs font-semibold">
                  Fecha Fin
                </Label>
                <Input
                  type="date"
                  id="fechaFin"
                  value={form.fechaFin}
                  onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Registrar Contrato
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
