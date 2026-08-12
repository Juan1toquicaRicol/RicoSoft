import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  DollarSign,
  Plus,
  ShieldAlert,
  UserPlus,
  Users,
  XCircle,
  Mail,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useTenant } from "@/lib/tenant-context";
import { useGestionHumana } from "@/hooks/use-gestion-humana";
import { money, Empleado, GravedadStrike } from "@/lib/data";

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
    permisos,
    addPermiso,
    updateEstadoPermiso,
    faltas,
    addFalta,
    loading,
    error,
  } = useGestionHumana();

  const [activeTab, setActiveTab] = useState<"expediente" | "permisos" | "faltas" | "comunicados">(
    "expediente",
  );

  // Modales
  const [modalEmpleadoOpen, setModalEmpleadoOpen] = useState(false);
  const [modalSalarioOpen, setModalSalarioOpen] = useState(false);
  const [modalPermisoOpen, setModalPermisoOpen] = useState(false);
  const [modalFaltaOpen, setModalFaltaOpen] = useState(false);
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);

  // Forms states
  const [empForm, setEmpForm] = useState({
    empresaId: empresaActiva === "ALL" ? "001" : empresaActiva,
    documento: "",
    nombres: "",
    apellidos: "",
    correo: "",
    cargo: "",
    area: "Operaciones",
    fechaContratacion: new Date().toISOString().split("T")[0],
    salarioActual: 2000000,
  });

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

  // Estado del Formulario de Comunicados
  const [comunicadoForm, setComunicadoForm] = useState({
    asunto: "",
    mensaje: "",
    destinatarioTipo: "todos", // "todos" | "Sistemas / TI" | "Comercial" | "Operaciones" | "Recursos Humanos" | "Financiera"
    empleadoId: "",
  });
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [mailSentSuccess, setMailSentSuccess] = useState(false);

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

  // Handlers
  const handleSaveEmpleado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.nombres || !empForm.documento) return;
    try {
      await addEmpleado({
        empresaId: empForm.empresaId,
        documento: empForm.documento,
        nombres: empForm.nombres,
        apellidos: empForm.apellidos,
        correo: empForm.correo || `${empForm.nombres.toLowerCase()}@empresa.com`,
        cargo: empForm.cargo || "Colaborador",
        area: empForm.area,
        fechaContratacion: empForm.fechaContratacion,
        salarioActual: Number(empForm.salarioActual),
      });
    } catch (err: any) {
      alert(err.message || "Error al registrar el colaborador.");
      return;
    }
    setModalEmpleadoOpen(false);
    setEmpForm({
      empresaId: empresaActiva === "ALL" ? "001" : empresaActiva,
      documento: "",
      nombres: "",
      apellidos: "",
      correo: "",
      cargo: "",
      area: "Operaciones",
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
      alert(err.message || "Error al actualizar el salario.");
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
      alert(err.message || "Error al registrar el permiso.");
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
      alert(err.message || "Error al registrar la falta.");
      return;
    }
    setModalFaltaOpen(false);
  };

  const handleSendComunicado = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comunicadoForm.asunto || !comunicadoForm.mensaje) return;

    setIsSendingMail(true);

    // Payload listo para cuando envíes al servidor/backend
    const payload = {
      empresaId: empresaActiva,
      asunto: comunicadoForm.asunto,
      mensaje: comunicadoForm.mensaje,
      destinatarioTipo: comunicadoForm.destinatarioTipo,
      empleadoId: comunicadoForm.empleadoId,
      fecha: new Date().toISOString(),
    };

    console.log("Enviando comunicado corporativo:", payload);

    setTimeout(() => {
      setIsSendingMail(false);
      setMailSentSuccess(true);
      setComunicadoForm({
        asunto: "",
        mensaje: "",
        destinatarioTipo: "todos",
        empleadoId: "",
      });
      setTimeout(() => setMailSentSuccess(false), 5000);
    }, 1200);
  };

  return (
    <AppShell
      title="Gestión de Empleados"
      description="Expedientes laborales, solicitudes de permisos, comunicados e historial de sanciones por empresa."
      actions={
        <div className="flex gap-2">
          {activeTab === "expediente" && (
            <Button
              onClick={() => setModalEmpleadoOpen(true)}
              size="sm"
              className="gap-2 bg-blue-800 text-white hover:bg-blue-900"
            >
              <UserPlus className="h-4 w-4" /> Registrar Colaborador
            </Button>
          )}
          {activeTab === "permisos" && (
            <Button
              onClick={() => setModalPermisoOpen(true)}
              size="sm"
              className="gap-2 bg-blue-800 text-white hover:bg-blue-900"
            >
              <Plus className="h-4 w-4" /> Solicitar Permiso
            </Button>
          )}
          {activeTab === "faltas" && (
            <Button
              onClick={() => setModalFaltaOpen(true)}
              size="sm"
              variant="destructive"
              className="gap-2 bg-rose-600 text-white hover:bg-rose-700"
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
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">Documento</th>
                  <th className="px-4 py-3.5">Colaborador</th>
                  <th className="px-4 py-3.5">Empresa</th>
                  <th className="px-4 py-3.5">Cargo / Área</th>
                  <th className="px-4 py-3.5">Fechas Contratación</th>
                  <th className="px-4 py-3.5 text-right">Salario Actual</th>
                  <th className="px-4 py-3.5 text-center">Strikes</th>
                  <th className="px-4 py-3.5">Estado</th>
                  <th className="px-4 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredEmpleados.map((emp) => (
                  <tr key={emp.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{emp.documento}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">
                        {emp.nombres} {emp.apellidos}
                      </p>
                      <p className="text-[11px] text-slate-500 font-normal">{emp.correo}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-800">
                        {emp.empresaId}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{emp.cargo}</p>
                      <p className="text-[11px] text-slate-500">{emp.area}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="text-emerald-700 font-bold">
                        Ingreso: {new Date(emp.fechaContratacion).toLocaleDateString("es-CO")}
                      </p>
                      {emp.fechaLiquidacion && (
                        <p className="text-rose-700 font-bold">
                          Retiro: {new Date(emp.fechaLiquidacion).toLocaleDateString("es-CO")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold font-mono text-slate-900">
                      {money(emp.salarioActual)}
                      <p className="text-[10px] text-slate-400 font-normal">
                        ({emp.historicoSalario.length} cambios)
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center font-bold">
                      {emp.strikesCount > 0 ? (
                        <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs text-rose-700 font-bold">
                          {emp.strikesCount} ⚡
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-normal">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={emp.estado} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setSelectedEmpleado(emp);
                            setSalarioForm({ nuevoSalario: emp.salarioActual, motivo: "" });
                            setModalSalarioOpen(true);
                          }}
                          className="h-7 text-[11px] font-semibold border-slate-300 hover:bg-slate-100"
                        >
                          <DollarSign className="h-3 w-3 mr-1 text-slate-500" /> Salario
                        </Button>
                        {emp.estado !== "Liquidado" && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`¿Liquidar al colaborador ${emp.nombres}?`)) {
                                liquidarEmpleado(emp.id, new Date().toISOString().split("T")[0]).catch(
                                  (err: any) => alert(err.message || "Error al liquidar el colaborador."),
                                );
                              }
                            }}
                            className="h-7 text-[11px] text-rose-700 hover:text-rose-800 hover:bg-rose-50 font-semibold"
                          >
                            Liquidar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredEmpleados.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-xs text-slate-500">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-30 text-slate-400" />
                      {loading
                        ? "Cargando colaboradores..."
                        : error ||
                          'No hay colaboradores registrados para esta empresa. Haz clic en "Registrar Colaborador".'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">Colaborador</th>
                  <th className="px-4 py-3.5">Tipo Permiso</th>
                  <th className="px-4 py-3.5">Fechas (Inicio / Fin)</th>
                  <th className="px-4 py-3.5 text-center">Días</th>
                  <th className="px-4 py-3.5">Observaciones</th>
                  <th className="px-4 py-3.5">Estado</th>
                  <th className="px-4 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredPermisos.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">{p.nombreEmpleado}</td>
                    <td className="px-4 py-3 text-xs font-bold text-blue-800">{p.tipoPermiso}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">
                      {new Date(p.fechaInicio).toLocaleDateString("es-CO")} al{" "}
                      {new Date(p.fechaFin).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-xs text-slate-900">
                      {p.dias} días
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[250px] truncate">
                      {p.observaciones || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={p.estado} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.estado === "Pendiente" && (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              updateEstadoPermiso(p.id, "Aprobado").catch((err: any) =>
                                alert(err.message || "Error al aprobar."),
                              )
                            }
                            className="h-7 text-[11px] font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              updateEstadoPermiso(p.id, "Rechazado").catch((err: any) =>
                                alert(err.message || "Error al rechazar."),
                              )
                            }
                            className="h-7 text-[11px] font-bold border-rose-300 text-rose-700 hover:bg-rose-50"
                          >
                            <XCircle className="h-3 w-3 mr-1" /> Rechazar
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredPermisos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-xs text-slate-500">
                      <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30 text-slate-400" />
                      {loading
                        ? "Cargando permisos..."
                        : error || 'No hay solicitudes de permiso registradas. Haz clic en "Solicitar Permiso".'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">Fecha</th>
                  <th className="px-4 py-3.5">Colaborador</th>
                  <th className="px-4 py-3.5">Gravedad</th>
                  <th className="px-4 py-3.5">Motivo de la Falta</th>
                  <th className="px-4 py-3.5">Descargos presentados</th>
                  <th className="px-4 py-3.5">Registrado Por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredFaltas.map((f) => (
                  <tr key={f.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {new Date(f.fecha).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">{f.nombreEmpleado}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2.5 py-0.5 text-[11px] font-bold border ${
                          f.gravedad === "Muy Grave"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : f.gravedad === "Grave"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-blue-50 text-blue-800 border-blue-200"
                        }`}
                      >
                        {f.gravedad}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-800 max-w-[280px]">
                      {f.motivo}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[250px] italic">
                      {f.descargos || "Sin descargos registrados"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{f.registradoPor}</td>
                  </tr>
                ))}
                {filteredFaltas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-xs text-slate-500">
                      <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40 text-emerald-600" />
                      {loading
                        ? "Cargando..."
                        : error || "Excelente. No hay faltas o strikes registrados en esta empresa."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: COMUNICADOS E EMAILS */}
      {activeTab === "comunicados" && (
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Emisión de Comunicados Internos</h3>
              <p className="text-xs text-slate-500 font-medium">
                Redacta e imparte anuncios oficiales directamente a las casillas de correo
                corporativas de la empresa activa.
              </p>
            </div>
          </div>

          {mailSentSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-emerald-800 border border-emerald-200 text-xs font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ¡El comunicado ha sido procesado e impartido vía correo electrónico con éxito!
            </div>
          )}

          <form onSubmit={handleSendComunicado} className="space-y-4 max-w-3xl">
            <div className="grid grid-cols-2 gap-4">
              {/* Asunto */}
              <div className="space-y-1.5">
                <Label htmlFor="asuntoMail" className="text-xs font-semibold text-slate-700">
                  Asunto del Comunicado *
                </Label>
                <Input
                  required
                  id="asuntoMail"
                  placeholder="Ej. Comunicado Oficial: Nuevos horarios y políticas"
                  value={comunicadoForm.asunto}
                  onChange={(e) => setComunicadoForm({ ...comunicadoForm, asunto: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>

              {/* Filtro de Destinatario */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Dirigido a *</Label>
                <Select
                  value={comunicadoForm.destinatarioTipo}
                  onValueChange={(val) =>
                    setComunicadoForm({ ...comunicadoForm, destinatarioTipo: val, empleadoId: "" })
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="todos" className="text-xs font-bold">
                      Toda la Empresa Activa ({filteredEmpleados.length} colaboradores)
                    </SelectItem>
                    <SelectItem value="Sistemas / TI" className="text-xs">
                      Área de Sistemas / TI
                    </SelectItem>
                    <SelectItem value="Comercial" className="text-xs">
                      Área Comercial
                    </SelectItem>
                    <SelectItem value="Operaciones" className="text-xs">
                      Área de Operaciones
                    </SelectItem>
                    <SelectItem value="Recursos Humanos" className="text-xs">
                      Área de Recursos Humanos
                    </SelectItem>
                    <SelectItem value="Financiera" className="text-xs">
                      Área Financiera
                    </SelectItem>
                    <SelectItem value="individual" className="text-xs text-blue-800 font-bold">
                      Colaborador Específico...
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Selector Individual si elige persona especifica */}
            {comunicadoForm.destinatarioTipo === "individual" && (
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <Label htmlFor="indivEmp" className="text-xs font-semibold text-slate-700">
                  Seleccionar Colaborador *
                </Label>
                <Select
                  value={comunicadoForm.empleadoId}
                  onValueChange={(val) => setComunicadoForm({ ...comunicadoForm, empleadoId: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue placeholder="Buscar empleado por nombre..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {filteredEmpleados.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id} className="text-xs">
                        {emp.nombres} {emp.apellidos} — ({emp.correo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Mensaje */}
            <div className="space-y-1.5">
              <Label htmlFor="mensajeMail" className="text-xs font-semibold text-slate-700">
                Cuerpo del Mensaje *
              </Label>
              <textarea
                required
                id="mensajeMail"
                rows={6}
                placeholder="Escribe el contenido detallado del correo corporativo..."
                value={comunicadoForm.mensaje}
                onChange={(e) => setComunicadoForm({ ...comunicadoForm, mensaje: e.target.value })}
                className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs shadow-xs placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-800"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={isSendingMail}
                className="gap-2 bg-blue-800 text-white hover:bg-blue-900 font-bold"
              >
                <Send className="h-3.5 w-3.5" />
                {isSendingMail ? "Enviando Correo..." : "Despachar Comunicado"}
              </Button>
            </div>
          </form>
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
                  Área
                </Label>
                <Select
                  value={empForm.area}
                  onValueChange={(val) => setEmpForm({ ...empForm, area: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="Sistemas / TI">Sistemas / TI</SelectItem>
                    <SelectItem value="Comercial">Comercial</SelectItem>
                    <SelectItem value="Operaciones">Operaciones</SelectItem>
                    <SelectItem value="Recursos Humanos">Recursos Humanos</SelectItem>
                    <SelectItem value="Financiera">Financiera</SelectItem>
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
              <Button
                type="submit"
                size="sm"
                className="bg-blue-800 text-white hover:bg-blue-900 font-bold"
              >
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
              <Button
                type="submit"
                size="sm"
                className="bg-blue-800 text-white hover:bg-blue-900 font-bold"
              >
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
              <Button
                type="submit"
                size="sm"
                className="bg-blue-800 text-white hover:bg-blue-900 font-bold"
              >
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
            <DialogTitle className="text-rose-700 font-bold flex items-center gap-2">
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
                className="bg-rose-600 text-white hover:bg-rose-700 font-bold"
              >
                Aplicar Sanción
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
