import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, ChevronDown, ChevronRight, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import {
  useReglasDestinatarios,
  type ReglaDestinatarios,
  type TipoDestinatario,
  type NuevoDestinatario,
  type Destinatario,
} from "@/hooks/use-reglas-destinatarios";
import { usePerfilesFuncionales } from "@/hooks/use-perfiles-funcionales";
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

export const Route = createFileRoute("/configuracion/reglas-destinatarios")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.REGLAS_DESTINATARIOS_VER),
  component: ReglasDestinatariosConfigPage,
});

const TIPOS: { value: TipoDestinatario; label: string }[] = [
  { value: "USUARIO", label: "Usuario específico" },
  { value: "PERFIL", label: "Perfil funcional" },
  { value: "AREA", label: "Área (departamento)" },
  { value: "RESPONSABLE_REGISTRO", label: "Responsable del registro" },
  { value: "JEFE_AREA", label: "Jefe de área" },
  { value: "PERMISO", label: "Permiso" },
];

function etiquetaTipo(tipo: TipoDestinatario) {
  return TIPOS.find((t) => t.value === tipo)?.label ?? tipo;
}

function etiquetaDestinatario(d: {
  tipo: TipoDestinatario;
  usuarioNombre?: string | null;
  perfilNombre?: string | null;
  departamentoNombre?: string | null;
  permisoClave?: string | null;
}) {
  switch (d.tipo) {
    case "USUARIO":
      return d.usuarioNombre || "Usuario";
    case "PERFIL":
      return d.perfilNombre || "Perfil";
    case "AREA":
    case "JEFE_AREA":
      return (
        d.departamentoNombre || (d.tipo === "JEFE_AREA" ? "Jefe del área del registro" : "Área")
      );
    case "PERMISO":
      return d.permisoClave || "Permiso";
    case "RESPONSABLE_REGISTRO":
      return "Responsable del registro";
    default:
      return d.tipo;
  }
}

