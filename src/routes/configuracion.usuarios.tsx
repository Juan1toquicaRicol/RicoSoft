import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Users,
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Shield,
  Eye,
  Trash2,
  UserPlus,
  Building2,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import { fetchAuth } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { validarPasswordSegura } from "@/lib/password";
import { esDominioCorporativoValido } from "@/lib/dominios";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OPCION_SIN_AGRUPAR, SelectorAgrupacion } from "@/components/ui/selector-agrupacion";
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

// Declaración indispensable para TanStack Router
export const Route = createFileRoute("/configuracion/usuarios")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.USUARIOS_VER),
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
  origen: "NATIVO" | "MEMBRESIA";
  empresaOrigen: string | null;
}

interface RolOpcion {
  id: string;
  nombre: string;
  activo: boolean;
}

interface DepartamentoOpcion {
  id: string;
  nombre: string;
}

interface TenantOpcion {
  id: string;
  nombre: string;
  subdomain: string;
}

interface MembresiaApi {
  id: string;
  activo: boolean;
  isSuperadmin: boolean;
  tenant: { id: string; nombre: string };
  rolRel: { id: string; nombre: string } | null;
  departamentoId: string | null;
  departamento: { id: string; nombre: string } | null;
}

function UsuariosConfigPage() {
  const { user: sesion } = useSession();
  const puedeDesactivar = hasPermission(sesion, PERMISOS_SISTEMA.USUARIOS_DESACTIVAR);
  const puedeCambiarRol = hasPermission(sesion, PERMISOS_SISTEMA.USUARIOS_CAMBIAR_ROL);
  const puedeCambiarDepartamento = hasPermission(
    sesion,
    PERMISOS_SISTEMA.USUARIOS_CAMBIAR_DEPARTAMENTO,
  );
  const puedeEditar = hasPermission(sesion, PERMISOS_SISTEMA.USUARIOS_EDITAR);
  const puedeResetearPassword = hasPermission(sesion, PERMISOS_SISTEMA.USUARIOS_RESET_PASSWORD);
  const puedeEliminar = hasPermission(sesion, PERMISOS_SISTEMA.USUARIOS_ELIMINAR);
  const puedeCrear = hasPermission(sesion, PERMISOS_SISTEMA.USUARIOS_CREAR);
  const puedeGestionar = puedeEditar || puedeResetearPassword || puedeEliminar;

  const [usuarios, setUsuarios] = useState<UsuarioApi[]>([]);
  const [roles, setRoles] = useState<RolOpcion[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoOpcion[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cambiandoRolId, setCambiandoRolId] = useState<string | null>(null);
  const [cambiandoDepartamentoId, setCambiandoDepartamentoId] = useState<string | null>(null);

  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioApi | null>(null);
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarNuevaPassword, setConfirmarNuevaPassword] = useState("");
  const [guardandoEmail, setGuardandoEmail] = useState(false);
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [errorModal, setErrorModal] = useState("");
  const [okModal, setOkModal] = useState("");
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<UsuarioApi | null>(null);
  const [creandoUsuario, setCreandoUsuario] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState({
    nombres: "",
    apellidos: "",
    email: "",
    password: "",
    departamentoId: "",
    rolId: "",
  });
  const [guardandoNuevoUsuario, setGuardandoNuevoUsuario] = useState(false);
  const [errorNuevoUsuario, setErrorNuevoUsuario] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [cambiandoSuperadmin, setCambiandoSuperadmin] = useState(false);
  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);

  // Gestión de acceso a otras empresas (solo visible/usable para superadmin)
  const [tenants, setTenants] = useState<TenantOpcion[]>([]);
  const [membresias, setMembresias] = useState<MembresiaApi[]>([]);
  const [cargandoMembresias, setCargandoMembresias] = useState(false);
  const [nuevaMembresiaTenantId, setNuevaMembresiaTenantId] = useState("");
  const [rolesTenantElegido, setRolesTenantElegido] = useState<RolOpcion[]>([]);
  const [departamentosTenantElegido, setDepartamentosTenantElegido] = useState<
    DepartamentoOpcion[]
  >([]);
  const [nuevaMembresiaRolId, setNuevaMembresiaRolId] = useState("");
  const [nuevaMembresiaDepartamentoId, setNuevaMembresiaDepartamentoId] = useState("");
  const [nuevaMembresiaSuperadmin, setNuevaMembresiaSuperadmin] = useState(false);
  const [guardandoMembresia, setGuardandoMembresia] = useState(false);
  const [eliminandoMembresiaId, setEliminandoMembresiaId] = useState<string | null>(null);

  // Edición inline (rol/departamento) de una membresía YA existente — sin
  // esto, la única forma de corregir el rol/departamento de un acceso ya
  // otorgado era eliminarlo y volver a crearlo desde cero (H2).
  const [editandoMembresiaId, setEditandoMembresiaId] = useState<string | null>(null);
  const [editMembresiaRolId, setEditMembresiaRolId] = useState("");
  const [editMembresiaDepartamentoId, setEditMembresiaDepartamentoId] = useState("");
  const [editMembresiaRoles, setEditMembresiaRoles] = useState<RolOpcion[]>([]);
  const [editMembresiaDepartamentos, setEditMembresiaDepartamentos] = useState<
    DepartamentoOpcion[]
  >([]);
  const [guardandoEdicionMembresia, setGuardandoEdicionMembresia] = useState(false);

  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "departamento":
        return (u: UsuarioApi) => u.departamento?.nombre ?? "Sin departamento";
      case "rol":
        return (u: UsuarioApi) => u.rolRel?.nombre ?? "Sin rol";
      case "estado":
        return (u: UsuarioApi) => (u.activo ? "Activo" : "Inactivo");
      default:
        return null;
    }
  }, [agrupacion]);

  const gruposUsuarios = useMemo(
    () => agruparFilas(usuarios, claveDeAgrupacion),
    [usuarios, claveDeAgrupacion],
  );

  const abrirEdicion = (u: UsuarioApi) => {
    setUsuarioEditando(u);
    setNuevoEmail(u.email);
    setNuevaPassword("");
    setConfirmarNuevaPassword("");
    setErrorModal("");
    setOkModal("");
    setMembresias([]);
    setNuevaMembresiaTenantId("");
    setNuevaMembresiaRolId("");
    setNuevaMembresiaDepartamentoId("");
    setNuevaMembresiaSuperadmin(false);
    setRolesTenantElegido([]);
    setDepartamentosTenantElegido([]);
    setEditandoMembresiaId(null);
    if (sesion?.isSuperadmin) {
      fetchMembresias(u.id);
      if (tenants.length === 0) fetchTenants();
    }
  };

  const fetchTenants = async () => {
    try {
      const data = await fetchAuth("/membresias/tenants");
      setTenants(Array.isArray(data) ? data : []);
    } catch {
      // Selector secundario; si falla, simplemente no se ofrece.
    }
  };

  const fetchMembresias = async (userId: string) => {
    setCargandoMembresias(true);
    try {
      const data = await fetchAuth(`/membresias/usuarios/${userId}`);
      setMembresias(Array.isArray(data.membresias) ? data.membresias : []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cargar las empresas del usuario.");
    } finally {
      setCargandoMembresias(false);
    }
  };

  const handleElegirTenantNuevaMembresia = async (tenantId: string) => {
    setNuevaMembresiaTenantId(tenantId);
    setNuevaMembresiaRolId("");
    setNuevaMembresiaDepartamentoId("");
    setRolesTenantElegido([]);
    setDepartamentosTenantElegido([]);
    if (!tenantId) return;
    try {
      const [roles, deptos] = await Promise.all([
        fetchAuth(`/membresias/tenants/${tenantId}/roles`),
        fetchAuth(`/membresias/tenants/${tenantId}/departamentos`),
      ]);
      setRolesTenantElegido(Array.isArray(roles) ? roles : []);
      setDepartamentosTenantElegido(Array.isArray(deptos) ? deptos : []);
    } catch {
      // Selectores secundarios; si fallan, se puede seguir sin rol/departamento o con superadmin.
    }
  };

  const handleAgregarMembresia = async () => {
    if (!usuarioEditando || !nuevaMembresiaTenantId) return;
    setGuardandoMembresia(true);
    try {
      await fetchAuth(`/membresias/usuarios/${usuarioEditando.id}`, {
        method: "POST",
        body: JSON.stringify({
          tenantId: nuevaMembresiaTenantId,
          rolId: nuevaMembresiaSuperadmin ? null : nuevaMembresiaRolId || null,
          departamentoId: nuevaMembresiaDepartamentoId || null,
          isSuperadmin: nuevaMembresiaSuperadmin,
        }),
      });
      toast.success("Acceso otorgado correctamente.");
      setNuevaMembresiaTenantId("");
      setNuevaMembresiaRolId("");
      setNuevaMembresiaDepartamentoId("");
      setNuevaMembresiaSuperadmin(false);
      setRolesTenantElegido([]);
      setDepartamentosTenantElegido([]);
      fetchMembresias(usuarioEditando.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al otorgar el acceso.");
    } finally {
      setGuardandoMembresia(false);
    }
  };

  const handleAbrirEdicionMembresia = async (m: MembresiaApi) => {
    setEditandoMembresiaId(m.id);
    setEditMembresiaRolId(m.rolRel?.id ?? "");
    setEditMembresiaDepartamentoId(m.departamentoId ?? "");
    setEditMembresiaRoles([]);
    setEditMembresiaDepartamentos([]);
    try {
      const [roles, deptos] = await Promise.all([
        fetchAuth(`/membresias/tenants/${m.tenant.id}/roles`),
        fetchAuth(`/membresias/tenants/${m.tenant.id}/departamentos`),
      ]);
      setEditMembresiaRoles(Array.isArray(roles) ? roles : []);
      setEditMembresiaDepartamentos(Array.isArray(deptos) ? deptos : []);
    } catch {
      // Selectores secundarios; si fallan, se puede seguir sin cambiar rol/departamento.
    }
  };

  const handleGuardarEdicionMembresia = async () => {
    if (!usuarioEditando || !editandoMembresiaId) return;
    setGuardandoEdicionMembresia(true);
    try {
      await fetchAuth(`/membresias/${editandoMembresiaId}`, {
        method: "PATCH",
        body: JSON.stringify({
          rolId: editMembresiaRolId || null,
          departamentoId: editMembresiaDepartamentoId || null,
        }),
      });
      toast.success("Acceso actualizado correctamente.");
      setEditandoMembresiaId(null);
      fetchMembresias(usuarioEditando.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el acceso.");
    } finally {
      setGuardandoEdicionMembresia(false);
    }
  };

  const handleToggleMembresia = async (m: MembresiaApi) => {
    if (!usuarioEditando) return;
    try {
      await fetchAuth(`/membresias/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !m.activo }),
      });
      fetchMembresias(usuarioEditando.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el acceso.");
    }
  };

  const handleEliminarMembresia = async (m: MembresiaApi) => {
    if (!usuarioEditando) return;
    setEliminandoMembresiaId(m.id);
    try {
      await fetchAuth(`/membresias/${m.id}`, { method: "DELETE" });
      toast.success(`Acceso a ${m.tenant.nombre} eliminado.`);
      fetchMembresias(usuarioEditando.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al quitar el acceso.");
    } finally {
      setEliminandoMembresiaId(null);
    }
  };

  // Los usuarios listados aquí siempre son del tenant del propio superadmin
  // (listarUsuarios está limitado a su tenant), así que ese es el "hogar" a
  // excluir del selector — junto con los tenants donde ya tiene membresía.
  const tenantsDisponiblesParaMembresia = tenants.filter(
    (t) => t.id !== sesion?.tenantId && !membresias.some((m) => m.tenant.id === t.id),
  );

  const handleGuardarEmail = async () => {
    if (!usuarioEditando) return;
    setGuardandoEmail(true);
    setErrorModal("");
    setOkModal("");
    try {
      await fetchAuth(`/usuarios/${usuarioEditando.id}/email`, {
        method: "PATCH",
        body: JSON.stringify({ email: nuevoEmail }),
      });
      setOkModal("Correo electrónico actualizado.");
      fetchUsuarios();
    } catch (err: unknown) {
      setErrorModal(err instanceof Error ? err.message : "Error al cambiar el correo electrónico.");
    } finally {
      setGuardandoEmail(false);
    }
  };

  const handleResetearPassword = async () => {
    if (!usuarioEditando) return;
    if (nuevaPassword.length < 8) {
      setErrorModal("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (nuevaPassword !== confirmarNuevaPassword) {
      setErrorModal("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setGuardandoPassword(true);
    setErrorModal("");
    setOkModal("");
    try {
      await fetchAuth(`/usuarios/${usuarioEditando.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ passwordNueva: nuevaPassword }),
      });
      setOkModal("Contraseña restablecida.");
      setNuevaPassword("");
      setConfirmarNuevaPassword("");
    } catch (err: unknown) {
      setErrorModal(err instanceof Error ? err.message : "Error al restablecer la contraseña.");
    } finally {
      setGuardandoPassword(false);
    }
  };

  const handleCambiarSuperadmin = async (nuevoValor: boolean) => {
    if (!usuarioEditando) return;
    setCambiandoSuperadmin(true);
    setErrorModal("");
    try {
      await fetchAuth(`/usuarios/${usuarioEditando.id}/superadmin`, {
        method: "PATCH",
        body: JSON.stringify({ isSuperadmin: nuevoValor }),
      });
      setUsuarioEditando({ ...usuarioEditando, isSuperadmin: nuevoValor });
      fetchUsuarios();
      toast.success(nuevoValor ? "Ahora es superadministrador." : "Ya no es superadministrador.");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al cambiar el estado de superadministrador.",
      );
    } finally {
      setCambiandoSuperadmin(false);
    }
  };

  const handleEliminarUsuario = async () => {
    if (!usuarioAEliminar) return;
    setEliminando(true);
    try {
      await fetchAuth(`/usuarios/${usuarioAEliminar.id}`, { method: "DELETE" });
      setUsuarioAEliminar(null);
      setUsuarioEditando(null);
      fetchUsuarios();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar el usuario.");
    } finally {
      setEliminando(false);
    }
  };

  const fetchUsuarios = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/usuarios?search=${encodeURIComponent(search)}`);
      setUsuarios(data.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando usuarios.");
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const data = await fetchAuth("/roles");
      setRoles(
        Array.isArray(data)
          ? data.map((r: RolOpcion) => ({ id: r.id, nombre: r.nombre, activo: r.activo }))
          : [],
      );
    } catch {
      // El catálogo de roles es secundario; si falla, simplemente no se ofrece el selector.
    }
  };

  const fetchDepartamentos = async () => {
    try {
      const data = await fetchAuth("/departamentos");
      setDepartamentos(
        Array.isArray(data)
          ? data.map((d: DepartamentoOpcion) => ({ id: d.id, nombre: d.nombre }))
          : [],
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
    if (puedeCambiarRol || puedeCrear) fetchRoles();
  }, [puedeCambiarRol, puedeCrear]);

  useEffect(() => {
    if (puedeCambiarDepartamento || puedeCrear) fetchDepartamentos();
  }, [puedeCambiarDepartamento, puedeCrear]);

  const rolesActivos = roles.filter((r) => r.activo);

  const handleToggleEstado = async (id: string, nuevoEstado: boolean) => {
    try {
      await fetchAuth(`/usuarios/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ activo: nuevoEstado }),
      });
      fetchUsuarios();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cambiar estado");
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al asignar el rol");
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al asignar el departamento");
    } finally {
      setCambiandoDepartamentoId(null);
    }
  };

  const abrirCreacion = () => {
    setNuevoUsuario({
      nombres: "",
      apellidos: "",
      email: "",
      password: "",
      departamentoId: "",
      rolId: "",
    });
    setErrorNuevoUsuario("");
    setCreandoUsuario(true);
  };

  const handleCrearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNuevoUsuario("");

    if (!nuevoUsuario.nombres.trim() || !nuevoUsuario.apellidos.trim()) {
      setErrorNuevoUsuario("Los nombres y los apellidos son obligatorios.");
      return;
    }
    if (!esDominioCorporativoValido(nuevoUsuario.email)) {
      setErrorNuevoUsuario("Solo se permiten correos corporativos autorizados.");
      return;
    }
    const errorPassword = validarPasswordSegura(nuevoUsuario.password);
    if (errorPassword) {
      setErrorNuevoUsuario(errorPassword);
      return;
    }

    setGuardandoNuevoUsuario(true);
    try {
      await fetchAuth("/usuarios", {
        method: "POST",
        body: JSON.stringify({
          nombres: nuevoUsuario.nombres.trim(),
          apellidos: nuevoUsuario.apellidos.trim(),
          email: nuevoUsuario.email.trim(),
          password: nuevoUsuario.password,
          departamentoId: nuevoUsuario.departamentoId || null,
          rolId: nuevoUsuario.rolId || null,
        }),
      });
      toast.success(
        `Usuario "${nuevoUsuario.nombres.trim()} ${nuevoUsuario.apellidos.trim()}" creado correctamente.`,
      );
      setCreandoUsuario(false);
      fetchUsuarios();
    } catch (err: unknown) {
      setErrorNuevoUsuario(err instanceof Error ? err.message : "Error al crear el usuario.");
    } finally {
      setGuardandoNuevoUsuario(false);
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
        <div className="flex items-center gap-2">
          {puedeCrear && (
            <Button size="sm" onClick={abrirCreacion} className="gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> Nuevo usuario
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={fetchUsuarios} title="Actualizar datos">
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre o correo electrónico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <SelectorAgrupacion
          value={agrupacion}
          onChange={setAgrupacion}
          opciones={[
            OPCION_SIN_AGRUPAR,
            { value: "departamento", label: "Departamento" },
            { value: "rol", label: "Rol" },
            { value: "estado", label: "Estado" },
          ]}
        />
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
              gruposUsuarios.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && (
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableCell
                        colSpan={5}
                        className="text-[11px] font-bold uppercase tracking-wider text-slate-500"
                      >
                        {grupo.clave}{" "}
                        <span className="font-normal text-slate-400">({grupo.filas.length})</span>
                      </TableCell>
                    </TableRow>
                  )}
                  {grupo.filas.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium text-slate-800 flex items-center gap-2">
                          {u.nombre}
                          {u.isSuperadmin && (
                            <Badge
                              variant="outline"
                              className="border-transparent bg-slate-900 text-white gap-1"
                            >
                              <Shield className="h-3 w-3" /> Superadmin
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {u.origen === "MEMBRESIA" ? (
                          u.departamento?.nombre || "Sin departamento"
                        ) : puedeCambiarDepartamento ? (
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
                        ) : u.origen === "MEMBRESIA" ? (
                          <Badge variant="secondary">{u.rolRel?.nombre || "Sin rol"}</Badge>
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
                              {rolesActivos.map((r) => (
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
                          <Badge
                            className="border-blue-200 bg-blue-50 text-blue-800 gap-1"
                            variant="outline"
                          >
                            <UserCheck className="h-3 w-3" /> Activo
                          </Badge>
                        ) : (
                          <Badge
                            className="border-transparent bg-slate-900 text-white gap-1"
                            variant="outline"
                          >
                            <UserX className="h-3 w-3" /> Inactivo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {u.origen === "MEMBRESIA" ? (
                            <span
                              className="text-xs text-slate-400"
                              title={`Esta cuenta se gestiona desde ${u.empresaOrigen}, su empresa hogar.`}
                            >
                              Gestionar desde {u.empresaOrigen}
                            </span>
                          ) : (
                            <>
                              {puedeGestionar && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Ver / editar usuario"
                                  onClick={() => abrirEdicion(u)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              {puedeDesactivar && !u.isSuperadmin ? (
                                <Button
                                  size="sm"
                                  variant={u.activo ? "destructive" : "success"}
                                  onClick={() => handleToggleEstado(u.id, !u.activo)}
                                >
                                  {u.activo ? "Desactivar" : "Activar"}
                                </Button>
                              ) : (
                                !puedeGestionar && <span className="text-xs text-slate-400">—</span>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!usuarioEditando} onOpenChange={(open) => !open && setUsuarioEditando(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              {usuarioEditando?.nombre} · {usuarioEditando?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {errorModal && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>{errorModal}</AlertDescription>
              </Alert>
            )}
            {okModal && (
              <Alert variant="info">
                <CheckCircle2 />
                <AlertDescription>{okModal}</AlertDescription>
              </Alert>
            )}

            {puedeEditar && (
              <div className="space-y-2">
                <Label htmlFor="usuario-email">Correo electrónico</Label>
                <div className="flex gap-2">
                  <Input
                    id="usuario-email"
                    type="email"
                    value={nuevoEmail}
                    onChange={(e) => setNuevoEmail(e.target.value)}
                  />
                  <Button onClick={handleGuardarEmail} disabled={guardandoEmail}>
                    {guardandoEmail ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </div>
            )}

            {puedeResetearPassword && (
              <div className="space-y-2">
                <Label htmlFor="usuario-password">Nueva contraseña</Label>
                <Input
                  id="usuario-password"
                  type="password"
                  placeholder="Mín. 8 caract., mayúscula, minúscula y número"
                  value={nuevaPassword}
                  onChange={(e) => setNuevaPassword(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Confirmar nueva contraseña"
                  value={confirmarNuevaPassword}
                  onChange={(e) => setConfirmarNuevaPassword(e.target.value)}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleResetearPassword}
                  disabled={guardandoPassword}
                >
                  {guardandoPassword ? "Restableciendo..." : "Restablecer contraseña"}
                </Button>
              </div>
            )}

            {sesion?.isSuperadmin && (
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  <Label className="text-sm font-semibold text-slate-700">
                    Acceso a otras empresas
                  </Label>
                </div>

                {cargandoMembresias ? (
                  <p className="text-xs text-slate-400">Cargando...</p>
                ) : membresias.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Este usuario solo tiene acceso a su empresa (no tiene membresías adicionales).
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {membresias.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-md border border-slate-200 px-2.5 py-1.5 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">
                              {m.tenant.nombre}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {m.isSuperadmin ? "Superadmin" : (m.rolRel?.nombre ?? "Sin rol")}
                              {" · "}
                              {m.departamento?.nombre ?? "Sin departamento propio"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant={m.activo ? "outline" : "success"}
                              className="h-7 text-[11px] px-2"
                              onClick={() => handleToggleMembresia(m)}
                            >
                              {m.activo ? "Activo" : "Inactivo"}
                            </Button>
                            {!m.isSuperadmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2"
                                onClick={() =>
                                  editandoMembresiaId === m.id
                                    ? setEditandoMembresiaId(null)
                                    : handleAbrirEdicionMembresia(m)
                                }
                              >
                                {editandoMembresiaId === m.id ? "Cancelar" : "Editar"}
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Quitar acceso"
                              disabled={eliminandoMembresiaId === m.id}
                              onClick={() => handleEliminarMembresia(m)}
                            >
                              <X className="h-3.5 w-3.5 text-slate-500" />
                            </Button>
                          </div>
                        </div>

                        {editandoMembresiaId === m.id && (
                          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                            <Select
                              value={editMembresiaRolId || "__sin_rol__"}
                              onValueChange={(v) =>
                                setEditMembresiaRolId(v === "__sin_rol__" ? "" : v)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Sin rol" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__sin_rol__">Sin rol asignado</SelectItem>
                                {editMembresiaRoles.map((r) => (
                                  <SelectItem key={r.id} value={r.id}>
                                    {r.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={editMembresiaDepartamentoId || "__sin_departamento__"}
                              onValueChange={(v) =>
                                setEditMembresiaDepartamentoId(
                                  v === "__sin_departamento__" ? "" : v,
                                )
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Sin departamento" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__sin_departamento__">
                                  Sin departamento propio
                                </SelectItem>
                                {editMembresiaDepartamentos.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>
                                    {d.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              className="col-span-2 h-8 text-xs"
                              disabled={guardandoEdicionMembresia}
                              onClick={handleGuardarEdicionMembresia}
                            >
                              {guardandoEdicionMembresia ? "Guardando..." : "Guardar cambios"}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {tenantsDisponiblesParaMembresia.length > 0 && (
                  <div className="rounded-md bg-slate-50 border border-slate-200 p-2.5 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-600">
                      Dar acceso a otra empresa
                    </p>
                    <Select
                      value={nuevaMembresiaTenantId}
                      onValueChange={handleElegirTenantNuevaMembresia}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Elige una empresa..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tenantsDisponiblesParaMembresia.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {nuevaMembresiaTenantId && !nuevaMembresiaSuperadmin && (
                      <Select
                        value={nuevaMembresiaRolId || "__sin_rol__"}
                        onValueChange={(v) => setNuevaMembresiaRolId(v === "__sin_rol__" ? "" : v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Sin rol" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__sin_rol__">
                            Sin rol (sin permisos hasta asignar uno)
                          </SelectItem>
                          {rolesTenantElegido.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {nuevaMembresiaTenantId && (
                      <Select
                        value={nuevaMembresiaDepartamentoId || "__sin_departamento__"}
                        onValueChange={(v) =>
                          setNuevaMembresiaDepartamentoId(v === "__sin_departamento__" ? "" : v)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Sin departamento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__sin_departamento__">
                            Sin departamento propio en esa empresa
                          </SelectItem>
                          {departamentosTenantElegido.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={nuevaMembresiaSuperadmin}
                        onChange={(e) => setNuevaMembresiaSuperadmin(e.target.checked)}
                      />
                      Dar acceso total (superadmin) en esa empresa
                    </label>

                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      disabled={!nuevaMembresiaTenantId || guardandoMembresia}
                      onClick={handleAgregarMembresia}
                    >
                      {guardandoMembresia ? "Guardando..." : "Dar acceso"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {sesion?.isSuperadmin && usuarioEditando && usuarioEditando.id !== sesion.id && (
              <div className="border-t border-slate-200 pt-4">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={usuarioEditando.isSuperadmin}
                    disabled={cambiandoSuperadmin}
                    onChange={(e) => handleCambiarSuperadmin(e.target.checked)}
                  />
                  Superadministrador (acceso total a esta empresa)
                </label>
              </div>
            )}

            {puedeEliminar && (
              <div className="border-t border-slate-200 pt-4">
                <Button
                  variant="destructive"
                  className="w-full gap-2"
                  onClick={() => usuarioEditando && setUsuarioAEliminar(usuarioEditando)}
                >
                  <Trash2 className="h-4 w-4" /> Eliminar usuario
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUsuarioEditando(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!usuarioAEliminar}
        onOpenChange={(open) => !open && setUsuarioAEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {usuarioAEliminar?.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. Si el usuario tiene historial asociado (auditoría,
              facturas, solicitudes u otros registros), esos registros se conservan pero quedan
              desvinculados de su cuenta — no se pueden recuperar la cuenta ni el vínculo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={handleEliminarUsuario}
              disabled={eliminando}
            >
              {eliminando ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={creandoUsuario}
        onOpenChange={(open) => !guardandoNuevoUsuario && setCreandoUsuario(open)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>
              Crea una cuenta con rol y departamento asignados desde ya. La persona podrá cambiar su
              contraseña después desde "Mi Perfil".
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCrearUsuario} className="space-y-4">
            {errorNuevoUsuario && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>{errorNuevoUsuario}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="nuevo-usuario-nombres">Nombres *</Label>
                <Input
                  id="nuevo-usuario-nombres"
                  required
                  value={nuevoUsuario.nombres}
                  onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombres: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nuevo-usuario-apellidos">Apellidos *</Label>
                <Input
                  id="nuevo-usuario-apellidos"
                  required
                  value={nuevoUsuario.apellidos}
                  onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, apellidos: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nuevo-usuario-email">Correo corporativo *</Label>
              <Input
                id="nuevo-usuario-email"
                type="email"
                required
                placeholder="usuario@ricol.com.co"
                value={nuevoUsuario.email}
                onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nuevo-usuario-password">Contraseña temporal *</Label>
              <Input
                id="nuevo-usuario-password"
                type="password"
                required
                value={nuevoUsuario.password}
                onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })}
              />
              <p className="text-[11px] text-slate-400">
                Mínimo 8 caracteres, con mayúscula, minúscula y número.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Departamento</Label>
                <Select
                  value={nuevoUsuario.departamentoId || "__sin_departamento__"}
                  onValueChange={(value) =>
                    setNuevoUsuario({
                      ...nuevoUsuario,
                      departamentoId: value === "__sin_departamento__" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger>
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
              </div>
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select
                  value={nuevoUsuario.rolId || "__sin_rol__"}
                  onValueChange={(value) =>
                    setNuevoUsuario({
                      ...nuevoUsuario,
                      rolId: value === "__sin_rol__" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__sin_rol__">Sin rol asignado</SelectItem>
                    {rolesActivos.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreandoUsuario(false)}
                disabled={guardandoNuevoUsuario}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={guardandoNuevoUsuario}>
                {guardandoNuevoUsuario ? "Creando..." : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
