import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  DollarSign,
  Download,
  FileSignature,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Receipt,
  Send,
  ShoppingCart,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { useFacturas, usePollingFacturas } from "@/hooks/use-facturas";
import { usePagosFactura, METODOS_PAGO, type Pago } from "@/hooks/use-pagos";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

export const Route = createFileRoute("/facturas/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de Factura | RicoSoft" },
      { name: "description", content: "Trazabilidad y aprobación de la factura." },
    ],
  }),
  component: DetalleFactura,
});

function formatearTamano(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DetalleFactura() {
  const { id } = Route.useParams();
  const {
    facturas,
    loading,
    error,
    refreshOne,
    updateEstadoFactura,
    subirArchivoFactura,
    eliminarArchivoFactura,
    descargarArchivoFactura,
    agregarComentarioFactura,
  } = useFacturas();
  const { user } = useSession();

  // Refresca en segundo plano cada pocos segundos SOLO esta factura (no todo
  // el listado del tenant): si otro usuario aprueba, adjunta un documento o
  // comenta la factura, se ve reflejado sin recargar. Se pausa si la pestaña
  // no está visible.
  usePollingFacturas(useCallback(() => refreshOne(id), [refreshOne, id]));

  const factura = facturas.find((f) => f.id === id);
  const canManageArchivo = hasPermission(user, PERMISOS_SISTEMA.FACTURAS_CREAR);
  const puedeAprobar = hasPermission(user, PERMISOS_SISTEMA.FACTURAS_APROBAR);
  const puedeRechazar = hasPermission(user, PERMISOS_SISTEMA.FACTURAS_RECHAZAR);
  const puedePagar = hasPermission(user, PERMISOS_SISTEMA.FACTURAS_PAGAR);

  const {
    pagos,
    totalPagado,
    saldoPendiente,
    registrarPago,
    anularPago,
    subirComprobante,
    descargarComprobante,
  } = usePagosFactura(factura?.id);

  const [confirmAccion, setConfirmAccion] = useState<{
    estado: "Aprobada" | "Rechazada";
    detalle: string;
    titulo: string;
    verbo: string;
  } | null>(null);
  const [aplicandoAccion, setAplicandoAccion] = useState(false);
  const [pagoModalOpen, setPagoModalOpen] = useState(false);

  const handleConfirmarAccion = async () => {
    if (!confirmAccion || !factura) return;
    setAplicandoAccion(true);
    try {
      await updateEstadoFactura(factura.id, confirmAccion.estado, confirmAccion.detalle);
      toast.success(`Factura actualizada a "${confirmAccion.estado}".`);
      setConfirmAccion(null);
    } catch (err: any) {
      toast.error(err.message || "No fue posible actualizar la factura.");
    } finally {
      setAplicandoAccion(false);
    }
  };

  if (loading && !factura) {
    return (
      <AppShell title="Cargando factura..." description="RicoSoft Contabilidad">
        <div className="panel p-12 text-center text-xs text-slate-500 bg-white border-slate-200 shadow-2xs">Cargando...</div>
      </AppShell>
    );
  }

  if (!factura) {
    return (
      <AppShell title="Factura no encontrada" description="RicoSoft Contabilidad">
        <div className="panel p-12 text-center text-xs text-slate-500 bg-white border-slate-200 shadow-2xs">
          <p className="font-semibold text-base mb-2">Factura no registrada</p>
          <p>{error || `No se encontró la factura ${id} en la base de datos de esta empresa.`}</p>
          <Link to="/facturas" className="mt-4 inline-block">
            <Button size="sm">Volver a Facturas</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const campos = [
    ["Número", factura.numero],
    ["Empresa ID", factura.empresaId],
    ["Proveedor", factura.proveedor],
    ["NIT Proveedor", factura.nit],
    ["Área Responsable", factura.area],
    ["Responsable", factura.responsable],
    ["Fecha de Emisión", factura.fecha],
    ["Vencimiento", factura.vence],
    ["Moneda", factura.moneda],
    ["Prioridad", factura.prioridad],
    ["Origen", factura.origen],
  ];

  const eventosSistema = factura.historial.filter((h) => h.accion !== "Comentario");
  const comentarios = factura.historial.filter((h) => h.accion === "Comentario");

  return (
    <AppShell
      title={`Factura ${factura.numero}`}
      description={`${factura.proveedor} · Empresa ID: ${factura.empresaId}`}
      actions={
        <>
          <Link to="/facturas">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          {factura.estado === "Pendiente" && (
            <>
              {puedeRechazar && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfirmAccion({
                      estado: "Rechazada",
                      detalle: "Rechazada en revisión manual",
                      titulo: "¿Rechazar esta factura?",
                      verbo: "rechazar",
                    })
                  }
                  className="gap-2 text-slate-900 border-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" /> Rechazar
                </Button>
              )}
              {puedeAprobar && (
                <Button
                  size="sm"
                  onClick={() =>
                    setConfirmAccion({
                      estado: "Aprobada",
                      detalle: "Validado correctamente",
                      titulo: "¿Aprobar esta factura?",
                      verbo: "aprobar",
                    })
                  }
                  className="gap-2 bg-blue-800 hover:bg-blue-900 text-white"
                >
                  <Check className="h-4 w-4" /> Aprobar Factura
                </Button>
              )}
            </>
          )}
          {factura.estado === "Aprobada" && puedePagar && (
            <Button
              size="sm"
              onClick={() => setPagoModalOpen(true)}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <DollarSign className="h-4 w-4" /> Registrar Pago
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 mb-4">
              <h2 className="text-sm font-semibold">Datos Generales de la Factura</h2>
              <div className="flex items-center gap-2">
                {factura.vencida && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> Vencida
                  </span>
                )}
                <EstadoBadge estado={factura.estado} />
              </div>
            </div>

            {(factura.servicio || factura.contratoRel || factura.solicitudCompraRel) && (
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                {factura.servicio && (
                  <Link
                    to="/servicios/$id"
                    params={{ id: factura.servicio.id }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 font-semibold text-blue-800 hover:bg-blue-100"
                  >
                    <Receipt className="h-3.5 w-3.5" /> {factura.servicio.nombre}
                  </Link>
                )}
                {factura.contratoRel && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
                    <FileSignature className="h-3.5 w-3.5" /> Contrato con {factura.contratoRel.proveedor}
                  </span>
                )}
                {factura.solicitudCompraRel && (
                  <Link
                    to="/historia-compras"
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> Solicitud: {factura.solicitudCompraRel.item}
                  </Link>
                )}
              </div>
            )}

            {factura.alertaValor && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{factura.alertaValor.mensaje}</span>
              </div>
            )}

            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {campos.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Subtotal
                </p>
                <p className="num text-base font-semibold">
                  {money(factura.subtotal, factura.moneda)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">IVA</p>
                <p className="num text-base font-semibold">{money(factura.iva, factura.moneda)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Total a Pagar
                </p>
                <p className="num text-lg font-bold text-blue-800">
                  {money(factura.total, factura.moneda)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Total Pagado
                </p>
                <p className="num text-base font-semibold text-emerald-700">
                  {money(totalPagado, factura.moneda)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Saldo Pendiente
                </p>
                <p className="num text-base font-semibold">
                  {money(saldoPendiente, factura.moneda)}
                </p>
              </div>
            </div>
          </div>

          <PagosFactura
            pagos={pagos}
            puedePagar={puedePagar}
            moneda={factura.moneda}
            onAnular={anularPago}
            onSubirComprobante={subirComprobante}
            onDescargarComprobante={descargarComprobante}
          />

          <DocumentoFactura
            facturaId={factura.id}
            archivo={factura.archivo}
            canManage={canManageArchivo}
            subirArchivoFactura={subirArchivoFactura}
            eliminarArchivoFactura={eliminarArchivoFactura}
            descargarArchivoFactura={descargarArchivoFactura}
          />

          <ComentariosFactura
            comentarios={comentarios}
            onEnviar={(texto) => agregarComentarioFactura(factura.id, texto)}
          />
        </div>

        <div className="space-y-4">
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="text-sm font-semibold mb-4">Trazabilidad y Auditoría</h2>
            <ol className="space-y-4">
              {eventosSistema.map((h, i) => (
                <li key={i} className="relative pl-6">
                  <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-blue-800" />
                  {i < eventosSistema.length - 1 && (
                    <span className="absolute left-[4.5px] top-5 h-[calc(100%+0.5rem)] w-px bg-border" />
                  )}
                  <p className="text-xs font-semibold">{h.accion}</p>
                  <p className="text-[10px] text-slate-500">
                    {new Date(h.fecha).toLocaleString("es-CO")} · {h.actor}
                  </p>
                  {h.detalle && (
                    <p className="mt-1 text-xs text-slate-500 italic">{h.detalle}</p>
                  )}
                </li>
              ))}
              {eventosSistema.length === 0 && (
                <li className="text-xs text-slate-500">Sin eventos registrados.</li>
              )}
            </ol>
          </div>
        </div>
      </div>

      <AlertDialog open={!!confirmAccion} onOpenChange={(open) => !open && setConfirmAccion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAccion?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a {confirmAccion?.verbo} la factura <strong>{factura.numero}</strong>. Esta acción
              queda registrada con tu usuario y la hora actual.
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

      <RegistrarPagoModal
        open={pagoModalOpen}
        onOpenChange={setPagoModalOpen}
        saldoPendiente={saldoPendiente}
        moneda={factura.moneda}
        onRegistrar={registrarPago}
      />
    </AppShell>
  );
}

interface RegistrarPagoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saldoPendiente: number;
  moneda: string;
  onRegistrar: (datos: {
    fecha?: string;
    valor: number;
    metodoPago: string;
    referencia?: string;
    observaciones?: string;
  }) => Promise<unknown>;
}

function RegistrarPagoModal({ open, onOpenChange, saldoPendiente, moneda, onRegistrar }: RegistrarPagoModalProps) {
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split("T")[0],
    valor: saldoPendiente,
    metodoPago: "Transferencia",
    referencia: "",
    observaciones: "",
  });
  const [guardando, setGuardando] = useState(false);

  // Cada vez que se abre el modal, precarga el saldo pendiente actual como
  // valor sugerido (lo normal es pagar el saldo completo; el usuario puede
  // cambiarlo para registrar un abono parcial).
  useEffect(() => {
    if (open) {
      setForm({
        fecha: new Date().toISOString().split("T")[0],
        valor: saldoPendiente,
        metodoPago: "Transferencia",
        referencia: "",
        observaciones: "",
      });
    }
  }, [open, saldoPendiente]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.valor || form.valor <= 0) {
      toast.error("El valor del pago debe ser mayor a cero.");
      return;
    }
    setGuardando(true);
    try {
      const resultado: any = await onRegistrar({
        fecha: form.fecha,
        valor: Number(form.valor),
        metodoPago: form.metodoPago,
        referencia: form.referencia.trim() || undefined,
        observaciones: form.observaciones.trim() || undefined,
      });
      if (resultado?.factura?.estado === "Pagada") {
        toast.success("Pago registrado. La factura quedó completamente pagada.");
      } else {
        toast.success("Pago registrado. Queda saldo pendiente.");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al registrar el pago.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white border-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-900 font-bold">Registrar pago</DialogTitle>
          <DialogDescription className="text-slate-500">
            Saldo pendiente: <strong>{money(saldoPendiente, moneda)}</strong>. Puedes registrar el pago
            completo o un abono parcial.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pago-fecha" className="text-xs font-semibold">Fecha del pago</Label>
              <Input
                type="date"
                id="pago-fecha"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pago-valor" className="text-xs font-semibold">Valor *</Label>
              <Input
                type="number"
                id="pago-valor"
                required
                min={1}
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })}
                className="h-9 text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pago-metodo" className="text-xs font-semibold">Método de pago</Label>
              <Select value={form.metodoPago} onValueChange={(val) => setForm({ ...form, metodoPago: val })}>
                <SelectTrigger id="pago-metodo" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METODOS_PAGO.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pago-referencia" className="text-xs font-semibold">Referencia</Label>
              <Input
                id="pago-referencia"
                placeholder="Nº de transacción, cheque, etc."
                value={form.referencia}
                onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pago-observaciones" className="text-xs font-semibold">Observaciones</Label>
            <Input
              id="pago-observaciones"
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              className="h-9 text-xs"
            />
          </div>
          <p className="text-[11px] text-slate-500">
            El comprobante se puede adjuntar después de registrar el pago, desde la lista de pagos.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={guardando} className="bg-blue-800 hover:bg-blue-900 text-white font-bold">
              {guardando ? "Registrando..." : "Registrar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface PagosFacturaProps {
  pagos: Pago[];
  puedePagar: boolean;
  moneda: string;
  onAnular: (pagoId: string) => Promise<unknown>;
  onSubirComprobante: (pagoId: string, file: File) => Promise<void>;
  onDescargarComprobante: (pagoId: string) => Promise<Blob>;
}

function PagosFactura({ pagos, puedePagar, moneda, onAnular, onSubirComprobante, onDescargarComprobante }: PagosFacturaProps) {
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [subiendoId, setSubiendoId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleAnular = async (pago: Pago) => {
    if (!confirm(`¿Anular el pago de ${money(pago.valor, moneda)}? La factura volverá a "Aprobada" si queda saldo pendiente.`)) return;
    setAnulandoId(pago.id);
    try {
      await onAnular(pago.id);
      toast.success("Pago anulado.");
    } catch (err: any) {
      toast.error(err.message || "Error al anular el pago.");
    } finally {
      setAnulandoId(null);
    }
  };

  const handleSeleccionComprobante = async (pago: Pago, file: File) => {
    setSubiendoId(pago.id);
    try {
      await onSubirComprobante(pago.id, file);
    } catch (err: any) {
      toast.error(err.message || "Error al subir el comprobante.");
    } finally {
      setSubiendoId(null);
    }
  };

  const handleVerComprobante = async (pago: Pago) => {
    try {
      const blob = await onDescargarComprobante(pago.id);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err: any) {
      toast.error(err.message || "No fue posible abrir el comprobante.");
    }
  };

  return (
    <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
      <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold">
        <Receipt className="h-4 w-4 text-slate-500" /> Pagos
      </h2>
      {pagos.length === 0 ? (
        <p className="text-xs text-slate-500">Sin pagos registrados.</p>
      ) : (
        <div className="space-y-3">
          {pagos.map((p) => (
            <div
              key={p.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs ${
                p.estado === "Anulado" ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200"
              }`}
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm">
                  {money(p.valor, moneda)}{" "}
                  {p.estado === "Anulado" && (
                    <span className="ml-1 text-[10px] font-bold uppercase text-slate-500">Anulado</span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500">
                  {new Date(p.fecha).toLocaleDateString("es-CO")} · {p.metodoPago}
                  {p.referencia ? ` · Ref: ${p.referencia}` : ""} · Registrado por {p.registradoPorNombre}
                </p>
                {p.observaciones && <p className="mt-1 text-[11px] italic text-slate-500">{p.observaciones}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {p.comprobante ? (
                  <Button type="button" size="xs" variant="outline" className="gap-1" onClick={() => handleVerComprobante(p)}>
                    <Paperclip className="h-3 w-3" /> Ver comprobante
                  </Button>
                ) : (
                  p.estado === "Confirmado" &&
                  puedePagar && (
                    <>
                      <input
                        ref={(el) => {
                          fileInputRefs.current[p.id] = el;
                        }}
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleSeleccionComprobante(p, file);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="gap-1"
                        disabled={subiendoId === p.id}
                        onClick={() => fileInputRefs.current[p.id]?.click()}
                      >
                        <Upload className="h-3 w-3" /> {subiendoId === p.id ? "Subiendo..." : "Adjuntar comprobante"}
                      </Button>
                    </>
                  )
                )}
                {p.estado === "Confirmado" && puedePagar && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="gap-1 text-red-700 hover:bg-red-50 hover:text-red-800"
                    disabled={anulandoId === p.id}
                    onClick={() => handleAnular(p)}
                  >
                    <Ban className="h-3 w-3" /> {anulandoId === p.id ? "Anulando..." : "Anular"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DocumentoFacturaProps {
  facturaId: string;
  archivo: {
    nombre: string;
    mime: string | null;
    tamano: number | null;
    subidoPor: string | null;
    subidoEn: string | null;
  } | null;
  canManage: boolean;
  subirArchivoFactura: (id: string, file: File) => Promise<void>;
  eliminarArchivoFactura: (id: string) => Promise<void>;
  descargarArchivoFactura: (id: string) => Promise<Blob>;
}

function DocumentoFactura({
  facturaId,
  archivo,
  canManage,
  subirArchivoFactura,
  eliminarArchivoFactura,
  descargarArchivoFactura,
}: DocumentoFacturaProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    let urlCreada: string | null = null;

    if (archivo) {
      setCargandoVista(true);
      descargarArchivoFactura(facturaId)
        .then((blob) => {
          if (cancelado) return;
          urlCreada = URL.createObjectURL(blob);
          setBlobUrl(urlCreada);
        })
        .catch(() => {
          if (!cancelado) setBlobUrl(null);
        })
        .finally(() => {
          if (!cancelado) setCargandoVista(false);
        });
    } else {
      setBlobUrl(null);
    }

    return () => {
      cancelado = true;
      if (urlCreada) URL.revokeObjectURL(urlCreada);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturaId, archivo?.nombre, archivo?.subidoEn]);

  const handleSeleccionArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorArchivo("");
    setSubiendo(true);
    try {
      await subirArchivoFactura(facturaId, file);
    } catch (err: any) {
      setErrorArchivo(err.message || "Error al subir el archivo.");
    } finally {
      setSubiendo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleEliminar = async () => {
    if (!confirm("¿Eliminar el documento adjunto de esta factura?")) return;
    try {
      await eliminarArchivoFactura(facturaId);
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el archivo.");
    }
  };

  const esImagen = archivo?.mime?.startsWith("image/");
  const esPdf = archivo?.mime === "application/pdf";

  return (
    <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Documento Digitalizado</h2>
        {archivo && (
          <div className="flex items-center gap-1.5">
            {blobUrl && (
              <a href={blobUrl} download={archivo.nombre}>
                <Button type="button" variant="outline" size="xs" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Descargar
                </Button>
              </a>
            )}
            {canManage && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="gap-1.5"
                  disabled={subiendo}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" /> Reemplazar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  className="gap-1.5"
                  onClick={handleEliminar}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleSeleccionArchivo}
      />

      {!archivo && (
        <div className="mt-4">
          {canManage ? (
            <button
              type="button"
              disabled={subiendo}
              onClick={() => fileInputRef.current?.click()}
              className="grid h-40 w-full place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center transition-colors hover:bg-slate-100 disabled:opacity-60"
            >
              <div>
                {subiendo ? (
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-800" />
                ) : (
                  <Upload className="mx-auto h-7 w-7 text-blue-800 opacity-60" />
                )}
                <p className="mt-2 text-sm font-medium">
                  {subiendo ? "Subiendo archivo..." : "Adjuntar PDF o imagen de la factura"}
                </p>
                <p className="text-xs text-slate-500">PDF, PNG, JPG o WEBP · máx. 10MB</p>
              </div>
            </button>
          ) : (
            <div className="grid h-40 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center">
              <div>
                <FileText className="mx-auto h-8 w-8 text-slate-500 opacity-50" />
                <p className="mt-2 text-sm text-slate-500">Sin documento adjunto</p>
              </div>
            </div>
          )}
          {errorArchivo && <p className="mt-2 text-xs font-semibold text-slate-900">{errorArchivo}</p>}
        </div>
      )}

      {archivo && (
        <div className="mt-4">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5 text-slate-500" />
            {archivo.nombre}
            {archivo.tamano ? (
              <span className="text-slate-500">({formatearTamano(archivo.tamano)})</span>
            ) : null}
          </p>
          {archivo.subidoPor && (
            <p className="text-[10px] text-slate-500">
              Subido por {archivo.subidoPor}
              {archivo.subidoEn ? ` · ${new Date(archivo.subidoEn).toLocaleString("es-CO")}` : ""}
            </p>
          )}

          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {cargandoVista && (
              <div className="grid h-52 place-items-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-800" />
              </div>
            )}
            {!cargandoVista && blobUrl && esPdf && (
              <iframe src={blobUrl} title={archivo.nombre} className="h-[480px] w-full" />
            )}
            {!cargandoVista && blobUrl && esImagen && (
              <img src={blobUrl} alt={archivo.nombre} className="mx-auto max-h-[480px] w-auto" />
            )}
            {!cargandoVista && blobUrl && !esPdf && !esImagen && (
              <div className="grid h-40 place-items-center text-center">
                <div>
                  <FileText className="mx-auto h-8 w-8 text-slate-500 opacity-50" />
                  <p className="mt-2 text-xs text-slate-500">
                    Vista previa no disponible para este tipo de archivo.
                  </p>
                </div>
              </div>
            )}
            {!cargandoVista && !blobUrl && (
              <div className="grid h-40 place-items-center text-center">
                <p className="text-xs text-slate-500">
                  No se pudo cargar la vista previa del archivo.
                </p>
              </div>
            )}
          </div>

          {errorArchivo && <p className="mt-2 text-xs font-semibold text-slate-900">{errorArchivo}</p>}
        </div>
      )}
    </div>
  );
}

function ComentariosFactura({
  comentarios,
  onEnviar,
}: {
  comentarios: { fecha: string; actor: string; detalle?: string }[];
  onEnviar: (texto: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorComentario, setErrorComentario] = useState("");

  const handleEnviar = async () => {
    const valor = texto.trim();
    if (!valor) return;
    setErrorComentario("");
    setEnviando(true);
    try {
      await onEnviar(valor);
      setTexto("");
    } catch (err: any) {
      setErrorComentario(err.message || "Error al enviar el comentario.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
      <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-slate-500" /> Comentarios
      </h2>

      <div className="space-y-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un comentario para el equipo..."
          rows={2}
          maxLength={2000}
          className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs shadow-xs placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-800"
        />
        <div className="flex items-center justify-between">
          {errorComentario ? (
            <p className="text-xs font-semibold text-slate-900">{errorComentario}</p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="xs"
            disabled={enviando || !texto.trim()}
            onClick={handleEnviar}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" /> {enviando ? "Enviando..." : "Comentar"}
          </Button>
        </div>
      </div>

      <ol className="mt-4 space-y-4 border-t border-slate-200 pt-4">
        {comentarios.map((c, i) => (
          <li key={i} className="text-xs">
            <p className="font-semibold">{c.actor}</p>
            <p className="text-[10px] text-slate-500">{new Date(c.fecha).toLocaleString("es-CO")}</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{c.detalle}</p>
          </li>
        ))}
        {comentarios.length === 0 && (
          <li className="text-xs text-slate-500">Todavía no hay comentarios.</li>
        )}
      </ol>
    </div>
  );
}
