import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { ListChecks, Plus, Globe2, Building2 } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import {
  useCatalogoAdmin,
  TIPOS_CATALOGO_ADMINISTRABLES,
  type CatalogoValor,
} from "@/hooks/use-catalogos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/configuracion/catalogos")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.CONFIGURACION_CATALOGOS),
  component: CatalogosConfigPage,
});

function CatalogosConfigPage() {
  const { user: sesion } = useSession();
  const puedeAdministrar = hasPermission(sesion, PERMISOS_SISTEMA.CONFIGURACION_CATALOGOS);
  const esSuperadmin = !!sesion?.isSuperadmin;

  const [tipoSeleccionado, setTipoSeleccionado] = useState(TIPOS_CATALOGO_ADMINISTRABLES[0].tipo);
  const { data, isLoading, error, crear, actualizar, eliminar } =
    useCatalogoAdmin(tipoSeleccionado);

  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ clave: "", etiqueta: "", orden: 0 });
  const [nuevoAlcance, setNuevoAlcance] = useState<"GENERAL" | "TENANT">("TENANT");
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState<CatalogoValor | null>(null);
  const [formEdicion, setFormEdicion] = useState({ etiqueta: "", orden: 0 });

  const etiquetaTipoActual =
    TIPOS_CATALOGO_ADMINISTRABLES.find((t) => t.tipo === tipoSeleccionado)?.etiqueta ??
    tipoSeleccionado;

  // Un registro GENERAL (tenantId null) es compartido entre todas las
  // empresas: solo un superadministrador puede crearlo/editarlo/eliminarlo
  // (mismo criterio que el backend en catalogos.controller.ts).
  const puedeModificar = (valor: CatalogoValor) =>
    puedeAdministrar && (valor.alcance !== "GENERAL" || esSuperadmin);

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevo.clave.trim() || !nuevo.etiqueta.trim()) return;
    setGuardando(true);
    try {
      await crear({
        clave: nuevo.clave.trim(),
        etiqueta: nuevo.etiqueta.trim(),
        orden: nuevo.orden,
        alcance: nuevoAlcance,
      });
      toast.success(`Valor "${nuevo.etiqueta}" creado.`);
      setNuevo({ clave: "", etiqueta: "", orden: 0 });
      setNuevoAlcance("TENANT");
      setCreando(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear el valor de catálogo.");
    } finally {
      setGuardando(false);
    }
  };

  const handleAbrirEdicion = (valor: CatalogoValor) => {
    setEditando(valor);
    setFormEdicion({ etiqueta: valor.etiqueta, orden: valor.orden });
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    try {
      await actualizar(editando.id, formEdicion);
      toast.success("Valor de catálogo actualizado.");
      setEditando(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el valor.");
    }
  };

  const handleToggleActivo = async (valor: CatalogoValor) => {
    try {
      await actualizar(valor.id, { activo: !valor.activo });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el valor.");
    }
  };

  const handleEliminar = async (valor: CatalogoValor) => {
    if (!confirm(`¿Eliminar el valor "${valor.etiqueta}" (${valor.clave})?`)) return;
    try {
      await eliminar(valor.id);
      toast.success("Valor de catálogo eliminado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar el valor.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <ListChecks className="h-6 w-6 text-blue-600" />
            Catálogos
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            Valores de referencia usados en formularios de todo el sistema (incoterms, monedas,
            países, formas de pago, etc.). Los valores{" "}
            <span className="font-semibold">GENERAL</span> son compartidos por todas las empresas y
            solo un superadministrador puede modificarlos; los de{" "}
            <span className="font-semibold">esta empresa</span> son exclusivos del tenant actual.
          </p>
        </div>
        {puedeAdministrar && (
          <Button size="sm" onClick={() => setCreando((c) => !c)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nuevo valor
          </Button>
        )}
      </div>

      <div className="max-w-xs">
        <Select value={tipoSeleccionado} onValueChange={setTipoSeleccionado}>
          <SelectTrigger className="bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white border-slate-200">
            {TIPOS_CATALOGO_ADMINISTRABLES.map((t) => (
              <SelectItem key={t.tipo} value={t.tipo}>
                {t.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {creando && (
        <form
          onSubmit={handleCrear}
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <Input
            required
            placeholder="Clave (ej. FOB) *"
            value={nuevo.clave}
            onChange={(e) => setNuevo({ ...nuevo, clave: e.target.value })}
          />
          <Input
            required
            placeholder="Etiqueta visible (ej. FOB - Libre a Bordo) *"
            value={nuevo.etiqueta}
            onChange={(e) => setNuevo({ ...nuevo, etiqueta: e.target.value })}
          />
          <Input
            type="number"
            placeholder="Orden (opcional)"
            value={nuevo.orden}
            onChange={(e) => setNuevo({ ...nuevo, orden: Number(e.target.value) || 0 })}
          />
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-500">Alcance:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="alcance-catalogo"
                checked={nuevoAlcance === "TENANT"}
                onChange={() => setNuevoAlcance("TENANT")}
                className="accent-blue-600"
              />
              Solo esta empresa
            </label>
            {esSuperadmin && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="alcance-catalogo"
                  checked={nuevoAlcance === "GENERAL"}
                  onChange={() => setNuevoAlcance("GENERAL")}
                  className="accent-blue-600"
                />
                General — todas las empresas
              </label>
            )}
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="success" disabled={guardando}>
              {guardando ? "Guardando..." : "Crear valor"}
            </Button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Clave</TableHead>
              <TableHead>Etiqueta</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Alcance</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500 py-6">
                  {isLoading
                    ? "Cargando catálogo..."
                    : `No hay valores registrados para "${etiquetaTipoActual}".`}
                </TableCell>
              </TableRow>
            ) : (
              data.map((valor) => (
                <TableRow key={valor.id}>
                  <TableCell className="font-mono text-xs text-slate-700">{valor.clave}</TableCell>
                  <TableCell className="font-medium text-slate-800">{valor.etiqueta}</TableCell>
                  <TableCell className="text-slate-600">{valor.orden}</TableCell>
                  <TableCell>
                    {valor.alcance === "GENERAL" ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1"
                      >
                        <Globe2 className="h-3 w-3" /> General
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-50 text-slate-600 gap-1"
                      >
                        <Building2 className="h-3 w-3" /> Esta empresa
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {valor.activo ? (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
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
                  <TableCell className="text-right space-x-2">
                    {puedeModificar(valor) && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAbrirEdicion(valor)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActivo(valor)}
                        >
                          {valor.activo ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleEliminar(valor)}
                        >
                          Eliminar
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Editar valor — {editando?.clave}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGuardarEdicion} className="space-y-3">
            <Input
              placeholder="Etiqueta"
              value={formEdicion.etiqueta}
              onChange={(e) => setFormEdicion({ ...formEdicion, etiqueta: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Orden"
              value={formEdicion.orden}
              onChange={(e) =>
                setFormEdicion({ ...formEdicion, orden: Number(e.target.value) || 0 })
              }
            />
            <DialogFooter>
              <Button type="submit" variant="success">
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
