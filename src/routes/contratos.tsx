import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, FileSignature, Plus, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { BarraVencimiento } from "@/components/ui/barra-vencimiento";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FilaGrupo,
  OPCION_SIN_AGRUPAR,
  SelectorAgrupacion,
} from "@/components/ui/selector-agrupacion";
import { agruparFilas } from "@/lib/agrupar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
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
import { useProveedorBusqueda } from "@/hooks/use-proveedores";
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
      {
        name: "description",
        content: "Administración de contratos de proveedores y centros de costos por empresa.",
      },
    ],
  }),
  component: Contratos,
});

const PAGE_SIZE = 25;

function Contratos() {
  const { empresaActiva, empresas } = useTenant();
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(1);

  const { contratos, total, totalPages, loading, error, addContrato, eliminarContrato } =
    useContratos({
      empresaId: empresaActiva === "ALL" ? undefined : empresaActiva,
      search: searchDebounced || undefined,
      page,
      pageSize: PAGE_SIZE,
    });

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPage(1);
  }, [empresaActiva, searchDebounced]);

  const {
    opciones: proveedorOpciones,
    loading: buscandoProveedores,
    buscar: buscarProveedores,
  } = useProveedorBusqueda();
  const [proveedorSeleccionadoNombre, setProveedorSeleccionadoNombre] = useState<
    string | undefined
  >();
  const { departamentos } = useDepartamentosPublico();
  const { user } = useSession();
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.CONTRATOS_ELIMINAR);
  const [modalOpen, setModalOpen] = useState(false);
  const [contratoAEliminar, setContratoAEliminar] = useState<{
    id: string;
    proveedor: string;
  } | null>(null);
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

  // El filtrado (empresa/búsqueda) ahora ocurre server-side (ver useContratos
  // de arriba). El agrupamiento sigue siendo client-side, sobre la página
  // actual (mismo patrón que Facturas y Configuración > Proveedores).
  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "area":
        return (c: (typeof contratos)[number]) => c.area;
      case "proveedor":
        return (c: (typeof contratos)[number]) => c.proveedor;
      case "estado":
        return (c: (typeof contratos)[number]) => c.estado;
      default:
        return null;
    }
  }, [agrupacion]);

  const gruposContratos = useMemo(
    () => agruparFilas(contratos, claveDeAgrupacion),
    [contratos, claveDeAgrupacion],
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
    setProveedorSeleccionadoNombre(undefined);
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
        <Button size="sm" className="gap-2" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo Contrato
        </Button>
      }
    >
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por proveedor o responsable..."
            className="h-9 w-full max-w-xs bg-white text-xs border-slate-300 shadow-2xs"
          />
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
        <Table>
          <TableHeader className="bg-slate-100/80">
            <TableRow className="hover:bg-slate-100/80">
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Proveedor
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Empresa
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Responsable
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Área
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Valor
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Vigencia
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Estado
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-slate-800 font-medium">
            {gruposContratos.map((grupo) => (
              <Fragment key={grupo.clave || "sin-grupo"}>
                {grupo.clave && (
                  <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={8} />
                )}
                {grupo.filas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-4 py-3 font-bold text-xs text-slate-900">
                      {c.proveedor}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="border-blue-200 bg-blue-50 text-blue-800 font-bold"
                      >
                        {c.empresaId}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-600 font-semibold">
                      {c.responsable}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-600 font-semibold">
                      {c.area}
                    </TableCell>
                    <TableCell className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">
                      {money(c.valorContratado)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-500">
                      <p className="font-mono">
                        {new Date(c.fechaInicio).toLocaleDateString("es-CO")} –{" "}
                        {new Date(c.fechaFin).toLocaleDateString("es-CO")}
                      </p>
                      {c.estado === "Activo" && (
                        <BarraVencimiento
                          fecha={c.fechaFin}
                          etiquetaVencido="Venció"
                          ventanaDias={60}
                          className="mt-1"
                        />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <EstadoBadge estado={c.estado} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {puedeEliminar && (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setContratoAEliminar({ id: c.id, proveedor: c.proveedor })}
                          className="h-7 text-[11px] text-slate-500 hover:text-slate-900"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
            {contratos.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="p-0">
                  {loading ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      Cargando contratos...
                    </div>
                  ) : error ? (
                    <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                  ) : (
                    <EmptyState
                      icon={FileSignature}
                      title="No hay contratos registrados"
                      description='Haz clic en "Nuevo Contrato" para registrar el primero.'
                      action={
                        <Button size="sm" onClick={() => setModalOpen(true)} className="gap-2">
                          <Plus className="h-4 w-4" /> Nuevo Contrato
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-500">
            <p>
              {contratos.length} de {total} contratos — página {page} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="gap-1"
              >
                Siguiente <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Nuevo Contrato de Proveedor
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Registro de vigencia, responsable y valor contractual.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="empresaId" className="text-xs font-semibold">
                  Empresa
                </Label>
                <Select
                  value={form.empresaId}
                  onValueChange={(val) => setForm({ ...form, empresaId: val })}
                >
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
                <Combobox
                  value={form.proveedorId}
                  onValueChange={(val) => {
                    setForm({ ...form, proveedorId: val });
                    const elegido = proveedorOpciones.find((p) => p.id === val);
                    if (elegido) setProveedorSeleccionadoNombre(elegido.nombre);
                  }}
                  placeholder="Escribe para buscar un proveedor..."
                  searchPlaceholder="Buscar por nombre o NIT..."
                  emptyText="Ningún proveedor coincide."
                  clearable={false}
                  onSearchChange={buscarProveedores}
                  loadingOptions={buscandoProveedores}
                  selectedLabel={proveedorSeleccionadoNombre}
                  options={proveedorOpciones.map((p) => ({ value: p.id, label: p.nombre }))}
                />
              </div>
            </div>
            {form.proveedorId === "" && proveedorOpciones.length === 0 && !buscandoProveedores && (
              <p className="-mt-2 text-[11px] font-semibold text-slate-600">
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
                  disabled={
                    !areaDepartamentoId || cargandoUsuariosArea || usuariosArea.length === 0
                  }
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
              <p className="-mt-2 text-[11px] font-semibold text-slate-600">
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
              <Button type="submit" size="sm">
                Registrar Contrato
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!contratoAEliminar}
        onOpenChange={(open) => !open && setContratoAEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar el contrato con "{contratoAEliminar?.proveedor}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. El contrato dejará de aparecer en el listado, pero queda
              registrado en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
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
