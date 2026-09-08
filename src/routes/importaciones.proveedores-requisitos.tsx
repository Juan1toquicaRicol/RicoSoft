import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  useRequisitosProveedor,
  type NuevoRequisitoProveedor,
  type RequisitoProveedorImportacion,
} from "@/hooks/use-importaciones";
import { useProveedorBusqueda } from "@/hooks/use-proveedores";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/importaciones/proveedores-requisitos")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_VER),
  head: () => ({
    meta: [
      { title: "Proveedores y Requisitos | RicoSoft" },
      {
        name: "description",
        content: "Requisitos de importación registrados por proveedor.",
      },
    ],
  }),
  component: ProveedoresRequisitosPage,
});

// Mismo catálogo EXACTO que TIPOS_REQUISITO_VALIDOS en
// importaciones-requisitos-proveedor.controller.ts.
const TIPOS_REQUISITO = [
  { value: "DOCUMENTO", label: "Documento" },
  { value: "ACCION", label: "Acción" },
  { value: "CONDICION", label: "Condición" },
  { value: "INFORMACION", label: "Información" },
  { value: "PAGO", label: "Pago" },
  { value: "ESPECIFICACION", label: "Especificación" },
];

const etiquetaTipo = (tipo: string) => TIPOS_REQUISITO.find((t) => t.value === tipo)?.label ?? tipo;

const formVacio: NuevoRequisitoProveedor = {
  tipo: "DOCUMENTO",
  nombre: "",
  descripcion: "",
  obligatorio: true,
  orden: 0,
};

