import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Plus, Power } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTenant } from "@/lib/tenant-context";
import { useServicios } from "@/hooks/use-servicios";
import { money, AreaEmpresa, PeriodicidadServicio } from "@/lib/data";

export const Route = createFileRoute("/servicios")({
  head: () => ({
    meta: [
      { title: "Servicios y Suscripciones | RicoSoft" },
      { name: "description", content: "Inventario y control de suscripciones y servicios activos categorizados por área y empresa." },
    ],
  }),
  component: ServiciosPage,
});

function ServiciosPage() {
  const { empresaActiva, empresas } = useTenant();
  const { suscripciones, loading, error, addSuscripcion, toggleEstadoSuscripcion } = useServicios();

  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    empresaId: empresaActiva === "ALL" ? "001" : empresaActiva,
    area: "Sistemas" as AreaEmpresa,
    nombreServicio: "",
    proveedor: "",
    periodicidad: "Mensual" as PeriodicidadServicio,
    costo: 350000,
    moneda: "COP" as const,
    fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    responsableArea: "",
  });

  const filteredSuscripciones = useMemo(() => {
    if (empresaActiva === "ALL") return suscripciones;
    return suscripciones.filter((s) => s.empresaId === empresaActiva);
  }, [suscripciones, empresaActiva]);

  // Total recurrente acumulado por empresa
  const costoMensualTotal = useMemo(() => {
    return filteredSuscripciones
      .filter((s) => s.estado === "Activo")
      .reduce((acc, curr) => {
        let val = curr.costo;
        if (curr.periodicidad === "Anual") val = val / 12;
        return acc + val;
      }, 0);
  }, [filteredSuscripciones]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombreServicio || !form.proveedor) return;
    try {
      await addSuscripcion({
        empresaId: form.empresaId,
        area: form.area,
        nombreServicio: form.nombreServicio,
        proveedor: form.proveedor,
        periodicidad: form.periodicidad,
        costo: Number(form.costo),
        moneda: form.moneda,
        fechaRenovacion: form.fechaRenovacion,
        responsableArea: form.responsableArea || "Líder de Área",
      });
    } catch (err: any) {
      alert(err.message || "Error al registrar el servicio.");
      return;
    }
    setModalOpen(false);
    setForm({
      empresaId: empresaActiva === "ALL" ? "001" : empresaActiva,
      area: "Sistemas",
      nombreServicio: "",
      proveedor: "",
      periodicidad: "Mensual",
      costo: 350000,
      moneda: "COP",
      fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      responsableArea: "",
    });
  };

  return (
    <AppShell
      title="Servicios y Suscripciones Activas"
      description="Inventario de licencias SaaS, infraestructura y servicios recurrentes categorizados por área."
      actions={
        <Button onClick={() => setModalOpen(true)} size="sm" className="gap-2 bg-blue-800 text-white hover:bg-blue-900 font-bold">
          <Plus className="h-4 w-4" /> Registrar Servicio / Suscripción
        </Button>
      }
    >
      {/* KPI Resumen */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Servicios Activos</p>
          <p className="text-2xl font-bold mt-1 text-blue-900">
            {filteredSuscripciones.filter((s) => s.estado === "Activo").length} / {filteredSuscripciones.length}
          </p>
        </div>
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Costo Mensual Recurrente Estimado</p>
          <p className="text-2xl font-bold mt-1 text-slate-900 font-mono">
            {money(costoMensualTotal)}
          </p>
        </div>
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Empresa Activa</p>
          <p className="text-sm font-bold text-slate-900 mt-2">
            {empresaActiva === "ALL" ? "Todas las empresas (Consolidado)" : empresaActiva}
          </p>
        </div>
      </div>

      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/80">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Inventario de Servicios Recurrentes</h3>
            <p className="text-xs text-slate-500 font-medium">Software, licencias, conectividad y servicios públicos activos por área.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-4 py-3.5">Servicio / Licencia</th>
                <th className="px-4 py-3.5">Empresa</th>
                <th className="px-4 py-3.5">Área Categorizada</th>
                <th className="px-4 py-3.5">Proveedor</th>
                <th className="px-4 py-3.5">Periodicidad</th>
                <th className="px-4 py-3.5 text-right">Costo</th>
                <th className="px-4 py-3.5">Próxima Renovación</th>
                <th className="px-4 py-3.5">Estado</th>
                <th className="px-4 py-3.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {filteredSuscripciones.map((sub) => (
                <tr key={sub.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-xs text-slate-900">
                    <p>{sub.nombreServicio}</p>
                    <p className="text-[10px] text-slate-400 font-normal">Resp: {sub.responsableArea}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-800">{sub.empresaId}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">{sub.area}</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-800">{sub.proveedor}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-medium">{sub.periodicidad}</td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-slate-900 text-xs">
                    {money(sub.costo, sub.moneda)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{sub.fechaRenovacion}</td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={sub.estado} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        toggleEstadoSuscripcion(sub.id).catch((err: any) =>
                          alert(err.message || "Error al cambiar el estado."),
                        )
                      }
                      className="h-7 text-[11px] gap-1 font-semibold border-slate-300 hover:bg-slate-100"
                    >
                      <Power className="h-3 w-3 text-slate-500" /> {sub.estado === "Activo" ? "Desactivar" : "Activar"}
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredSuscripciones.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-xs text-slate-500">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30 text-slate-400" />
                    {loading
                      ? "Cargando servicios..."
                      : error || 'No hay servicios o suscripciones registradas en esta empresa. Haz clic en "Registrar Servicio / Suscripción".'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL REGISTRAR SUSCRIPCION */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Registrar Servicio o Suscripción Activa</DialogTitle>
            <DialogDescription className="text-slate-500">Control de costos recurrentes y licencias por área.</DialogDescription>
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
                <Label htmlFor="area" className="text-xs font-semibold text-slate-700">Área Categorizada *</Label>
                <Select value={form.area} onValueChange={(val: any) => setForm({ ...form, area: val })}>
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
                <Label htmlFor="nombreServicio" className="text-xs font-semibold text-slate-700">Nombre del Servicio / SaaS *</Label>
                <Input
                  required
                  id="nombreServicio"
                  placeholder="Ej: Licencias Microsoft 365"
                  value={form.nombreServicio}
                  onChange={(e) => setForm({ ...form, nombreServicio: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="proveedor" className="text-xs font-semibold text-slate-700">Proveedor *</Label>
                <Input
                  required
                  id="proveedor"
                  placeholder="Ej: TechCloud Colombia S.A.S."
                  value={form.proveedor}
                  onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="costo" className="text-xs font-semibold text-slate-700">Costo (Monto)</Label>
                <Input
                  type="number"
                  id="costo"
                  value={form.costo}
                  onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="moneda" className="text-xs font-semibold text-slate-700">Moneda</Label>
                <Select value={form.moneda} onValueChange={(val: any) => setForm({ ...form, moneda: val })}>
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="COP">COP ($)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="periodicidad" className="text-xs font-semibold text-slate-700">Periodicidad</Label>
                <Select value={form.periodicidad} onValueChange={(val: any) => setForm({ ...form, periodicidad: val })}>
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="Mensual">Mensual</SelectItem>
                    <SelectItem value="Anual">Anual</SelectItem>
                    <SelectItem value="Trimestral">Trimestral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fechaRenovacion" className="text-xs font-semibold text-slate-700">Próxima Fecha de Pago</Label>
                <Input
                  type="date"
                  id="fechaRenovacion"
                  value={form.fechaRenovacion}
                  onChange={(e) => setForm({ ...form, fechaRenovacion: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="responsable" className="text-xs font-semibold text-slate-700">Responsable del Área</Label>
                <Input
                  id="responsable"
                  placeholder="Líder de Sistemas"
                  value={form.responsableArea}
                  onChange={(e) => setForm({ ...form, responsableArea: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" size="sm" className="bg-blue-800 text-white hover:bg-blue-900 font-bold">Guardar Servicio</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
