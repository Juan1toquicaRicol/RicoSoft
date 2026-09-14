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
import { z } from "zod";

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
import { Combobox } from "@/components/ui/combobox";
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
import { useTenant, siglaEmpresa, empresaIdDeTenant } from "@/lib/tenant-context";
import {
  useSolicitudes,
  useCotizacionesProveedor,
  agregarCotizacionProveedor,
  descargarCotizacionSolicitud,
  descargarCotizacionProveedor,
} from "@/hooks/use-solicitudes";
import { useProveedorBusqueda, type ProveedorOpcion } from "@/hooks/use-proveedores";
import { useDepartamentosPublico } from "@/hooks/use-departamentos-publico";
import { useUsuariosPorDepartamento } from "@/hooks/use-usuarios-por-departamento";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { money, Prioridad } from "@/lib/data";

const PRIORIDADES_SOLICITUD: Prioridad[] = ["Baja", "Media", "Alta", "Urgente"];
const PROVEEDOR_MANUAL = "__manual__";

interface FilaCotizacion {
  proveedorId: string;
  proveedorNombre: string;
  proveedorNit: string;
  valorTotalCOP: number;
  tiempoEntregaDias: number;
  archivo: File | null;
  proveedorSeleccionado: ProveedorOpcion | null;
}

// Búsqueda opcional para prellenar el formulario de nueva solicitud desde
// otra pantalla (ej. "Necesidades de abastecimiento" en Inventario) — nunca
// crea la solicitud automáticamente, solo prellena item/cantidad para que
// el usuario revise y complete el resto (empresa, responsable, proveedor)
// antes de guardar, igual que si la hubiera escrito a mano.
const busquedaSolicitudSchema = z.object({
  item: z.string().optional(),
  cantidad: z.number().positive().optional(),
});

export const Route = createFileRoute("/solicitudes-compra/")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.SOLICITUDES_VER),
  head: () => ({
    meta: [
      { title: "Solicitudes de Compra | RicoSoft" },
      {
        name: "description",
        content: "Requerimientos y solicitudes internas de compra por departamento y empresa.",
      },
    ],
  }),
  validateSearch: busquedaSolicitudSchema,
  component: SolicitudesCompraPage,
});

