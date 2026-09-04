import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Key, Plus, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";

import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { usePermisosCatalogo, type PermisoCatalogo } from "@/hooks/use-permisos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
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

export const Route = createFileRoute("/configuracion/permisos")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.PERMISOS_VER),
  component: PermisosConfigPage,
});

const FORM_INICIAL = { codigo: "", nombre: "", descripcion: "", modulo: "" };

function PermisosConfigPage() {
  const { user: sesion } = useSession();
  const puedeGestionar = hasPermission(sesion, PERMISOS_SISTEMA.PERMISOS_GESTIONAR);

  const { permisos, loading, error, crearPermiso, actualizarPermiso, eliminarPermiso } =
    usePermisosCatalogo();

  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [editando, setEditando] = useState<PermisoCatalogo | null>(null);
  const [formEdicion, setFormEdicion] = useState({ nombre: "", descripcion: "", modulo: "" });
  const [aEliminar, setAEliminar] = useState<PermisoCatalogo | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const modulos = Array.from(new Set(permisos.map((p) => p.modulo))).sort();

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.codigo.trim() || !form.nombre.trim() || !form.modulo.trim()) return;
    setGuardando(true);
    try {
      await crearPermiso(form);
      toast.success(`Permiso "${form.codigo}" creado.`);
      setForm(FORM_INICIAL);
      setCreando(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear el permiso.");
    } finally {
      setGuardando(false);
    }
  };

  const abrirEdicion = (p: PermisoCatalogo) => {
    setFormEdicion({ nombre: p.nombre, descripcion: p.descripcion || "", modulo: p.modulo });
    setEditando(p);
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setGuardando(true);
    try {
      await actualizarPermiso(editando.id, formEdicion);
      toast.success("Permiso actualizado.");
      setEditando(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el permiso.");
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleActivo = async (p: PermisoCatalogo) => {
    try {
      await actualizarPermiso(p.id, { activo: !p.activo });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el permiso.");
    }
  };

  const handleEliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await eliminarPermiso(aEliminar.id);
      toast.success(`Permiso "${aEliminar.codigo}" eliminado.`);
      setAEliminar(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar el permiso.");
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <Key className="h-6 w-6 text-blue-600" />
            Permisos
          </h1>
          <p className="text-sm text-slate-500">
            Catálogo de permisos granulares del sistema. Se asignan a los usuarios a través de
            Roles. Los permisos que crees aquí quedan disponibles para asignar a un rol, pero solo
            tienen efecto real una vez que un desarrollador los exige en el backend correspondiente.
          </p>
        </div>
        {puedeGestionar && (
          <Button size="sm" onClick={() => setCreando((c) => !c)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nuevo permiso
          </Button>
        )}
      </div>

      {creando && (
        <form
          onSubmit={handleCrear}
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Código *</Label>
            <Input
              required
              placeholder='p. ej. "compras.aprobar_extra"'
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Módulo *</Label>
            <Input
              required
              placeholder="p. ej. Compras"
              value={form.modulo}
              onChange={(e) => setForm({ ...form, modulo: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs font-semibold text-slate-700">Nombre *</Label>
            <Input
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs font-semibold text-slate-700">Descripción (opcional)</Label>
            <Input
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="success" disabled={guardando}>
              {guardando ? "Guardando..." : "Crear permiso"}
            </Button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      <div className="space-y-6">
        {modulos.map((modulo) => (
          <div
            key={modulo}
            className="border border-slate-200 rounded-lg bg-white shadow-2xs overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
              {modulo}
            </div>
            <Table>
              <TableBody>
                {permisos
                  .filter((p) => p.modulo === modulo)
                  .map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="w-72 font-mono text-xs text-blue-700">
                        <span className="inline-flex items-center gap-1.5">
                          {p.esSistema && <Lock className="h-3 w-3 text-slate-400" />}
                          {p.codigo}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-slate-800">{p.nombre}</TableCell>
                      <TableCell className="text-slate-500">{p.descripcion || "—"}</TableCell>
                      <TableCell className="w-24">
                        {p.activo ? (
                          <Badge
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-blue-800"
                          >
                            Activo
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-slate-900 text-white"
                          >
                            Inactivo
                          </Badge>
                        )}
                      </TableCell>
                      {puedeGestionar && (
                        <TableCell className="text-right space-x-1.5 whitespace-nowrap">
                          <Button size="sm" variant="outline" onClick={() => abrirEdicion(p)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleToggleActivo(p)}>
                            {p.activo ? "Desactivar" : "Activar"}
                          </Button>
                          {!p.esSistema && (
                            <button
                              onClick={() => setAEliminar(p)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-900 transition-colors align-middle cursor-pointer"
                              title="Eliminar permiso"
                            >
                              <Trash2 className="h-3.5 w-3.5 inline" />
                            </button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        ))}
        {!loading && permisos.length === 0 && (
          <p className="text-sm text-slate-500 py-6 text-center">
            {error || "No hay permisos registrados todavía."}
          </p>
        )}
      </div>

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Editar permiso — {editando?.codigo}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              {editando?.esSistema
                ? "El código de un permiso del sistema no se puede cambiar."
                : "El código no se puede cambiar una vez creado."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGuardarEdicion} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Módulo</Label>
              <Input
                required
                value={formEdicion.modulo}
                onChange={(e) => setFormEdicion({ ...formEdicion, modulo: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Nombre</Label>
              <Input
                required
                value={formEdicion.nombre}
                onChange={(e) => setFormEdicion({ ...formEdicion, nombre: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Descripción</Label>
              <Input
                value={formEdicion.descripcion}
                onChange={(e) => setFormEdicion({ ...formEdicion, descripcion: e.target.value })}
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aEliminar} onOpenChange={(open) => !open && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el permiso "{aEliminar?.codigo}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. Si el permiso está asignado a algún rol, primero debes
              quitarlo de ahí.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEliminar} disabled={eliminando}>
              {eliminando ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
