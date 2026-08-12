import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, Search, RefreshCw, UserCheck, UserX, Shield } from "lucide-react";

import { fetchAuth } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Declaración indispensable para TanStack Router
export const Route = createFileRoute("/configuracion/usuarios")({
  component: UsuariosConfigPage,
});

interface UsuarioApi {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  isSuperadmin: boolean;
  rolId: string | null;
  rolRel: { id: string; nombre: string } | null;
  departamentoId: string | null;
  departamento: { id: string; nombre: string } | null;
}

interface RolOpcion {
  id: string;
  nombre: string;
}

interface DepartamentoOpcion {
  id: string;
  nombre: string;
}

function UsuariosConfigPage() {
  const { user: sesion } = useSession();
  const puedeDesactivar = hasPermission(sesion, PERMISOS_SISTEMA.USUARIOS_DESACTIVAR);
  const puedeCambiarRol = hasPermission(sesion, PERMISOS_SISTEMA.USUARIOS_CAMBIAR_ROL);
  const puedeCambiarDepartamento = hasPermission(
    sesion,
    PERMISOS_SISTEMA.USUARIOS_CAMBIAR_DEPARTAMENTO,
  );

  const [usuarios, setUsuarios] = useState<UsuarioApi[]>([]);
  const [roles, setRoles] = useState<RolOpcion[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoOpcion[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cambiandoRolId, setCambiandoRolId] = useState<string | null>(null);
  const [cambiandoDepartamentoId, setCambiandoDepartamentoId] = useState<string | null>(null);

  const fetchUsuarios = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/usuarios?search=${encodeURIComponent(search)}`);
      setUsuarios(data.data || []);
    } catch (err: any) {
      setError(err.message || "Error cargando usuarios.");
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const data = await fetchAuth("/roles");
      setRoles(Array.isArray(data) ? data.map((r: any) => ({ id: r.id, nombre: r.nombre })) : []);
    } catch {
      // El catálogo de roles es secundario; si falla, simplemente no se ofrece el selector.
    }
  };

  const fetchDepartamentos = async () => {
    try {
      const data = await fetchAuth("/departamentos");
      setDepartamentos(
        Array.isArray(data) ? data.map((d: any) => ({ id: d.id, nombre: d.nombre })) : [],
      );
    } catch {
      // El catálogo de departamentos es secundario; si falla, simplemente no se ofrece el selector.
    }
  };

  useEffect(() => {
    fetchUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (puedeCambiarRol) fetchRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeCambiarRol]);

  useEffect(() => {
    if (puedeCambiarDepartamento) fetchDepartamentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeCambiarDepartamento]);

  const handleToggleEstado = async (id: string, nuevoEstado: boolean) => {
    try {
      await fetchAuth(`/usuarios/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ activo: nuevoEstado }),
      });
      fetchUsuarios();
    } catch (err: any) {
      alert(err.message || "Error al cambiar estado");
    }
  };

  const handleCambiarRol = async (id: string, rolId: string) => {
    setCambiandoRolId(id);
    const rolIdReal = rolId === "__sin_rol__" ? null : rolId;
    try {
      await fetchAuth(`/usuarios/${id}/rol`, {
        method: "PATCH",
        body: JSON.stringify({ rolId: rolIdReal }),
      });
      fetchUsuarios();
    } catch (err: any) {
      alert(err.message || "Error al asignar el rol");
    } finally {
      setCambiandoRolId(null);
    }
  };

  const handleCambiarDepartamento = async (id: string, departamentoId: string) => {
    setCambiandoDepartamentoId(id);
    const departamentoIdReal = departamentoId === "__sin_departamento__" ? null : departamentoId;
    try {
      await fetchAuth(`/usuarios/${id}/departamento`, {
        method: "PATCH",
        body: JSON.stringify({ departamentoId: departamentoIdReal }),
      });
      fetchUsuarios();
    } catch (err: any) {
      alert(err.message || "Error al asignar el departamento");
    } finally {
      setCambiandoDepartamentoId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <Users className="h-6 w-6 text-blue-600" />
            Administración de Usuarios
          </h1>
          <p className="text-sm text-slate-500">
            Gestiona las cuentas, estados, roles y accesos a RicoSoft.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchUsuarios} title="Actualizar datos">
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre o correo electrónico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Usuario / Email</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-500 py-6">
                  {loading ? "Cargando usuarios..." : error || "No se encontraron usuarios."}
                </TableCell>
              </TableRow>
            ) : (
              usuarios.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium text-slate-800 flex items-center gap-2">
                      {u.nombre}
                      {u.isSuperadmin && (
                        <Badge variant="outline" className="border-transparent bg-slate-900 text-white gap-1">
                          <Shield className="h-3 w-3" /> Superadmin
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {puedeCambiarDepartamento ? (
                      <Select
                        value={u.departamentoId ?? "__sin_departamento__"}
                        onValueChange={(value) => handleCambiarDepartamento(u.id, value)}
                        disabled={cambiandoDepartamentoId === u.id}
                      >
                        <SelectTrigger className="h-8 w-44 text-xs">
                          <SelectValue placeholder="Sin departamento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__sin_departamento__">Sin departamento</SelectItem>
                          {departamentos.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      u.departamento?.nombre || "Sin departamento"
                    )}
                  </TableCell>
                  <TableCell>
                    {u.isSuperadmin ? (
                      <span className="text-xs text-slate-500">Todos los permisos</span>
                    ) : puedeCambiarRol ? (
                      <Select
                        value={u.rolId ?? "__sin_rol__"}
                        onValueChange={(value) => handleCambiarRol(u.id, value)}
                        disabled={cambiandoRolId === u.id}
                      >
                        <SelectTrigger className="h-8 w-44 text-xs">
                          <SelectValue placeholder="Sin rol" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__sin_rol__">Sin rol asignado</SelectItem>
                          {roles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{u.rolRel?.nombre || "Sin rol"}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.activo ? (
                      <Badge className="border-blue-200 bg-blue-50 text-blue-800 gap-1" variant="outline">
                        <UserCheck className="h-3 w-3" /> Activo
                      </Badge>
                    ) : (
                      <Badge className="border-transparent bg-slate-900 text-white gap-1" variant="outline">
                        <UserX className="h-3 w-3" /> Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {puedeDesactivar && !u.isSuperadmin ? (
                      <Button
                        size="sm"
                        variant={u.activo ? "destructive" : "success"}
                        onClick={() => handleToggleEstado(u.id, !u.activo)}
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
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