function SolicitudesCompraPage() {
  const prellenado = Route.useSearch();
  const { empresaActiva, empresas } = useTenant();
  const {
    solicitudesCompra,
    loading,
    error,
    refresh: refrescarSolicitudes,
    addSolicitudCompra,
    updateEstadoSolicitudCompra,
    eliminarSolicitudCompra,
  } = useSolicitudes();
  const { departamentos } = useDepartamentosPublico();
  const [proveedorCotizacionSeleccionado, setProveedorCotizacionSeleccionado] =
    useState<ProveedorOpcion | null>(null);
  const { user } = useSession();
  const empresaBloqueada =
    empresaIdDeTenant(user?.tenantNombre) || (empresaActiva !== "ALL" ? empresaActiva : null);

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
    solicitanteId: string | null | undefined;
    minimo: number;
    maximo: number;
  } | null>(null);
  const {
    cotizaciones,
    loading: cargandoCotizaciones,
    error: errorCotizaciones,
    agregarCotizacion,
    eliminarCotizacion,
    seleccionarGanadora,
  } = useCotizacionesProveedor(cotizacionesModal?.id ?? null, refrescarSolicitudes);
  // Mismo filtro por departamento que el formulario de la solicitud: cada
  // área solo cotiza con sus proveedores asignados + los generales. La
  // búsqueda ahora es server-side (ver useProveedorBusqueda) — el filtro por
  // departamento también lo aplica el backend, no un .filter() en cliente.
  const areaCotizacionDepartamentoId = departamentos.find(
    (d) => d.nombre === cotizacionesModal?.area,
  )?.id;
  const {
    opciones: proveedoresDelAreaCotizacion,
    loading: buscandoProveedoresCotizacion,
    buscar: buscarProveedoresCotizacion,
  } = useProveedorBusqueda(areaCotizacionDepartamentoId);
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible abrir la cotización.");
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

  const abrirCotizaciones = (
    id: string,
    item: string,
    area: string,
    solicitanteId: string | null | undefined,
    minimo: number,
    maximo: number,
  ) => {
    setFormCotizacion(cotizacionFormInicial);
    setProveedorCotizacionSeleccionado(null);
    setArchivoCotizacion(null);
    setCotizacionesModal({ id, item, area, solicitanteId, minimo, maximo });
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
      setProveedorCotizacionSeleccionado(null);
      setArchivoCotizacion(null);
      if (archivoCotizacionRef.current) archivoCotizacionRef.current.value = "";
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible agregar la cotización.");
    } finally {
      setGuardandoCotizacion(false);
    }
  };

  const handleEliminarCotizacion = async (cotizacionId: string) => {
    setAccionCotizacionId(cotizacionId);
    try {
      await eliminarCotizacion(cotizacionId);
      toast.success("Cotización eliminada.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar la cotización.");
    } finally {
      setAccionCotizacionId(null);
    }
  };

  const handleSeleccionarGanadora = async (cotizacionId: string) => {
    setAccionCotizacionId(cotizacionId);
    try {
      await seleccionarGanadora(cotizacionId);
      toast.success("Cotización ganadora seleccionada.");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "No fue posible seleccionar la cotización ganadora.",
      );
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible abrir el documento.");
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible actualizar la solicitud.");
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar la solicitud.");
    } finally {
      setEliminando(false);
    }
  };

  const [form, setForm] = useState({
    empresaId: empresaBloqueada || "RC",
    area: "Sistemas",
    solicitanteId: "",
    item: prellenado.item ?? "",
    descripcion: prellenado.item
      ? "Generado desde Inventario > Necesidades de abastecimiento — revisa cantidad/proveedor antes de enviar."
      : "",
    cantidad: prellenado.cantidad ? Math.ceil(prellenado.cantidad) : 1,
    prioridad: "Media" as Prioridad,
  });
  const [guardando, setGuardando] = useState(false);

  const areaDepartamentoId = departamentos.find((d) => d.nombre === form.area)?.id;
  const { usuarios: usuariosArea, loading: cargandoUsuariosArea } =
    useUsuariosPorDepartamento(areaDepartamentoId);
  // Cotizaciones de proveedor cargadas de una vez en el mismo modal de
  // creación (2 o 3, la regla de negocio del cuadro comparativo) — se suben
  // justo después de crear la solicitud, sin necesidad de abrir el cuadro
  // comparativo por separado.
  const filaCotizacionVacia: FilaCotizacion = {
    proveedorId: "",
    proveedorNombre: "",
    proveedorNit: "",
    valorTotalCOP: 0,
    tiempoEntregaDias: 0,
    archivo: null,
    proveedorSeleccionado: null,
  };
  const [filasCotizacion, setFilasCotizacion] = useState<FilaCotizacion[]>([
    { ...filaCotizacionVacia },
    { ...filaCotizacionVacia },
  ]);
  const [formVersion, setFormVersion] = useState(0);
  const {
    opciones: proveedoresParaCotizar,
    loading: buscandoProveedoresParaCotizar,
    buscar: buscarProveedoresParaCotizar,
  } = useProveedorBusqueda(areaDepartamentoId);

  const actualizarFilaCotizacion = (index: number, patch: Partial<FilaCotizacion>) => {
    setFilasCotizacion((filas) => filas.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };
  const agregarFilaCotizacion = () => {
    if (filasCotizacion.length >= 3) return;
    setFilasCotizacion((filas) => [...filas, { ...filaCotizacionVacia }]);
  };
  const quitarFilaCotizacion = (index: number) => {
    setFilasCotizacion((filas) => (filas.length > 1 ? filas.filter((_, i) => i !== index) : filas));
  };

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
      if (form.item && !form.solicitanteId)
        toast.error("Selecciona el responsable del departamento.");
      return;
    }
    // Filas que el usuario empezó a llenar (con proveedor elegido) deben
    // quedar completas antes de intentar guardar — una fila totalmente vacía
    // simplemente se ignora (no todas las filas son obligatorias).
    const filasIncompletas = filasCotizacion.some(
      (f) =>
        f.proveedorId &&
        (!f.archivo ||
          f.valorTotalCOP <= 0 ||
          (f.proveedorId === PROVEEDOR_MANUAL && (!f.proveedorNombre || !f.proveedorNit))),
    );
    if (filasIncompletas) {
      toast.error(
        "Completa proveedor, valor y documento de cada cotización que hayas empezado a llenar (o quítala).",
      );
      return;
    }
    const filasCompletas = filasCotizacion.filter((f) => f.proveedorId && f.archivo);
    // Sin un campo de valor estimado en el formulario, se toma como estimado
    // inicial el promedio de las cotizaciones ya cargadas (0 si todavía no
    // hay ninguna) — se corrige solo al aprobar, con el valor real de la
    // cotización ganadora (ver solicitudes.controller.ts).
    const valorEstimadoInicial = filasCompletas.length
      ? Math.round(
          filasCompletas.reduce((sum, f) => sum + f.valorTotalCOP, 0) / filasCompletas.length,
        )
      : 0;
    setGuardando(true);
    try {
      const creada = await addSolicitudCompra({
        empresaId: form.empresaId,
        area: form.area,
        solicitanteId: form.solicitanteId,
        item: form.item,
        descripcion: form.descripcion,
        cantidad: Number(form.cantidad),
        valorEstimado: valorEstimadoInicial,
        prioridad: form.prioridad,
      });
      let cotizacionesConError = 0;
      for (const fila of filasCompletas) {
        try {
          await agregarCotizacionProveedor(creada.id, {
            proveedorId: fila.proveedorId === PROVEEDOR_MANUAL ? undefined : fila.proveedorId,
            proveedorNombre:
              fila.proveedorId === PROVEEDOR_MANUAL ? fila.proveedorNombre : undefined,
            proveedorNit: fila.proveedorId === PROVEEDOR_MANUAL ? fila.proveedorNit : undefined,
            valorTotalCOP: fila.valorTotalCOP,
            tiempoEntregaDias: fila.tiempoEntregaDias,
            archivo: fila.archivo!,
          });
        } catch {
          cotizacionesConError += 1;
        }
      }
      if (cotizacionesConError > 0) {
        toast.error(
          `La solicitud se creó, pero ${cotizacionesConError} cotización(es) no se pudieron registrar. Agrégalas desde el detalle de la solicitud.`,
        );
      }
      await refrescarSolicitudes();
      setModalOpen(false);
      setForm({
        empresaId: empresaBloqueada || "RC",
        area: "Sistemas",
        solicitanteId: "",
        item: "",
        descripcion: "",
        cantidad: 1,
        prioridad: "Media",
      });
      setFilasCotizacion([{ ...filaCotizacionVacia }, { ...filaCotizacionVacia }]);
      setFormVersion((v) => v + 1);
      toast.success("Solicitud registrada.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar la solicitud.");
    } finally {
      setGuardando(false);
    }
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
              { value: "area", label: "Departamento" },
              { value: "proveedor", label: "Proveedor" },
              { value: "estado", label: "Estado" },
              { value: "empresa", label: "Empresa" },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
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
                  Departamento / Solicitante
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-center">
                  Cant.
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                  Menor valor
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
                    <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={9} />
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
                          {siglaEmpresa(sol.empresaId)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link
                            to="/solicitudes-compra/$id"
                            params={{ id: sol.id }}
                            className="font-bold text-slate-900 text-xs hover:text-blue-800 hover:underline"
                          >
                            {sol.item}
                          </Link>
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
                      <TableCell className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{sol.solicitante}</p>
                        <p className="text-[11px] text-slate-500">{sol.area}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center font-bold text-xs text-slate-900">
                        {sol.cantidad}
                      </TableCell>
                      <TableCell className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">
                        {sol.cotizacionesResumen.menorValor != null
                          ? money(sol.cotizacionesResumen.menorValor)
                          : "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-500">
                        {sol.prioridad}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <EstadoBadge estado={sol.estado} />
                        {(sol.estado === "Pendiente" || sol.estado === "En Cotización") && (
                          <p className="mt-1 text-[10px] font-semibold text-slate-500">
                            {sol.cotizacionesResumen.total}/{sol.cotizacionesResumen.maximo}{" "}
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
                                  onClick={() =>
                                    abrirCotizaciones(
                                      sol.id,
                                      sol.item,
                                      sol.area,
                                      sol.solicitanteId,
                                      sol.cotizacionesResumen.minimo,
                                      sol.cotizacionesResumen.maximo,
                                    )
                                  }
                                  className="h-7 text-[11px]"
                                >
                                  <FileSpreadsheet className="h-3 w-3 mr-1" /> Cotizaciones
                                </Button>
                              )}
                              {puedeAprobar &&
                                (() => {
                                  const esPropia = sol.solicitanteId === user?.id;
                                  const faltaCotizacion =
                                    sol.cotizacionesResumen.total <
                                      sol.cotizacionesResumen.minimo ||
                                    !sol.cotizacionesResumen.tieneGanadora;
                                  return (
                                    <Button
                                      size="xs"
                                      variant="success"
                                      disabled={esPropia || faltaCotizacion}
                                      title={
                                        esPropia
                                          ? "No puedes aprobar una solicitud que tú mismo creaste."
                                          : faltaCotizacion
                                            ? `Se requiere al menos ${sol.cotizacionesResumen.minimo} cotización y una ganadora elegida.`
                                            : undefined
                                      }
                                      onClick={() =>
                                        abrirConfirmacion(sol.id, sol.item, "Aprobada")
                                      }
                                      className="h-7 text-[11px]"
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
                                    </Button>
                                  );
                                })()}
                              {puedeRechazar &&
                                (() => {
                                  const esPropia = sol.solicitanteId === user?.id;
                                  return (
                                    <Button
                                      size="xs"
                                      variant="destructive"
                                      disabled={esPropia}
                                      title={
                                        esPropia
                                          ? "No puedes rechazar una solicitud que tú mismo creaste."
                                          : undefined
                                      }
                                      onClick={() =>
                                        abrirConfirmacion(sol.id, sol.item, "Rechazada")
                                      }
                                      className="h-7 text-[11px]"
                                    >
                                      <XCircle className="h-3 w-3 mr-1" /> Rechazar
                                    </Button>
                                  );
                                })()}
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
                  <TableCell colSpan={9} className="p-0">
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
      </div>

      {/* MODAL CREAR SOLICITUD DE COMPRA */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Nueva Solicitud de Compra Interna
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Requerimiento de compra por departamento empresarial.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="empresaId" className="text-xs font-semibold text-slate-700">
                  Empresa
                </Label>
                {empresaBloqueada ? (
                  <Input
                    disabled
                    value={siglaEmpresa(empresaBloqueada)}
                    className="h-9 text-xs border-slate-300 bg-slate-50 text-slate-500 font-semibold"
                  />
                ) : (
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
                          {e.sigla}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="area" className="text-xs font-semibold text-slate-700">
                  Departamento Solicitante
                </Label>
                <Select
                  value={form.area}
                  onValueChange={(val) => setForm({ ...form, area: val, solicitanteId: "" })}
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
                            ? "Sin usuarios en este departamento"
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

            <p className="-mt-1 text-[11px] font-semibold text-slate-600">
              El proveedor se define en el cuadro comparativo de cotizaciones, no aquí: después de
              guardar podrás registrar las 2 o 3 cotizaciones y elegir la ganadora.
            </p>
            {areaDepartamentoId && !cargandoUsuariosArea && usuariosArea.length === 0 && (
              <p className="-mt-2 text-[11px] font-semibold text-slate-600">
                No hay usuarios asignados a "{form.area}". Asígnalos en Configuración &gt; Usuarios.
              </p>
            )}

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-700">
                    Cotizaciones de proveedor ({filasCotizacion.length}/3)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Carga las 2 o 3 cotizaciones ahora mismo; el ganador se elige después de
                    guardar, desde el detalle de la solicitud.
                  </p>
                </div>
                {filasCotizacion.length < 3 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="h-7 shrink-0 gap-1 text-[11px]"
                    onClick={agregarFilaCotizacion}
                  >
                    <Plus className="h-3 w-3" /> Agregar cotización
                  </Button>
                )}
              </div>

              {filasCotizacion.map((fila, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-md border border-slate-200 bg-white p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-600">Cotización {index + 1}</p>
                    {filasCotizacion.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarFilaCotizacion(index)}
                        className="text-slate-400 hover:text-slate-900"
                        title="Quitar cotización"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <Combobox
                    value={fila.proveedorId}
                    onValueChange={(val) => {
                      const elegido = proveedoresParaCotizar.find((p) => p.id === val) ?? null;
                      actualizarFilaCotizacion(index, {
                        proveedorId: val,
                        proveedorNombre: "",
                        proveedorNit: "",
                        proveedorSeleccionado: elegido,
                      });
                    }}
                    placeholder="Selecciona un proveedor (opcional)"
                    searchPlaceholder="Buscar por nombre o NIT..."
                    emptyText="Ningún proveedor coincide."
                    onSearchChange={buscarProveedoresParaCotizar}
                    loadingOptions={buscandoProveedoresParaCotizar}
                    selectedLabel={fila.proveedorSeleccionado?.nombre}
                    options={[
                      ...proveedoresParaCotizar.map((p) => ({ value: p.id, label: p.nombre })),
                      { value: PROVEEDOR_MANUAL, label: "Otro proveedor (no está en el catálogo)" },
                    ]}
                  />
                  {fila.proveedorId === PROVEEDOR_MANUAL ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Nombre del proveedor *"
                        value={fila.proveedorNombre}
                        onChange={(e) =>
                          actualizarFilaCotizacion(index, { proveedorNombre: e.target.value })
                        }
                        className="h-8 text-xs border-slate-300"
                      />
                      <Input
                        placeholder="NIT *"
                        value={fila.proveedorNit}
                        onChange={(e) =>
                          actualizarFilaCotizacion(index, { proveedorNit: e.target.value })
                        }
                        className="h-8 text-xs border-slate-300"
                      />
                    </div>
                  ) : (
                    fila.proveedorId && (
                      <Input
                        disabled
                        value={fila.proveedorSeleccionado?.nit ?? ""}
                        placeholder="NIT"
                        className="h-8 text-xs border-slate-300 bg-slate-50 text-slate-500"
                      />
                    )
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min={0}
                      placeholder="Valor total (COP) *"
                      value={fila.valorTotalCOP || ""}
                      onChange={(e) =>
                        actualizarFilaCotizacion(index, { valorTotalCOP: Number(e.target.value) })
                      }
                      className="h-8 text-xs border-slate-300"
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Entrega (días) *"
                      value={fila.tiempoEntregaDias || ""}
                      onChange={(e) =>
                        actualizarFilaCotizacion(index, {
                          tiempoEntregaDias: Number(e.target.value),
                        })
                      }
                      className="h-8 text-xs border-slate-300"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <Input
                      key={`${index}-${formVersion}`}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) =>
                        actualizarFilaCotizacion(index, { archivo: e.target.files?.[0] || null })
                      }
                      className="h-8 text-xs border-slate-300 file:mr-2 file:text-xs file:font-semibold"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
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
              Se requiere al menos {cotizacionesModal?.minimo ?? 1} cotización completa y una
              elegida como ganadora para poder aprobar la solicitud (hasta un máximo de{" "}
              {cotizacionesModal?.maximo ?? 3}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="overflow-x-auto">
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
                          {puedeAprobar &&
                            !c.esGanadora &&
                            (() => {
                              const esPropia = cotizacionesModal?.solicitanteId === user?.id;
                              return (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  disabled={
                                    esPropia ||
                                    cotizaciones.length < 1 ||
                                    accionCotizacionId === c.id
                                  }
                                  title={
                                    esPropia
                                      ? "No puedes elegir la cotización ganadora de una solicitud que tú mismo creaste."
                                      : undefined
                                  }
                                  onClick={() => handleSeleccionarGanadora(c.id)}
                                  className="h-6 text-[10px]"
                                >
                                  Elegir ganadora
                                </Button>
                              );
                            })()}
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
                      <TableCell
                        colSpan={6}
                        className="px-3 py-6 text-center text-xs text-slate-500"
                      >
                        {cargandoCotizaciones
                          ? "Cargando cotizaciones..."
                          : errorCotizaciones || "Todavía no hay cotizaciones registradas."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {puedeCrear && cotizaciones.length < 3 && !cotizaciones.some((c) => c.esGanadora) && (
              <form
                onSubmit={handleAgregarCotizacion}
                className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
              >
                <p className="text-xs font-bold text-slate-700">
                  Agregar cotización ({cotizaciones.length}/3)
                </p>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Proveedor *</Label>
                  <Combobox
                    value={formCotizacion.proveedorId}
                    onValueChange={(val) => {
                      setFormCotizacion({
                        ...formCotizacion,
                        proveedorId: val,
                        proveedorNombre: "",
                        proveedorNit: "",
                      });
                      setProveedorCotizacionSeleccionado(
                        proveedoresDelAreaCotizacion.find((p) => p.id === val) ?? null,
                      );
                    }}
                    placeholder="Selecciona un proveedor"
                    searchPlaceholder="Buscar por nombre o NIT..."
                    emptyText="Ningún proveedor coincide."
                    clearable={false}
                    onSearchChange={buscarProveedoresCotizacion}
                    loadingOptions={buscandoProveedoresCotizacion}
                    selectedLabel={proveedorCotizacionSeleccionado?.nombre}
                    options={[
                      ...proveedoresDelAreaCotizacion.map((p) => ({
                        value: p.id,
                        label: p.nombre,
                      })),
                      { value: PROVEEDOR_MANUAL, label: "Otro proveedor (no está en el catálogo)" },
                    ]}
                  />
                  {proveedoresDelAreaCotizacion.length === 0 && !buscandoProveedoresCotizacion && (
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
                          value={proveedorCotizacionSeleccionado?.nit ?? ""}
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
