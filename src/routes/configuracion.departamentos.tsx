import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { Building2, Plus, Trash2, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { fetchAuth } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/configuracion/departamentos")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.DEPARTAMENTOS_VER),
  component: DepartamentosConfigPage,
});

interface DepartamentoApi {
  id: string;
  nombre: string;
  esSistemas: boolean;
  activo: boolean;
  usuariosAsignados: number;
}

function DepartamentosConfigPage() {
  const { user: sesion } = useSession();
  const puedeCrear = hasPermission(sesion, PERMISOS_SISTEMA.DEPARTAMENTOS_CREAR);
  const puedeEditar = hasPermission(sesion, PERMISOS_SISTEMA.DEPARTAMENTOS_EDITAR);
  const puedeEliminar = hasPermission(sesion, PERMISOS_SISTEMA.DEPARTAMENTOS_ELIMINAR);

  const [departamentos, setDepartamentos] = useState<DepartamentoApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoEsSistemas, setNuevoEsSistemas] = useState(false);

  const fetchDepartamentos = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/departamentos");
      setDepartamentos(data);
    } catch (err: any) {
      setError(err.message || "Error cargando departamentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartamentos();
  }, []);

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;
    try {
      await fetchAuth("/departamentos", {
        method: "POST",
        body: JSON.stringify({ nombre: nuevoNombre.trim(), esSistemas: nuevoEsSistemas }),
      });
      setNuevoNombre("");
      setNuevoEsSistemas(false);
      setCreando(false);
      fetchDepartamentos();
    } catch (err: any) {
      toast.error(err.message || "Error al crear el departamento.");
    }
  };

  const handleToggleActivo = async (departamento: DepartamentoApi) => {
    try {
      await fetchAuth(`/departamentos/${departamento.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !departamento.activo }),
      });
      fetchDepartamentos();
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar el departamento.");
    }
  };

  const handleEliminar = async (departamento: DepartamentoApi) => {
    if (!confirm(`¿Eliminar el departamento "${departamento.nombre}"?`)) return;
    try {
      await fetchAuth(`/departamentos/${departamento.id}`, { method: "DELETE" });
      fetchDepartamentos();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el departamento.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <Building2 className="h-6 w-6 text-blue-600" />
            Departamentos
          </h1>
          <p className="text-sm text-slate-500">
            Departamentos de la empresa. Cada usuario pertenece a uno; el marcado como "Sistemas"
            habilita el acceso a Configuración para quienes además tengan el permiso correspondiente.
          </p>
        </div>
        {puedeCrear && (
          <Button size="sm" onClick={() => setCreando((c) => !c)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nuevo departamento
          </Button>
        )}
      </div>

      {creando && (
        <form
          onSubmit={handleCrear}
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center gap-3"
        >
          <Input
            required
            placeholder="Nombre del departamento"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="flex-1 w-full sm:w-auto"
          />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={nuevoEsSistemas}
              onChange={(e) => setNuevoEsSistemas(e.target.checked)}
              className="accent-blue-600"
            />
            Es el departamento de Sistemas
          </label>
          <Button type="submit" variant="success">
            Crear
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Departamento</TableHead>
              <TableHead>Usuarios</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departamentos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-500 py-6">
                  {loading ? "Cargando departamentos..." : error || "No hay departamentos registrados."}
                </TableCell>
              </TableRow>
            ) : (
              departamentos.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      {d.nombre}
                      {d.esSistemas && (
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 gap-1">
                          <ShieldCheck className="h-3 w-3" /> Sistemas
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-slate-400" /> {d.usuariosAsignados}
                    </span>
                  </TableCell>
                  <TableCell>
                    {d.activo ? (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-transparent bg-slate-900 text-white">
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {puedeEditar && (
                      <Button size="sm" variant="outline" onClick={() => handleToggleActivo(d)}>
                        {d.activo ? "Desactivar" : "Activar"}
                      </Button>
                    )}
                    {puedeEliminar && d.usuariosAsignados === 0 && (
                      <button
                        onClick={() => handleEliminar(d)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-900 transition-colors align-middle cursor-pointer"
                        title="Eliminar departamento"
                      >
                        <Trash2 className="h-3.5 w-3.5 inline" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
