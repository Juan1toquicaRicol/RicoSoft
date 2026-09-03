import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Download,
  Package,
  Paperclip,
  ShoppingBag,
  Trophy,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { money } from "@/lib/data";
import {
  useSolicitudDetalle,
  useCotizacionesProveedor,
  descargarCotizacionSolicitud,
  descargarCotizacionProveedor,
} from "@/hooks/use-solicitudes";
import { useFacturasPorSolicitud } from "@/hooks/use-facturas";
import { useProveedorBusqueda, type ProveedorOpcion } from "@/hooks/use-proveedores";
import { useDepartamentosPublico } from "@/hooks/use-departamentos-publico";
import { siglaEmpresa } from "@/lib/tenant-context";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

const PROVEEDOR_MANUAL = "__manual__";

export const Route = createFileRoute("/solicitudes-compra/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de Solicitud de Compra | RicoSoft" },
      { name: "description", content: "Trazabilidad y aprobación de la solicitud de compra." },
    ],
  }),
  component: DetalleSolicitud,
});

function DetalleSolicitud() {
  const { id } = Route.useParams();
  const { solicitud, loading, error, refresh, cambiarEstado, confirmarRecepcion, subirCotizacion } =
    useSolicitudDetalle(id);
  const { user } = useSession();
  const { facturas: facturasRelacionadas } = useFacturasPorSolicitud(solicitud?.id);
  const { departamentos } = useDepartamentosPublico();

  const puedeCrear = hasPermission(user, PERMISOS_SISTEMA.SOLICITUDES_CREAR);
  const puedeAprobar = hasPermission(user, PERMISOS_SISTEMA.SOLICITUDES_APROBAR);
  const puedeRechazar = hasPermission(user, PERMISOS_SISTEMA.SOLICITUDES_RECHAZAR);
  const puedeComprar = hasPermission(user, PERMISOS_SISTEMA.SOLICITUDES_COMPRAR);

  const [confirmAccion, setConfirmAccion] = useState<{
    estado: "Aprobada" | "Rechazada" | "Comprado";
    titulo: string;
    verbo: string;
  } | null>(null);
  const [aplicandoAccion, setAplicandoAccion] = useState(false);
  const [descargandoCotizacion, setDescargandoCotizacion] = useState(false);
  const [subiendoCotizacion, setSubiendoCotizacion] = useState(false);
  const [comentarioRecepcion, setComentarioRecepcion] = useState("");
  const [confirmandoRecepcion, setConfirmandoRecepcion] = useState(false);
  const archivoCotizacionSolicitudRef = useRef<HTMLInputElement>(null);

  const handleConfirmarAccion = async () => {
    if (!confirmAccion) return;
    setAplicandoAccion(true);
    try {
      await cambiarEstado(confirmAccion.estado);
      toast.success(`Solicitud actualizada a "${confirmAccion.estado}".`);
      setConfirmAccion(null);
    } catch (err: any) {
      toast.error(err.message || "No fue posible actualizar la solicitud.");
    } finally {
      setAplicandoAccion(false);
    }
  };

  const handleVerCotizacionSolicitud = async () => {
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

  const handleSubirCotizacionSolicitud = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoCotizacion(true);
    try {
      await subirCotizacion(file);
      toast.success("Documento de cotización subido.");
    } catch (err: any) {
      toast.error(err.message || "No fue posible subir el documento.");
    } finally {
      setSubiendoCotizacion(false);
      if (archivoCotizacionSolicitudRef.current) archivoCotizacionSolicitudRef.current.value = "";
    }
  };

  const handleConfirmarRecepcion = async () => {
    setConfirmandoRecepcion(true);
    try {
      await confirmarRecepcion(comentarioRecepcion.trim() || undefined);
      toast.success("Recepción del producto confirmada.");
      setComentarioRecepcion("");
    } catch (err: any) {
      toast.error(err.message || "No fue posible confirmar la recepción.");
    } finally {
      setConfirmandoRecepcion(false);
    }
  };

  if (loading && !solicitud) {
    return (
      <AppShell title="Cargando solicitud..." description="RicoSoft Compras">
        <div className="panel p-12 text-center text-xs text-slate-500 bg-white border-slate-200 shadow-2xs">
          Cargando...
        </div>
      </AppShell>
    );
  }

  if (!solicitud) {
    return (
      <AppShell title="Solicitud no encontrada" description="RicoSoft Compras">
        <div className="panel p-12 text-center text-xs text-slate-500 bg-white border-slate-200 shadow-2xs">
          <p className="font-semibold text-base mb-2">Solicitud no registrada</p>
          <p>{error || `No se encontró la solicitud ${id} en la base de datos de esta empresa.`}</p>
          <Link to="/solicitudes-compra" className="mt-4 inline-block">
            <Button size="sm">Volver a Solicitudes de Compra</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const puedeEstadoActivo = solicitud.estado === "Pendiente" || solicitud.estado === "En Cotización";

  const campos = [
    ["Solicitante", solicitud.solicitante],
    ["Empresa", siglaEmpresa(solicitud.empresaId)],
    ["Departamento", solicitud.area],
    ["Proveedor", solicitud.proveedor || "Por definir en cotizaciones"],
    ["Cantidad", String(solicitud.cantidad)],
    ["Valor Estimado", money(solicitud.valorEstimado)],
    ["Prioridad", solicitud.prioridad],
    ["Fecha de Solicitud", new Date(solicitud.fechaSolicitud).toLocaleString("es-CO")],
  ];

  return (
    <AppShell
      title={`Solicitud de Compra — ${solicitud.item}`}
      description={`${solicitud.solicitante} · Empresa: ${siglaEmpresa(solicitud.empresaId)}`}
      actions={
        <>
          <Link to="/solicitudes-compra">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          {puedeEstadoActivo && (
            <>
              {puedeRechazar && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfirmAccion({
                      estado: "Rechazada",
                      titulo: "¿Rechazar esta solicitud?",
                      verbo: "rechazar",
                    })
                  }
                  className="gap-2 text-slate-900 border-slate-400 hover:bg-slate-100"
                >
                  <XCircle className="h-4 w-4" /> Rechazar
                </Button>
              )}
              {puedeAprobar && (
                <Button
                  size="sm"
                  onClick={() =>
                    setConfirmAccion({
                      estado: "Aprobada",
                      titulo: "¿Aprobar esta solicitud?",
                      verbo: "aprobar",
                    })
                  }
                  className="gap-2 bg-blue-800 hover:bg-blue-900 text-white"
                >
                  <Check className="h-4 w-4" /> Aprobar Solicitud
                </Button>
              )}
            </>
          )}
          {solicitud.estado === "Aprobada" && puedeComprar && (
            <Button
              size="sm"
              onClick={() =>
                setConfirmAccion({
                  estado: "Comprado",
                  titulo: "¿Marcar esta solicitud como comprada?",
                  verbo: "marcar como comprada",
                })
              }
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Package className="h-4 w-4" /> Marcar Comprado
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 mb-4">
              <h2 className="text-sm font-semibold">Datos Generales de la Solicitud</h2>
              <EstadoBadge estado={solicitud.estado} />
            </div>

            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {campos.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
                </div>
              ))}
              {solicitud.descripcion && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                    Justificación de la compra
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm font-medium">
                    {solicitud.descripcion}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Paperclip className="h-4 w-4 text-slate-500" /> Cotización de soporte
              </h2>
              {puedeCrear && (
                <>
                  <input
                    ref={archivoCotizacionSolicitudRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={handleSubirCotizacionSolicitud}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="gap-1.5"
                    disabled={subiendoCotizacion}
                    onClick={() => archivoCotizacionSolicitudRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />{" "}
                    {subiendoCotizacion
                      ? "Subiendo..."
                      : solicitud.cotizacion
                        ? "Reemplazar"
                        : "Adjuntar"}
                  </Button>
                </>
              )}
            </div>
            {solicitud.cotizacion ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={descargandoCotizacion}
                onClick={handleVerCotizacionSolicitud}
                className="mt-3 h-8 gap-1.5 text-xs font-bold"
              >
                <Paperclip className="h-3 w-3" />
                {descargandoCotizacion ? "Abriendo..." : solicitud.cotizacion.nombre}
                <Download className="h-3 w-3" />
              </Button>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                Sin documento de cotización adjunto todavía.
              </p>
            )}
          </div>

          <PanelCotizaciones
            solicitudId={solicitud.id}
            area={solicitud.area}
            puedeCrear={puedeCrear}
            puedeAprobar={puedeAprobar}
            // Una vez la solicitud sale de Pendiente/En Cotización (Historia
            // de Compras) la decisión ya quedó tomada — el cuadro
            // comparativo pasa a ser registro histórico, nunca editable.
            soloLectura={!puedeEstadoActivo}
            onChange={refresh}
          />

          {facturasRelacionadas.length > 0 && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold">
                <ShoppingBag className="h-4 w-4 text-slate-500" /> Facturas Relacionadas
              </h2>
              <div className="space-y-1.5">
                {facturasRelacionadas.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <Link
                        to="/facturas/$id"
                        params={{ id: f.id }}
                        className="text-xs font-semibold text-blue-800 hover:underline"
                      >
                        {f.numero}
                      </Link>
                      <p className="text-[11px] text-slate-500">
                        {f.proveedor} · {new Date(f.fecha).toLocaleDateString("es-CO")} ·{" "}
                        {money(f.total)}
                      </p>
                    </div>
                    <EstadoBadge estado={f.estado} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {solicitud.fechaResolucion && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <h2 className="text-sm font-semibold mb-4">Resolución</h2>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">
                    {solicitud.estado === "Rechazada" ? "Rechazada por" : "Aprobada por"}
                  </dt>
                  <dd className="font-semibold text-right">{solicitud.resueltoPorNombre || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Fecha</dt>
                  <dd className="font-semibold text-right">
                    {new Date(solicitud.fechaResolucion).toLocaleString("es-CO")}
                  </dd>
                </div>
                {solicitud.comentarioResolucion && (
                  <div>
                    <dt className="text-slate-500 mb-1">Comentario</dt>
                    <dd className="italic text-slate-700">{solicitud.comentarioResolucion}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {(solicitud.estado === "Facturada" || solicitud.estado === "Recibida") && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <h2 className="text-sm font-semibold mb-4">Recepción del Producto</h2>
              {solicitud.estado === "Recibida" && solicitud.recepcion ? (
                <p className="text-xs font-semibold text-slate-900">
                  Confirmada por {solicitud.recepcion.confirmadaPor || "—"} el{" "}
                  {new Date(solicitud.recepcion.confirmadaEn).toLocaleString("es-CO")}
                  {solicitud.recepcion.comentario ? ` — "${solicitud.recepcion.comentario}"` : ""}
                </p>
              ) : user?.id && solicitud.solicitanteId === user.id ? (
                solicitud.factura?.estado === "Pagada" ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Comentario opcional (ej. estado del producto recibido)"
                      value={comentarioRecepcion}
                      onChange={(e) => setComentarioRecepcion(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      size="xs"
                      className="gap-1.5 bg-blue-800 hover:bg-blue-900 text-white"
                      disabled={confirmandoRecepcion}
                      onClick={handleConfirmarRecepcion}
                    >
                      {confirmandoRecepcion ? "Confirmando..." : "Confirmar recepción del producto"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 font-semibold">
                    La factura vinculada todavía no está totalmente pagada.
                  </p>
                )
              ) : (
                <p className="text-xs text-slate-500 font-semibold">
                  Solo quien creó la solicitud puede confirmar la recepción del producto.
                </p>
              )}
            </div>
          )}

          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="text-sm font-semibold mb-4">Trazabilidad y Auditoría</h2>
            <TrazabilidadSolicitud
              solicitud={solicitud}
              facturasRelacionadas={facturasRelacionadas}
            />
          </div>
        </div>
      </div>

      <AlertDialog open={!!confirmAccion} onOpenChange={(open) => !open && setConfirmAccion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAccion?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a {confirmAccion?.verbo} la solicitud <strong>{solicitud.item}</strong>. Esta
              acción queda registrada con tu usuario y la hora actual.
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
    </AppShell>
  );
}

/**
 * Cuadro comparativo de cotizaciones de proveedor, embebido directamente en
 * la página de detalle (en vez del modal que usa /solicitudes-compra) — la
 * misma lógica/hook, presentada como panel en vez de Dialog para que este
 * detalle se vea como el de Factura.
 */
function PanelCotizaciones({
  solicitudId,
  area,
  puedeCrear: puedeCrearProp,
  puedeAprobar: puedeAprobarProp,
  soloLectura = false,
  onChange,
}: {
  solicitudId: string;
  area: string;
  puedeCrear: boolean;
  puedeAprobar: boolean;
  /** Solicitud ya resuelta (Historia de Compras): el cuadro comparativo es
   * registro histórico, no se puede agregar, eliminar ni elegir ganadora —
   * solo se muestra. */
  soloLectura?: boolean;
  onChange: () => void;
}) {
  const puedeCrear = puedeCrearProp && !soloLectura;
  const puedeAprobar = puedeAprobarProp && !soloLectura;
  const {
    cotizaciones,
    loading: cargandoCotizaciones,
    error: errorCotizaciones,
    agregarCotizacion,
    eliminarCotizacion,
    seleccionarGanadora,
  } = useCotizacionesProveedor(solicitudId, onChange);
  const { departamentos } = useDepartamentosPublico();
  const areaDepartamentoId = departamentos.find((d) => d.nombre === area)?.id;
  const {
    opciones: proveedoresDelArea,
    loading: buscandoProveedores,
    buscar: buscarProveedores,
  } = useProveedorBusqueda(areaDepartamentoId);

  const formInicial = {
    proveedorId: "",
    proveedorNombre: "",
    proveedorNit: "",
    valorTotalCOP: 0,
    tiempoEntregaDias: 0,
  };
  const [form, setForm] = useState(formInicial);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<ProveedorOpcion | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [accionId, setAccionId] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const handleAgregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivo) {
      toast.error("Adjunta el documento de la cotización.");
      return;
    }
    if (!form.proveedorId) {
      toast.error("Selecciona un proveedor del catálogo o elige registrarlo manualmente.");
      return;
    }
    if (form.proveedorId === PROVEEDOR_MANUAL && (!form.proveedorNombre || !form.proveedorNit)) {
      toast.error("Escribe el nombre y el NIT del proveedor.");
      return;
    }
    setGuardando(true);
    try {
      await agregarCotizacion({
        proveedorId: form.proveedorId === PROVEEDOR_MANUAL ? undefined : form.proveedorId,
        proveedorNombre: form.proveedorId === PROVEEDOR_MANUAL ? form.proveedorNombre : undefined,
        proveedorNit: form.proveedorId === PROVEEDOR_MANUAL ? form.proveedorNit : undefined,
        valorTotalCOP: form.valorTotalCOP,
        tiempoEntregaDias: form.tiempoEntregaDias,
        archivo,
      });
      toast.success("Cotización agregada.");
      setForm(formInicial);
      setProveedorSeleccionado(null);
      setArchivo(null);
      if (archivoRef.current) archivoRef.current.value = "";
    } catch (err: any) {
      toast.error(err.message || "No fue posible agregar la cotización.");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (cotizacionId: string) => {
    setAccionId(cotizacionId);
    try {
      await eliminarCotizacion(cotizacionId);
      toast.success("Cotización eliminada.");
    } catch (err: any) {
      toast.error(err.message || "No fue posible eliminar la cotización.");
    } finally {
      setAccionId(null);
    }
  };

  const handleSeleccionar = async (cotizacionId: string) => {
    setAccionId(cotizacionId);
    try {
      await seleccionarGanadora(cotizacionId);
      toast.success("Cotización ganadora seleccionada.");
    } catch (err: any) {
      toast.error(err.message || "No fue posible seleccionar la cotización ganadora.");
    } finally {
      setAccionId(null);
    }
  };

  const handleVerCotizacion = async (cotizacionId: string) => {
    try {
      const blob = await descargarCotizacionProveedor(solicitudId, cotizacionId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      toast.error(err.message || "No fue posible abrir el documento.");
    }
  };

  return (
    <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
      <div className="pb-3 border-b border-slate-200 mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Trophy className="h-4 w-4 text-slate-500" /> Cuadro Comparativo de Cotizaciones
        </h2>
        <p className="mt-1 text-[11px] text-slate-500">
          {soloLectura
            ? "Registro histórico: el cuadro comparativo ya no se puede modificar."
            : "Se requiere al menos 1 cotización completa y una elegida como ganadora para poder aprobar la solicitud (hasta un máximo de 3)."}
        </p>
      </div>

      <Table>
        <TableHeader className="bg-slate-100/80">
          <TableRow className="hover:bg-slate-100/80">
            <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-3 py-2">
              Proveedor
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-3 py-2 text-right">
              Valor COP
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-3 py-2 text-center">
              Entrega
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-3 py-2 text-center">
              Doc.
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
              <TableCell className="num px-3 py-2 text-right text-xs font-bold">
                {money(c.valorTotalCOP)}
              </TableCell>
              <TableCell className="px-3 py-2 text-center text-xs">{c.tiempoEntregaDias} d.</TableCell>
              <TableCell className="px-3 py-2 text-center">
                <button
                  type="button"
                  title={`Ver documento: ${c.archivo.nombre}`}
                  onClick={() => handleVerCotizacion(c.id)}
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
                      disabled={accionId === c.id}
                      onClick={() => handleSeleccionar(c.id)}
                      className="h-6 text-[10px]"
                    >
                      Elegir ganadora
                    </Button>
                  )}
                  {puedeCrear && (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={accionId === c.id}
                      onClick={() => handleEliminar(c.id)}
                      className="h-6 text-[10px] text-slate-500 hover:text-slate-900"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {cotizaciones.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="px-3 py-6 text-center text-xs text-slate-500">
                {cargandoCotizaciones
                  ? "Cargando cotizaciones..."
                  : errorCotizaciones || "Todavía no hay cotizaciones registradas."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {puedeCrear && cotizaciones.length < 3 && !cotizaciones.some((c) => c.esGanadora) && (
        <form
          onSubmit={handleAgregar}
          className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
        >
          <p className="text-xs font-bold text-slate-700">
            Agregar cotización ({cotizaciones.length}/3)
          </p>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Proveedor *</Label>
            <Combobox
              value={form.proveedorId}
              onValueChange={(val) => {
                setForm({ ...form, proveedorId: val, proveedorNombre: "", proveedorNit: "" });
                setProveedorSeleccionado(proveedoresDelArea.find((p) => p.id === val) ?? null);
              }}
              placeholder="Selecciona un proveedor"
              searchPlaceholder="Buscar por nombre o NIT..."
              emptyText="Ningún proveedor coincide."
              clearable={false}
              onSearchChange={buscarProveedores}
              loadingOptions={buscandoProveedores}
              selectedLabel={proveedorSeleccionado?.nombre}
              options={[
                ...proveedoresDelArea.map((p) => ({ value: p.id, label: p.nombre })),
                { value: PROVEEDOR_MANUAL, label: "Otro proveedor (no está en el catálogo)" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {form.proveedorId === PROVEEDOR_MANUAL ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">
                    Nombre del proveedor *
                  </Label>
                  <Input
                    required
                    value={form.proveedorNombre}
                    onChange={(e) => setForm({ ...form, proveedorNombre: e.target.value })}
                    className="h-9 text-xs border-slate-300 bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">NIT *</Label>
                  <Input
                    required
                    value={form.proveedorNit}
                    onChange={(e) => setForm({ ...form, proveedorNit: e.target.value })}
                    className="h-9 text-xs border-slate-300 bg-white"
                  />
                </div>
              </>
            ) : (
              form.proveedorId && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">NIT</Label>
                  <Input
                    disabled
                    value={proveedorSeleccionado?.nit ?? ""}
                    className="h-9 text-xs border-slate-300 bg-slate-50 text-slate-500"
                  />
                </div>
              )
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Valor total (COP) *</Label>
              <Input
                required
                type="number"
                min={1}
                value={form.valorTotalCOP}
                onChange={(e) => setForm({ ...form, valorTotalCOP: Number(e.target.value) })}
                className="h-9 text-xs border-slate-300 bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Tiempo de entrega (días) *</Label>
              <Input
                required
                type="number"
                min={0}
                value={form.tiempoEntregaDias}
                onChange={(e) => setForm({ ...form, tiempoEntregaDias: Number(e.target.value) })}
                className="h-9 text-xs border-slate-300 bg-white"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Documento de la cotización *</Label>
            <div className="flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <Input
                ref={archivoRef}
                required
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                className="h-9 text-xs border-slate-300 bg-white file:mr-2 file:text-xs file:font-semibold"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={guardando}
              className="bg-blue-800 text-white hover:bg-blue-900 font-bold"
            >
              {guardando ? "Guardando..." : "Agregar Cotización"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * Timeline derivada de los datos ya disponibles (SolicitudCompra no tiene
 * una tabla de historial propia como Factura) — se compone a partir de
 * fechaSolicitud, cotizaciones agregadas, resolución, facturas vinculadas y
 * confirmación de recepción, ordenada cronológicamente.
 */
function TrazabilidadSolicitud({
  solicitud,
  facturasRelacionadas,
}: {
  solicitud: import("@/lib/data").SolicitudCompra;
  facturasRelacionadas: import("@/lib/data").Factura[];
}) {
  const eventos: { fecha: string; titulo: string; detalle?: string }[] = [
    { fecha: solicitud.fechaSolicitud, titulo: "Solicitud creada", detalle: solicitud.solicitante },
  ];
  if (solicitud.fechaResolucion) {
    eventos.push({
      fecha: solicitud.fechaResolucion,
      titulo: solicitud.estado === "Rechazada" ? "Solicitud rechazada" : "Solicitud aprobada",
      detalle: solicitud.resueltoPorNombre || undefined,
    });
  }
  for (const f of facturasRelacionadas) {
    eventos.push({
      fecha: f.fecha,
      titulo: `Factura ${f.numero} vinculada`,
      detalle: `${f.proveedor} · ${money(f.total)}`,
    });
  }
  if (solicitud.recepcion) {
    eventos.push({
      fecha: solicitud.recepcion.confirmadaEn,
      titulo: "Recepción del producto confirmada",
      detalle: solicitud.recepcion.confirmadaPor || undefined,
    });
  }
  eventos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  return (
    <ol className="space-y-4">
      {eventos.map((ev, i) => (
        <li key={i} className="relative pl-6">
          <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-blue-800" />
          {i < eventos.length - 1 && (
            <span className="absolute left-[4.5px] top-5 h-[calc(100%+0.5rem)] w-px bg-border" />
          )}
          <p className="text-xs font-semibold">{ev.titulo}</p>
          <p className="text-[10px] text-slate-500">{new Date(ev.fecha).toLocaleString("es-CO")}</p>
          {ev.detalle && <p className="mt-1 text-xs text-slate-500 italic">{ev.detalle}</p>}
        </li>
      ))}
    </ol>
  );
}
