import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Plus,
  Trash2,
  Lock,
  ChevronDown,
  ChevronRight,
  Users,
  Globe2,
  Building2,
} from "lucide-react";
import { toast } from "sonner";

import { fetchAuth } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { usePermisosCatalogo, type PermisoCatalogo } from "@/hooks/use-permisos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/configuracion/roles")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.ROLES_VER),
  component: RolesConfigPage,
});

interface RolApi {
  id: string;
  nombre: string;
  descripcion: string | null;
  esSistema: boolean;
  activo: boolean;
  alcance: "GENERAL" | "TENANT";
  permisos: string[];
  usuariosAsignados: number;
}

function RolesConfigPage() {
  const { user: sesion } = useSession();
  const puedeCrear = hasPermission(sesion, PERMISOS_SISTEMA.ROLES_CREAR);
  const puedeEditar = hasPermission(sesion, PERMISOS_SISTEMA.ROLES_EDITAR);
  const puedeAsignarPermisos = hasPermission(sesion, PERMISOS_SISTEMA.ROLES_ASIGNAR_PERMISOS);
  const puedeEliminar = hasPermission(sesion, PERMISOS_SISTEMA.ROLES_ELIMINAR);

  // Catálogo real (backend, Permiso), no la lista hardcodeada: así un
  // permiso creado en Configuración > Permisos aparece aquí para asignar sin
  // necesidad de un deploy. Solo se ofrecen los activos.
  const { permisos: catalogoPermisos } = usePermisosCatalogo();
  const permisosAsignables = catalogoPermisos.filter((p) => p.activo);
  const permisosPorCodigo = useMemo(
    () => new Map(permisosAsignables.map((p) => [p.codigo, p])),
    [permisosAsignables],
  );

  // Agrupa Módulo → Sección → Ver/Gestionar/Especiales a partir de
  // `jerarquia` (server/src/lib/catalogo-permisos.ts) — no de la columna
  // `modulo` (agrupador plano/legacy, ver serializar() en
  // permisos.controller.ts). Los permisos personalizados del tenant (sin
  // jerarquia) se agrupan aparte, por su `modulo` libre.
  const gruposModulo = useMemo(() => {
    interface SeccionGrupo {
      clave: string;
      nombre: string;
      ver?: PermisoCatalogo;
      gestionar?: PermisoCatalogo;
      especiales: PermisoCatalogo[];
    }
    interface ModuloGrupo {
      clave: string;
      nombre: string;
      secciones: Map<string, SeccionGrupo>;
      sueltos: PermisoCatalogo[];
    }
    const modulos = new Map<string, ModuloGrupo>();

    for (const p of permisosAsignables) {
      if (!p.jerarquia) {
        const clave = `__custom__${p.modulo}`;
        if (!modulos.has(clave)) {
          modulos.set(clave, { clave, nombre: p.modulo, secciones: new Map(), sueltos: [] });
        }
        modulos.get(clave)!.sueltos.push(p);
        continue;
      }
      const { moduloClave, moduloNombre, seccionClave, seccionNombre, tipo } = p.jerarquia;
      if (!modulos.has(moduloClave)) {
        modulos.set(moduloClave, {
          clave: moduloClave,
          nombre: moduloNombre,
          secciones: new Map(),
          sueltos: [],
        });
      }
      const modulo = modulos.get(moduloClave)!;
      if (!modulo.secciones.has(seccionClave)) {
        modulo.secciones.set(seccionClave, {
          clave: seccionClave,
          nombre: seccionNombre,
          especiales: [],
        });
      }
      const seccion = modulo.secciones.get(seccionClave)!;
      if (tipo === "ver") seccion.ver = p;
      else if (tipo === "gestionar") seccion.gestionar = p;
      else seccion.especiales.push(p);
    }

    return Array.from(modulos.values()).map((m) => ({
      ...m,
      secciones: Array.from(m.secciones.values()),
    }));
  }, [permisosAsignables]);

  const [roles, setRoles] = useState<RolApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [nuevoAlcance, setNuevoAlcance] = useState<"GENERAL" | "TENANT">("TENANT");

  const fetchRoles = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/roles");
      setRoles(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando roles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;
    try {
      await fetchAuth("/roles", {
        method: "POST",
        body: JSON.stringify({
          nombre: nuevoNombre.trim(),
          descripcion: nuevaDescripcion.trim(),
          permisos: [],
          alcance: nuevoAlcance,
        }),
      });
      setNuevoNombre("");
      setNuevaDescripcion("");
      setNuevoAlcance("TENANT");
      setCreando(false);
      fetchRoles();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear el rol.");
    }
  };

  /**
   * Además de marcar/desmarcar, mantiene consistente la dependencia
   * VER ⊂ Gestionar/Especial (server/src/lib/catalogo-permisos.ts,
   * `exigeVer`): activar un permiso que depende de otro activa también ese
   * otro; desactivar un VER del que dependen otros permisos ya marcados los
   * desactiva en cascada — el backend igual la exige por su cuenta
   * (`requirePermission` expande prerrequisitos), esto es solo para que la
   * matriz nunca muestre una casilla marcada sin sentido funcional real.
   */
  const handleTogglePermiso = async (rol: RolApi, codigo: string) => {
    const activando = !rol.permisos.includes(codigo);
    let permisos: string[];

    if (activando) {
      const dependeDe = permisosPorCodigo.get(codigo)?.jerarquia?.dependeDe;
      permisos = [...new Set([...rol.permisos, codigo, ...(dependeDe ? [dependeDe] : [])])];
    } else {
      const dependientes = permisosAsignables
        .filter((p) => p.jerarquia?.dependeDe === codigo && rol.permisos.includes(p.codigo))
        .map((p) => p.codigo);
      const aQuitar = new Set([codigo, ...dependientes]);
      permisos = rol.permisos.filter((p) => !aQuitar.has(p));
      if (dependientes.length > 0) {
        toast.info(
          `Al quitar "Ver" también se quitaron ${dependientes.length} permiso(s) que dependían de él.`,
        );
      }
    }

    // Optimista, luego confirmado por el servidor
    setRoles((prev) => prev.map((r) => (r.id === rol.id ? { ...r, permisos } : r)));
    try {
      await fetchAuth(`/roles/${rol.id}`, { method: "PATCH", body: JSON.stringify({ permisos }) });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar permisos.");
      fetchRoles();
    }
  };

  const handleToggleActivo = async (rol: RolApi) => {
    try {
      await fetchAuth(`/roles/${rol.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !rol.activo }),
      });
      fetchRoles();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el rol.");
    }
  };

  const handleCambiarAlcance = async (rol: RolApi) => {
    const nuevo = rol.alcance === "GENERAL" ? "TENANT" : "GENERAL";
    const mensaje =
      nuevo === "GENERAL"
        ? `¿Convertir "${rol.nombre}" en GENERAL? Quedará disponible para asignar en todas las empresas.`
        : `¿Convertir "${rol.nombre}" en exclusivo de esta empresa? Se bloqueará si ya está asignado en otra empresa.`;
    if (!confirm(mensaje)) return;
    try {
      await fetchAuth(`/roles/${rol.id}`, {
        method: "PATCH",
        body: JSON.stringify({ alcance: nuevo }),
      });
      fetchRoles();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cambiar el alcance del rol.");
    }
  };

  const handleEliminar = async (rol: RolApi) => {
    if (!confirm(`¿Eliminar el rol "${rol.nombre}"?`)) return;
    try {
      await fetchAuth(`/roles/${rol.id}`, { method: "DELETE" });
      fetchRoles();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar el rol.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            Roles y Permisos
          </h1>
          <p className="text-sm text-slate-500">
            Define qué puede hacer cada rol dentro de RicoSoft.
          </p>
        </div>
        {puedeCrear && (
          <Button size="sm" onClick={() => setCreando((c) => !c)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nuevo rol
          </Button>
        )}
      </div>

      {creando && (
        <form
          onSubmit={handleCrear}
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-3"
        >
          <Input
            required
            placeholder="Nombre del rol"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Descripción (opcional)"
            value={nuevaDescripcion}
            onChange={(e) => setNuevaDescripcion(e.target.value)}
            className="flex-1"
          />
          <div className="flex items-center gap-3 text-xs text-slate-600 shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="alcance-rol"
                checked={nuevoAlcance === "TENANT"}
                onChange={() => setNuevoAlcance("TENANT")}
                className="accent-blue-600"
              />
              Solo esta empresa
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="alcance-rol"
                checked={nuevoAlcance === "GENERAL"}
                onChange={() => setNuevoAlcance("GENERAL")}
                className="accent-blue-600"
              />
              General
            </label>
          </div>
          <Button type="submit" variant="success">
            Crear
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      <div className="space-y-3">
        {loading && roles.length === 0 && (
          <p className="text-sm text-slate-500">Cargando roles...</p>
        )}
        {roles.map((rol) => (
          <div
            key={rol.id}
            className="border border-slate-200 rounded-lg bg-white shadow-2xs overflow-hidden"
          >
            <button
              onClick={() => setExpandido(expandido === rol.id ? null : rol.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {expandido === rol.id ? (
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{rol.nombre}</span>
                    {rol.esSistema && (
                      <Badge variant="outline" className="gap-1 text-slate-500">
                        <Lock className="h-3 w-3" /> Rol de sistema
                      </Badge>
                    )}
                    {rol.alcance === "GENERAL" ? (
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
                    {rol.activo ? (
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
                  </div>
                  {rol.descripcion && (
                    <p className="text-xs text-slate-500 mt-0.5">{rol.descripcion}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" /> {rol.usuariosAsignados}
                </span>
                <span className="text-xs text-slate-500">{rol.permisos.length} permisos</span>
                {puedeEditar && !rol.esSistema && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleActivo(rol);
                    }}
                    className="h-7 text-[11px] font-bold"
                  >
                    {rol.activo ? "Desactivar" : "Activar"}
                  </Button>
                )}
                {puedeEditar && !rol.esSistema && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCambiarAlcance(rol);
                    }}
                    className="h-7 text-[11px] font-bold"
                  >
                    {rol.alcance === "GENERAL" ? "Hacer exclusivo" : "Hacer general"}
                  </Button>
                )}
                {puedeEliminar && !rol.esSistema && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEliminar(rol);
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
                    title="Eliminar rol"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </button>

            {expandido === rol.id && (
              <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50/60">
                {rol.esSistema ? (
                  <p className="text-xs text-slate-500">
                    Los permisos de los roles de sistema no pueden modificarse.
                  </p>
                ) : !puedeAsignarPermisos ? (
                  <p className="text-xs text-slate-500">
                    No tienes permiso para modificar la matriz de este rol.
                  </p>
                ) : (
                  gruposModulo.map((modulo) => (
                    <div key={modulo.clave}>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">
                        {modulo.nombre}
                      </p>
                      <div className="space-y-3">
                        {modulo.secciones.map((seccion) => (
                          <div
                            key={seccion.clave}
                            className="rounded-md border border-slate-200 bg-white p-2.5"
                          >
                            <p className="text-xs font-semibold text-slate-700 mb-1.5">
                              {seccion.nombre}
                            </p>
                            <div className="grid sm:grid-cols-2 gap-2">
                              {[seccion.ver, seccion.gestionar].filter(Boolean).map((p) => (
                                <label
                                  key={p!.id}
                                  className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={rol.permisos.includes(p!.codigo)}
                                    onChange={() => handleTogglePermiso(rol, p!.codigo)}
                                    className="mt-0.5 accent-blue-600"
                                  />
                                  <span>
                                    <span className="font-medium text-slate-800">
                                      {p!.jerarquia
                                        ? p!.jerarquia.accion === "ver"
                                          ? "Ver"
                                          : "Gestionar"
                                        : p!.nombre}
                                    </span>
                                    <span className="block text-slate-500">{p!.descripcion}</span>
                                  </span>
                                </label>
                              ))}
                            </div>
                            {seccion.especiales.length > 0 && (
                              <div className="mt-2 border-t border-slate-100 pt-2 grid sm:grid-cols-2 gap-2">
                                {seccion.especiales.map((p) => (
                                  <label
                                    key={p.id}
                                    className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={rol.permisos.includes(p.codigo)}
                                      onChange={() => handleTogglePermiso(rol, p.codigo)}
                                      className="mt-0.5 accent-amber-600"
                                    />
                                    <span>
                                      <span className="font-medium text-slate-800">
                                        {p.jerarquia
                                          ? p.jerarquia.accion.charAt(0).toUpperCase() +
                                            p.jerarquia.accion.slice(1)
                                          : p.nombre}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="ml-1.5 h-4 px-1 text-[9px] align-middle"
                                      >
                                        especial
                                      </Badge>
                                      <span className="block text-slate-500">{p.descripcion}</span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {modulo.sueltos.length > 0 && (
                          <div className="grid sm:grid-cols-2 gap-2">
                            {modulo.sueltos.map((p) => (
                              <label
                                key={p.id}
                                className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={rol.permisos.includes(p.codigo)}
                                  onChange={() => handleTogglePermiso(rol, p.codigo)}
                                  className="mt-0.5 accent-blue-600"
                                />
                                <span>
                                  <span className="font-medium text-slate-800">{p.nombre}</span>
                                  <span className="block text-slate-500">{p.descripcion}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
