import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { BarraVencimiento } from "@/components/ui/barra-vencimiento";
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
import { useFacturas } from "@/hooks/use-facturas";
import { useProveedorBusqueda, type ProveedorOpcion } from "@/hooks/use-proveedores";
import { useServicios } from "@/hooks/use-servicios";
import { useContratos } from "@/hooks/use-contratos";
import { useSolicitudesDisponiblesParaFactura } from "@/hooks/use-solicitudes";
import type { SolicitudDisponibleParaFactura } from "@/lib/data";
import { useDepartamentosPublico } from "@/hooks/use-departamentos-publico";
import { useUsuariosPorDepartamento } from "@/hooks/use-usuarios-por-departamento";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money, EstadoFactura } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/facturas/")({
  head: () => ({
    meta: [
      { title: "Recepción de Facturas | RicoSoft" },
      {
        name: "description",
        content: "Flujo de recepción y aprobación de facturas por estado y empresa.",
      },
    ],
  }),
  component: FacturasPage,
});

const estadosFilter: (EstadoFactura | "Todas")[] = [
  "Todas",
  "Pendiente",
  "Aprobada",
  "Pagada",
  "Rechazada",
];

const ACCION_LABEL: Record<"Aprobada" | "Rechazada", { verbo: string; titulo: string }> = {
  Aprobada: { verbo: "aprobar", titulo: "¿Aprobar esta factura?" },
  Rechazada: { verbo: "rechazar", titulo: "¿Rechazar esta factura?" },
};

const PAGE_SIZE = 25;

