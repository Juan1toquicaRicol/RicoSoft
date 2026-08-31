import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  FileSpreadsheet,
  History,
  Package,
  Paperclip,
  Plus,
  ShoppingBag,
  Trash2,
  Trophy,
  XCircle,
} from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  FilaGrupo,
  OPCION_SIN_AGRUPAR,
  SelectorAgrupacion,
} from "@/components/ui/selector-agrupacion";
import { agruparFilas } from "@/lib/agrupar";
import { Textarea } from "@/components/ui/textarea";
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
import {
  useSolicitudes,
  useCotizacionesProveedor,
  descargarCotizacionSolicitud,
  descargarCotizacionProveedor,
} from "@/hooks/use-solicitudes";
import { useProveedores } from "@/hooks/use-proveedores";
import { useDepartamentosPublico } from "@/hooks/use-departamentos-publico";
import { useUsuariosPorDepartamento } from "@/hooks/use-usuarios-por-departamento";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money, Prioridad } from "@/lib/data";

const PRIORIDADES_SOLICITUD: Prioridad[] = ["Baja", "Media", "Alta", "Urgente"];
const PROVEEDOR_MANUAL = "__manual__";

export const Route = createFileRoute("/solicitudes-compra")({
  head: () => ({
    meta: [
      { title: "Solicitudes de Compra | RicoSoft" },
      {
        name: "description",
        content: "Requerimientos y solicitudes internas de compra por área y empresa.",
      },
    ],
  }),
  component: SolicitudesCompraPage,
});

