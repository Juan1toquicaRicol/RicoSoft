import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Award, ChevronDown, ChevronRight, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { usePerfilesFuncionales, type PerfilFuncional } from "@/hooks/use-perfiles-funcionales";
import { useDepartamentosPublico } from "@/hooks/use-departamentos-publico";
import { useUsuariosPorDepartamento } from "@/hooks/use-usuarios-por-departamento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/configuracion/perfiles-funcionales")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.PERFILES_FUNCIONALES_VER),
  component: PerfilesFuncionalesConfigPage,
});

function PerfilesFuncionalesConfigPage() {
  const { user: sesion } = useSession();
  const puedeCrear = hasPermission(sesion, PERMISOS_SISTEMA.PERFILES_FUNCIONALES_CREAR);
  const puedeEditar = hasPermission(sesion, PERMISOS_SISTEMA.PERFILES_FUNCIONALES_EDITAR);
  const puedeEliminar = hasPermission(sesion, PERMISOS_SISTEMA.PERFILES_FUNCIONALES_ELIMINAR);
  const puedeAsignar = hasPermission(sesion, PERMISOS_SISTEMA.PERFILES_FUNCIONALES_ASIGNAR);

  const {
    perfiles,
    loading,
    error,
    crearPerfil,
    actualizarPerfil,
    eliminarPerfil,
    agregarUsuario,
    quitarUsuario,
  } = usePerfilesFuncionales();
  const { departamentos } = useDepartamentosPublico();

  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoDepartamentoId, setNuevoDepartamentoId] = useState("");
  const [nuevoEsJefe, setNuevoEsJefe] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const gruposPorArea = useMemo(() => {
    const mapa = new Map<string, { nombre: string; perfiles: PerfilFuncional[] }>();
    for (const p of perfiles) {
      const clave = p.departamentoId;
      const grupo = mapa.get(clave) ?? { nombre: p.departamentoNombre || "Sin área", perfiles: [] };
      grupo.perfiles.push(p);
      mapa.set(clave, grupo);
    }
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [perfiles]);

  const toggleExpandido = (id: string) => {
    setExpandidos((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim() || !nuevoDepartamentoId) {
      toast.error("Selecciona el área y escribe un nombre para el perfil.");
      return;
    }
    try {
      await crearPerfil({
        departamentoId: nuevoDepartamentoId,
        nombre: nuevoNombre.trim(),
        esJefeDeArea: nuevoEsJefe,
      });
      setNuevoNombre("");
      setNuevoDepartamentoId("");
      setNuevoEsJefe(false);
      setCreando(false);
      toast.success("Perfil funcional creado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear el perfil funcional.");
    }
  };

  const handleToggleActivo = async (perfil: PerfilFuncional) => {
    try {
      await actualizarPerfil(perfil.id, { activo: !perfil.activo });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el perfil.");
    }
  };

  const handleToggleJefe = async (perfil: PerfilFuncional) => {
    try {
      await actualizarPerfil(perfil.id, { esJefeDeArea: !perfil.esJefeDeArea });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el perfil.");
    }
  };

  const handleEliminar = async (perfil: PerfilFuncional) => {
    if (!confirm(`¿Eliminar el perfil "${perfil.nombre}"?`)) return;
    try {
      await eliminarPerfil(perfil.id);
      toast.success("Perfil funcional eliminado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar el perfil.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <Award className="h-6 w-6 text-blue-600" />
            Perfiles Funcionales
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            Agrupan usuarios dentro de un área (ej. "Tesorería", "Jefe de Contabilidad") para poder
            dirigirles avisos operativos más adelante. No otorgan ningún permiso de seguridad — eso
            lo sigue definiendo el Rol de cada usuario en Configuración &gt; Roles.
          </p>
        </div>
        {puedeCrear && (
          <Button size="sm" onClick={() => setCreando((c) => !c)} className="gap-1.5 shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nuevo perfil
          </Button>
        )}
      </div>

      {creando && (
        <form
          onSubmit={handleCrear}
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-end gap-3"
        >
          <div className="space-y-1 w-full sm:w-56">
            <Label className="text-xs font-semibold text-slate-700">Área *</Label>
            <Select value={nuevoDepartamentoId} onValueChange={setNuevoDepartamentoId}>
              <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                <SelectValue placeholder="Selecciona un área" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                {departamentos.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">
                    {d.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 w-full">
            <Label className="text-xs font-semibold text-slate-700">Nombre del perfil *</Label>
            <Input
              required
              placeholder="Ej: Tesorería"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <label className="flex h-9 items-center gap-2 text-xs text-slate-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={nuevoEsJefe}
              onChange={(e) => setNuevoEsJefe(e.target.checked)}
              className="accent-blue-600"
            />
            Es jefe de área
          </label>
          <Button type="submit" variant="success" className="h-9 shrink-0">
            Crear
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      {loading ? (
        <p className="text-xs text-slate-500">Cargando perfiles funcionales...</p>
      ) : gruposPorArea.length === 0 ? (
        <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-2xs text-center text-sm text-slate-500">
          No hay perfiles funcionales registrados todavía.
        </div>
      ) : (
        <div className="space-y-5">
          {gruposPorArea.map((grupo) => (
            <div
              key={grupo.nombre}
              className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs"
            >
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  {grupo.nombre}
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {grupo.perfiles.map((perfil) => (
                  <FilaPerfil
                    key={perfil.id}
                    perfil={perfil}
                    expandido={expandidos.has(perfil.id)}
                    onToggleExpandido={() => toggleExpandido(perfil.id)}
                    onAgregarUsuario={agregarUsuario}
                    onQuitarUsuario={quitarUsuario}
                    puedeEditar={puedeEditar}
                    puedeEliminar={puedeEliminar}
                    puedeAsignar={puedeAsignar}
                    onToggleActivo={() => handleToggleActivo(perfil)}
                    onToggleJefe={() => handleToggleJefe(perfil)}
                    onEliminar={() => handleEliminar(perfil)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilaPerfil({
  perfil,
  expandido,
  onToggleExpandido,
  onAgregarUsuario,
  onQuitarUsuario,
  puedeEditar,
  puedeEliminar,
  puedeAsignar,
  onToggleActivo,
  onToggleJefe,
  onEliminar,
}: {
  perfil: PerfilFuncional;
  expandido: boolean;
  onToggleExpandido: () => void;
  onAgregarUsuario: (perfilId: string, userId: string) => Promise<void>;
  onQuitarUsuario: (perfilId: string, userId: string) => Promise<void>;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  puedeAsignar: boolean;
  onToggleActivo: () => void;
  onToggleJefe: () => void;
  onEliminar: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleExpandido}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expandido ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          )}
          <span className="truncate text-sm font-semibold text-slate-800">{perfil.nombre}</span>
          {perfil.esJefeDeArea && (
            <Badge
              variant="outline"
              className="shrink-0 border-blue-200 bg-blue-50 text-blue-700 gap-1"
            >
              <Award className="h-3 w-3" /> Jefe de área
            </Badge>
          )}
          {!perfil.activo && (
            <Badge
              variant="outline"
              className="shrink-0 border-transparent bg-slate-900 text-white"
            >
              Inactivo
            </Badge>
          )}
          <span className="shrink-0 flex items-center gap-1 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5" /> {perfil.usuariosCount}
          </span>
        </button>
        <div className="shrink-0 flex items-center gap-2">
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={onToggleJefe}>
              {perfil.esJefeDeArea ? "Quitar jefe" : "Marcar jefe"}
            </Button>
          )}
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={onToggleActivo}>
              {perfil.activo ? "Desactivar" : "Activar"}
            </Button>
          )}
          {puedeEliminar && perfil.usuariosCount === 0 && (
            <button
              onClick={onEliminar}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
              title="Eliminar perfil"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {expandido && (
        <div className="bg-slate-50/60 px-4 py-3 border-t border-slate-100">
          <GestionUsuariosPerfil
            perfil={perfil}
            puedeAsignar={puedeAsignar}
            onAgregarUsuario={onAgregarUsuario}
            onQuitarUsuario={onQuitarUsuario}
          />
        </div>
      )}
    </div>
  );
}

function GestionUsuariosPerfil({
  perfil,
  puedeAsignar,
  onAgregarUsuario,
  onQuitarUsuario,
}: {
  perfil: PerfilFuncional;
  puedeAsignar: boolean;
  onAgregarUsuario: (perfilId: string, userId: string) => Promise<void>;
  onQuitarUsuario: (perfilId: string, userId: string) => Promise<void>;
}) {
  const { usuarios: candidatos, loading: cargandoCandidatos } = useUsuariosPorDepartamento(
    perfil.departamentoId,
  );
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState("");
  const [guardando, setGuardando] = useState(false);

  const yaAsignadosIds = new Set(perfil.usuarios.map((u) => u.id));
  const disponibles = candidatos.filter((c) => !yaAsignadosIds.has(c.id));

  const handleAgregar = async () => {
    if (!usuarioSeleccionado) return;
    setGuardando(true);
    try {
      await onAgregarUsuario(perfil.id, usuarioSeleccionado);
      setUsuarioSeleccionado("");
      toast.success("Usuario asignado al perfil.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al asignar el usuario.");
    } finally {
      setGuardando(false);
    }
  };

  const handleQuitar = async (userId: string, nombre: string) => {
    if (!confirm(`¿Quitar a "${nombre}" de este perfil?`)) return;
    try {
      await onQuitarUsuario(perfil.id, userId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al quitar el usuario.");
    }
  };

  return (
    <div className="space-y-3">
      {perfil.usuarios.length === 0 ? (
        <p className="text-xs text-slate-500">Ningún usuario asignado a este perfil todavía.</p>
      ) : (
        <ul className="space-y-1.5">
          {perfil.usuarios.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-800">{u.nombre}</p>
                <p className="truncate text-[11px] text-slate-500">{u.email}</p>
              </div>
              {puedeAsignar && (
                <button
                  type="button"
                  onClick={() => handleQuitar(u.id, u.nombre)}
                  className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                  title="Quitar del perfil"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeAsignar && (
        <div className="flex items-center gap-2">
          <Select value={usuarioSeleccionado} onValueChange={setUsuarioSeleccionado}>
            <SelectTrigger className="h-9 flex-1 text-xs border-slate-300 bg-white">
              <SelectValue
                placeholder={
                  cargandoCandidatos
                    ? "Cargando usuarios..."
                    : disponibles.length === 0
                      ? "Sin usuarios disponibles en esta área"
                      : "Selecciona un usuario del área"
                }
              />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              {disponibles.map((u) => (
                <SelectItem key={u.id} value={u.id} className="text-xs">
                  {u.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!usuarioSeleccionado || guardando}
            onClick={handleAgregar}
          >
            <UserPlus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
      )}
    </div>
  );
}
