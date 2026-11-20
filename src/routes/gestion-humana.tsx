import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Briefcase,
  DollarSign,
  FileText,
  Fingerprint,
  Paperclip,
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
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useCargosOpciones } from "@/hooks/use-cargos";
import { GestionInformacionPanel } from "@/components/gestion-humana/gestion-informacion-panel";
import { BiometricoMarcacionesPanel } from "@/components/gestion-humana/biometrico-marcaciones-panel";
import { SelectorArchivo } from "@/components/gestion-humana/selector-archivo";
import { validarArchivoAdjunto } from "@/lib/archivo-adjunto";
import { DetallePersonalCampos } from "@/components/gestion-humana/detalle-personal-campos";
import { DETALLE_PERSONAL_VACIO } from "@/lib/detalle-personal";
import {
  ejecutarAlta,
  empFormInicial,
  hayCambiosPendientesAlta,
  resolverCierreAlta,
  type ApiDetallesAlta,
  type EmpFormAlta,
  type EstudioAlta,
} from "@/lib/gestion-humana-alta";
import { useOpcionesSeguridadSocial } from "@/hooks/use-seguridad-social";
import { EmpleadoDetallesDialog } from "@/components/gestion-humana/empleado-detalles-dialog";
import { correoRequeridoParaCargo, validarCorreoColaborador } from "@/lib/cargos";
import { useSession } from "@/lib/session-context";
import { fetchAuth, fetchAuthUpload, hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { DOMINIO_POR_EMPRESA } from "@/lib/dominios";
import { formatearFechaDia, hoyLocalISO } from "@/lib/fecha-local";
import { money, Empleado, GravedadStrike } from "@/lib/data";
import {
  FilaGrupo,
  OPCION_SIN_AGRUPAR,
  SelectorAgrupacion,
} from "@/components/ui/selector-agrupacion";
import { agruparFilas } from "@/lib/agrupar";

export const Route = createFileRoute("/gestion-humana")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.EMPLEADOS_VER),
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
    editarEmpleado,
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
    errorPermisos,
    errorFaltas,
  } = useGestionHumana();
  const { departamentos } = useDepartamentosPublico();
  const { user } = useSession();
  const puedeEliminarEmpleado = hasPermission(user, PERMISOS_SISTEMA.EMPLEADOS_ELIMINAR);
  const puedeCrearEmpleado = hasPermission(user, PERMISOS_SISTEMA.EMPLEADOS_CREAR);
  const puedeVerCargos = hasPermission(user, PERMISOS_SISTEMA.CARGOS_VER);
  const puedeGestionarCargos = hasPermission(user, PERMISOS_SISTEMA.CARGOS_GESTIONAR);
  const puedeVerInformacion = hasPermission(user, PERMISOS_SISTEMA.GESTION_INFORMACION_VER);
  const puedeVerBiometrico = hasPermission(user, PERMISOS_SISTEMA.BIOMETRICO_VER);
  const puedeGestionarInformacion = hasPermission(
    user,
    PERMISOS_SISTEMA.GESTION_INFORMACION_GESTIONAR,
  );
  const puedeVerGestionInformacion = puedeVerCargos || puedeVerInformacion;
  const puedeEditarCargoCorreo = hasPermission(user, PERMISOS_SISTEMA.EMPLEADOS_EDITAR);
  const puedeVerDetallesEmpleado = hasPermission(user, PERMISOS_SISTEMA.EMPLEADOS_DETALLES_VER);
  const permisosDetalles = {
    verDetalles: puedeVerDetallesEmpleado,
    editarDetalles:
      puedeVerDetallesEmpleado && hasPermission(user, PERMISOS_SISTEMA.EMPLEADOS_DETALLES_EDITAR),
    gestionarDocumentos:
      puedeVerDetallesEmpleado &&
      hasPermission(user, PERMISOS_SISTEMA.EMPLEADOS_DOCUMENTOS_GESTIONAR),
    editarCargoCorreo: puedeEditarCargoCorreo,
  };
  const puedeAbrirDetalles = puedeVerDetallesEmpleado || puedeEditarCargoCorreo;
  const necesitaCargos =
    hasPermission(user, PERMISOS_SISTEMA.EMPLEADOS_CREAR) ||
    puedeEditarCargoCorreo ||
    puedeVerCargos;
  const { cargos: cargosOpciones } = useCargosOpciones(necesitaCargos);
  const opcionesSeguridadSocial = useOpcionesSeguridadSocial(
    (permisosDetalles.verDetalles && permisosDetalles.editarDetalles) ||
      hasPermission(user, PERMISOS_SISTEMA.EMPLEADOS_CREAR) ||
      puedeEditarCargoCorreo,
  );

  const [activeTab, setActiveTab] = useState<
    "expediente" | "permisos" | "faltas" | "comunicados" | "cargos" | "marcaciones" | "alta"
  >("expediente");
  const [detallesEmpleadoId, setDetallesEmpleadoId] = useState<string | null>(null);

  // Modales
  const [modalSalarioOpen, setModalSalarioOpen] = useState(false);
  const [modalPermisoOpen, setModalPermisoOpen] = useState(false);
  const [modalFaltaOpen, setModalFaltaOpen] = useState(false);
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
  const [empleadoAEliminar, setEmpleadoAEliminar] = useState<Empleado | null>(null);
  const [eliminandoEmpleado, setEliminandoEmpleado] = useState(false);
  const [empleadoALiquidar, setEmpleadoALiquidar] = useState<Empleado | null>(null);
  const [liquidandoEmpleado, setLiquidandoEmpleado] = useState(false);
  const [accionPermisoId, setAccionPermisoId] = useState<string | null>(null);
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar el expediente.");
    } finally {
      setEliminandoEmpleado(false);
    }
  };

  const handleLiquidarEmpleado = async () => {
    if (!empleadoALiquidar) return;
    setLiquidandoEmpleado(true);
    try {
      await liquidarEmpleado(empleadoALiquidar.id, hoyLocalISO());
      toast.success(`Colaborador ${empleadoALiquidar.nombres} liquidado.`);
      setEmpleadoALiquidar(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al liquidar el colaborador.");
    } finally {
      setLiquidandoEmpleado(false);
    }
  };

  // Forms states
  const areaPorDefecto = departamentos[0]?.nombre ?? "";
  const [empForm, setEmpForm] = useState<EmpFormAlta>(() =>
    empFormInicial(empresaActiva, "", hoyLocalISO()),
  );
  const correoRequerido = correoRequeridoParaCargo(cargosOpciones, empForm.cargoId || null);

  // Pestaña "Detalles" del registro: se guarda DESPUÉS de crear el colaborador
  // (necesita su id). Solo se muestra con detalles_ver + detalles_editar.
  const DETALLE_VACIO = DETALLE_PERSONAL_VACIO;
  const [tabRegistro, setTabRegistro] = useState<"datos" | "detalles">("datos");
  const [detalleForm, setDetalleForm] = useState(DETALLE_VACIO);
  const [familiaresNuevos, setFamiliaresNuevos] = useState<
    { nombre: string; parentesco: string }[]
  >([]);
  const [estudiosNuevos, setEstudiosNuevos] = useState<EstudioAlta[]>([]);
  const [estNuevoArchivo, setEstNuevoArchivo] = useState<File | null>(null);
  const [certificadoNuevo, setCertificadoNuevo] = useState<File | null>(null);
  const [famNuevoNombre, setFamNuevoNombre] = useState("");
  const [famNuevoParentesco, setFamNuevoParentesco] = useState("");
  const [estNuevoTitulo, setEstNuevoTitulo] = useState("");
  const [estNuevaInstitucion, setEstNuevaInstitucion] = useState("");
  const [guardandoEmpleado, setGuardandoEmpleado] = useState(false);
  // Alta en dos fases: tras crear el colaborador su id queda aquí; si fallan detalles
  // o adjuntos, el diálogo sigue abierto y reintentar NO vuelve a crear el colaborador.
  const [altaCreadaId, setAltaCreadaId] = useState<string | null>(null);
  const [altaResultado, setAltaResultado] = useState<{
    guardados: string[];
    fallidos: { etiqueta: string; mensaje: string }[];
  } | null>(null);
  const [confirmarDescarteAlta, setConfirmarDescarteAlta] = useState(false);
  const puedeCapturarDetalles = permisosDetalles.verDetalles && permisosDetalles.editarDetalles;

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
    tipoPermiso: "Vacaciones" as
      "Vacaciones" | "Licencia Médica" | "Cita Médica" | "Calamidad Doméstica" | "Otro",
    fechaInicio: hoyLocalISO(),
    fechaFin: hoyLocalISO(),
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
  const gruposFaltas = useMemo(
    () => agruparFilas(filteredFaltas, claveFaltas),
    [filteredFaltas, claveFaltas],
  );

  // Handlers
  const handleSaveEmpleado = async (e: React.FormEvent) => {
    e.preventDefault();
    // Con el colaborador ya creado (reintento) los datos están bloqueados y no se revalidan.
    let correoValidado = "";
    if (!altaCreadaId) {
      if (!empForm.nombres.trim() || !empForm.apellidos.trim() || !empForm.documento.trim()) {
        setTabRegistro("datos");
        toast.error("Completa cédula, nombres y apellidos.");
        return;
      }
      const validacionCorreo = validarCorreoColaborador(
        empForm.correo,
        correoRequerido,
        empForm.empresaId,
      );
      if (!validacionCorreo.ok) {
        setTabRegistro("datos");
        toast.error(validacionCorreo.message);
        return;
      }
      correoValidado = validacionCorreo.correo;
    }
    setGuardandoEmpleado(true);
    let resultado;
    try {
      resultado = await ejecutarAlta({
        creadoId: altaCreadaId,
        crear: () =>
          addEmpleado({
            empresaId: empForm.empresaId,
            documento: empForm.documento,
            nombres: empForm.nombres,
            apellidos: empForm.apellidos,
            correo: correoValidado,
            ...(empForm.cargoId ? { cargoId: empForm.cargoId } : {}),
            ...(empForm.tipoContrato ? { tipoContrato: empForm.tipoContrato } : {}),
            area: empForm.area,
            fechaContratacion: empForm.fechaContratacion,
            salarioActual: Number(empForm.salarioActual),
          }),
        borrador: {
          detalle: detalleForm,
          familiares: familiaresNuevos,
          estudios: estudiosNuevos,
          certificado: certificadoNuevo,
        },
        crearApi: crearApiDetallesAlta,
        puedeCapturarDetalles,
        puedeGestionarDocumentos: permisosDetalles.gestionarDocumentos,
      });
    } catch (err: unknown) {
      // Solo puede fallar la creación del colaborador: no existe y no hay nada que reintentar.
      toast.error(err instanceof Error ? err.message : "Error al registrar el colaborador.");
      setGuardandoEmpleado(false);
      return;
    }
    setGuardandoEmpleado(false);

    if (resultado.fallidos.length > 0) {
      // El colaborador YA existe: se conservan solo los pendientes y el diálogo sigue abierto.
      setAltaCreadaId(resultado.creadoId);
      setAltaResultado({ guardados: resultado.guardados, fallidos: resultado.fallidos });
      setDetalleForm(resultado.pendiente.detalle);
      setFamiliaresNuevos(resultado.pendiente.familiares);
      setEstudiosNuevos(resultado.pendiente.estudios);
      setCertificadoNuevo(resultado.pendiente.certificado);
      setTabRegistro("detalles");
      toast.warning(
        "Colaborador registrado, pero faltan detalles por guardar. Revisa el aviso y reintenta.",
      );
      return;
    }

    if (altaCreadaId) toast.success("Detalles pendientes guardados.");
    reiniciarFormularioAlta();
    setActiveTab("expediente");
  };

  const crearApiDetallesAlta = (empleadoId: string): ApiDetallesAlta => {
    const base = `/gestion-humana/empleados/${empleadoId}`;
    const subir = (tipo: string, archivo: File, estudioId?: string) => {
      const fd = new FormData();
      fd.append("tipo", tipo);
      if (estudioId) fd.append("estudioId", estudioId);
      fd.append("archivo", archivo);
      return fetchAuthUpload(`${base}/documentos`, fd);
    };
    return {
      guardarDetalle: (d) =>
        fetchAuth(`${base}/detalles`, { method: "PUT", body: JSON.stringify(d) }),
      agregarFamiliar: (f) =>
        fetchAuth(`${base}/familiares`, { method: "POST", body: JSON.stringify(f) }),
      crearEstudio: (e) =>
        fetchAuth(`${base}/estudios`, { method: "POST", body: JSON.stringify(e) }),
      subirSoporteEstudio: (estudioId, archivo) => subir("SOPORTE_ESTUDIO", archivo, estudioId),
      subirCertificadoBancario: (archivo) => subir("CERTIFICADO_BANCARIO", archivo),
    };
  };

  /** Deja el alta como nueva: datos, detalles, familiares, estudios, archivos y estado de reintento. */
  const reiniciarFormularioAlta = () => {
    setTabRegistro("datos");
    setDetalleForm(DETALLE_VACIO);
    setFamiliaresNuevos([]);
    setEstudiosNuevos([]);
    setEstNuevoArchivo(null);
    setCertificadoNuevo(null);
    setFamNuevoNombre("");
    setFamNuevoParentesco("");
    setEstNuevoTitulo("");
    setEstNuevaInstitucion("");
    setAltaCreadaId(null);
    setAltaResultado(null);
    setConfirmarDescarteAlta(false);
    setEmpForm(empFormInicial(empresaActiva, areaPorDefecto, hoyLocalISO()));
  };

  const altaBase = useMemo(
    () => empFormInicial(empresaActiva, areaPorDefecto, hoyLocalISO()),
    [empresaActiva, areaPorDefecto],
  );
  const altaTieneCambios = hayCambiosPendientesAlta({
    empForm,
    base: altaBase,
    borrador: {
      detalle: detalleForm,
      familiares: familiaresNuevos,
      estudios: estudiosNuevos,
      certificado: certificadoNuevo,
    },
    enEdicion: {
      textos: [famNuevoNombre, famNuevoParentesco, estNuevoTitulo, estNuevaInstitucion],
      archivo: estNuevoArchivo,
    },
  });

  /** Cancelar, X y Escape: piden confirmación si hay cambios pendientes; nunca cierran mientras se guarda. */
  const solicitarCierreAlta = () => {
    const decision = resolverCierreAlta(altaTieneCambios, guardandoEmpleado);
    if (decision === "confirmar") setConfirmarDescarteAlta(true);
    else if (decision === "cerrar") setActiveTab("expediente");
  };

  const handleSaveSalario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpleado) return;
    try {
      await updateSalarioEmpleado(
        selectedEmpleado.id,
        Number(salarioForm.nuevoSalario),
        salarioForm.motivo,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el salario.");
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar el permiso.");
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar la falta.");
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
          {activeTab === "expediente" && puedeCrearEmpleado && (
            <Button onClick={() => setActiveTab("alta")} size="sm" className="gap-2">
              <UserPlus className="h-4 w-4" /> Registrar Colaborador
            </Button>
          )}
          {activeTab === "expediente" && !puedeCrearEmpleado && (
            <span className="self-center text-xs text-slate-500">
              Solicita el permiso empleados.crear para registrar colaboradores.
            </span>
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
      <div
        className={`flex border-b border-slate-200 mb-6 bg-white rounded-t-lg px-2 shadow-2xs ${
          activeTab === "alta" ? "hidden" : ""
        }`}
      >
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
        {puedeVerGestionInformacion && (
          <button
            onClick={() => setActiveTab("cargos")}
            className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "cargos"
                ? "border-blue-800 text-blue-800"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Briefcase className="h-4 w-4" /> Gestión de información
          </button>
        )}
        {puedeVerBiometrico && (
          <button
            onClick={() => setActiveTab("marcaciones")}
            className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "marcaciones"
                ? "border-blue-800 text-blue-800"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Fingerprint className="h-4 w-4" /> Marcaciones biométricas
          </button>
        )}
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

      {/* TAB: CARGOS */}
      {activeTab === "cargos" && puedeVerGestionInformacion && (
        <GestionInformacionPanel
          puedeVerCargos={puedeVerCargos}
          puedeGestionarCargos={puedeGestionarCargos}
          puedeVerInformacion={puedeVerInformacion}
          puedeGestionarInformacion={puedeGestionarInformacion}
        />
      )}

      {activeTab === "marcaciones" && puedeVerBiometrico && <BiometricoMarcacionesPanel />}

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
              opciones={[
                OPCION_SIN_AGRUPAR,
                { value: "area", label: "Departamento" },
                { value: "estado", label: "Estado" },
              ]}
            />
          </div>
          <Table>
            <TableHeader className="bg-slate-100/80">
              <TableRow className="hover:bg-slate-100/80">
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Cédula de ciudadanía
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Colaborador
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Empresa
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Cargo / Departamento
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Tipo de contrato
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Fechas Contratación
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                  Salario Actual
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-center">
                  Strikes
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Estado
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-slate-800 font-medium">
              {gruposEmpleados.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && (
                    <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={10} />
                  )}
                  {grupo.filas.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="px-4 py-3 font-mono text-xs text-slate-500">
                        {emp.documento}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="font-bold text-slate-900">
                          {emp.nombres} {emp.apellidos}
                        </p>
                        {emp.correo && (
                          <p className="text-[11px] text-slate-500 font-normal">{emp.correo}</p>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-blue-800 font-bold"
                        >
                          {emp.empresaId}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{emp.cargo}</p>
                        <p className="text-[11px] text-slate-500">{emp.area}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-800">
                        {emp.tipoContrato || <span className="text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs">
                        <p className="text-slate-600 font-bold">
                          Ingreso: {formatearFechaDia(emp.fechaContratacion)}
                        </p>
                        {emp.fechaLiquidacion && (
                          <p className="text-slate-900 font-bold">
                            Retiro: {formatearFechaDia(emp.fechaLiquidacion)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="num px-4 py-3 text-right font-bold text-slate-900">
                        {money(emp.salarioActual)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center font-bold">
                        {emp.strikesCount > 0 ? (
                          <Badge className="rounded-full border-transparent bg-slate-900 text-white">
                            {emp.strikesCount} ⚡
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400 font-normal">0</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <EstadoBadge estado={emp.estado} />
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          {puedeAbrirDetalles && (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setDetallesEmpleadoId(emp.id)}
                              className="h-7 text-[11px]"
                            >
                              <FileText className="h-3 w-3 mr-1" /> Detalles
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
                  <TableCell colSpan={10} className="p-0">
                    {loading ? (
                      <div className="py-12 text-center text-xs text-slate-500">
                        Cargando colaboradores...
                      </div>
                    ) : error ? (
                      <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                    ) : (
                      <EmptyState
                        icon={Users}
                        title="No hay colaboradores registrados para esta empresa"
                        description={
                          puedeCrearEmpleado
                            ? 'Haz clic en "Registrar Colaborador" para crear el primer expediente.'
                            : "Solicita al administrador el permiso empleados.crear para registrar colaboradores."
                        }
                        action={
                          puedeCrearEmpleado ? (
                            <Button
                              size="sm"
                              onClick={() => setActiveTab("alta")}
                              className="gap-2"
                            >
                              <UserPlus className="h-4 w-4" /> Registrar Colaborador
                            </Button>
                          ) : undefined
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
              opciones={[
                OPCION_SIN_AGRUPAR,
                { value: "tipo", label: "Tipo de permiso" },
                { value: "estado", label: "Estado" },
              ]}
            />
          </div>
          <Table>
            <TableHeader className="bg-slate-100/80">
              <TableRow className="hover:bg-slate-100/80">
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Colaborador
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Tipo Permiso
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Fechas (Inicio / Fin)
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-center">
                  Días
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Observaciones
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Estado
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-slate-800 font-medium">
              {gruposPermisos.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && (
                    <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={7} />
                  )}
                  {grupo.filas.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="px-4 py-3 font-bold text-slate-900">
                        {p.nombreEmpleado}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs font-bold text-blue-800">
                        {p.tipoPermiso}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs font-mono text-slate-600">
                        {formatearFechaDia(p.fechaInicio)} al {formatearFechaDia(p.fechaFin)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center font-bold text-xs text-slate-900">
                        {p.dias} días
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-500 max-w-[250px] truncate">
                        {p.observaciones || "-"}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <EstadoBadge estado={p.estado} />
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        {p.estado === "Pendiente" && (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="xs"
                              variant="success"
                              disabled={accionPermisoId === p.id}
                              onClick={async () => {
                                setAccionPermisoId(p.id);
                                try {
                                  await updateEstadoPermiso(p.id, "Aprobado");
                                } catch (err: unknown) {
                                  toast.error(
                                    err instanceof Error ? err.message : "Error al aprobar.",
                                  );
                                } finally {
                                  setAccionPermisoId(null);
                                }
                              }}
                              className="h-7 text-[11px]"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />{" "}
                              {accionPermisoId === p.id ? "..." : "Aprobar"}
                            </Button>
                            <Button
                              size="xs"
                              variant="destructive"
                              disabled={accionPermisoId === p.id}
                              onClick={async () => {
                                setAccionPermisoId(p.id);
                                try {
                                  await updateEstadoPermiso(p.id, "Rechazado");
                                } catch (err: unknown) {
                                  toast.error(
                                    err instanceof Error ? err.message : "Error al rechazar.",
                                  );
                                } finally {
                                  setAccionPermisoId(null);
                                }
                              }}
                              className="h-7 text-[11px]"
                            >
                              <XCircle className="h-3 w-3 mr-1" />{" "}
                              {accionPermisoId === p.id ? "..." : "Rechazar"}
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
                      <div className="py-12 text-center text-xs text-slate-500">
                        Cargando permisos...
                      </div>
                    ) : errorPermisos ? (
                      <div className="py-12 text-center text-xs text-slate-500">
                        {errorPermisos}
                      </div>
                    ) : (
                      <EmptyState
                        icon={Calendar}
                        title="No hay solicitudes de permiso registradas"
                        description='Haz clic en "Solicitar Permiso" para crear la primera.'
                        action={
                          <Button
                            size="sm"
                            onClick={() => setModalPermisoOpen(true)}
                            className="gap-2"
                          >
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
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Fecha
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Colaborador
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Gravedad
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Motivo de la Falta
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Descargos presentados
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Registrado Por
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-slate-800 font-medium">
              {gruposFaltas.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && (
                    <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={6} />
                  )}
                  {grupo.filas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="px-4 py-3 font-mono text-xs text-slate-500">
                        {new Date(f.fecha).toLocaleDateString("es-CO")}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-bold text-slate-900">
                        {f.nombreEmpleado}
                      </TableCell>
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
                      <TableCell className="px-4 py-3 text-xs font-semibold text-slate-800 max-w-[280px]">
                        {f.motivo}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-500 max-w-[250px] italic">
                        {f.descargos || "Sin descargos registrados"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-500">
                        {f.registradoPor}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              {filteredFaltas.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    {loading ? (
                      <div className="py-12 text-center text-xs text-slate-500">Cargando...</div>
                    ) : errorFaltas ? (
                      <div className="py-12 text-center text-xs text-slate-500">{errorFaltas}</div>
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

      {/* MODAL: DETALLES DEL COLABORADOR */}
      <EmpleadoDetallesDialog
        empleado={empleados.find((e) => e.id === detallesEmpleadoId) ?? null}
        onClose={() => setDetallesEmpleadoId(null)}
        permisos={permisosDetalles}
        cargos={cargosOpciones}
        opcionesSeguridadSocial={opcionesSeguridadSocial}
        onEditarCargoCorreo={editarEmpleado}
      />

      {activeTab === "alta" && (
        <section className="mx-auto w-full max-w-5xl space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs text-slate-500">
                Gestión Humana <span className="px-1">›</span> Expediente del Colaborador{" "}
                <span className="px-1">›</span>{" "}
                <span className="font-semibold">Nuevo colaborador</span>
              </p>
              <h2 className="text-xl font-bold text-slate-900">Registrar nuevo colaborador</h2>
              <p className="mt-1 text-xs text-slate-500">
                Completa el expediente inicial de contratación para la empresa activa.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={solicitarCierreAlta}>
              ← Volver a expedientes
            </Button>
          </div>

          <form
            onSubmit={handleSaveEmpleado}
            className="panel space-y-4 overflow-hidden rounded-lg border-slate-200 bg-white p-4 shadow-2xs"
          >
            <div className="-mx-4 -mt-4 border-b border-slate-200 bg-slate-50/80 p-4">
              <h3 className="text-sm font-bold text-slate-900">Datos de contratación</h3>
              <p className="mt-1 text-xs text-slate-500">
                Información necesaria para crear el expediente laboral.
              </p>
            </div>
            <Tabs
              value={puedeCapturarDetalles ? tabRegistro : "datos"}
              onValueChange={(v) => setTabRegistro(v as "datos" | "detalles")}
            >
              {puedeCapturarDetalles && (
                <TabsList className="mb-3">
                  <TabsTrigger value="datos" className="text-xs">
                    Datos del colaborador
                  </TabsTrigger>
                  <TabsTrigger value="detalles" className="text-xs">
                    Detalles
                  </TabsTrigger>
                </TabsList>
              )}
              <TabsContent value="datos" className="space-y-4 mt-0">
                {altaCreadaId && (
                  <p className="text-[11px] text-slate-500">
                    El colaborador ya fue registrado; estos datos quedaron bloqueados. Reintenta los
                    detalles pendientes desde la pestaña Detalles.
                  </p>
                )}
                <fieldset disabled={!!altaCreadaId} className="min-w-0 space-y-4 border-0 p-0 m-0">
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
                        Cédula de Ciudadanía *
                      </Label>
                      <Input
                        required
                        id="documento"
                        placeholder="Ej. 1020304050"
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
                      Correo Corporativo{correoRequerido ? " *" : " (opcional)"}
                    </Label>
                    <Input
                      required={correoRequerido}
                      type="email"
                      id="correo"
                      placeholder={`usuario@${DOMINIO_POR_EMPRESA[empForm.empresaId] ?? "empresa.com"}`}
                      value={empForm.correo}
                      onChange={(e) => setEmpForm({ ...empForm, correo: e.target.value })}
                      className="h-9 text-xs border-slate-300"
                    />
                    <p className="text-[11px] text-slate-400">
                      {DOMINIO_POR_EMPRESA[empForm.empresaId]
                        ? `Solo se permite el dominio de la empresa seleccionada (@${DOMINIO_POR_EMPRESA[empForm.empresaId]}).`
                        : "Solo se permiten correos corporativos."}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="cargo" className="text-xs font-semibold text-slate-700">
                        Cargo
                      </Label>
                      <Combobox
                        id="cargo"
                        options={cargosOpciones.map((c) => ({ value: c.id, label: c.nombre }))}
                        value={empForm.cargoId}
                        onValueChange={(val) => setEmpForm({ ...empForm, cargoId: val })}
                        placeholder="Selecciona un cargo"
                        searchPlaceholder="Buscar cargo..."
                        emptyText="No hay cargos activos."
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

                  <div className="space-y-1">
                    <Label htmlFor="tipo-contrato" className="text-xs font-semibold text-slate-700">
                      Tipo de contrato
                    </Label>
                    <Combobox
                      id="tipo-contrato"
                      options={opcionesSeguridadSocial.tiposContrato.map((n) => ({
                        value: n,
                        label: n,
                      }))}
                      value={empForm.tipoContrato}
                      onValueChange={(val) => setEmpForm({ ...empForm, tipoContrato: val })}
                      placeholder="Selecciona un tipo de contrato"
                      searchPlaceholder="Buscar..."
                      emptyText="Sin opciones. Agrégalas en Gestión de información."
                    />
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
                        onChange={(e) =>
                          setEmpForm({ ...empForm, fechaContratacion: e.target.value })
                        }
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
                </fieldset>
              </TabsContent>
              <TabsContent value="detalles" className="space-y-5 mt-0">
                {altaResultado && (
                  <div
                    role="alert"
                    className="space-y-2 rounded-md border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700"
                  >
                    <p className="font-bold text-slate-900">
                      Colaborador registrado. Los detalles se guardaron parcialmente.
                    </p>
                    {altaResultado.guardados.length > 0 && (
                      <div>
                        <p className="font-semibold">Guardado</p>
                        <ul className="list-disc pl-4">
                          {altaResultado.guardados.map((g) => (
                            <li key={g}>{g}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <p className="font-semibold">Pendiente (falló)</p>
                      <ul className="list-disc pl-4">
                        {altaResultado.fallidos.map((f) => (
                          <li key={f.etiqueta}>
                            {f.etiqueta}: {f.mensaje}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-slate-500">
                      Usa «Reintentar pendientes»: no se vuelve a crear el colaborador.
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-slate-500">
                  Información adicional opcional. Los adjuntos (PDF, PNG, JPG o WEBP de hasta 10 MB)
                  son privados y se suben al guardar el colaborador.
                </p>
                <section
                  className="space-y-3 rounded-md border border-slate-200 p-3"
                  aria-labelledby="reg-personal"
                >
                  <h4
                    id="reg-personal"
                    className="text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Información personal
                  </h4>
                  <DetallePersonalCampos
                    idPrefix="reg"
                    valor={detalleForm}
                    onChange={setDetalleForm}
                    opciones={opcionesSeguridadSocial}
                  />
                </section>

                <div className="space-y-2 rounded-md border border-slate-200 p-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Núcleo familiar
                  </h4>
                  <ul className="space-y-1">
                    {familiaresNuevos.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-xs text-slate-800"
                      >
                        <span>
                          {f.nombre} <span className="text-slate-500">· {f.parentesco}</span>
                        </span>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          aria-label={`Quitar familiar ${f.nombre}`}
                          onClick={() =>
                            setFamiliaresNuevos(familiaresNuevos.filter((_, j) => j !== i))
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                    {familiaresNuevos.length === 0 && (
                      <li className="text-xs text-slate-500">Sin familiares agregados.</li>
                    )}
                  </ul>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1 flex-1 min-w-40">
                      <Label
                        htmlFor="reg-fam-nombre"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Nombre
                      </Label>
                      <Input
                        id="reg-fam-nombre"
                        value={famNuevoNombre}
                        maxLength={255}
                        onChange={(e) => setFamNuevoNombre(e.target.value)}
                        className="h-9 text-xs border-slate-300"
                      />
                    </div>
                    <div className="space-y-1 w-44">
                      <Label
                        htmlFor="reg-fam-parentesco"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Parentesco
                      </Label>
                      <Input
                        id="reg-fam-parentesco"
                        value={famNuevoParentesco}
                        maxLength={50}
                        onChange={(e) => setFamNuevoParentesco(e.target.value)}
                        className="h-9 text-xs border-slate-300"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!famNuevoNombre.trim() || !famNuevoParentesco.trim()}
                      onClick={() => {
                        setFamiliaresNuevos([
                          ...familiaresNuevos,
                          { nombre: famNuevoNombre.trim(), parentesco: famNuevoParentesco.trim() },
                        ]);
                        setFamNuevoNombre("");
                        setFamNuevoParentesco("");
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Agregar
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-slate-200 p-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Estudios
                  </h4>
                  <ul className="space-y-1">
                    {estudiosNuevos.map((est, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-xs text-slate-800"
                      >
                        <span>
                          {est.titulo}
                          {est.institucion && (
                            <span className="text-slate-500"> · {est.institucion}</span>
                          )}
                          {est.archivo && (
                            <span className="ml-2 inline-flex items-center gap-1 text-slate-600">
                              <Paperclip className="h-3 w-3 text-slate-400" /> {est.archivo.name}
                            </span>
                          )}
                        </span>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          aria-label={`Quitar estudio ${est.titulo}`}
                          onClick={() =>
                            setEstudiosNuevos(estudiosNuevos.filter((_, j) => j !== i))
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                    {estudiosNuevos.length === 0 && (
                      <li className="text-xs text-slate-500">Sin estudios agregados.</li>
                    )}
                  </ul>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1 flex-1 min-w-40">
                      <Label
                        htmlFor="reg-est-titulo"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Título / estudio
                      </Label>
                      <Input
                        id="reg-est-titulo"
                        value={estNuevoTitulo}
                        maxLength={255}
                        onChange={(e) => setEstNuevoTitulo(e.target.value)}
                        className="h-9 text-xs border-slate-300"
                      />
                    </div>
                    <div className="space-y-1 flex-1 min-w-40">
                      <Label
                        htmlFor="reg-est-institucion"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Institución (opcional)
                      </Label>
                      <Input
                        id="reg-est-institucion"
                        value={estNuevaInstitucion}
                        maxLength={255}
                        onChange={(e) => setEstNuevaInstitucion(e.target.value)}
                        className="h-9 text-xs border-slate-300"
                      />
                    </div>
                    {permisosDetalles.gestionarDocumentos && (
                      <div className="flex items-center gap-2 pb-1">
                        <SelectorArchivo
                          etiqueta={estNuevoArchivo ? "Cambiar soporte" : "Adjuntar soporte"}
                          etiquetaAccesible="Adjuntar soporte del nuevo estudio"
                          onArchivo={(f) => {
                            const err = validarArchivoAdjunto(f);
                            if (err) toast.error(err);
                            else setEstNuevoArchivo(f);
                          }}
                        />
                        {estNuevoArchivo && (
                          <span className="max-w-40 truncate text-[11px] text-slate-600">
                            {estNuevoArchivo.name}
                          </span>
                        )}
                      </div>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!estNuevoTitulo.trim()}
                      onClick={() => {
                        setEstudiosNuevos([
                          ...estudiosNuevos,
                          {
                            titulo: estNuevoTitulo.trim(),
                            institucion: estNuevaInstitucion.trim(),
                            ...(estNuevoArchivo ? { archivo: estNuevoArchivo } : {}),
                          },
                        ]);
                        setEstNuevoTitulo("");
                        setEstNuevaInstitucion("");
                        setEstNuevoArchivo(null);
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Agregar
                    </Button>
                  </div>
                </div>

                {permisosDetalles.gestionarDocumentos && (
                  <div className="space-y-2 rounded-md border border-slate-200 p-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Certificado bancario
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <SelectorArchivo
                        etiqueta={certificadoNuevo ? "Cambiar certificado" : "Adjuntar certificado"}
                        etiquetaAccesible="Adjuntar certificado bancario"
                        onArchivo={(f) => {
                          const err = validarArchivoAdjunto(f);
                          if (err) toast.error(err);
                          else setCertificadoNuevo(f);
                        }}
                      />
                      {certificadoNuevo ? (
                        <>
                          <span className="text-xs text-slate-700">{certificadoNuevo.name}</span>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            aria-label="Quitar certificado bancario"
                            onClick={() => setCertificadoNuevo(null)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500">Sin certificado bancario.</span>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-200 pt-4 sm:flex-row">
              <Button type="button" variant="outline" size="sm" onClick={solicitarCierreAlta}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={guardandoEmpleado}>
                {altaCreadaId ? "Reintentar pendientes" : "Guardar Colaborador"}
              </Button>
            </div>
          </form>
        </section>
      )}

      <AlertDialog open={confirmarDescarteAlta} onOpenChange={setConfirmarDescarteAlta}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar el alta en curso?</AlertDialogTitle>
            <AlertDialogDescription>
              {altaCreadaId
                ? "El colaborador ya fue registrado, pero los detalles pendientes se perderán. Podrás completarlos después desde el botón «Detalles»."
                : "Se perderán los datos, detalles, familiares, estudios y archivos que ingresaste."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                reiniciarFormularioAlta();
                setActiveTab("expediente");
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                  onValueChange={(
                    val:
                      | "Vacaciones"
                      | "Licencia Médica"
                      | "Cita Médica"
                      | "Calamidad Doméstica"
                      | "Otro",
                  ) => setPermisoForm({ ...permisoForm, tipoPermiso: val })}
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
                onValueChange={(val: GravedadStrike) =>
                  setFaltaForm({ ...faltaForm, gravedad: val })
                }
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
              <Button type="submit" size="sm" variant="destructive" className="font-bold">
                Aplicar Sanción
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!empleadoAEliminar}
        onOpenChange={(open) => !open && setEmpleadoAEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar el expediente de {empleadoAEliminar?.nombres} {empleadoAEliminar?.apellidos}
              ?
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

      <AlertDialog
        open={!!empleadoALiquidar}
        onOpenChange={(open) => !open && setEmpleadoALiquidar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Liquidar al colaborador {empleadoALiquidar?.nombres}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              El colaborador quedará marcado como "Liquidado" con fecha de hoy. Esta acción queda
              registrada en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={liquidandoEmpleado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleLiquidarEmpleado} disabled={liquidandoEmpleado}>
              {liquidandoEmpleado ? "Liquidando..." : "Liquidar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