function FacturasPage() {
  const { empresaActiva, empresas } = useTenant();
  const [estadoSel, setEstadoSel] = useState<(typeof estadosFilter)[number]>("Todas");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);

  const {
    facturas,
    total,
    totalPages,
    loading,
    error,
    addFactura,
    updateEstadoFactura,
    eliminarFactura,
    subirArchivoFactura,
  } = useFacturas({
    empresaId: empresaActiva === "ALL" ? undefined : empresaActiva,
    estado: estadoSel === "Todas" ? undefined : estadoSel,
    search: qDebounced || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  // Debounce de la búsqueda: espera a que el usuario deje de escribir antes
  // de pedirle al servidor, y siempre vuelve a la página 1 (una búsqueda
  // nueva invalida la posición de página anterior).
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setPage(1);
  }, [empresaActiva, estadoSel, qDebounced]);

  const {
    opciones: proveedorOpciones,
    loading: buscandoProveedores,
    buscar: buscarProveedores,
  } = useProveedorBusqueda();
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<ProveedorOpcion | null>(null);
  const { suscripciones } = useServicios();
  const { contratos } = useContratos();
  const contratosActivos = contratos.filter((c) => c.estado === "Activo");
  const { departamentos } = useDepartamentosPublico();
  const { user } = useSession();
  // La empresa "de verdad" es la del tenant en el que se está (cada tenant
  // de este despliegue es una de las 3 empresas del grupo) — empresaActiva
  // es un filtro de solo lectura aparte que ningún control activa todavía,
  // así que no basta por sí solo para autocompletar. Si no se puede
  // determinar ninguna, se deja elegir manualmente (null).
  const empresaBloqueada =
    empresaIdDeTenant(user?.tenantNombre) || (empresaActiva !== "ALL" ? empresaActiva : null);

  const puedeAprobar = hasPermission(user, PERMISOS_SISTEMA.FACTURAS_APROBAR);
  const puedeRechazar = hasPermission(user, PERMISOS_SISTEMA.FACTURAS_RECHAZAR);
  const puedePagar = hasPermission(user, PERMISOS_SISTEMA.FACTURAS_PAGAR);
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.FACTURAS_ELIMINAR);

  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);

  const [modalOpen, setModalOpen] = useState(false);
  const [confirmAccion, setConfirmAccion] = useState<{
    id: string;
    numero: string;
    estado: "Aprobada" | "Rechazada";
  } | null>(null);
  const [aplicandoAccion, setAplicandoAccion] = useState(false);
  const [facturaAEliminar, setFacturaAEliminar] = useState<{ id: string; numero: string } | null>(
    null,
  );
  const [eliminando, setEliminando] = useState(false);

  const handleConfirmarAccion = async () => {
    if (!confirmAccion) return;
    setAplicandoAccion(true);
    try {
      await updateEstadoFactura(confirmAccion.id, confirmAccion.estado);
      toast.success(`Factura ${confirmAccion.numero} actualizada a "${confirmAccion.estado}".`);
      setConfirmAccion(null);
    } catch (err: any) {
      toast.error(err.message || "No fue posible actualizar la factura.");
    } finally {
      setAplicandoAccion(false);
    }
  };

  const handleEliminarFactura = async () => {
    if (!facturaAEliminar) return;
    setEliminando(true);
    try {
      await eliminarFactura(facturaAEliminar.id);
      toast.success(`Factura ${facturaAEliminar.numero} eliminada.`);
      setFacturaAEliminar(null);
    } catch (err: any) {
      toast.error(err.message || "No fue posible eliminar la factura.");
    } finally {
      setEliminando(false);
    }
  };

  const [form, setForm] = useState({
    empresaId: empresaBloqueada || "RC",
    numero: "",
    proveedorId: "",
    servicioId: "",
    contratoId: "",
    solicitudCompraId: "",
    area: "",
    responsableId: "",
    vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    subtotal: "",
    iva: "",
    prioridad: "Media",
    origen: "Carga manual" as const,
  });

  // Solicitud de compra relacionada: se busca priorizando el proveedor de la
  // factura (ver useSolicitudesDisponiblesParaFactura) — nunca se descarga el
  // catálogo completo de solicitudes al elegir una.
  const [solicitudSeleccionada, setSolicitudSeleccionada] =
    useState<SolicitudDisponibleParaFactura | null>(null);
  const [dialogSolicitudOpen, setDialogSolicitudOpen] = useState(false);
  const [buscarSolicitudTexto, setBuscarSolicitudTexto] = useState("");
  const [archivoFactura, setArchivoFactura] = useState<File | null>(null);
  const {
    solicitudes: solicitudesDisponibles,
    loading: buscandoSolicitudes,
    buscar: buscarSolicitudesDisponibles,
  } = useSolicitudesDisponiblesParaFactura(form.proveedorId || undefined);

  const areaDepartamentoId = departamentos.find((d) => d.nombre === form.area)?.id;
  const { usuarios: usuariosArea, loading: cargandoUsuariosArea } =
    useUsuariosPorDepartamento(areaDepartamentoId);

  const serviciosDelProveedor = useMemo(
    () =>
      suscripciones.filter(
        (s) => s.estado === "Activo" && (!form.proveedorId || s.proveedorId === form.proveedorId),
      ),
    [suscripciones, form.proveedorId],
  );
  const servicioSeleccionado = suscripciones.find((s) => s.id === form.servicioId) ?? null;
  const totalFormPreview = Number(form.subtotal || 0) + Number(form.iva || 0);
  // Una factura solo se relaciona con UNA de las tres cosas a la vez.
  const tieneSolicitud = Boolean(form.solicitudCompraId);
  const tieneServicio = Boolean(form.servicioId);
  const tieneContrato = Boolean(form.contratoId);
  const tieneServicioOContrato = tieneServicio || tieneContrato;
  const alertaValorPreview =
    servicioSeleccionado && totalFormPreview > servicioSeleccionado.costo
      ? `El valor de la factura (${money(totalFormPreview)}) supera el valor recurrente configurado para "${servicioSeleccionado.nombreServicio}" (${money(servicioSeleccionado.costo, servicioSeleccionado.moneda)}).`
      : null;
  // Advertencia informativa (no bloqueante, ver spec): si la factura supera
  // el saldo que le queda a la solicitud (valor estimado menos lo ya
  // facturado con otras facturas), se avisa pero se permite continuar.
  const alertaSolicitudPreview =
    solicitudSeleccionada && totalFormPreview > solicitudSeleccionada.saldoPendiente
      ? `El valor de la factura (${money(totalFormPreview)}) supera el saldo pendiente de la solicitud de compra "${solicitudSeleccionada.item}" (${money(solicitudSeleccionada.saldoPendiente)}) en ${money(totalFormPreview - solicitudSeleccionada.saldoPendiente)}.`
      : null;

  // Si el usuario cambia de proveedor después de elegir una solicitud, esa
  // solicitud ya no es necesariamente compatible — se limpia la selección en
  // vez de dejar una relación que el usuario ya no ve reflejada en pantalla.
  useEffect(() => {
    if (solicitudSeleccionada && solicitudSeleccionada.proveedorId !== (form.proveedorId || null)) {
      setSolicitudSeleccionada(null);
      setForm((f) => ({ ...f, solicitudCompraId: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.proveedorId]);

  // El filtrado (empresa/estado/búsqueda) ahora ocurre server-side (ver
  // useFacturas de arriba) — `facturas` ya es exactamente la página filtrada
  // que corresponde. El agrupamiento sigue siendo client-side, sobre la
  // página actual (mismo patrón ya usado en Configuración > Proveedores).
  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "area":
        return (f: (typeof facturas)[number]) => f.area;
      case "proveedor":
        return (f: (typeof facturas)[number]) => f.proveedor;
      case "estado":
        return (f: (typeof facturas)[number]) => f.estado;
      default:
        return null;
    }
  }, [agrupacion]);

  const gruposFacturas = useMemo(
    () => agruparFilas(facturas, claveDeAgrupacion),
    [facturas, claveDeAgrupacion],
  );

  const handleSaveFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero || !form.proveedorId) return;
    if (!form.responsableId) {
      toast.error("Selecciona el responsable del departamento.");
      return;
    }

    let creada;
    try {
      creada = await addFactura({
        empresaId: form.empresaId,
        numero: form.numero,
        proveedorId: form.proveedorId,
        servicioId: form.servicioId || undefined,
        contratoId: form.contratoId || undefined,
        solicitudCompraId: form.solicitudCompraId || undefined,
        area: form.area,
        responsableId: form.responsableId,
        vence: form.vence,
        subtotal: Number(form.subtotal),
        iva: Number(form.iva),
        moneda: "COP",
        prioridad: form.prioridad,
        origen: form.origen,
      });
    } catch (err: any) {
      toast.error(err.message || "Error al registrar la factura.");
      return;
    }

    // La factura ya quedó registrada; el documento adjunto es un paso
    // adicional que no debe bloquear ni deshacer el registro si falla.
    if (archivoFactura) {
      try {
        await subirArchivoFactura(creada.id, archivoFactura);
      } catch (err: any) {
        toast.error(
          err.message ||
            "La factura se registró, pero no fue posible adjuntar el documento. Puedes subirlo desde el detalle.",
        );
      }
    }

    setModalOpen(false);
    setForm({
      empresaId: empresaBloqueada || "RC",
      numero: "",
      proveedorId: "",
      servicioId: "",
      contratoId: "",
      solicitudCompraId: "",
      area: "",
      responsableId: "",
      vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      subtotal: "",
      iva: "",
      prioridad: "Media",
      origen: "Carga manual",
    });
    setSolicitudSeleccionada(null);
    setArchivoFactura(null);
  };

  return (
    <AppShell
      title="Recepción de facturas"
      description="Control del flujo documental y financiero de facturas por estado (Pendiente, Aprobada, Pagada, Rechazada)."
      actions={
        <Button onClick={() => setModalOpen(true)} size="sm" className="gap-2">
          <Upload className="h-4 w-4" /> Recepcionar Factura
        </Button>
      }
    >
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 lg:flex lg:items-center lg:justify-between bg-slate-50/80">
          <div className="flex flex-wrap gap-2">
            {estadosFilter.map((e) => (
              <button
                key={e}
                onClick={() => setEstadoSel(e)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                  estadoSel === e
                    ? "border-blue-700 bg-blue-800 text-white shadow-2xs"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <SelectorAgrupacion
              value={agrupacion}
              onChange={setAgrupacion}
              opciones={[
                OPCION_SIN_AGRUPAR,
                { value: "area", label: "Departamento" },
                { value: "proveedor", label: "Proveedor" },
                { value: "estado", label: "Estado" },
              ]}
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por número, proveedor, NIT..."
              className="h-9 w-full max-w-xs bg-white text-xs border-slate-300 shadow-2xs"
            />
          </div>
        </div>

        <Table>
          <TableHeader className="bg-slate-100/80">
            <TableRow className="hover:bg-slate-100/80">
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Factura
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Empresa
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Proveedor / NIT
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Departamento
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Vencimiento
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Total
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
            {gruposFacturas.map((grupo) => (
              <Fragment key={grupo.clave || "sin-grupo"}>
                {grupo.clave && (
                  <FilaGrupo
                    key={`grupo-${grupo.clave}`}
                    clave={grupo.clave}
                    cantidad={grupo.filas.length}
                    colSpan={9}
                  />
                )}
                {grupo.filas.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="px-4 py-3 font-bold text-xs">
                      <Link
                        to="/facturas/$id"
                        params={{ id: f.id }}
                        className="text-blue-800 hover:underline"
                      >
                        {f.numero}
                      </Link>
                      <p className="text-[10px] text-slate-400 font-normal">{f.origen}</p>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="border-blue-200 bg-blue-50 text-blue-800 font-bold"
                      >
                        {siglaEmpresa(f.empresaId)}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <p className="font-bold text-slate-900 truncate max-w-[200px]">
                        {f.proveedor}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">{f.nit}</p>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-600 font-semibold">
                      {f.area}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <p className="text-xs font-mono text-slate-500">
                        {new Date(f.vence).toLocaleDateString("es-CO")}
                      </p>
                      {(f.estado === "Pendiente" || f.estado === "Aprobada") && (
                        <BarraVencimiento
                          fecha={f.vence}
                          etiquetaVencido="Vencida"
                          className="mt-1"
                        />
                      )}
                    </TableCell>
                    <TableCell className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">
                      {money(f.total, f.moneda)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-500">
                      {f.prioridad}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <EstadoBadge estado={f.estado} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {f.estado === "Pendiente" && (
                          <>
                            {puedeAprobar && (
                              <Button
                                size="xs"
                                variant="success"
                                onClick={() =>
                                  setConfirmAccion({
                                    id: f.id,
                                    numero: f.numero,
                                    estado: "Aprobada",
                                  })
                                }
                                className="h-7 text-[11px]"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
                              </Button>
                            )}
                            {puedeRechazar && (
                              <Button
                                size="xs"
                                variant="destructive"
                                onClick={() =>
                                  setConfirmAccion({
                                    id: f.id,
                                    numero: f.numero,
                                    estado: "Rechazada",
                                  })
                                }
                                className="h-7 text-[11px]"
                              >
                                <XCircle className="h-3 w-3 mr-1" /> Rechazar
                              </Button>
                            )}
                          </>
                        )}
                        {f.estado === "Aprobada" && puedePagar && (
                          <Link to="/facturas/$id" params={{ id: f.id }}>
                            <Button size="xs" variant="outline" className="h-7 text-[11px]">
                              Registrar Pago
                            </Button>
                          </Link>
                        )}
                        {puedeEliminar && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setFacturaAEliminar({ id: f.id, numero: f.numero })}
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
            {facturas.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="p-0">
                  {loading ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      Cargando facturas...
                    </div>
                  ) : error ? (
                    <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                  ) : (
                    <EmptyState
                      icon={Upload}
                      title="No hay facturas para el filtro seleccionado"
                      description='Cambia los filtros de arriba, o haz clic en "Recepcionar Factura" para registrar una nueva.'
                      action={
                        <Button size="sm" onClick={() => setModalOpen(true)} className="gap-2">
                          <Upload className="h-4 w-4" /> Recepcionar Factura
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-500">
            <p>
              {facturas.length} de {total} facturas — página {page} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="gap-1"
              >
                Siguiente <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL REGISTRAR FACTURA */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-white border-slate-200 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Recepcionar Factura</DialogTitle>
            <DialogDescription className="text-slate-500">
              Registra la factura y envíala al flujo de aprobación correspondiente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveFactura} className="space-y-5 py-2">
            {/* ── FACTURA ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-1.5">
                Factura
              </p>
              <div className="space-y-1">
                <Label htmlFor="proveedor" className="text-xs font-semibold text-slate-700">
                  Proveedor *
                </Label>
                <Combobox
                  value={form.proveedorId}
                  onValueChange={(val) => {
                    setForm({ ...form, proveedorId: val });
                    setProveedorSeleccionado(proveedorOpciones.find((p) => p.id === val) ?? null);
                  }}
                  placeholder="Buscar proveedor por nombre o NIT..."
                  searchPlaceholder="Buscar por nombre o NIT..."
                  emptyText="Ningún proveedor coincide."
                  clearable={false}
                  onSearchChange={buscarProveedores}
                  loadingOptions={buscandoProveedores}
                  selectedLabel={proveedorSeleccionado?.nombre}
                  options={proveedorOpciones.map((p) => ({ value: p.id, label: p.nombre }))}
                />
                {proveedorSeleccionado && (
                  <p className="text-[11px] text-slate-500">NIT {proveedorSeleccionado.nit}</p>
                )}
                {form.proveedorId === "" &&
                  proveedorOpciones.length === 0 &&
                  !buscandoProveedores && (
                    <p className="text-[11px] font-semibold text-slate-600">
                      No hay proveedores registrados.{" "}
                      <Link to="/configuracion/proveedores" className="font-semibold underline">
                        Créalos en Configuración
                      </Link>{" "}
                      antes de recepcionar una factura.
                    </p>
                  )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="numero" className="text-xs font-semibold text-slate-700">
                    Número de factura *
                  </Label>
                  <Input
                    required
                    id="numero"
                    placeholder="Ej: FE-10492"
                    value={form.numero}
                    onChange={(e) => setForm({ ...form, numero: e.target.value })}
                    className="h-9 text-xs border-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vence" className="text-xs font-semibold text-slate-700">
                    Fecha de vencimiento
                  </Label>
                  <Input
                    type="date"
                    id="vence"
                    value={form.vence}
                    onChange={(e) => setForm({ ...form, vence: e.target.value })}
                    className="h-9 text-xs border-slate-300"
                  />
                </div>
              </div>

              {!empresaBloqueada && (
                <div className="space-y-1">
                  <Label htmlFor="empresaId" className="text-xs font-semibold text-slate-700">
                    Empresa receptora *
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
                          {e.sigla}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* ── VALORES ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-1.5">
                Valores
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="subtotal" className="text-xs font-semibold text-slate-700">
                    Subtotal (COP)
                  </Label>
                  <Input
                    type="number"
                    id="subtotal"
                    value={form.subtotal}
                    onChange={(e) => setForm({ ...form, subtotal: e.target.value })}
                    className="h-9 text-xs border-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="iva" className="text-xs font-semibold text-slate-700">
                    IVA (COP)
                  </Label>
                  <Input
                    type="number"
                    id="iva"
                    value={form.iva}
                    onChange={(e) => setForm({ ...form, iva: e.target.value })}
                    className="h-9 text-xs border-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Total</Label>
                  <Input
                    disabled
                    value={money(totalFormPreview)}
                    className="h-9 text-xs border-slate-300 bg-slate-50 font-bold text-slate-900"
                  />
                </div>
              </div>

              {alertaValorPreview && (
                <Alert variant="warning" className="py-2.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-[11px]">{alertaValorPreview}</AlertDescription>
                </Alert>
              )}
              {alertaSolicitudPreview && (
                <Alert variant="warning" className="py-2.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-[11px]">
                    {alertaSolicitudPreview}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* ── RELACIONAR ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-1.5">
                Relacionar factura
              </p>
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-slate-50/60">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="shrink-0 text-xs font-semibold text-slate-600 w-36">
                    Solicitud de compra
                  </span>
                  {solicitudSeleccionada ? (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-blue-900">
                          {solicitudSeleccionada.item}
                        </p>
                        <p className="text-[11px] text-blue-700">
                          Pendiente {money(solicitudSeleccionada.saldoPendiente)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSolicitudSeleccionada(null);
                          setForm({ ...form, solicitudCompraId: "" });
                        }}
                        className="shrink-0 rounded-md p-1 text-blue-700 hover:bg-blue-100"
                        title="Quitar solicitud relacionada"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!form.proveedorId || tieneServicioOContrato}
                      onClick={() => {
                        setBuscarSolicitudTexto("");
                        buscarSolicitudesDisponibles();
                        setDialogSolicitudOpen(true);
                      }}
                      className="flex flex-1 items-center justify-between gap-2 text-xs text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="flex items-center gap-1.5">
                        <Search className="h-3.5 w-3.5" />
                        {tieneServicioOContrato
                          ? "Ya relacionada con servicio/contrato"
                          : form.proveedorId
                            ? "Sin solicitud asociada"
                            : "Elige un proveedor primero"}
                      </span>
                      <span aria-hidden>›</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <Label
                    htmlFor="servicio"
                    className="shrink-0 text-xs font-semibold text-slate-600 w-36"
                  >
                    Servicio / suscripción
                  </Label>
                  <Select
                    value={form.servicioId || "__none__"}
                    disabled={tieneSolicitud || tieneContrato}
                    onValueChange={(val) => {
                      if (val === "__none__") {
                        setForm({ ...form, servicioId: "" });
                        return;
                      }
                      // Servicio y solicitud/contrato son mutuamente
                      // excluyentes; además, el servicio ya sabe quién lo
                      // gestiona — se autocompleta área y responsable.
                      const servicio = serviciosDelProveedor.find((s) => s.id === val);
                      setForm({
                        ...form,
                        servicioId: val,
                        solicitudCompraId: "",
                        contratoId: "",
                        area: servicio?.area || form.area,
                        responsableId: servicio?.responsableId || form.responsableId,
                      });
                      if (servicio) setSolicitudSeleccionada(null);
                    }}
                  >
                    <SelectTrigger
                      id="servicio"
                      className="h-8 flex-1 border-none bg-transparent text-xs shadow-none hover:bg-white disabled:opacity-60"
                    >
                      <SelectValue placeholder="Sin servicio asociado" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      <SelectItem value="__none__" className="text-xs">
                        Sin servicio asociado
                      </SelectItem>
                      {serviciosDelProveedor.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.nombreServicio}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <Label
                    htmlFor="contrato"
                    className="shrink-0 text-xs font-semibold text-slate-600 w-36"
                  >
                    Contrato
                  </Label>
                  <Select
                    value={form.contratoId || "__none__"}
                    disabled={tieneSolicitud || tieneServicio}
                    onValueChange={(val) => {
                      if (val === "__none__") {
                        setForm({ ...form, contratoId: "" });
                        return;
                      }
                      setForm({ ...form, contratoId: val, solicitudCompraId: "", servicioId: "" });
                      setSolicitudSeleccionada(null);
                    }}
                  >
                    <SelectTrigger
                      id="contrato"
                      className="h-8 flex-1 border-none bg-transparent text-xs shadow-none hover:bg-white disabled:opacity-60"
                    >
                      <SelectValue placeholder="Sin contrato asociado" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      <SelectItem value="__none__" className="text-xs">
                        Sin contrato asociado
                      </SelectItem>
                      {contratosActivos.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.proveedor} — {c.area}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ── GESTIÓN ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-1.5">
                Gestión
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="area" className="text-xs font-semibold text-slate-700">
                    Departamento responsable
                  </Label>
                  <Select
                    value={form.area}
                    onValueChange={(val) => setForm({ ...form, area: val, responsableId: "" })}
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
                <div className="space-y-1">
                  <Label htmlFor="responsable" className="text-xs font-semibold text-slate-700">
                    Responsable *
                  </Label>
                  <Select
                    value={form.responsableId}
                    onValueChange={(val) => setForm({ ...form, responsableId: val })}
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
              </div>
              {areaDepartamentoId && !cargandoUsuariosArea && usuariosArea.length === 0 && (
                <p className="text-[11px] font-semibold text-slate-600">
                  No hay usuarios asignados a "{form.area}". Asígnalos en Configuración &gt;
                  Usuarios.
                </p>
              )}

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Documento (opcional)</Label>
                {archivoFactura ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="truncate text-xs font-semibold text-slate-700">
                      📎 {archivoFactura.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setArchivoFactura(null)}
                      className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100"
                      title="Quitar documento"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <Input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => setArchivoFactura(e.target.files?.[0] || null)}
                    className="h-9 text-xs border-slate-300 bg-white file:mr-2 file:text-xs file:font-semibold"
                  />
                )}
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-blue-800 text-white hover:bg-blue-900 font-bold"
              >
                Registrar factura
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Selector de solicitud de compra compatible con el proveedor elegido
          arriba (ver useSolicitudesDisponiblesParaFactura) — separado del
          modal principal para no anidar dos <Dialog> abiertos a la vez. */}
      <Dialog open={dialogSolicitudOpen} onOpenChange={setDialogSolicitudOpen}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Solicitudes de compra de {proveedorSeleccionado?.nombre || "este proveedor"}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Solo se muestran solicitudes aprobadas/compradas con saldo pendiente por facturar.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Buscar por concepto..."
            value={buscarSolicitudTexto}
            onChange={(e) => {
              const texto = e.target.value;
              setBuscarSolicitudTexto(texto);
              buscarSolicitudesDisponibles(texto);
            }}
            className="h-9 text-xs border-slate-300"
          />
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {buscandoSolicitudes ? (
              <p className="py-6 text-center text-xs text-slate-500">Buscando...</p>
            ) : solicitudesDisponibles.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No hay solicitudes de compra disponibles para este proveedor.
              </p>
            ) : (
              solicitudesDisponibles.map((s) => (
                <div
                  key={s.id}
                  className="rounded-md border border-slate-200 p-3 hover:border-blue-300 hover:bg-blue-50/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">{s.item}</p>
                      {s.descripcion && (
                        <p className="truncate text-[11px] text-slate-500">{s.descripcion}</p>
                      )}
                      <p className="mt-1 text-[11px] text-slate-500">
                        {s.proveedor || "Sin proveedor"} ·{" "}
                        {new Date(s.fechaSolicitud).toLocaleDateString("es-CO")} · {s.estado}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="success"
                      className="shrink-0"
                      onClick={() => {
                        setSolicitudSeleccionada(s);
                        // Una factura solo se relaciona con una cosa: elegir
                        // solicitud limpia servicio/contrato si había alguno.
                        setForm({
                          ...form,
                          solicitudCompraId: s.id,
                          servicioId: "",
                          contratoId: "",
                        });
                        setDialogSolicitudOpen(false);
                      }}
                    >
                      Seleccionar
                    </Button>
                  </div>
                  <div className="mt-2 flex gap-4 text-[11px]">
                    <span className="text-slate-500">
                      Solicitado <b className="text-slate-800">{money(s.valorEstimado)}</b>
                    </span>
                    <span className="text-slate-500">
                      Facturado <b className="text-slate-800">{money(s.facturado)}</b>
                    </span>
                    <span className="text-slate-500">
                      Pendiente <b className="text-blue-800">{money(s.saldoPendiente)}</b>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmAccion} onOpenChange={(open) => !open && setConfirmAccion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAccion ? ACCION_LABEL[confirmAccion.estado].titulo : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vas a {confirmAccion ? ACCION_LABEL[confirmAccion.estado].verbo : ""} la factura{" "}
              <strong>{confirmAccion?.numero}</strong>. Esta acción queda registrada con tu usuario
              y la hora actual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aplicandoAccion}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarAccion} disabled={aplicandoAccion}>
              {aplicandoAccion ? "Aplicando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!facturaAEliminar}
        onOpenChange={(open) => !open && setFacturaAEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la factura {facturaAEliminar?.numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. La factura dejará de aparecer en el sistema, pero queda
              registrada en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={handleEliminarFactura}
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