function SolicitudesCompraPage() {
  const { empresaActiva, empresas } = useTenant();
  const {
    solicitudesCompra,
    loading,
    error,
    addSolicitudCompra,
    subirCotizacionSolicitud,
    updateEstadoSolicitudCompra,
    eliminarSolicitudCompra,
  } = useSolicitudes();
  const { departamentos } = useDepartamentosPublico();
  const { proveedores } = useProveedores();
  const proveedoresActivos = proveedores.filter((p) => p.activo);
  const { user } = useSession();

  const puedeCrear = hasPermission(user, PERMISOS_SISTEMA.SOLICITUDES_CREAR);
  const puedeAprobar = hasPermission(user, PERMISOS_SISTEMA.SOLICITUDES_APROBAR);
  const puedeRechazar = hasPermission(user, PERMISOS_SISTEMA.SOLICITUDES_RECHAZAR);
  const puedeComprar = hasPermission(user, PERMISOS_SISTEMA.SOLICITUDES_COMPRAR);
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.SOLICITUDES_ELIMINAR);

  const [modalOpen, setModalOpen] = useState(false);
  const [confirmAccion, setConfirmAccion] = useState<{
    id: string;
    item: string;
    estado: "Aprobada" | "Rechazada" | "Comprado";
  } | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [aplicandoAccion, setAplicandoAccion] = useState(false);
  const [solicitudAEliminar, setSolicitudAEliminar] = useState<{ id: string; item: string } | null>(
    null,
  );
  const [eliminando, setEliminando] = useState(false);
  const [descargandoCotizacion, setDescargandoCotizacion] = useState(false);
  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);

  // Cuadro comparativo de cotizaciones de proveedor (regla de las 3 cotizaciones).
  const [cotizacionesModal, setCotizacionesModal] = useState<{
    id: string;
    item: string;
    area: string;
  } | null>(null);
  const {
    cotizaciones,
    loading: cargandoCotizaciones,
    error: errorCotizaciones,
    agregarCotizacion,
    eliminarCotizacion,
    seleccionarGanadora,
  } = useCotizacionesProveedor(cotizacionesModal?.id ?? null);
  // Mismo filtro por departamento que el formulario de la solicitud: cada
  // área solo cotiza con sus proveedores asignados + los generales.
  const areaCotizacionDepartamentoId = departamentos.find(
    (d) => d.nombre === cotizacionesModal?.area,
  )?.id;
  const proveedoresDelAreaCotizacion = proveedoresActivos.filter(
    (p) => !p.departamentoId || p.departamentoId === areaCotizacionDepartamentoId,
  );
  const [formCotizacion, setFormCotizacion] = useState({
    proveedorId: "",
    proveedorNombre: "",
    proveedorNit: "",
    valorTotalCOP: 0,
    tiempoEntregaDias: 0,
  });
  const [archivoCotizacion, setArchivoCotizacion] = useState<File | null>(null);
  const [guardandoCotizacion, setGuardandoCotizacion] = useState(false);
  const [accionCotizacionId, setAccionCotizacionId] = useState<string | null>(null);
  const archivoCotizacionRef = useRef<HTMLInputElement>(null);

  const handleVerCotizacion = async (id: string) => {
    setDescargandoCotizacion(true);
    try {
      const blob = await descargarCotizacionSolicitud(id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      toast.error(err.message || "No fue posible abrir la cotización.");
    } finally {
      setDescargandoCotizacion(false);
    }
  };

  const cotizacionFormInicial = {
    proveedorId: "",
    proveedorNombre: "",
    proveedorNit: "",
    valorTotalCOP: 0,
    tiempoEntregaDias: 0,
  };

  const abrirCotizaciones = (id: string, item: string, area: string) => {
    setFormCotizacion(cotizacionFormInicial);
    setArchivoCotizacion(null);
    setCotizacionesModal({ id, item, area });
  };

  const handleAgregarCotizacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivoCotizacion) {
      toast.error("Adjunta el documento de la cotización.");
      return;
    }
    if (!formCotizacion.proveedorId) {
      toast.error("Selecciona un proveedor del catálogo o elige registrarlo manualmente.");
      return;
    }
    if (
      formCotizacion.proveedorId === PROVEEDOR_MANUAL &&
      (!formCotizacion.proveedorNombre || !formCotizacion.proveedorNit)
    ) {
      toast.error("Escribe el nombre y el NIT del proveedor.");
      return;
    }
    setGuardandoCotizacion(true);
    try {
      await agregarCotizacion({
        proveedorId:
          formCotizacion.proveedorId === PROVEEDOR_MANUAL ? undefined : formCotizacion.proveedorId,
        proveedorNombre:
          formCotizacion.proveedorId === PROVEEDOR_MANUAL
            ? formCotizacion.proveedorNombre
            : undefined,
        proveedorNit:
          formCotizacion.proveedorId === PROVEEDOR_MANUAL ? formCotizacion.proveedorNit : undefined,
        valorTotalCOP: formCotizacion.valorTotalCOP,
        tiempoEntregaDias: formCotizacion.tiempoEntregaDias,
        archivo: archivoCotizacion,
      });
      toast.success("Cotización agregada.");
      setFormCotizacion(cotizacionFormInicial);
      setArchivoCotizacion(null);
      if (archivoCotizacionRef.current) archivoCotizacionRef.current.value = "";
    } catch (err: any) {
      toast.error(err.message || "No fue posible agregar la cotización.");
    } finally {
      setGuardandoCotizacion(false);
    }
  };

  const handleEliminarCotizacion = async (cotizacionId: string) => {
    setAccionCotizacionId(cotizacionId);
    try {
      await eliminarCotizacion(cotizacionId);
      toast.success("Cotización eliminada.");
    } catch (err: any) {
      toast.error(err.message || "No fue posible eliminar la cotización.");
    } finally {
      setAccionCotizacionId(null);
    }
  };

  const handleSeleccionarGanadora = async (cotizacionId: string) => {
    setAccionCotizacionId(cotizacionId);
    try {
      await seleccionarGanadora(cotizacionId);
      toast.success("Cotización ganadora seleccionada.");
    } catch (err: any) {
      toast.error(err.message || "No fue posible seleccionar la cotización ganadora.");
    } finally {
      setAccionCotizacionId(null);
    }
  };

  const handleVerCotizacionProveedor = async (cotizacionId: string) => {
    if (!cotizacionesModal) return;
    try {
      const blob = await descargarCotizacionProveedor(cotizacionesModal.id, cotizacionId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      toast.error(err.message || "No fue posible abrir el documento.");
    }
  };

  const abrirConfirmacion = (
    id: string,
    item: string,
    estado: "Aprobada" | "Rechazada" | "Comprado",
  ) => {
    setMotivoRechazo("");
    setConfirmAccion({ id, item, estado });
  };

  const handleConfirmarAccion = async () => {
    if (!confirmAccion) return;
    setAplicandoAccion(true);
    try {
      await updateEstadoSolicitudCompra(
        confirmAccion.id,
        confirmAccion.estado,
        confirmAccion.estado === "Rechazada" ? motivoRechazo || undefined : undefined,
      );
      toast.success(`Solicitud actualizada a "${confirmAccion.estado}".`);
      setConfirmAccion(null);
    } catch (err: any) {
      toast.error(err.message || "No fue posible actualizar la solicitud.");
    } finally {
      setAplicandoAccion(false);
    }
  };

  const handleEliminarSolicitud = async () => {
    if (!solicitudAEliminar) return;
    setEliminando(true);
    try {
      await eliminarSolicitudCompra(solicitudAEliminar.id);
      toast.success(`Solicitud "${solicitudAEliminar.item}" eliminada.`);
      setSolicitudAEliminar(null);
    } catch (err: any) {
      toast.error(err.message || "No fue posible eliminar la solicitud.");
    } finally {
      setEliminando(false);
    }
  };

  const [form, setForm] = useState({
    empresaId: empresaActiva === "ALL" ? "RC" : empresaActiva,
    area: "Sistemas",
    solicitanteId: "",
    proveedorId: "",
    item: "",
    descripcion: "",
    cantidad: 1,
    valorEstimado: 500000,
    prioridad: "Media" as Prioridad,
  });
  const [cotizacion, setCotizacion] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cotizacionInputRef = useRef<HTMLInputElement>(null);

  const areaDepartamentoId = departamentos.find((d) => d.nombre === form.area)?.id;
  const { usuarios: usuariosArea, loading: cargandoUsuariosArea } =
    useUsuariosPorDepartamento(areaDepartamentoId);
  // Cada departamento puede tener proveedores propios (p. ej. los de
  // Producción no deberían ofrecerse al crear una SC de Comercial): un
  // proveedor sin departamento asignado ("general") sigue apareciendo para
  // cualquier área, para no romper el catálogo compartido ya existente.
  const proveedoresDelArea = proveedoresActivos.filter(
    (p) => !p.departamentoId || p.departamentoId === areaDepartamentoId,
  );

  const filteredSolicitudes = useMemo(() => {
    if (empresaActiva === "ALL") return solicitudesCompra;
    return solicitudesCompra.filter((s) => s.empresaId === empresaActiva);
  }, [solicitudesCompra, empresaActiva]);

  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "area":
        return (s: (typeof filteredSolicitudes)[number]) => s.area;
      case "proveedor":
        return (s: (typeof filteredSolicitudes)[number]) => s.proveedor || "Sin proveedor";
      case "estado":
        return (s: (typeof filteredSolicitudes)[number]) => s.estado;
      default:
        return null;
    }
  }, [agrupacion]);

  const gruposSolicitudes = useMemo(
    () => agruparFilas(filteredSolicitudes, claveDeAgrupacion),
    [filteredSolicitudes, claveDeAgrupacion],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item || !form.solicitanteId) {
      if (form.item && !form.solicitanteId) toast.error("Selecciona el responsable del área.");
      return;
    }
    setGuardando(true);
    try {
      const creada = await addSolicitudCompra({
        empresaId: form.empresaId,
        area: form.area,
        solicitanteId: form.solicitanteId,
        proveedorId: form.proveedorId || undefined,
        item: form.item,
        descripcion: form.descripcion,
        cantidad: Number(form.cantidad),
        valorEstimado: Number(form.valorEstimado),
        prioridad: form.prioridad,
      });
      if (cotizacion) {
        try {
          await subirCotizacionSolicitud(creada.id, cotizacion);
        } catch (err: any) {
          toast.error(
            err.message || "La solicitud se creó, pero no fue posible adjuntar la cotización.",
          );
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Error al registrar la solicitud.");
      setGuardando(false);
      return;
    }
    setGuardando(false);
    setModalOpen(false);
    setForm({
      empresaId: empresaActiva === "ALL" ? "RC" : empresaActiva,
      area: "Sistemas",
      solicitanteId: "",
      proveedorId: "",
      item: "",
      descripcion: "",
      cantidad: 1,
      valorEstimado: 500000,
      prioridad: "Media",
    });
    setCotizacion(null);
    if (cotizacionInputRef.current) cotizacionInputRef.current.value = "";
  };

  return (
    <AppShell
      title="Solicitudes de Compra Internas"
      description="Solicitudes activas pendientes de gestión. Al aprobar o rechazar, la solicitud pasa a Historia de Compras."
      actions={
        <>
          <Link to="/historia-compras">
            <Button variant="outline" size="sm" className="gap-2">
              <History className="h-4 w-4" /> Ver Historia de Compras
            </Button>
          </Link>
          <Button onClick={() => setModalOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> Crear Solicitud de Compra
          </Button>
        </>
      }
    >
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/80">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Listado de Solicitudes Internas</h3>
            <p className="text-xs text-slate-500 font-medium">
              Flujo de aprobación para compras de insumos y servicios.
            </p>
          </div>
          <SelectorAgrupacion
            value={agrupacion}
            onChange={setAgrupacion}
            opciones={[
              OPCION_SIN_AGRUPAR,
              { value: "area", label: "Área" },
              { value: "proveedor", label: "Proveedor" },
              { value: "estado", label: "Estado" },
              { value: "empresa", label: "Empresa" },
            ]}
          />
        </div>
        <Table>
          <TableHeader className="bg-slate-100/80">
            <TableRow className="hover:bg-slate-100/80">
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Fecha
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Empresa
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Ítem Solicitado
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Proveedor
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Área / Solicitante
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-center">
                Cant.
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Valor Estimado
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Prioridad
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
            {gruposSolicitudes.map((grupo) => (
              <Fragment key={grupo.clave || "sin-grupo"}>
                {grupo.clave && (
                  <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={10} />
                )}
                {grupo.filas.map((sol) => (
                  <TableRow key={sol.id}>
                    <TableCell className="px-4 py-3 font-mono text-xs text-slate-500">
                      {new Date(sol.fechaSolicitud).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="border-blue-200 bg-blue-50 text-blue-800 font-bold"
                      >
                        {sol.empresaId}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-slate-900 text-xs">{sol.item}</p>
                        {sol.cotizacion && (
                          <button
                            type="button"
                            title={`Ver cotización: ${sol.cotizacion.nombre}`}
                            disabled={descargandoCotizacion}
                            onClick={() => handleVerCotizacion(sol.id)}
                            className="shrink-0 text-slate-400 hover:text-blue-700"
                          >
                            <Paperclip className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate max-w-[200px]">
                        {sol.descripcion || "-"}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs font-semibold text-slate-800">
                      {sol.proveedor || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{sol.solicitante}</p>
                      <p className="text-[11px] text-slate-500">{sol.area}</p>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-center font-bold text-xs text-slate-900">
                      {sol.cantidad}
                    </TableCell>
                    <TableCell className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">
                      {money(sol.valorEstimado)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-500">
                      {sol.prioridad}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <EstadoBadge estado={sol.estado} />
                      {(sol.estado === "Pendiente" || sol.estado === "En Cotización") && (
                        <p className="mt-1 text-[10px] font-semibold text-slate-500">
                          {sol.cotizacionesResumen.total}/{sol.cotizacionesResumen.requeridas}{" "}
                          cotizaciones
                          {sol.cotizacionesResumen.tieneGanadora ? " · ganadora elegida" : ""}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {(sol.estado === "Pendiente" || sol.estado === "En Cotización") && (
                          <>
                            {(puedeCrear || puedeAprobar) && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => abrirCotizaciones(sol.id, sol.item, sol.area)}
                                className="h-7 text-[11px]"
                              >
                                <FileSpreadsheet className="h-3 w-3 mr-1" /> Cotizaciones
                              </Button>
                            )}
                            {puedeAprobar && (
                              <Button
                                size="xs"
                                variant="success"
                                disabled={
                                  sol.cotizacionesResumen.total <
                                    sol.cotizacionesResumen.requeridas ||
                                  !sol.cotizacionesResumen.tieneGanadora
                                }
                                title={
                                  sol.cotizacionesResumen.total <
                                    sol.cotizacionesResumen.requeridas ||
                                  !sol.cotizacionesResumen.tieneGanadora
                                    ? `Se requieren ${sol.cotizacionesResumen.requeridas} cotizaciones y una ganadora elegida.`
                                    : undefined
                                }
                                onClick={() => abrirConfirmacion(sol.id, sol.item, "Aprobada")}
                                className="h-7 text-[11px]"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
                              </Button>
                            )}
                            {puedeRechazar && (
                              <Button
                                size="xs"
                                variant="destructive"
                                onClick={() => abrirConfirmacion(sol.id, sol.item, "Rechazada")}
                                className="h-7 text-[11px]"
                              >
                                <XCircle className="h-3 w-3 mr-1" /> Rechazar
                              </Button>
                            )}
                          </>
                        )}
                        {sol.estado === "Aprobada" && puedeComprar && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => abrirConfirmacion(sol.id, sol.item, "Comprado")}
                            className="h-7 text-[11px]"
                          >
                            <Package className="h-3 w-3 mr-1" /> Marcar Comprado
                          </Button>
                        )}
                        {puedeEliminar && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setSolicitudAEliminar({ id: sol.id, item: sol.item })}
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
            {filteredSolicitudes.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={10} className="p-0">
                  {loading ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      Cargando solicitudes...
                    </div>
                  ) : error ? (
                    <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                  ) : (
                    <EmptyState
                      icon={ShoppingBag}
                      title="No hay solicitudes de compra en esta empresa"
                      description='Haz clic en "Crear Solicitud de Compra" para registrar la primera.'
                      action={
                        <Button size="sm" onClick={() => setModalOpen(true)} className="gap-2">
                          <Plus className="h-4 w-4" /> Crear Solicitud de Compra
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

      {/* MODAL CREAR SOLICITUD DE COMPRA */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Nueva Solicitud de Compra Interna
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Requerimiento de compra por área empresarial.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="empresaId" className="text-xs font-semibold text-slate-700">
                  Empresa
                </Label>
                <Select
                  value={form.empresaId}
                  onValueChange={(val) => setForm({ ...form, empresaId: val })}
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
                <Label htmlFor="area" className="text-xs font-semibold text-slate-700">
                  Área Solicitante
                </Label>
                <Select
                  value={form.area}
                  onValueChange={(val) =>
                    setForm({ ...form, area: val, solicitanteId: "", proveedorId: "" })
                  }
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
                <Label htmlFor="solicitante" className="text-xs font-semibold text-slate-700">
                  Responsable / Solicitante *
                </Label>
                <Select
                  value={form.solicitanteId}
                  onValueChange={(val) => setForm({ ...form, solicitanteId: val })}
                  disabled={
                    !areaDepartamentoId || cargandoUsuariosArea || usuariosArea.length === 0
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue
                      placeholder={
                        cargandoUsuariosArea
                          ? "Cargando usuarios..."
                          : usuariosArea.length === 0
                            ? "Sin usuarios en esta área"
                            : "Selecciona un responsable"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {usuariosArea.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {u.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="item" className="text-xs font-semibold text-slate-700">
                  Ítem / Producto Solicitado *
                </Label>
                <Input
                  required
                  id="item"
                  placeholder="Ej: Servidor NAS 16TB"
                  value={form.item}
                  onChange={(e) => setForm({ ...form, item: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="proveedor" className="text-xs font-semibold text-slate-700">
                Proveedor (opcional)
              </Label>
              <Select
                value={form.proveedorId || "__none__"}
                onValueChange={(val) =>
                  setForm({ ...form, proveedorId: val === "__none__" ? "" : val })
                }
              >
                <SelectTrigger id="proveedor" className="h-9 text-xs border-slate-300 bg-white">
                  <SelectValue placeholder="Sin proveedor asociado" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="__none__" className="text-xs">
                    Sin proveedor asociado
                  </SelectItem>
                  {proveedoresDelArea.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {proveedoresDelArea.length === 0 && (
                <p className="text-[11px] font-semibold text-slate-600">
                  {proveedoresActivos.length === 0
                    ? "No hay proveedores registrados."
                    : `No hay proveedores asignados al área "${form.area}".`}{" "}
                  <Link to="/configuracion/proveedores" className="font-semibold underline">
                    Créalos en Configuración
                  </Link>{" "}
                  si ya sabes a quién se le va a comprar.
                </p>
              )}
            </div>
            {areaDepartamentoId && !cargandoUsuariosArea && usuariosArea.length === 0 && (
              <p className="-mt-2 text-[11px] font-semibold text-slate-600">
                No hay usuarios asignados a "{form.area}". Asígnalos en Configuración &gt; Usuarios.
              </p>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cantidad" className="text-xs font-semibold text-slate-700">
                  Cantidad
                </Label>
                <Input
                  type="number"
                  id="cantidad"
                  value={form.cantidad}
                  onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prioridad" className="text-xs font-semibold text-slate-700">
                  Prioridad
                </Label>
                <Select
                  value={form.prioridad}
                  onValueChange={(val) => setForm({ ...form, prioridad: val as Prioridad })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {PRIORIDADES_SOLICITUD.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="valorEstimado" className="text-xs font-semibold text-slate-700">
                  Valor Estimado (COP)
                </Label>
                <Input
                  type="number"
                  id="valorEstimado"
                  value={form.valorEstimado}
                  onChange={(e) => setForm({ ...form, valorEstimado: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="descripcion" className="text-xs font-semibold text-slate-700">
                Justificación de la Compra
              </Label>
              <Input
                id="descripcion"
                placeholder="Explicación del uso o necesidad corporativa..."
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cotizacion" className="text-xs font-semibold text-slate-700">
                Cotización adjunta (opcional)
              </Label>
              <div className="flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <Input
                  ref={cotizacionInputRef}
                  type="file"
                  id="cotizacion"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setCotizacion(e.target.files?.[0] || null)}
                  className="h-9 text-xs border-slate-300 file:mr-2 file:text-xs file:font-semibold"
                />
              </div>
              <p className="text-[11px] text-slate-500">PDF, PNG, JPG o WEBP. Máximo 10MB.</p>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={guardando}
                className="bg-blue-800 text-white hover:bg-blue-900 font-bold"
              >
                {guardando ? "Guardando..." : "Registrar Solicitud"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CUADRO COMPARATIVO DE COTIZACIONES DE PROVEEDOR */}
      <Dialog
        open={!!cotizacionesModal}
        onOpenChange={(open) => !open && setCotizacionesModal(null)}
      >
        <DialogContent className="sm:max-w-2xl bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Cotizaciones de proveedor — {cotizacionesModal?.item}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Se requieren exactamente 3 cotizaciones completas y una elegida como ganadora para
              poder aprobar la solicitud.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow className="hover:bg-slate-100/80">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-3 py-2">
                    Proveedor
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-3 py-2">
                    NIT
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-3 py-2 text-right">
                    Valor COP
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-3 py-2 text-center">
                    Entrega (días)
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-3 py-2 text-center">
                    Documento
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-3 py-2 text-right">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-slate-800 font-medium">
                {cotizaciones.map((c) => (
                  <TableRow key={c.id} className={c.esGanadora ? "bg-blue-50/60" : undefined}>
                    <TableCell className="px-3 py-2 text-xs font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        {c.esGanadora && <Trophy className="h-3.5 w-3.5 text-blue-700" />}
                        {c.proveedorNombre}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs">{c.proveedorNit}</TableCell>
                    <TableCell className="num px-3 py-2 text-right text-xs font-bold">
                      {money(c.valorTotalCOP)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-center text-xs">
                      {c.tiempoEntregaDias}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-center">
                      <button
                        type="button"
                        title={`Ver documento: ${c.archivo.nombre}`}
                        onClick={() => handleVerCotizacionProveedor(c.id)}
                        className="text-slate-400 hover:text-blue-700"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {puedeAprobar && !c.esGanadora && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={cotizaciones.length < 3 || accionCotizacionId === c.id}
                            onClick={() => handleSeleccionarGanadora(c.id)}
                            className="h-6 text-[10px]"
                          >
                            Elegir ganadora
                          </Button>
                        )}
                        {puedeCrear && (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={accionCotizacionId === c.id}
                            onClick={() => handleEliminarCotizacion(c.id)}
                            className="h-6 text-[10px] text-slate-500 hover:text-slate-900"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {cotizaciones.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="px-3 py-6 text-center text-xs text-slate-500">
                      {cargandoCotizaciones
                        ? "Cargando cotizaciones..."
                        : errorCotizaciones || "Todavía no hay cotizaciones registradas."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {puedeCrear && cotizaciones.length < 3 && (
              <form
                onSubmit={handleAgregarCotizacion}
                className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
              >
                <p className="text-xs font-bold text-slate-700">
                  Agregar cotización ({cotizaciones.length}/3)
                </p>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Proveedor *</Label>
                  <Select
                    value={formCotizacion.proveedorId}
                    onValueChange={(val) =>
                      setFormCotizacion({
                        ...formCotizacion,
                        proveedorId: val,
                        proveedorNombre: "",
                        proveedorNit: "",
                      })
                    }
                  >
                    <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                      <SelectValue placeholder="Selecciona un proveedor" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      {proveedoresDelAreaCotizacion.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.nombre}
                        </SelectItem>
                      ))}
                      <SelectItem value={PROVEEDOR_MANUAL} className="text-xs">
                        Otro proveedor (no está en el catálogo)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {proveedoresDelAreaCotizacion.length === 0 && (
                    <p className="text-[11px] text-slate-500">
                      No hay proveedores asignados a "{cotizacionesModal?.area}" en el catálogo.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {formCotizacion.proveedorId === PROVEEDOR_MANUAL ? (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">
                          Nombre del proveedor *
                        </Label>
                        <Input
                          required
                          value={formCotizacion.proveedorNombre}
                          onChange={(e) =>
                            setFormCotizacion({
                              ...formCotizacion,
                              proveedorNombre: e.target.value,
                            })
                          }
                          className="h-9 text-xs border-slate-300 bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">NIT *</Label>
                        <Input
                          required
                          value={formCotizacion.proveedorNit}
                          onChange={(e) =>
                            setFormCotizacion({ ...formCotizacion, proveedorNit: e.target.value })
                          }
                          className="h-9 text-xs border-slate-300 bg-white"
                        />
                      </div>
                    </>
                  ) : (
                    formCotizacion.proveedorId && (
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">NIT</Label>
                        <Input
                          disabled
                          value={
                            proveedoresDelAreaCotizacion.find(
                              (p) => p.id === formCotizacion.proveedorId,
                            )?.nit ?? ""
                          }
                          className="h-9 text-xs border-slate-300 bg-slate-50 text-slate-500"
                        />
                      </div>
                    )
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">
                      Valor total (COP) *
                    </Label>
                    <Input
                      required
                      type="number"
                      min={1}
                      value={formCotizacion.valorTotalCOP}
                      onChange={(e) =>
                        setFormCotizacion({
                          ...formCotizacion,
                          valorTotalCOP: Number(e.target.value),
                        })
                      }
                      className="h-9 text-xs border-slate-300 bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">
                      Tiempo de entrega (días) *
                    </Label>
                    <Input
                      required
                      type="number"
                      min={0}
                      value={formCotizacion.tiempoEntregaDias}
                      onChange={(e) =>
                        setFormCotizacion({
                          ...formCotizacion,
                          tiempoEntregaDias: Number(e.target.value),
                        })
                      }
                      className="h-9 text-xs border-slate-300 bg-white"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">
                    Documento de la cotización *
                  </Label>
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <Input
                      ref={archivoCotizacionRef}
                      required
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => setArchivoCotizacion(e.target.files?.[0] || null)}
                      className="h-9 text-xs border-slate-300 bg-white file:mr-2 file:text-xs file:font-semibold"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={guardandoCotizacion}
                    className="bg-blue-800 text-white hover:bg-blue-900 font-bold"
                  >
                    {guardandoCotizacion ? "Guardando..." : "Agregar Cotización"}
                  </Button>
                </div>
              </form>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCotizacionesModal(null)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmAccion} onOpenChange={(open) => !open && setConfirmAccion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAccion?.estado === "Aprobada" && "¿Aprobar esta solicitud?"}
              {confirmAccion?.estado === "Rechazada" && "¿Rechazar esta solicitud?"}
              {confirmAccion?.estado === "Comprado" && "¿Marcar esta solicitud como comprada?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Solicitud de <strong>{confirmAccion?.item}</strong>. Esta acción queda registrada con
              tu usuario y la hora actual, y se reflejará en Historia de Compras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmAccion?.estado === "Rechazada" && (
            <div className="space-y-1.5">
              <Label htmlFor="motivoRechazo" className="text-xs font-semibold text-slate-700">
                Motivo del rechazo (opcional)
              </Label>
              <Textarea
                id="motivoRechazo"
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Explica por qué se rechaza esta solicitud..."
                className="text-sm"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aplicandoAccion}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarAccion} disabled={aplicandoAccion}>
              {aplicandoAccion ? "Aplicando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!solicitudAEliminar}
        onOpenChange={(open) => !open && setSolicitudAEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar la solicitud "{solicitudAEliminar?.item}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. La solicitud dejará de aparecer en el sistema, pero queda
              registrada en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={handleEliminarSolicitud}
              disabled={eliminando}
            >
              {eliminando ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
