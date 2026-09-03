import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  DollarSign,
  Plus,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  XCircle,
  Mail,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { useTenant } from "@/lib/tenant-context";
import { useGestionHumana } from "@/hooks/use-gestion-humana";
import { useDepartamentosPublico } from "@/hooks/use-departamentos-publico";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { DOMINIOS_PERMITIDOS, esDominioCorporativoValido } from "@/lib/dominios";
import { money, Empleado, GravedadStrike } from "@/lib/data";
import { FilaGrupo, OPCION_SIN_AGRUPAR, SelectorAgrupacion } from "@/components/ui/selector-agrupacion";
import { agruparFilas } from "@/lib/agrupar";

export const Route = createFileRoute("/gestion-humana")({
  head: () => ({
    meta: [
      { title: "Gestión Humana | RicoSoft" },
      {
        name: "description",
        content:
          "Expedientes de colaboradores, permisos, solicitudes y faltas disciplinarias por empresa.",
      },
    ],
  }),
  component: GestionHumana,
});

function GestionHumana() {
  const { empresaActiva, empresas } = useTenant();
  const {
    empleados,
    addEmpleado,
    updateSalarioEmpleado,
    liquidarEmpleado,
    eliminarEmpleado,
    permisos,
    addPermiso,
    updateEstadoPermiso,
    faltas,
    addFalta,
    loading,
    error,
  } = useGestionHumana();
  const { departamentos } = useDepartamentosPublico();
  const { user } = useSession();
  const puedeEliminarEmpleado = hasPermission(user, PERMISOS_SISTEMA.EMPLEADOS_ELIMINAR);

  const [activeTab, setActiveTab] = useState<"expediente" | "permisos" | "faltas" | "comunicados">(
    "expediente",
  );

  // Modales
  const [modalEmpleadoOpen, setModalEmpleadoOpen] = useState(false);
  const [modalSalarioOpen, setModalSalarioOpen] = useState(false);
  const [modalPermisoOpen, setModalPermisoOpen] = useState(false);
  const [modalFaltaOpen, setModalFaltaOpen] = useState(false);
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
  const [empleadoAEliminar, setEmpleadoAEliminar] = useState<Empleado | null>(null);
  const [eliminandoEmpleado, setEliminandoEmpleado] = useState(false);
  const [agrupacionEmpleados, setAgrupacionEmpleados] = useState(OPCION_SIN_AGRUPAR.value);
  const [agrupacionPermisos, setAgrupacionPermisos] = useState(OPCION_SIN_AGRUPAR.value);
  const [agrupacionFaltas, setAgrupacionFaltas] = useState(OPCION_SIN_AGRUPAR.value);

  const handleEliminarEmpleado = async () => {
    if (!empleadoAEliminar) return;
    setEliminandoEmpleado(true);
    try {
      await eliminarEmpleado(empleadoAEliminar.id);
      toast.success(`Expediente de ${empleadoAEliminar.nombres} eliminado.`);
      setEmpleadoAEliminar(null);
    } catch (err: any) {
      toast.error(err.message || "No fue posible eliminar el expediente.");
    } finally {
      setEliminandoEmpleado(false);
    }
  };

  // Forms states
  const [empForm, setEmpForm] = useState({
    empresaId: empresaActiva === "ALL" ? "RC" : empresaActiva,
    documento: "",
    nombres: "",
    apellidos: "",
    correo: "",
    cargo: "",
    area: "",
    fechaContratacion: new Date().toISOString().split("T")[0],
    salarioActual: 2000000,
  });

  // Preselecciona el primer departamento real configurado apenas carguen.
  useEffect(() => {
    if (departamentos.length === 0) return;
    setEmpForm((f) => (f.area ? f : { ...f, area: departamentos[0].nombre }));
  }, [departamentos]);

  const [salarioForm, setSalarioForm] = useState({
    nuevoSalario: 2500000,
    motivo: "Aumento por desempeño",
  });

  const [permisoForm, setPermisoForm] = useState({
    empleadoId: "",
    tipoPermiso: "Vacaciones" as const,
    fechaInicio: new Date().toISOString().split("T")[0],
    fechaFin: new Date().toISOString().split("T")[0],
    dias: 1,
    observaciones: "",
  });

  const [faltaForm, setFaltaForm] = useState({
    empleadoId: "",
    gravedad: "Leve" as GravedadStrike,
    motivo: "",
    descargos: "",
    registradoPor: "Director RRHH",
  });


  // Filtered Lists
  const filteredEmpleados = useMemo(() => {
    if (empresaActiva === "ALL") return empleados;
    return empleados.filter((e) => e.empresaId === empresaActiva);
  }, [empleados, empresaActiva]);

  const filteredPermisos = useMemo(() => {
    if (empresaActiva === "ALL") return permisos;
    return permisos.filter((p) => p.empresaId === empresaActiva);
  }, [permisos, empresaActiva]);

  const filteredFaltas = useMemo(() => {
    if (empresaActiva === "ALL") return faltas;
    return faltas.filter((f) => f.empresaId === empresaActiva);
  }, [faltas, empresaActiva]);

  const claveEmpleados = useMemo(() => {
    switch (agrupacionEmpleados) {
      case "area":
        return (e: (typeof filteredEmpleados)[number]) => e.area;
      case "estado":
        return (e: (typeof filteredEmpleados)[number]) => e.estado;
      default:
        return null;
    }
  }, [agrupacionEmpleados]);
  const gruposEmpleados = useMemo(
    () => agruparFilas(filteredEmpleados, claveEmpleados),
    [filteredEmpleados, claveEmpleados],
  );

  const clavePermisos = useMemo(() => {
    switch (agrupacionPermisos) {
      case "tipo":
        return (p: (typeof filteredPermisos)[number]) => p.tipoPermiso;
      case "estado":
        return (p: (typeof filteredPermisos)[number]) => p.estado;
      default:
        return null;
    }
  }, [agrupacionPermisos]);
  const gruposPermisos = useMemo(
    () => agruparFilas(filteredPermisos, clavePermisos),
    [filteredPermisos, clavePermisos],
  );

  const claveFaltas = useMemo(() => {
    switch (agrupacionFaltas) {
      case "gravedad":
        return (f: (typeof filteredFaltas)[number]) => f.gravedad;
      default:
        return null;
    }
  }, [agrupacionFaltas]);
  const gruposFaltas = useMemo(() => agruparFilas(filteredFaltas, claveFaltas), [filteredFaltas, claveFaltas]);

  // Handlers
  const handleSaveEmpleado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.nombres || !empForm.documento) return;
    if (!esDominioCorporativoValido(empForm.correo)) {
      toast.error(
        `El correo debe ser corporativo (${DOMINIOS_PERMITIDOS.map((d) => `@${d}`).join(", ")}). No se permiten correos personales.`,
      );
      return;
    }
    try {
      await addEmpleado({
        empresaId: empForm.empresaId,
        documento: empForm.documento,
        nombres: empForm.nombres,
        apellidos: empForm.apellidos,
        correo: empForm.correo.trim().toLowerCase(),
        cargo: empForm.cargo || "Colaborador",
        area: empForm.area,
        fechaContratacion: empForm.fechaContratacion,
        salarioActual: Number(empForm.salarioActual),
      });
    } catch (err: any) {
      toast.error(err.message || "Error al registrar el colaborador.");
      return;
    }
    setModalEmpleadoOpen(false);
    setEmpForm({
      empresaId: empresaActiva === "ALL" ? "RC" : empresaActiva,
      documento: "",
      nombres: "",
      apellidos: "",
      correo: "",
      cargo: "",
      area: "",
      fechaContratacion: new Date().toISOString().split("T")[0],
      salarioActual: 2000000,
    });
  };

  const handleSaveSalario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpleado) return;
    try {
      await updateSalarioEmpleado(selectedEmpleado.id, Number(salarioForm.nuevoSalario), salarioForm.motivo);
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar el salario.");
      return;
    }
    setModalSalarioOpen(false);
  };

  const handleSavePermiso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permisoForm.empleadoId) return;
    try {
      await addPermiso({
        empleadoId: permisoForm.empleadoId,
        tipoPermiso: permisoForm.tipoPermiso,
        fechaInicio: permisoForm.fechaInicio,
        fechaFin: permisoForm.fechaFin,
        dias: Number(permisoForm.dias),
        observaciones: permisoForm.observaciones,
      });
    } catch (err: any) {
      toast.error(err.message || "Error al registrar el permiso.");
      return;
    }
    setModalPermisoOpen(false);
  };

  const handleSaveFalta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faltaForm.empleadoId) return;
    try {
      await addFalta({
        empleadoId: faltaForm.empleadoId,
        gravedad: faltaForm.gravedad,
        motivo: faltaForm.motivo,
        descargos: faltaForm.descargos,
      });
    } catch (err: any) {
      toast.error(err.message || "Error al registrar la falta.");
      return;
    }
    setModalFaltaOpen(false);
  };

  return (
    <AppShell
      title="Gestión de Empleados"
      description="Expedientes laborales, solicitudes de permisos, comunicados e historial de sanciones por empresa."
      actions={
        <div className="flex gap-2">
          {activeTab === "expediente" && (
            <Button onClick={() => setModalEmpleadoOpen(true)} size="sm" className="gap-2">
              <UserPlus className="h-4 w-4" /> Registrar Colaborador
            </Button>
          )}
          {activeTab === "permisos" && (
            <Button onClick={() => setModalPermisoOpen(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Solicitar Permiso
            </Button>
          )}
          {activeTab === "faltas" && (
            <Button
              onClick={() => setModalFaltaOpen(true)}
              size="sm"
              variant="destructive"
              className="gap-2"
            >
              <ShieldAlert className="h-4 w-4" /> Registrar Falta / Strike
            </Button>
          )}
        </div>
      }
    >
      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 mb-6 bg-white rounded-t-lg px-2 shadow-2xs">
        <button
          onClick={() => setActiveTab("expediente")}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "expediente"
              ? "border-blue-800 text-blue-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Users className="h-4 w-4" /> Expediente del Colaborador ({filteredEmpleados.length})
        </button>
        <button
          onClick={() => setActiveTab("permisos")}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "permisos"
              ? "border-blue-800 text-blue-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Calendar className="h-4 w-4" /> Permisos y Solicitudes ({filteredPermisos.length})
        </button>
        <button
          onClick={() => setActiveTab("faltas")}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "faltas"
              ? "border-blue-800 text-blue-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <AlertTriangle className="h-4 w-4" /> Faltas y Strikes Disciplinarios (
          {filteredFaltas.length})
        </button>
        <button
          onClick={() => setActiveTab("comunicados")}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "comunicados"
              ? "border-blue-800 text-blue-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Mail className="h-4 w-4" /> Comunicados Corporativos
        </button>
      </div>

      {/* TAB 1: EXPEDIENTES */}
      {activeTab === "expediente" && (
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/80">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Listado de Expedientes Laborales</h3>
              <p className="text-xs text-slate-500 font-medium">
                Colaboradores registrados y su historial de contratación/salario.
              </p>
            </div>
            <SelectorAgrupacion
              value={agrupacionEmpleados}
              onChange={setAgrupacionEmpleados}
              opciones={[OPCION_SIN_AGRUPAR, { value: "area", label: "Departamento" }, { value: "estado", label: "Estado" }]}
            />
          </div>
          <Table>
            <TableHeader className="bg-slate-100/80">
              <TableRow className="hover:bg-slate-100/80">
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Documento</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Colaborador</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Empresa</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Cargo / Departamento</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Fechas Contratación</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">Salario Actual</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-center">Strikes</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Estado</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-slate-800 font-medium">
              {gruposEmpleados.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={9} />}
                  {grupo.filas.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="px-4 py-3 font-mono text-xs text-slate-500">{emp.documento}</TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="font-bold text-slate-900">
                          {emp.nombres} {emp.apellidos}
                        </p>
                        <p className="text-[11px] text-slate-500 font-normal">{emp.correo}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800 font-bold">
                          {emp.empresaId}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{emp.cargo}</p>
                        <p className="text-[11px] text-slate-500">{emp.area}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs">
                        <p className="text-slate-600 font-bold">
                          Ingreso: {new Date(emp.fechaContratacion).toLocaleDateString("es-CO")}
                        </p>
                        {emp.fechaLiquidacion && (
                          <p className="text-slate-900 font-bold">
                            Retiro: {new Date(emp.fechaLiquidacion).toLocaleDateString("es-CO")}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="num px-4 py-3 text-right font-bold text-slate-900">
                        {money(emp.salarioActual)}
                        <p className="text-[10px] text-slate-400 font-normal">({emp.historicoSalario.length} cambios)</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center font-bold">
                        {emp.strikesCount > 0 ? (
                          <Badge className="rounded-full border-transparent bg-slate-900 text-white">{emp.strikesCount} ⚡</Badge>
                        ) : (
                          <span className="text-xs text-slate-400 font-normal">0</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <EstadoBadge estado={emp.estado} />
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              setSelectedEmpleado(emp);
                              setSalarioForm({ nuevoSalario: emp.salarioActual, motivo: "" });
                              setModalSalarioOpen(true);
                            }}
                            className="h-7 text-[11px]"
                          >
                            <DollarSign className="h-3 w-3 mr-1" /> Salario
                          </Button>
                          {emp.estado !== "Liquidado" && (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`¿Liquidar al colaborador ${emp.nombres}?`)) {
                                  liquidarEmpleado(emp.id, new Date().toISOString().split("T")[0]).catch(
                                    (err: any) => toast.error(err.message || "Error al liquidar el colaborador."),
                                  );
                                }
                              }}
                              className="h-7 text-[11px] text-slate-900 hover:bg-slate-100"
                            >
                              Liquidar
                            </Button>
                          )}
                          {puedeEliminarEmpleado && (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => setEmpleadoAEliminar(emp)}
                              className="h-7 text-[11px] text-slate-500 hover:text-slate-900"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              {filteredEmpleados.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="p-0">
                    {loading ? (
                      <div className="py-12 text-center text-xs text-slate-500">Cargando colaboradores...</div>
                    ) : error ? (
                      <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                    ) : (
                      <EmptyState
                        icon={Users}
                        title="No hay colaboradores registrados para esta empresa"
                        description='Haz clic en "Registrar Colaborador" para crear el primer expediente.'
                        action={
                          <Button size="sm" onClick={() => setModalEmpleadoOpen(true)} className="gap-2">
                            <UserPlus className="h-4 w-4" /> Registrar Colaborador
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* TAB 2: PERMISOS Y SOLICITUDES */}
      {activeTab === "permisos" && (
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/80">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Solicitudes de Permisos y Vacaciones
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Gestión de ausencias, licencias y solicitudes del personal.
              </p>
            </div>
            <SelectorAgrupacion
              value={agrupacionPermisos}
              onChange={setAgrupacionPermisos}
              opciones={[OPCION_SIN_AGRUPAR, { value: "tipo", label: "Tipo de permiso" }, { value: "estado", label: "Estado" }]}
            />
          </div>
          <Table>
            <TableHeader className="bg-slate-100/80">
              <TableRow className="hover:bg-slate-100/80">
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Colaborador</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Tipo Permiso</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Fechas (Inicio / Fin)</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-center">Días</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Observaciones</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Estado</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-slate-800 font-medium">
              {gruposPermisos.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={7} />}
                  {grupo.filas.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="px-4 py-3 font-bold text-slate-900">{p.nombreEmpleado}</TableCell>
                      <TableCell className="px-4 py-3 text-xs font-bold text-blue-800">{p.tipoPermiso}</TableCell>
                      <TableCell className="px-4 py-3 text-xs font-mono text-slate-600">
                        {new Date(p.fechaInicio).toLocaleDateString("es-CO")} al{" "}
                        {new Date(p.fechaFin).toLocaleDateString("es-CO")}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center font-bold text-xs text-slate-900">{p.dias} días</TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-500 max-w-[250px] truncate">{p.observaciones || "-"}</TableCell>
                      <TableCell className="px-4 py-3">
                        <EstadoBadge estado={p.estado} />
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        {p.estado === "Pendiente" && (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="xs"
                              variant="success"
                              onClick={() =>
                                updateEstadoPermiso(p.id, "Aprobado").catch((err: any) =>
                                  toast.error(err.message || "Error al aprobar."),
                                )
                              }
                              className="h-7 text-[11px]"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
                            </Button>
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() =>
                                updateEstadoPermiso(p.id, "Rechazado").catch((err: any) =>
                                  toast.error(err.message || "Error al rechazar."),
                                )
                              }
                              className="h-7 text-[11px]"
                            >
                              <XCircle className="h-3 w-3 mr-1" /> Rechazar
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              {filteredPermisos.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0">
                    {loading ? (
                      <div className="py-12 text-center text-xs text-slate-500">Cargando permisos...</div>
                    ) : error ? (
                      <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                    ) : (
                      <EmptyState
                        icon={Calendar}
                        title="No hay solicitudes de permiso registradas"
                        description='Haz clic en "Solicitar Permiso" para crear la primera.'
                        action={
                          <Button size="sm" onClick={() => setModalPermisoOpen(true)} className="gap-2">
                            <Plus className="h-4 w-4" /> Solicitar Permiso
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* TAB 3: FALTAS Y STRIKES */}
      {activeTab === "faltas" && (
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/80">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Registro de Faltas y Strikes Disciplinarios
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Sanciones disciplinarias con descargos y severidad.
              </p>
            </div>
            <SelectorAgrupacion
              value={agrupacionFaltas}
              onChange={setAgrupacionFaltas}
              opciones={[OPCION_SIN_AGRUPAR, { value: "gravedad", label: "Gravedad" }]}
            />
          </div>
          <Table>
            <TableHeader className="bg-slate-100/80">
              <TableRow className="hover:bg-slate-100/80">
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Fecha</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Colaborador</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Gravedad</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Motivo de la Falta</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Descargos presentados</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">Registrado Por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-slate-800 font-medium">
              {gruposFaltas.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={6} />}
                  {grupo.filas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="px-4 py-3 font-mono text-xs text-slate-500">
                        {new Date(f.fecha).toLocaleDateString("es-CO")}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-bold text-slate-900">{f.nombreEmpleado}</TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            f.gravedad === "Muy Grave"
                              ? "border-transparent bg-slate-900 text-white"
                              : f.gravedad === "Grave"
                                ? "border-slate-400 bg-slate-200 text-slate-900"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                          }
                        >
                          {f.gravedad}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs font-semibold text-slate-800 max-w-[280px]">{f.motivo}</TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-500 max-w-[250px] italic">
                        {f.descargos || "Sin descargos registrados"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-500">{f.registradoPor}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              {filteredFaltas.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    {loading ? (
                      <div className="py-12 text-center text-xs text-slate-500">Cargando...</div>
                    ) : error ? (
                      <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                    ) : (
                      <EmptyState
                        icon={AlertTriangle}
                        title="No hay faltas o strikes registrados en esta empresa"
                        description="Excelente historial disciplinario."
                      />
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* TAB 4: COMUNICADOS E EMAILS */}
      {activeTab === "comunicados" && (
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs p-6 space-y-4">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-sm font-bold text-slate-900">Emisión de Comunicados Internos</h3>
            <p className="text-xs text-slate-500 font-medium">
              Redacta e imparte anuncios oficiales a las casillas de correo corporativas de la
              empresa activa.
            </p>
          </div>
          <Alert variant="warning">
            <Mail className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <p className="font-bold">Esta función todavía no está disponible.</p>
              <p className="mt-1">
                El envío de comunicados requiere conectar un proveedor de correo (SMTP o un servicio
                como Resend/SendGrid) en el backend. Por ahora no hay ningún mecanismo de envío
                implementado, así que preferimos no mostrar un formulario que aparente funcionar.
              </p>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* MODAL 1: REGISTRAR COLABORADOR */}
      <Dialog open={modalEmpleadoOpen} onOpenChange={setModalEmpleadoOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Registrar Nuevo Colaborador
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Expediente de contratación de Gestión Humana.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEmpleado} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="empresaId" className="text-xs font-semibold text-slate-700">
                  Empresa
                </Label>
                <Select
                  value={empForm.empresaId}
                  onValueChange={(val) => setEmpForm({ ...empForm, empresaId: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id} className="text-xs">
                        {e.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="documento" className="text-xs font-semibold text-slate-700">
                  Documento de Identidad *
                </Label>
                <Input
                  required
                  id="documento"
                  placeholder="CC / NIT 102030..."
                  value={empForm.documento}
                  onChange={(e) => setEmpForm({ ...empForm, documento: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="nombres" className="text-xs font-semibold text-slate-700">
                  Nombres *
                </Label>
                <Input
                  required
                  id="nombres"
                  placeholder="Carlos Alberto"
                  value={empForm.nombres}
                  onChange={(e) => setEmpForm({ ...empForm, nombres: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="apellidos" className="text-xs font-semibold text-slate-700">
                  Apellidos *
                </Label>
                <Input
                  required
                  id="apellidos"
                  placeholder="Gómez Pérez"
                  value={empForm.apellidos}
                  onChange={(e) => setEmpForm({ ...empForm, apellidos: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="correo" className="text-xs font-semibold text-slate-700">
                Correo Corporativo *
              </Label>
              <Input
                required
                type="email"
                id="correo"
                placeholder="usuario@ricol.com.co"
                value={empForm.correo}
                onChange={(e) => setEmpForm({ ...empForm, correo: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
              <p className="text-[11px] text-slate-400">
                Solo se permiten correos corporativos ({DOMINIOS_PERMITIDOS.map((d) => `@${d}`).join(", ")}).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cargo" className="text-xs font-semibold text-slate-700">
                  Cargo
                </Label>
                <Input
                  id="cargo"
                  placeholder="Analista / Coordinador"
                  value={empForm.cargo}
                  onChange={(e) => setEmpForm({ ...empForm, cargo: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="area" className="text-xs font-semibold text-slate-700">
                  Departamento
                </Label>
                <Select
                  value={empForm.area}
                  onValueChange={(val) => setEmpForm({ ...empForm, area: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {departamentos.map((d) => (
                      <SelectItem key={d.id} value={d.nombre} className="text-xs">
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fecha" className="text-xs font-semibold text-slate-700">
                  Fecha Contratación
                </Label>
                <Input
                  type="date"
                  id="fecha"
                  value={empForm.fechaContratacion}
                  onChange={(e) => setEmpForm({ ...empForm, fechaContratacion: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="salario" className="text-xs font-semibold text-slate-700">
                  Salario Mensual (COP)
                </Label>
                <Input
                  type="number"
                  id="salario"
                  value={empForm.salarioActual}
                  onChange={(e) =>
                    setEmpForm({ ...empForm, salarioActual: Number(e.target.value) })
                  }
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalEmpleadoOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Guardar Colaborador
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: AJUSTE SALARIAL */}
      <Dialog open={modalSalarioOpen} onOpenChange={setModalSalarioOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Ajustar Salario de Colaborador
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              {selectedEmpleado
                ? `${selectedEmpleado.nombres} ${selectedEmpleado.apellidos} (${money(selectedEmpleado.salarioActual)})`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSalario} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="nuevoSalario" className="text-xs font-semibold text-slate-700">
                Nuevo Salario Mensual (COP)
              </Label>
              <Input
                type="number"
                id="nuevoSalario"
                value={salarioForm.nuevoSalario}
                onChange={(e) =>
                  setSalarioForm({ ...salarioForm, nuevoSalario: Number(e.target.value) })
                }
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="motivoSalario" className="text-xs font-semibold text-slate-700">
                Motivo del Ajuste / Ascenso
              </Label>
              <Input
                id="motivoSalario"
                placeholder="Ascenso de cargo / Ajuste IPC"
                value={salarioForm.motivo}
                onChange={(e) => setSalarioForm({ ...salarioForm, motivo: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalSalarioOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Actualizar Salario
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: SOLICITUD DE PERMISO */}
      <Dialog open={modalPermisoOpen} onOpenChange={setModalPermisoOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Crear Solicitud de Permiso / Vacaciones
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSavePermiso} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="permEmpleado" className="text-xs font-semibold text-slate-700">
                Colaborador *
              </Label>
              <Select
                value={permisoForm.empleadoId}
                onValueChange={(val) => setPermisoForm({ ...permisoForm, empleadoId: val })}
              >
                <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                  <SelectValue placeholder="Seleccionar colaborador" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  {filteredEmpleados.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">
                      {e.nombres} {e.apellidos} ({e.empresaId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tipoPerm" className="text-xs font-semibold text-slate-700">
                  Tipo de Permiso
                </Label>
                <Select
                  value={permisoForm.tipoPermiso}
                  onValueChange={(val: any) => setPermisoForm({ ...permisoForm, tipoPermiso: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="Vacaciones">Vacaciones</SelectItem>
                    <SelectItem value="Licencia Médica">Licencia Médica</SelectItem>
                    <SelectItem value="Cita Médica">Cita Médica</SelectItem>
                    <SelectItem value="Calamidad Doméstica">Calamidad Doméstica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="diasPerm" className="text-xs font-semibold text-slate-700">
                  Días Solicitados
                </Label>
                <Input
                  type="number"
                  id="diasPerm"
                  value={permisoForm.dias}
                  onChange={(e) => setPermisoForm({ ...permisoForm, dias: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fechaIn" className="text-xs font-semibold text-slate-700">
                  Fecha Inicio
                </Label>
                <Input
                  type="date"
                  id="fechaIn"
                  value={permisoForm.fechaInicio}
                  onChange={(e) => setPermisoForm({ ...permisoForm, fechaInicio: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fechaFn" className="text-xs font-semibold text-slate-700">
                  Fecha Fin
                </Label>
                <Input
                  type="date"
                  id="fechaFn"
                  value={permisoForm.fechaFin}
                  onChange={(e) => setPermisoForm({ ...permisoForm, fechaFin: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="obsPerm" className="text-xs font-semibold text-slate-700">
                Observaciones
              </Label>
              <Input
                id="obsPerm"
                placeholder="Motivo o detalles de la solicitud..."
                value={permisoForm.observaciones}
                onChange={(e) => setPermisoForm({ ...permisoForm, observaciones: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalPermisoOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Crear Solicitud
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: REGISTRAR FALTA / STRIKE */}
      <Dialog open={modalFaltaOpen} onOpenChange={setModalFaltaOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Registrar Falta / Strike Disciplinario
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveFalta} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="faltaEmp" className="text-xs font-semibold text-slate-700">
                Colaborador Sancionado *
              </Label>
              <Select
                value={faltaForm.empleadoId}
                onValueChange={(val) => setFaltaForm({ ...faltaForm, empleadoId: val })}
              >
                <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                  <SelectValue placeholder="Seleccionar colaborador" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  {filteredEmpleados.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">
                      {e.nombres} {e.apellidos} ({e.empresaId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="gravFalta" className="text-xs font-semibold text-slate-700">
                Gravedad de la Falta
              </Label>
              <Select
                value={faltaForm.gravedad}
                onValueChange={(val: any) => setFaltaForm({ ...faltaForm, gravedad: val })}
              >
                <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="Leve">Leve (Llamado de atención verbal)</SelectItem>
                  <SelectItem value="Grave">Grave (Amonestación escrita)</SelectItem>
                  <SelectItem value="Muy Grave">Muy Grave (Suspensión / Strike directo)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="motivoFalta" className="text-xs font-semibold text-slate-700">
                Motivo / Descripción de la falta *
              </Label>
              <Input
                required
                id="motivoFalta"
                placeholder="Ej. Ausencia injustificada el día lunes..."
                value={faltaForm.motivo}
                onChange={(e) => setFaltaForm({ ...faltaForm, motivo: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="descargosFalta" className="text-xs font-semibold text-slate-700">
                Descargos Presentados
              </Label>
              <Input
                id="descargosFalta"
                placeholder="Respuesta o justificación dada por el empleado..."
                value={faltaForm.descargos}
                onChange={(e) => setFaltaForm({ ...faltaForm, descargos: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalFaltaOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                className="font-bold"
              >
                Aplicar Sanción
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!empleadoAEliminar} onOpenChange={(open) => !open && setEmpleadoAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar el expediente de {empleadoAEliminar?.nombres} {empleadoAEliminar?.apellidos}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. El colaborador dejará de aparecer en el listado, pero su
              historial queda registrado en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminandoEmpleado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={handleEliminarEmpleado}
              disabled={eliminandoEmpleado}
            >
              {eliminandoEmpleado ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