function ReglasDestinatariosConfigPage() {
  const { user: sesion } = useSession();
  const puedeCrear = hasPermission(sesion, PERMISOS_SISTEMA.REGLAS_DESTINATARIOS_CREAR);
  const puedeEditar = hasPermission(sesion, PERMISOS_SISTEMA.REGLAS_DESTINATARIOS_EDITAR);
  const puedeEliminar = hasPermission(sesion, PERMISOS_SISTEMA.REGLAS_DESTINATARIOS_ELIMINAR);

  const {
    reglas,
    loading,
    error,
    crearRegla,
    actualizarRegla,
    eliminarRegla,
    agregarDestinatario,
    quitarDestinatario,
  } = useReglasDestinatarios();

  const [creando, setCreando] = useState(false);
  const [nuevoEvento, setNuevoEvento] = useState("");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  const toggleExpandida = (id: string) => {
    setExpandidas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEvento.trim()) {
      toast.error("Escribe el nombre del evento.");
      return;
    }
    try {
      // Se crea con un único destinatario RESPONSABLE_REGISTRO por defecto
      // (siempre válido, no requiere selección) — se ajusta/completa después
      // desde el panel de destinatarios de la regla.
      await crearRegla({
        evento: nuevoEvento.trim(),
        destinatarios: [{ tipo: "RESPONSABLE_REGISTRO" }],
      });
      setNuevoEvento("");
      setCreando(false);
      toast.success("Regla creada — ahora agrega o ajusta sus destinatarios.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear la regla.");
    }
  };

  const handleToggleActiva = async (regla: ReglaDestinatarios) => {
    try {
      await actualizarRegla(regla.id, { activa: !regla.activa });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar la regla.");
    }
  };

  const handleEliminar = async (regla: ReglaDestinatarios) => {
    if (!confirm(`¿Eliminar la regla del evento "${regla.evento}"?`)) return;
    try {
      await eliminarRegla(regla.id);
      toast.success("Regla eliminada.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar la regla.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <Bell className="h-6 w-6 text-blue-600" />
            Reglas de Destinatarios
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            Define quién debe enterarse de cada tipo de evento (usuario, perfil funcional, área,
            responsable del registro, jefe de área o permiso). Esta pantalla solo configura — la
            resolución real ocurre cuando un módulo dispara el evento.
          </p>
        </div>
        {puedeCrear && (
          <Button size="sm" onClick={() => setCreando((c) => !c)} className="gap-1.5 shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nueva regla
          </Button>
        )}
      </div>

      {creando && (
        <form
          onSubmit={handleCrear}
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-end gap-3"
        >
          <div className="space-y-1 flex-1 w-full">
            <Label className="text-xs font-semibold text-slate-700">Evento *</Label>
            <Input
              required
              placeholder="Ej: SERVICIO_RENOVACION_PROXIMA"
              value={nuevoEvento}
              onChange={(e) => setNuevoEvento(e.target.value.toUpperCase())}
              className="h-9 text-xs font-mono"
            />
          </div>
          <Button type="submit" variant="success" className="h-9 shrink-0">
            Crear
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      {loading ? (
        <p className="text-xs text-slate-500">Cargando reglas de destinatarios...</p>
      ) : reglas.length === 0 ? (
        <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-2xs text-center text-sm text-slate-500">
          No hay reglas de destinatarios registradas todavía.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs divide-y divide-slate-100">
          {reglas.map((regla) => (
            <FilaRegla
              key={regla.id}
              regla={regla}
              expandida={expandidas.has(regla.id)}
              onToggleExpandida={() => toggleExpandida(regla.id)}
              puedeEditar={puedeEditar}
              puedeEliminar={puedeEliminar}
              onToggleActiva={() => handleToggleActiva(regla)}
              onEliminar={() => handleEliminar(regla)}
              onAgregarDestinatario={agregarDestinatario}
              onQuitarDestinatario={quitarDestinatario}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaRegla({
  regla,
  expandida,
  onToggleExpandida,
  puedeEditar,
  puedeEliminar,
  onToggleActiva,
  onEliminar,
  onAgregarDestinatario,
  onQuitarDestinatario,
}: {
  regla: ReglaDestinatarios;
  expandida: boolean;
  onToggleExpandida: () => void;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  onToggleActiva: () => void;
  onEliminar: () => void;
  onAgregarDestinatario: (reglaId: string, d: NuevoDestinatario) => Promise<void>;
  onQuitarDestinatario: (reglaId: string, destinatarioId: string) => Promise<void>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleExpandida}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expandida ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          )}
          <span className="truncate font-mono text-sm font-semibold text-slate-800">
            {regla.evento}
          </span>
          {!regla.activa && (
            <Badge
              variant="outline"
              className="shrink-0 border-transparent bg-slate-900 text-white"
            >
              Inactiva
            </Badge>
          )}
          <span className="shrink-0 text-xs text-slate-500">
            {regla.destinatarios.length} destinatario(s)
          </span>
        </button>
        <div className="shrink-0 flex items-center gap-2">
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={onToggleActiva}>
              {regla.activa ? "Desactivar" : "Activar"}
            </Button>
          )}
          {puedeEliminar && (
            <button
              onClick={onEliminar}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
              title="Eliminar regla"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {expandida && (
        <div className="bg-slate-50/60 px-4 py-3 border-t border-slate-100">
          <GestionDestinatarios
            regla={regla}
            puedeEditar={puedeEditar}
            onAgregarDestinatario={onAgregarDestinatario}
            onQuitarDestinatario={onQuitarDestinatario}
          />
        </div>
      )}
    </div>
  );
}

function GestionDestinatarios({
  regla,
  puedeEditar,
  onAgregarDestinatario,
  onQuitarDestinatario,
}: {
  regla: ReglaDestinatarios;
  puedeEditar: boolean;
  onAgregarDestinatario: (reglaId: string, d: NuevoDestinatario) => Promise<void>;
  onQuitarDestinatario: (reglaId: string, destinatarioId: string) => Promise<void>;
}) {
  const { perfiles } = usePerfilesFuncionales();
  const { departamentos } = useDepartamentosPublico();
  const [tipo, setTipo] = useState<TipoDestinatario>("PERFIL");
  const [perfilId, setPerfilId] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [permisoClave, setPermisoClave] = useState("");
  const [areaParaUsuario, setAreaParaUsuario] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const { usuarios: usuariosDelArea } = useUsuariosPorDepartamento(areaParaUsuario || undefined);
  const [guardando, setGuardando] = useState(false);

  const resetFormulario = () => {
    setPerfilId("");
    setDepartamentoId("");
    setPermisoClave("");
    setAreaParaUsuario("");
    setUsuarioId("");
  };

  const handleAgregar = async () => {
    let nuevo: NuevoDestinatario | null = null;
    if (tipo === "USUARIO") {
      if (!usuarioId) return toast.error("Selecciona un usuario.");
      nuevo = { tipo, usuarioId };
    } else if (tipo === "PERFIL") {
      if (!perfilId) return toast.error("Selecciona un perfil funcional.");
      nuevo = { tipo, perfilId };
    } else if (tipo === "AREA") {
      if (!departamentoId) return toast.error("Selecciona un área.");
      nuevo = { tipo, departamentoId };
    } else if (tipo === "PERMISO") {
      if (!permisoClave.trim()) return toast.error("Escribe el código del permiso.");
      nuevo = { tipo, permisoClave: permisoClave.trim() };
    } else if (tipo === "JEFE_AREA") {
      nuevo = { tipo, ...(departamentoId ? { departamentoId } : {}) };
    } else {
      nuevo = { tipo };
    }

    setGuardando(true);
    try {
      await onAgregarDestinatario(regla.id, nuevo);
      resetFormulario();
      toast.success("Destinatario agregado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al agregar el destinatario.");
    } finally {
      setGuardando(false);
    }
  };

  const handleQuitar = async (d: Destinatario) => {
    if (!confirm(`¿Quitar "${etiquetaDestinatario(d)}" (${etiquetaTipo(d.tipo)}) de esta regla?`))
      return;
    try {
      await onQuitarDestinatario(regla.id, d.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al quitar el destinatario.");
    }
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {regla.destinatarios.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800">
                {etiquetaDestinatario(d)}
              </p>
              <p className="text-[11px] text-slate-500">{etiquetaTipo(d.tipo)}</p>
            </div>
            {puedeEditar && (
              <button
                type="button"
                onClick={() => handleQuitar(d)}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                title="Quitar destinatario"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {puedeEditar && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
          <Label className="text-xs font-semibold text-slate-700">Agregar destinatario</Label>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Select
                value={tipo}
                onValueChange={(v) => {
                  setTipo(v as TipoDestinatario);
                  resetFormulario();
                }}
              >
                <SelectTrigger className="h-9 w-56 text-xs border-slate-300 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tipo === "PERFIL" && (
              <Select value={perfilId} onValueChange={setPerfilId}>
                <SelectTrigger className="h-9 w-56 text-xs border-slate-300 bg-white">
                  <SelectValue placeholder="Selecciona un perfil" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  {perfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.departamentoNombre} · {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {(tipo === "AREA" || tipo === "JEFE_AREA") && (
              <Select value={departamentoId} onValueChange={setDepartamentoId}>
                <SelectTrigger className="h-9 w-56 text-xs border-slate-300 bg-white">
                  <SelectValue
                    placeholder={tipo === "JEFE_AREA" ? "Área (opcional)" : "Selecciona un área"}
                  />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  {departamentos.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {tipo === "PERMISO" && (
              <Input
                placeholder="Ej: solicitudes.aprobar"
                value={permisoClave}
                onChange={(e) => setPermisoClave(e.target.value)}
                className="h-9 w-56 text-xs font-mono"
              />
            )}

            {tipo === "USUARIO" && (
              <>
                <Select
                  value={areaParaUsuario}
                  onValueChange={(v) => {
                    setAreaParaUsuario(v);
                    setUsuarioId("");
                  }}
                >
                  <SelectTrigger className="h-9 w-44 text-xs border-slate-300 bg-white">
                    <SelectValue placeholder="Área del usuario" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {departamentos.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={usuarioId} onValueChange={setUsuarioId} disabled={!areaParaUsuario}>
                  <SelectTrigger className="h-9 w-56 text-xs border-slate-300 bg-white">
                    <SelectValue placeholder="Selecciona un usuario" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {usuariosDelArea.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {u.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {tipo === "RESPONSABLE_REGISTRO" && (
              <p className="text-[11px] text-slate-500">
                No requiere selección — se resuelve del registro que dispare el evento.
              </p>
            )}

            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5"
              disabled={guardando}
              onClick={handleAgregar}
            >
              <UserPlus className="h-3.5 w-3.5" /> Agregar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
