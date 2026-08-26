import { createFileRoute, Link } from "@tanstack/react-router";
import { FileSignature, Plus, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { BarraVencimiento } from "@/components/ui/barra-vencimiento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilaGrupo, OPCION_SIN_AGRUPAR, SelectorAgrupacion } from "@/components/ui/selector-agrupacion";
import { agruparFilas } from "@/lib/agrupar";
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
import { useTenant } from "@/lib/tenant-context";
import { useContratos } from "@/hooks/use-contratos";
import { useProveedores } from "@/hooks/use-proveedores";
import { useDepartamentosPublico } from "@/hooks/use-departamentos-publico";
import { useUsuariosPorDepartamento } from "@/hooks/use-usuarios-por-departamento";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
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
  const { contratos, loading, error, addContrato, eliminarContrato } = useContratos();
  const { proveedores } = useProveedores();
  const proveedoresActivos = proveedores.filter((p) => p.activo);
  const { departamentos } = useDepartamentosPublico();
  const { user } = useSession();
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.CONTRATOS_ELIMINAR);
  const [modalOpen, setModalOpen] = useState(false);
  const [contratoAEliminar, setContratoAEliminar] = useState<{ id: string; proveedor: string } | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);

  const handleEliminarContrato = async () => {
    if (!contratoAEliminar) return;
    setEliminando(true);
    try {
      await eliminarContrato(contratoAEliminar.id);
      toast.success(`Contrato con "${contratoAEliminar.proveedor}" eliminado.`);
      setContratoAEliminar(null);
    } catch (err: any) {
      toast.error(err.message || "No fue posible eliminar el contrato.");
    } finally {
      setEliminando(false);
    }
  };

  const [form, setForm] = useState({
    empresaId: empresaActiva === "ALL" ? "RC" : empresaActiva,
    proveedorId: "",
    responsableId: "",
    area: "Compras",
    valorContratado: 10000000,
    fechaInicio: new Date().toISOString().split("T")[0],
    fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });

  const areaDepartamentoId = departamentos.find((d) => d.nombre === form.area)?.id;
  const { usuarios: usuariosArea, loading: cargandoUsuariosArea } =
    useUsuariosPorDepartamento(areaDepartamentoId);

  const filteredContratos = useMemo(() => {
    if (empresaActiva === "ALL") return contratos;
    return contratos.filter((c) => c.empresaId === empresaActiva);
  }, [contratos, empresaActiva]);

  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "area":
        return (c: (typeof filteredContratos)[number]) => c.area;
      case "proveedor":
        return (c: (typeof filteredContratos)[number]) => c.proveedor;
      case "estado":
        return (c: (typeof filteredContratos)[number]) => c.estado;
      default:
        return null;
    }
  }, [agrupacion]);

  const gruposContratos = useMemo(
    () => agruparFilas(filteredContratos, claveDeAgrupacion),
    [filteredContratos, claveDeAgrupacion],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.proveedorId || !form.responsableId) return;
    try {
      await addContrato(form);
    } catch (err: any) {
      toast.error(err.message || "Error al registrar el contrato.");
      return;
    }
    setModalOpen(false);
    setForm({
      empresaId: empresaActiva === "ALL" ? "RC" : empresaActiva,
      proveedorId: "",
      responsableId: "",
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
        <Button size="sm" className="gap-2 bg-blue-800 text-white hover:bg-blue-900 font-bold" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo Contrato
        </Button>
      }
    >
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="flex justify-end border-b border-slate-200 bg-slate-50/80 p-3">
          <SelectorAgrupacion
            value={agrupacion}
            onChange={setAgrupacion}
            opciones={[
              OPCION_SIN_AGRUPAR,
              { value: "area", label: "Área" },
              { value: "proveedor", label: "Proveedor" },
              { value: "estado", label: "Estado" },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-4 py-3.5">Proveedor</th>
                <th className="px-4 py-3.5">Empresa</th>
                <th className="px-4 py-3.5">Responsable</th>
                <th className="px-4 py-3.5">Área</th>
                <th className="px-4 py-3.5 text-right">Valor</th>
                <th className="px-4 py-3.5">Vigencia</th>
                <th className="px-4 py-3.5">Estado</th>
                <th className="px-4 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {gruposContratos.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && (
                    <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={8} />
                  )}
                  {grupo.filas.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-xs text-slate-900">{c.proveedor}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-800">
                      {c.empresaId}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 font-semibold">{c.responsable}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 font-semibold">{c.area}</td>
                  <td className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">{money(c.valorContratado)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <p className="font-mono">
                      {new Date(c.fechaInicio).toLocaleDateString("es-CO")} –{" "}
                      {new Date(c.fechaFin).toLocaleDateString("es-CO")}
                    </p>
                    {c.estado === "Activo" && (
                      <BarraVencimiento fecha={c.fechaFin} etiquetaVencido="Venció" ventanaDias={60} className="mt-1" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={c.estado} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {puedeEliminar && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setContratoAEliminar({ id: c.id, proveedor: c.proveedor })}
                        className="h-7 text-[11px] font-bold text-red-700 hover:bg-red-50 hover:text-red-800"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
              {filteredContratos.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-xs text-slate-500">
                    <FileSignature className="mx-auto h-8 w-8 text-slate-400 opacity-30 mb-2" />
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
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Nuevo Contrato de Proveedor</DialogTitle>
            <DialogDescription className="text-slate-500">Registro de vigencia, responsable y valor contractual.</DialogDescription>
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
                <Select
                  value={form.proveedorId}
                  onValueChange={(val) => setForm({ ...form, proveedorId: val })}
                  disabled={proveedoresActivos.length === 0}
                >
                  <SelectTrigger id="proveedor" className="h-9 text-xs">
                    <SelectValue
                      placeholder={proveedoresActivos.length === 0 ? "Sin proveedores registrados" : "Selecciona un proveedor"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {proveedoresActivos.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {proveedoresActivos.length === 0 && (
              <p className="-mt-2 text-[11px] text-amber-600">
                No hay proveedores registrados.{" "}
                <Link to="/configuracion/proveedores" className="font-semibold underline">
                  Créalos en Configuración
                </Link>{" "}
                antes de registrar un contrato.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="area" className="text-xs font-semibold">
                  Área
                </Label>
                <Select
                  value={form.area}
                  onValueChange={(val) => setForm({ ...form, area: val, responsableId: "" })}
                >
                  <SelectTrigger id="area" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {departamentos.map((d) => (
                      <SelectItem key={d.id} value={d.nombre} className="text-xs">
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="responsable" className="text-xs font-semibold">
                  Responsable *
                </Label>
                <Select
                  value={form.responsableId}
                  onValueChange={(val) => setForm({ ...form, responsableId: val })}
                  disabled={!areaDepartamentoId || cargandoUsuariosArea || usuariosArea.length === 0}
                >
                  <SelectTrigger id="responsable" className="h-9 text-xs">
                    <SelectValue
                      placeholder={
                        cargandoUsuariosArea
                          ? "Cargando usuarios..."
                          : usuariosArea.length === 0
                            ? "Sin usuarios en esta área"
                            : "Selecciona un responsable"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {usuariosArea.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {u.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {areaDepartamentoId && !cargandoUsuariosArea && usuariosArea.length === 0 && (
              <p className="-mt-2 text-[11px] text-amber-600">
                No hay usuarios asignados a "{form.area}". Asígnalos en Configuración &gt; Usuarios.
              </p>
            )}

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
              <Button type="submit" size="sm" className="bg-blue-800 text-white hover:bg-blue-900 font-bold">
                Registrar Contrato
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!contratoAEliminar} onOpenChange={(open) => !open && setContratoAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el contrato con "{contratoAEliminar?.proveedor}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. El contrato dejará de aparecer en el listado, pero queda
              registrado en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleEliminarContrato}
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