function ProveedoresRequisitosPage() {
  const { user } = useSession();
  const puedeCrear = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_CREAR);
  const puedeEditar = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_EDITAR);
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_ELIMINAR);

  const [proveedorId, setProveedorId] = useState("");
  const {
    opciones: proveedorOpciones,
    loading: buscandoProveedores,
    buscar: buscarProveedores,
  } = useProveedorBusqueda();
  const proveedorSeleccionado = proveedorOpciones.find((p) => p.id === proveedorId);

  const { proveedor, requisitos, loading, crearRequisito, actualizarRequisito, eliminarRequisito } =
    useRequisitosProveedor(proveedorId || undefined, true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<RequisitoProveedorImportacion | null>(null);
  const [form, setForm] = useState<NuevoRequisitoProveedor>({ ...formVacio });
  const [guardando, setGuardando] = useState(false);
  const [requisitoAEliminar, setRequisitoAEliminar] =
    useState<RequisitoProveedorImportacion | null>(null);

  const abrirCrear = () => {
    setEditando(null);
    setForm({ ...formVacio, orden: requisitos.length });
    setModalOpen(true);
  };

  const abrirEditar = (r: RequisitoProveedorImportacion) => {
    setEditando(r);
    setForm({
      tipo: r.tipo,
      nombre: r.nombre,
      descripcion: r.descripcion ?? "",
      obligatorio: r.obligatorio,
      orden: r.orden,
    });
    setModalOpen(true);
  };

  const handleGuardar = async () => {
    if (!form.nombre.trim()) {
      toast.error("El nombre del requisito es obligatorio.");
      return;
    }
    setGuardando(true);
    try {
      if (editando) {
        await actualizarRequisito(editando.id, form);
        toast.success("Requisito actualizado.");
      } else {
        await crearRequisito(form);
        toast.success("Requisito creado.");
      }
      setModalOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el requisito.");
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleActivo = async (r: RequisitoProveedorImportacion) => {
    try {
      await actualizarRequisito(r.id, { activo: !r.activo });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cambiar el estado.");
    }
  };

  const handleEliminar = async () => {
    if (!requisitoAEliminar) return;
    try {
      await eliminarRequisito(requisitoAEliminar.id);
      toast.success("Requisito eliminado.");
      setRequisitoAEliminar(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar el requisito.");
    }
  };

  return (
    <AppShell
      title="Proveedores y Requisitos"
      description="Requisitos de importación registrados por proveedor (documentos, condiciones, pagos, especificaciones)."
    >
      <div className="panel bg-white border-slate-200 rounded-lg p-5 shadow-2xs">
        <Label className="text-xs font-semibold text-slate-700">Proveedor</Label>
        <Combobox
          value={proveedorId}
          onValueChange={setProveedorId}
          placeholder="Buscar proveedor por nombre o NIT..."
          searchPlaceholder="Buscar por nombre o NIT..."
          emptyText="Ningún proveedor coincide."
          onSearchChange={buscarProveedores}
          loadingOptions={buscandoProveedores}
          selectedLabel={proveedor?.nombre}
          options={proveedorOpciones.map((p) => ({
            value: p.id,
            label: `${p.nombre} (NIT ${p.nit})`,
          }))}
          className="mt-1 max-w-md"
        />
        {proveedorSeleccionado?.nit && (
          <p className="mt-1 text-[11px] text-slate-500">NIT {proveedorSeleccionado.nit}</p>
        )}
      </div>

      {!proveedorId ? (
        <div className="mt-4">
          <EmptyState
            icon={Truck}
            title="Selecciona un proveedor"
            description="Elige un proveedor arriba para ver y administrar sus requisitos de importación."
          />
        </div>
      ) : (
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs mt-4">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 bg-slate-50/80">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Requisitos de {proveedor?.nombre}
            </h3>
            {puedeCrear && (
              <Button size="xs" onClick={abrirCrear} className="h-7 text-[11px] font-bold">
                <Plus className="h-3 w-3 mr-1" /> Agregar requisito
              </Button>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Cargando...</div>
          ) : requisitos.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Este proveedor no tiene requisitos registrados todavía.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {requisitos
                .slice()
                .sort((a, b) => a.orden - b.orden)
                .map((r) => (
                  <li
                    key={r.id}
                    className={`flex items-center gap-3 px-4 py-3 ${!r.activo ? "opacity-50" : ""}`}
                  >
                    <span className="w-6 shrink-0 text-center text-[11px] font-mono text-slate-400">
                      {r.orden}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-slate-300 bg-slate-50 text-slate-600 text-[10px] shrink-0"
                    >
                      {etiquetaTipo(r.tipo)}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 truncate">{r.nombre}</p>
                      {r.descripcion && (
                        <p className="text-[11px] text-slate-500 truncate">{r.descripcion}</p>
                      )}
                    </div>
                    {r.obligatorio && (
                      <Badge
                        variant="outline"
                        className="border-slate-300 bg-slate-900 text-white text-[10px] shrink-0"
                      >
                        Obligatorio
                      </Badge>
                    )}
                    {puedeEditar && (
                      <Switch
                        checked={r.activo}
                        onCheckedChange={() => handleToggleActivo(r)}
                        aria-label={r.activo ? "Desactivar" : "Activar"}
                      />
                    )}
                    {puedeEditar && (
                      <button
                        type="button"
                        onClick={() => abrirEditar(r)}
                        className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 shrink-0"
                      >
                        Editar
                      </button>
                    )}
                    {puedeEliminar && (
                      <button
                        type="button"
                        onClick={() => setRequisitoAEliminar(r)}
                        className="text-slate-400 hover:text-slate-900 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              {editando ? "Editar requisito" : "Nuevo requisito"}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Para {proveedor?.nombre}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Tipo *</Label>
                <Select value={form.tipo} onValueChange={(val) => setForm({ ...form, tipo: val })}>
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {TIPOS_REQUISITO.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Orden</Label>
                <Input
                  type="number"
                  value={form.orden ?? 0}
                  onChange={(e) => setForm({ ...form, orden: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Nombre *</Label>
              <Input
                required
                placeholder='Ej: "Certificado de origen"'
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Descripción</Label>
              <Textarea
                value={form.descripcion ?? ""}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className="text-xs border-slate-300"
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.obligatorio ?? true}
                onCheckedChange={(checked) => setForm({ ...form, obligatorio: checked })}
              />
              <Label className="text-xs font-semibold text-slate-700">
                Obligatorio para completar la solicitud
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleGuardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!requisitoAEliminar}
        onOpenChange={(open) => !open && setRequisitoAEliminar(null)}
      >
        <DialogContent className="bg-white border-slate-200 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Eliminar requisito</DialogTitle>
            <DialogDescription className="text-slate-500">
              ¿Eliminar "{requisitoAEliminar?.nombre}"? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRequisitoAEliminar(null)}
            >
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleEliminar}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
