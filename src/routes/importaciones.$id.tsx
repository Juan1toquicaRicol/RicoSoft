import { AsignacionesEmbarque, VincularItemSiesa } from "@/components/importaciones/asignaciones-embarque";
import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Anchor,
  ArrowLeft,
  Lock,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Ship,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { BarraVencimiento } from "@/components/ui/barra-vencimiento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HitosLotePanel } from "@/components/importaciones/hitos-lote-panel";
import { OrdenCreadaAviso } from "@/components/importaciones/orden-creada-aviso";
import { esMarcaOrdenCreada, sinMarcaOrdenCreada } from "@/components/importaciones/orden-creada";
import {
  ImportacionHeader,
  ImportacionResumen,
  ImportacionProgreso,
  ImportacionAccionesPendientes,
  ImportacionMercanciaResumen,
  EstadoVacioPestana,
  TabCounterBadge,
} from "@/components/importaciones/orden-detalle";
import {
  useOrdenCompraIntl,
  usePollingOrdenCompraIntl,
  ETIQUETA_RESPONSABLE_TIPO,
  type ActualizarEmbarqueInput,
  type ActualizarExpedienteInput,
  type ActualizarVistoBuenoInput,
  type ContenedorLote,
  type CrearActividadInput,
  type CrearLoteInput,
  type CrearNovedadInput,
  type CrearPagoInput,
  type CrearVistoBuenoInput,
  type DocumentoLote,
  type EtapaImportacion,
  type EventoContenedorTipo,
  type LiquidarCosteoInput,
  type LoteImportacion,
  type MetodoProrrateoGastos,
  type ResponsableTipo,
  type TipoDocumentoExpediente,
  type TipoDocumentoLote,
  type TipoDocumentoOrdenIntl,
  type TipoNovedad,
  type VistoBuenoAduanero,
  METODOS_PRORRATEO_GASTOS,
  TIPOS_DOCUMENTO_LOTE,
  TIPOS_DOCUMENTO_ORDEN_INTL,
} from "@/hooks/use-importaciones";
import { useCatalogo } from "@/hooks/use-catalogos";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money } from "@/lib/data";
import { cn } from "@/lib/utils";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/importaciones/$id")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.IMPORTACIONES_VER),
  head: () => ({
    meta: [
      { title: "Detalle de Orden de Compra Internacional | RicoSoft" },
      {
        name: "description",
        content: "Trazabilidad de lotes, expediente aduanero y costeo landed (NIC 2/21).",
      },
    ],
  }),
  component: DetalleOrdenIntl,
});

const TIPOS_DOCUMENTO_EXPEDIENTE: { tipo: TipoDocumentoExpediente; etiqueta: string }[] = [
  { tipo: "dim", etiqueta: "DIM" },
  { tipo: "factura-comercial", etiqueta: "Factura comercial" },
  { tipo: "certificado-origen", etiqueta: "Certificado de origen" },
];

const DOC_KEY: Record<TipoDocumentoExpediente, "dim" | "facturaComercial" | "certificadoOrigen"> = {
  dim: "dim",
  "factura-comercial": "facturaComercial",
  "certificado-origen": "certificadoOrigen",
};

const ESTADOS_VISTO_BUENO = ["Pendiente", "Aprobado", "Rechazado"];

const ETAPAS_IMPORTACION: EtapaImportacion[] = [
  "Orden",
  "Documentación",
  "Embarque",
  "Tránsito",
  "Aduana",
  "Nacionalización",
  "Pagos",
  "Recepción",
  "Cierre",
];
const RESPONSABLE_TIPOS: ResponsableTipo[] = [
  "Interno",
  "Proveedor",
  "AgenciaAduana",
  "Transportador",
  "Naviera",
  "Otro",
];
const actividadVacia: CrearActividadInput = {
  nombre: "",
  etapa: "Documentación",
  responsableTipo: "Proveedor",
};
const novedadVacia: CrearNovedadInput = { tipo: "Otro", descripcion: "" };
const pagoVacio: CrearPagoInput = { concepto: "", valor: 0, moneda: "COP" };

const ESTADOS_TRANSITO_MANUAL = ["En tránsito", "En puerto", "En inspección"];
const ESTADOS_LOTE_LIQUIDABLES = ["En puerto", "En inspección", "Liberado pre-compra"];

const loteVacio: CrearLoteInput = {
  blAwb: "",
  contenedor: "",
  precinto: "",
  puertoOrigen: "",
  puertoDestino: "",
  naviera: "",
};

const liquidacionVacia: LiquidarCosteoInput = {
  metodoProrrateoGastos: "FOB",
  trmLiquidacion: 4000,
  valorCifTotalUsd: 0,
  arancelTotalCop: 0,
  ivaTotalCop: 0,
  ivaDescontableCop: 0,
  fletesNacionalesCop: 0,
  agenciamientoCop: 0,
  otrosCostosCop: 0,
};

function DetalleOrdenIntl() {
  const { id } = Route.useParams();
  const { user } = useSession();
  return <DetalleOrdenIntlContenido key={(user?.tenantId ?? "sin-empresa") + "/" + id} id={id} />;
}

function DetalleOrdenIntlContenido({ id }: { id: string }) {
  const {
    data: motivosNovedad,
    isLoading: cargandoMotivosNovedad,
    error: errorMotivosNovedad,
  } = useCatalogo("MOTIVO_NOVEDAD_IMPORTACION");
  const etiquetaTipoNovedad = (clave: string) =>
    motivosNovedad.find((m) => m.clave === clave)?.etiqueta ?? clave;
  const {
    orden,
    loading,
    error,
    refresh,
    addLote,
    actualizarEstadoLote,
    actualizarEmbarqueLote,
    agregarContenedor,
    eliminarContenedor,
    sincronizarTracking,
    recibirPreCompraPlanta,
    liquidarCosteoImportacion,
    actualizarExpediente,
    subirDocumentoExpediente,
    eliminarDocumentoExpediente,
    descargarDocumentoExpediente,
    crearVistoBueno,
    actualizarVistoBueno,
    subirDocumentoVistoBueno,
    descargarDocumentoVistoBueno,
    subirDocumentoOrden,
    eliminarDocumentoOrden,
    descargarDocumentoOrden,
    registrarHito,
    eliminarHito,
    subirDocumentoLote,
    eliminarDocumentoLote,
    descargarDocumentoLote,
    crearActividad,
    completarActividad,
    crearNovedad,
    resolverNovedad,
    crearPago,
    marcarPagoPagado,
    cerrarOrden,
  } = useOrdenCompraIntl(id);
  const { user } = useSession();

  usePollingOrdenCompraIntl(useCallback(() => refresh({ silencioso: true }), [refresh]));

  const puedeCrear = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_CREAR);
  const puedeGestionarTransito = hasPermission(
    user,
    PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO,
  );
  const puedeRecibir = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_RECIBIR);
  const puedeLiquidar = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR);

  // Confirmación tras crear la orden: el formulario de creación redirige aquí con
  // state.ordenCreadaId = id de la orden creada. El aviso solo se muestra si ese
  // id coincide con el de la ruta y se consume una sola vez del historial con
  // replace (no reaparece al recargar, con Atrás/Adelante ni en otra orden).
  // El número mostrado es el definitivo (orden.codigo, devuelto por el servidor).
  const navigate = useNavigate();
  const llegoDeCrear = useLocation({ select: (l) => esMarcaOrdenCreada(l.state, id) });
  const [avisoParaId, setAvisoParaId] = useState<string | null>(llegoDeCrear ? id : null);
  useEffect(() => {
    if (!llegoDeCrear) return;
    setAvisoParaId(id);
    void navigate({
      to: "/importaciones/$id",
      params: { id },
      replace: true,
      state: (prev) => sinMarcaOrdenCreada(prev),
    });
  }, [llegoDeCrear, navigate, id]);
  const avisoCreadaVisible = avisoParaId === id;
  const [pestanaActiva, setPestanaActiva] = useState("resumen");
  // Lleva al contenido de la pestaña: la activa, con scroll y foco en su panel
  // (los paneles de Radix son enfocables, tabIndex=0).
  const irAPestana = (valor: string) => {
    setPestanaActiva(valor);
    requestAnimationFrame(() => {
      const panel = document.querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]');
      panel?.scrollIntoView({ block: "start", behavior: "smooth" });
      panel?.focus({ preventScroll: true });
    });
  };

  const [modalLoteOpen, setModalLoteOpen] = useState(false);
  const [loteForm, setLoteForm] = useState<CrearLoteInput>({ ...loteVacio });
  const [guardandoLote, setGuardandoLote] = useState(false);

  const [loteLiquidando, setLoteLiquidando] = useState<LoteImportacion | null>(null);
  const [liquidacionForm, setLiquidacionForm] = useState<LiquidarCosteoInput>({
    ...liquidacionVacia,
  });
  const [liquidando, setLiquidando] = useState(false);

  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);

  const [modalActividadOpen, setModalActividadOpen] = useState(false);
  const [actividadForm, setActividadForm] = useState<CrearActividadInput>({ ...actividadVacia });
  const [guardandoActividad, setGuardandoActividad] = useState(false);

  const [modalNovedadOpen, setModalNovedadOpen] = useState(false);
  const [novedadForm, setNovedadForm] = useState<CrearNovedadInput>({ ...novedadVacia });
  const [guardandoNovedad, setGuardandoNovedad] = useState(false);

  const [modalPagoOpen, setModalPagoOpen] = useState(false);
  const [pagoForm, setPagoForm] = useState<CrearPagoInput>({ ...pagoVacio });
  const [guardandoPago, setGuardandoPago] = useState(false);

  const [modalCerrarOpen, setModalCerrarOpen] = useState(false);
  const [justificacionCierre, setJustificacionCierre] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [errorCierre, setErrorCierre] = useState<string | null>(null);

  if (loading) {
    return (
      <AppShell title="Orden de Compra Internacional" description="Cargando...">
        <div className="p-12 text-center text-xs text-slate-500">Cargando orden...</div>
      </AppShell>
    );
  }

  if (error || !orden) {
    return (
      <AppShell title="Orden de Compra Internacional" description="No fue posible cargar la orden.">
        <div className="p-12 text-center text-xs text-slate-500">
          {error || "Orden no encontrada."}
        </div>
      </AppShell>
    );
  }

  const descripcionItem = (itemId: string) =>
    orden.items.find((i) => i.id === itemId)?.descripcion ?? "—";

  const handleAgregarLote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteForm.blAwb || !loteForm.puertoOrigen || !loteForm.puertoDestino) return;
    setGuardandoLote(true);
    try {
      await addLote(loteForm);
      toast.success("Lote registrado.");
      setModalLoteOpen(false);
      setLoteForm({ ...loteVacio });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible registrar el lote.");
    } finally {
      setGuardandoLote(false);
    }
  };

  const handleAvanzarTransito = async (lote: LoteImportacion, siguienteEstado: string) => {
    setAccionEnCurso(lote.id);
    try {
      await actualizarEstadoLote(lote.id, siguienteEstado);
      toast.success(`Lote ${lote.blAwb} → ${siguienteEstado}.`);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "No fue posible actualizar el estado del lote.",
      );
    } finally {
      setAccionEnCurso(null);
    }
  };

  const handleRecibirPlanta = async (lote: LoteImportacion) => {
    setAccionEnCurso(lote.id);
    try {
      await recibirPreCompraPlanta(lote.id);
      toast.success(
        `Lote ${lote.blAwb} recibido en planta (pre-compra). Costeo provisional generado.`,
      );
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "No fue posible registrar el ingreso a planta.",
      );
    } finally {
      setAccionEnCurso(null);
    }
  };

  const handleLiquidar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteLiquidando) return;
    setLiquidando(true);
    try {
      await liquidarCosteoImportacion(loteLiquidando.id, liquidacionForm);
      toast.success(`Costeo del lote ${loteLiquidando.blAwb} liquidado.`);
      setLoteLiquidando(null);
      setLiquidacionForm({ ...liquidacionVacia });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible liquidar el costeo.");
    } finally {
      setLiquidando(false);
    }
  };

  const handleAgregarActividad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actividadForm.nombre.trim()) return;
    setGuardandoActividad(true);
    try {
      await crearActividad(actividadForm);
      toast.success("Actividad registrada.");
      setModalActividadOpen(false);
      setActividadForm({ ...actividadVacia });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible registrar la actividad.");
    } finally {
      setGuardandoActividad(false);
    }
  };

  const handleCompletarActividad = async (actividadId: string) => {
    setAccionEnCurso(actividadId);
    try {
      await completarActividad(actividadId);
      toast.success("Actividad completada.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible completar la actividad.");
    } finally {
      setAccionEnCurso(null);
    }
  };

  const handleAgregarNovedad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novedadForm.descripcion.trim()) return;
    setGuardandoNovedad(true);
    try {
      await crearNovedad(novedadForm);
      toast.success("Novedad registrada.");
      setModalNovedadOpen(false);
      setNovedadForm({ ...novedadVacia });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible registrar la novedad.");
    } finally {
      setGuardandoNovedad(false);
    }
  };

  const handleResolverNovedad = async (novedadId: string) => {
    setAccionEnCurso(novedadId);
    try {
      await resolverNovedad(novedadId);
      toast.success("Novedad resuelta.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible resolver la novedad.");
    } finally {
      setAccionEnCurso(null);
    }
  };

  const handleAgregarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagoForm.concepto.trim() || pagoForm.valor <= 0) return;
    setGuardandoPago(true);
    try {
      await crearPago(pagoForm);
      toast.success("Obligación registrada.");
      setModalPagoOpen(false);
      setPagoForm({ ...pagoVacio });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible registrar el pago.");
    } finally {
      setGuardandoPago(false);
    }
  };

  const handleMarcarPagado = async (pagoId: string) => {
    setAccionEnCurso(pagoId);
    try {
      await marcarPagoPagado(pagoId);
      toast.success("Pago marcado como pagado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible actualizar el pago.");
    } finally {
      setAccionEnCurso(null);
    }
  };

  const handleCerrar = async (forzar: boolean) => {
    setCerrando(true);
    setErrorCierre(null);
    try {
      await cerrarOrden(forzar ? { forzar: true, justificacion: justificacionCierre } : undefined);
      toast.success("Importación cerrada.");
      setModalCerrarOpen(false);
      setJustificacionCierre("");
    } catch (err: unknown) {
      setErrorCierre(err instanceof Error ? err.message : "No fue posible cerrar la importación.");
    } finally {
      setCerrando(false);
    }
  };

  const puedeCerrar =
    puedeGestionarTransito && orden.estado !== "Cerrada" && orden.estado !== "Anulada";

  return (
    <AppShell
      title={orden.codigo}
      description={`${orden.proveedorExtranjero} · ${orden.paisOrigen} · Incoterm ${orden.incoterm}${
        orden.numeroOrden !== orden.codigo ? ` · Orden ${orden.numeroOrden}` : ""
      }`}
      actions={
        <>
          <Link to="/importaciones">
            <Button size="sm" variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Volver al listado
            </Button>
          </Link>
          {puedeCerrar && (
            <Button size="sm" onClick={() => setModalCerrarOpen(true)} className="gap-2">
              <Lock className="h-4 w-4" /> Cerrar importación
            </Button>
          )}
        </>
      }
    >
      {avisoCreadaVisible && (
        <OrdenCreadaAviso
          codigo={orden.codigo}
          onCerrar={() => setAvisoParaId(null)}
          onAdjuntarDocumentos={puedeCrear ? () => irAPestana("documentos") : undefined}
          onCrearLotes={
            puedeCrear && orden.estado !== "Anulada" && orden.estado !== "Cerrada"
              ? () => irAPestana("embarques")
              : undefined
          }
        />
      )}
      {/* 1. Header / centro de control — siempre visible, sin importar la pestaña activa. */}
      <ImportacionHeader orden={orden} />

      {/* 5. Navegación por pestañas — reubica el contenido ya existente sin duplicarlo. */}
      <Tabs value={pestanaActiva} onValueChange={setPestanaActiva} className="mt-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
          <TabsTrigger value="resumen" className="text-xs">
            Resumen
          </TabsTrigger>
          <TabsTrigger value="mercancia" className="text-xs">
            Mercancía
            <TabCounterBadge n={orden.items.length} />
          </TabsTrigger>
          <TabsTrigger value="documentos" className="text-xs">
            Documentos
            <TabCounterBadge n={orden.documentos.length} />
          </TabsTrigger>
          <TabsTrigger value="embarques" className="text-xs">
            Embarques
            <TabCounterBadge n={orden.lotes.length} />
          </TabsTrigger>
          <TabsTrigger value="seguimiento" className="text-xs">
            Seguimiento
            <TabCounterBadge
              n={orden.actividades.filter((a) => a.estado !== "Completada").length}
            />
          </TabsTrigger>
          <TabsTrigger value="novedades" className="text-xs">
            Novedades
            <TabCounterBadge n={orden.novedades.filter((n) => n.estado !== "Resuelta").length} />
          </TabsTrigger>
          <TabsTrigger value="pagos" className="text-xs">
            Pagos
            <TabCounterBadge n={orden.pagos.filter((p) => p.estado === "Pendiente").length} />
          </TabsTrigger>
          <TabsTrigger value="auditoria" className="text-xs">
            Auditoría
          </TabsTrigger>
        </TabsList>

        {/* RESUMEN */}
        <TabsContent value="resumen" className="space-y-4">
          <ImportacionResumen orden={orden} />
          <ImportacionProgreso orden={orden} />
          <ImportacionAccionesPendientes orden={orden} />

          {orden.proveedor && orden.proveedor.requisitos.length > 0 && (
            <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
              <div className="border-b border-slate-200 p-4 bg-slate-50/80">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Requisitos del Proveedor
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Vigentes hoy para {orden.proveedor.nombre} — administrados en Importaciones →
                  Proveedores y Requisitos.
                </p>
              </div>
              <ul className="divide-y divide-slate-100">
                {orden.proveedor.requisitos.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className="border-slate-300 bg-slate-50 text-slate-600 text-[10px]"
                    >
                      {r.tipo}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 truncate">{r.nombre}</p>
                      {r.descripcion && (
                        <p className="text-[11px] text-slate-500 truncate">{r.descripcion}</p>
                      )}
                    </div>
                    {r.obligatorio && (
                      <Badge
                        variant="outline"
                        className="border-slate-300 bg-slate-900 text-white text-[10px] shrink-0"
                      >
                        Obligatorio
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!orden.proveedor && (
            <p className="text-[11px] text-slate-500">
              Proveedor no vinculado al catálogo — sin requisitos asociados.
            </p>
          )}
        </TabsContent>

        {/* MERCANCÍA */}
        <TabsContent value="mercancia" className="space-y-4">
          <ImportacionMercanciaResumen orden={orden} />
          <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="border-b border-slate-200 p-4 bg-slate-50/80">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Ítems de la Orden
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Cantidad comercial y peso físico son datos distintos del ítem.
              </p>
            </div>
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow className="hover:bg-slate-100/80">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3">
                    Descripción
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3">
                    Ref. proveedor
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3 text-right">
                    Cantidad (comercial)
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3 text-right">
                    Peso físico
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3 text-right">
                    Valor FOB unit.
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3 text-right">
                    Subtotal FOB
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-slate-800 font-medium">
                {orden.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="px-4 py-2.5">
                      {item.descripcion}
                      {puedeCrear && orden.estado !== "Anulada" && !item.itemRowId && item.unidadMedida && (
                        <VincularItemSiesa item={item} onGuardado={() => refresh({ silencioso: true })} />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-slate-500">
                      {item.referenciaProveedor ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right font-mono">
                      {item.cantidad}
                      {item.unidadMedida ? ` ${item.unidadMedida}` : ""}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right font-mono text-slate-500">
                      {item.pesoKg != null ? `${item.pesoKg.toLocaleString("es-CO")} kg` : "—"}
                    </TableCell>
                    <TableCell className="num px-4 py-2.5 text-right">
                      {money(item.valorUnitarioFob, orden.moneda)}
                    </TableCell>
                    <TableCell className="num px-4 py-2.5 text-right font-bold">
                      {money(item.cantidad * item.valorUnitarioFob, orden.moneda)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* DOCUMENTOS */}
        <TabsContent value="documentos" className="space-y-4">
          <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="border-b border-slate-200 p-4 bg-slate-50/80">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Documentos Iniciales
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Cotización, Proforma Invoice, oferta comercial u otros documentos de soporte de la
                orden.
              </p>
            </div>
            <div className="p-4">
              {orden.documentos.length === 0 && !puedeCrear ? (
                <EstadoVacioPestana
                  titulo="Sin documentos"
                  descripcion="Todavía no se ha adjuntado ningún documento inicial a esta orden."
                />
              ) : (
                <DocumentosInicialesPanel
                  ordenId={orden.id}
                  documentos={orden.documentos}
                  canManage={puedeCrear}
                  onSubir={subirDocumentoOrden}
                  onEliminar={eliminarDocumentoOrden}
                  onDescargar={descargarDocumentoOrden}
                />
              )}
            </div>
          </div>
        </TabsContent>

        {/* EMBARQUES */}
        <TabsContent value="embarques" className="space-y-4">
          <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 bg-slate-50/80">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <Ship className="h-3.5 w-3.5" /> Lotes de Embarque
              </h3>
              {puedeCrear && orden.estado !== "Anulada" && orden.estado !== "Cerrada" && (
                <Button
                  size="xs"
                  onClick={() => setModalLoteOpen(true)}
                  className="h-7 text-[11px]"
                >
                  <Plus className="h-3 w-3 mr-1" /> Registrar Lote
                </Button>
              )}
            </div>

            {orden.lotes.length === 0 ? (
              <EstadoVacioPestana
                titulo="Sin lotes de embarque"
                descripcion="Esta orden no tiene lotes registrados todavía."
                accion={
                  puedeCrear &&
                  orden.estado !== "Anulada" &&
                  orden.estado !== "Cerrada" && (
                    <Button
                      size="xs"
                      onClick={() => setModalLoteOpen(true)}
                      className="h-7 text-[11px]"
                    >
                      <Plus className="h-3 w-3 mr-1" /> Registrar Lote
                    </Button>
                  )
                }
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {orden.lotes.map((lote) => (
                  <div key={lote.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-900">BL/AWB {lote.blAwb}</p>
                        <p className="text-[11px] text-slate-500">
                          {lote.puertoOrigen} → {lote.puertoDestino}
                          {lote.contenedor ? ` · Contenedor ${lote.contenedor}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <EstadoBadge estado={lote.estado} />
                        {ESTADOS_TRANSITO_MANUAL.includes(lote.estado) &&
                          lote.fechaLlegadaEstimada && (
                            <BarraVencimiento
                              fecha={lote.fechaLlegadaEstimada}
                              etiquetaVencido="Debió llegar"
                              ventanaDias={20}
                            />
                          )}
                      </div>
                    </div>

                    <AsignacionesEmbarque
                      lote={lote}
                      items={orden.items}
                      puedeEditar={puedeGestionarTransito && orden.estado !== "Anulada"}
                      puedeRecibir={puedeRecibir}
                      onGuardado={() => refresh({ silencioso: true })}
                    />

                    <div className="flex flex-wrap gap-1.5">
                      {puedeGestionarTransito &&
                        ESTADOS_TRANSITO_MANUAL.includes(lote.estado) &&
                        ESTADOS_TRANSITO_MANUAL.filter((e) => e !== lote.estado).map((estado) => (
                          <Button
                            key={estado}
                            size="xs"
                            variant="outline"
                            disabled={accionEnCurso === lote.id}
                            onClick={() => handleAvanzarTransito(lote, estado)}
                            className="h-7 text-[11px] font-bold"
                          >
                            Mover a "{estado}"
                          </Button>
                        ))}
                      {puedeRecibir && ESTADOS_TRANSITO_MANUAL.includes(lote.estado) && (
                        <Button
                          size="xs"
                          variant="destructive"
                          disabled={accionEnCurso === lote.id}
                          onClick={() => handleRecibirPlanta(lote)}
                          className="h-7 text-[11px]"
                        >
                          <Package className="h-3 w-3 mr-1" /> Recibir en planta (pre-compra)
                        </Button>
                      )}
                      {puedeLiquidar &&
                        ESTADOS_LOTE_LIQUIDABLES.includes(lote.estado) &&
                        (() => {
                          const vistosPendientes = (lote.expediente?.vistosBuenos ?? []).filter(
                            (v) => v.estado !== "Aprobado",
                          ).length;
                          const listoParaLiquidar =
                            lote.expediente?.estado === "Levantado" && vistosPendientes === 0;
                          return (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                setLoteLiquidando(lote);
                                setLiquidacionForm({
                                  ...liquidacionVacia,
                                  trmLiquidacion: orden.trmPactada,
                                });
                              }}
                              title={
                                listoParaLiquidar
                                  ? undefined
                                  : 'La liquidación definitiva requiere el levante aduanero (expediente en estado "Levantado") y todos los vistos buenos aprobados. El sistema lo validará al confirmar.'
                              }
                              className="h-7 text-[11px] font-bold border-blue-300 text-blue-800 hover:bg-blue-50"
                            >
                              Liquidar costeo de importación
                              {!listoParaLiquidar && (
                                <AlertTriangle className="h-3 w-3 ml-1.5 text-amber-600" />
                              )}
                            </Button>
                          );
                        })()}
                    </div>

                    {lote.costeos.length > 0 && (
                      <div className="rounded-md border border-slate-200 overflow-hidden">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow className="hover:bg-slate-50">
                              <TableHead className="text-slate-600 font-bold px-3 py-2">
                                Ítem
                              </TableHead>
                              <TableHead className="text-slate-600 font-bold px-3 py-2 text-right">
                                Costo total COP
                              </TableHead>
                              <TableHead className="text-slate-600 font-bold px-3 py-2 text-right">
                                Costo unitario COP
                              </TableHead>
                              <TableHead className="text-slate-600 font-bold px-3 py-2 text-right">
                                Dif. cambio COP
                              </TableHead>
                              <TableHead className="text-slate-600 font-bold px-3 py-2">
                                Tipo
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lote.costeos.map((c) => (
                              <TableRow key={c.id}>
                                <TableCell className="px-3 py-2">
                                  {descripcionItem(c.itemId)}
                                </TableCell>
                                <TableCell className="num px-3 py-2 text-right font-bold">
                                  {money(c.costoTotalCop, "COP")}
                                </TableCell>
                                <TableCell className="num px-3 py-2 text-right">
                                  {money(c.costoUnitarioCop, "COP")}
                                </TableCell>
                                <TableCell className="num px-3 py-2 text-right">
                                  {money(c.diferenciaCambioCop, "COP")}
                                </TableCell>
                                <TableCell className="px-3 py-2">
                                  <EstadoBadge
                                    estado={c.esProvisional ? "Pendiente" : "Aprobada"}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    <EmbarqueTrackingPanel
                      lote={lote}
                      canManage={puedeGestionarTransito}
                      onEditar={actualizarEmbarqueLote}
                      onAgregarContenedor={agregarContenedor}
                      onEliminarContenedor={eliminarContenedor}
                      onSincronizar={sincronizarTracking}
                    />

                    <HitosLotePanel
                      lote={lote}
                      canManage={puedeGestionarTransito}
                      onRegistrar={registrarHito}
                      onEliminar={eliminarHito}
                    />

                    <DocumentosLotePanel
                      lote={lote}
                      canManage={puedeGestionarTransito}
                      onSubir={subirDocumentoLote}
                      onEliminar={eliminarDocumentoLote}
                      onDescargar={descargarDocumentoLote}
                    />

                    <ExpedienteAduaneroPanel
                      lote={lote}
                      canManage={puedeGestionarTransito}
                      onActualizar={actualizarExpediente}
                      onSubirDocumento={subirDocumentoExpediente}
                      onEliminarDocumento={eliminarDocumentoExpediente}
                      onDescargarDocumento={descargarDocumentoExpediente}
                    />

                    <VistosBuenosPanel
                      lote={lote}
                      canManage={puedeGestionarTransito}
                      onCrear={crearVistoBueno}
                      onActualizar={actualizarVistoBueno}
                      onSubirDocumento={subirDocumentoVistoBueno}
                      onDescargarDocumento={descargarDocumentoVistoBueno}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* SEGUIMIENTO — actividades esperadas del proceso, en lenguaje de negocio. */}
        <TabsContent value="seguimiento" className="space-y-4">
          <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 bg-slate-50/80">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Seguimiento
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Actividades esperadas del proceso — quién debe hacer qué, y para cuándo.
                </p>
              </div>
              {puedeGestionarTransito && (
                <Button
                  size="xs"
                  onClick={() => setModalActividadOpen(true)}
                  className="h-7 text-[11px]"
                >
                  <Plus className="h-3 w-3 mr-1" /> Agregar actividad
                </Button>
              )}
            </div>
            <div className="p-4">
              {orden.actividades.length === 0 ? (
                <EstadoVacioPestana
                  titulo="Sin actividades"
                  descripcion="Todavía no hay actividades esperadas registradas para esta importación."
                  accion={
                    puedeGestionarTransito && (
                      <Button
                        size="xs"
                        onClick={() => setModalActividadOpen(true)}
                        className="h-7 text-[11px]"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Agregar actividad
                      </Button>
                    )
                  }
                />
              ) : (
                <div className="space-y-2">
                  {orden.actividades.map((a) => {
                    const vencida =
                      a.fechaLimite &&
                      new Date(a.fechaLimite).getTime() < Date.now() &&
                      (a.estado === "Pendiente" || a.estado === "EnCurso");
                    return (
                      <div
                        key={a.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                          a.estado === "Completada"
                            ? "border-slate-200 bg-slate-50"
                            : vencida
                              ? "border-amber-300 bg-amber-50"
                              : "border-slate-200"
                        }`}
                      >
                        <div className="min-w-0">
                          <p
                            className={`font-bold ${a.estado === "Completada" ? "text-slate-500 line-through" : "text-slate-800"}`}
                          >
                            {a.nombre}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {a.etapa} · {ETIQUETA_RESPONSABLE_TIPO[a.responsableTipo]}
                            {a.responsableNombre ? ` (${a.responsableNombre})` : ""}
                            {a.fechaLimite && (
                              <> · límite {new Date(a.fechaLimite).toLocaleDateString("es-CO")}</>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <EstadoBadge estado={vencida ? "Vencida" : a.estado} />
                          {puedeGestionarTransito && a.estado !== "Completada" && (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={accionEnCurso === a.id}
                              onClick={() => handleCompletarActividad(a.id)}
                              className="h-7 text-[11px]"
                            >
                              Marcar completada
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* NOVEDADES — reales, no comentarios; automáticas + manuales. */}
        <TabsContent value="novedades" className="space-y-4">
          <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 bg-slate-50/80">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Novedades
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Retrasos, documentos faltantes, bloqueos y otros problemas — automáticos o
                  registrados a mano.
                </p>
              </div>
              {puedeGestionarTransito && (
                <Button
                  size="xs"
                  onClick={() => setModalNovedadOpen(true)}
                  className="h-7 text-[11px]"
                >
                  <Plus className="h-3 w-3 mr-1" /> Registrar novedad
                </Button>
              )}
            </div>
            <div className="p-4">
              {orden.novedades.length === 0 ? (
                <EstadoVacioPestana
                  titulo="Sin novedades"
                  descripcion="No se han detectado ni registrado novedades para esta importación."
                  accion={
                    puedeGestionarTransito && (
                      <Button
                        size="xs"
                        onClick={() => setModalNovedadOpen(true)}
                        className="h-7 text-[11px]"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Registrar novedad
                      </Button>
                    )
                  }
                />
              ) : (
                <div className="space-y-2">
                  {orden.novedades.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        n.estado === "Resuelta"
                          ? "border-slate-200 bg-slate-50"
                          : n.prioridad === "Alta"
                            ? "border-red-300 bg-red-50"
                            : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold text-slate-800">
                          {etiquetaTipoNovedad(n.tipo)}
                          {n.automatica && (
                            <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              Automática
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <EstadoBadge estado={n.estado} />
                          {puedeGestionarTransito && !n.automatica && n.estado !== "Resuelta" && (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={accionEnCurso === n.id}
                              onClick={() => handleResolverNovedad(n.id)}
                              className="h-7 text-[11px]"
                            >
                              Resolver
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-slate-600">{n.descripcion}</p>
                      {n.automatica && n.estado !== "Resuelta" && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Se resuelve sola cuando la condición deja de cumplirse.
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-slate-500">
                        Origen: {n.origen === "PorDeterminar" ? "Por determinar" : n.origen}
                        {n.responsable ? ` · ${n.responsable}` : ""} · Prioridad {n.prioridad}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* PAGOS / obligaciones. */}
        <TabsContent value="pagos" className="space-y-4">
          <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 bg-slate-50/80">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Pagos</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Anticipos, saldos, impuestos y demás obligaciones asociadas a esta importación.
                </p>
              </div>
              {puedeLiquidar && (
                <Button
                  size="xs"
                  onClick={() => setModalPagoOpen(true)}
                  className="h-7 text-[11px]"
                >
                  <Plus className="h-3 w-3 mr-1" /> Registrar pago
                </Button>
              )}
            </div>
            <div className="p-4">
              {orden.pagos.length === 0 ? (
                <EstadoVacioPestana
                  titulo="Sin pagos"
                  descripcion="No se han registrado pagos u obligaciones para esta importación."
                  accion={
                    puedeLiquidar && (
                      <Button
                        size="xs"
                        onClick={() => setModalPagoOpen(true)}
                        className="h-7 text-[11px]"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Registrar pago
                      </Button>
                    )
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/80">
                      <TableRow className="hover:bg-slate-100/80">
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Concepto
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Valor
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Vencimiento
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Estado
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Acción
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orden.pagos.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs font-semibold text-slate-800">
                            {p.concepto}
                          </TableCell>
                          <TableCell className="num text-right text-xs text-slate-700">
                            {money(p.valor, p.moneda)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {p.fechaVencimiento
                              ? new Date(p.fechaVencimiento).toLocaleDateString("es-CO")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <EstadoBadge estado={p.estado} />
                          </TableCell>
                          <TableCell className="text-right">
                            {puedeLiquidar && p.estado === "Pendiente" && (
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={accionEnCurso === p.id}
                                onClick={() => handleMarcarPagado(p.id)}
                                className="h-7 text-[11px]"
                              >
                                Marcar pagado
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* AUDITORÍA — visualmente secundaria (compacta, texto pequeño). */}
        <TabsContent value="auditoria" className="space-y-4">
          <div className="panel bg-white border-slate-200 rounded-lg p-5 shadow-2xs">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-4">
              Trazabilidad y Auditoría
            </h2>
            {orden.historial.length === 0 ? (
              <EstadoVacioPestana
                titulo="Sin eventos"
                descripcion="Todavía no hay eventos de auditoría registrados para esta importación."
              />
            ) : (
              <ol className="space-y-4">
                {orden.historial.map((h, i) => (
                  <li key={i} className="relative pl-6">
                    <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-slate-400" />
                    {i < orden.historial.length - 1 && (
                      <span className="absolute left-[3.5px] top-4 h-[calc(100%+0.5rem)] w-px bg-slate-200" />
                    )}
                    <p className="text-[11px] font-semibold text-slate-700">
                      {h.accion}
                      {h.etapa && (
                        <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                          {h.etapa}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(h.fecha).toLocaleString("es-CO")} · {h.responsable ?? h.actor}
                      {h.origen === "Manual" && h.responsable ? ` (registrado por ${h.actor})` : ""}
                    </p>
                    {h.detalle && (
                      <p className="mt-1 text-[11px] text-slate-500 italic">{h.detalle}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* MODAL REGISTRAR LOTE */}
      <Dialog
        open={modalLoteOpen}
        onOpenChange={(open) => {
          setModalLoteOpen(open);
          if (!open) setLoteForm({ ...loteVacio });
        }}
      >
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Registrar Lote de Embarque
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Trazabilidad desde puerto de origen (BL/AWB, contenedor).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAgregarLote} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">BL / AWB *</Label>
              <Input
                required
                value={loteForm.blAwb}
                onChange={(e) => setLoteForm({ ...loteForm, blAwb: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Contenedor</Label>
                <Input
                  value={loteForm.contenedor}
                  onChange={(e) => setLoteForm({ ...loteForm, contenedor: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Precinto</Label>
                <Input
                  value={loteForm.precinto}
                  onChange={(e) => setLoteForm({ ...loteForm, precinto: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Puerto de Origen *</Label>
                <Input
                  required
                  value={loteForm.puertoOrigen}
                  onChange={(e) => setLoteForm({ ...loteForm, puertoOrigen: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Puerto de Destino *</Label>
                <Input
                  required
                  value={loteForm.puertoDestino}
                  onChange={(e) => setLoteForm({ ...loteForm, puertoDestino: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Naviera</Label>
              <Input
                value={loteForm.naviera}
                onChange={(e) => setLoteForm({ ...loteForm, naviera: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalLoteOpen(false)}
                disabled={guardandoLote}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={guardandoLote}>
                {guardandoLote ? "Guardando..." : "Registrar Lote"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL LIQUIDAR COSTEO */}
      <Dialog open={!!loteLiquidando} onOpenChange={(open) => !open && setLoteLiquidando(null)}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Liquidar Costeo de Importación
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Landed cost definitivo (NIC 2), prorrateado por ítem según su participación en el
              valor FOB. Lote {loteLiquidando?.blAwb}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLiquidar} className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">TRM de Liquidación *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={liquidacionForm.trmLiquidacion}
                  onChange={(e) =>
                    setLiquidacionForm({
                      ...liquidacionForm,
                      trmLiquidacion: Number(e.target.value),
                    })
                  }
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Valor CIF Total (USD) *
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={liquidacionForm.valorCifTotalUsd}
                  onChange={(e) =>
                    setLiquidacionForm({
                      ...liquidacionForm,
                      valorCifTotalUsd: Number(e.target.value),
                    })
                  }
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Arancel Total (COP) *
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={liquidacionForm.arancelTotalCop}
                  onChange={(e) =>
                    setLiquidacionForm({
                      ...liquidacionForm,
                      arancelTotalCop: Number(e.target.value),
                    })
                  }
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">IVA Total (COP) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={liquidacionForm.ivaTotalCop}
                  onChange={(e) =>
                    setLiquidacionForm({ ...liquidacionForm, ivaTotalCop: Number(e.target.value) })
                  }
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">IVA Descontable (COP)</Label>
              <Input
                type="number"
                step="0.01"
                value={liquidacionForm.ivaDescontableCop}
                onChange={(e) =>
                  setLiquidacionForm({
                    ...liquidacionForm,
                    ivaDescontableCop: Number(e.target.value),
                  })
                }
                className="h-9 text-xs border-slate-300"
              />
              <p className="text-[10px] text-slate-500">
                La diferencia (IVA total − descontable) se capitaliza como costo bajo NIC 2.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Fletes Nacionales</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={liquidacionForm.fletesNacionalesCop}
                  onChange={(e) =>
                    setLiquidacionForm({
                      ...liquidacionForm,
                      fletesNacionalesCop: Number(e.target.value),
                    })
                  }
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Agenciamiento</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={liquidacionForm.agenciamientoCop}
                  onChange={(e) =>
                    setLiquidacionForm({
                      ...liquidacionForm,
                      agenciamientoCop: Number(e.target.value),
                    })
                  }
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Otros Costos</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={liquidacionForm.otrosCostosCop}
                  onChange={(e) =>
                    setLiquidacionForm({
                      ...liquidacionForm,
                      otrosCostosCop: Number(e.target.value),
                    })
                  }
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Prorrateo de fletes, agenciamiento y otros costos
              </Label>
              <Select
                value={liquidacionForm.metodoProrrateoGastos ?? "FOB"}
                onValueChange={(valor) =>
                  setLiquidacionForm({
                    ...liquidacionForm,
                    metodoProrrateoGastos: valor as MetodoProrrateoGastos,
                  })
                }
              >
                <SelectTrigger className="h-9 text-xs border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METODOS_PRORRATEO_GASTOS.map((m) => (
                    <SelectItem key={m.metodo} value={m.metodo}>
                      {m.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-500">
                {
                  METODOS_PRORRATEO_GASTOS.find(
                    (m) => m.metodo === (liquidacionForm.metodoProrrateoGastos ?? "FOB"),
                  )?.ayuda
                }{" "}
                El valor CIF, el arancel y el IVA siempre se reparten por FOB. Si falta el dato, la
                liquidación se rechaza: no se reparte con otro método.
              </p>
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLoteLiquidando(null)}
                disabled={liquidando}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={liquidando}>
                {liquidando ? "Liquidando..." : "Liquidar Costeo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL AGREGAR ACTIVIDAD */}
      <Dialog
        open={modalActividadOpen}
        onOpenChange={(open) => {
          setModalActividadOpen(open);
          if (!open) setActividadForm({ ...actividadVacia });
        }}
      >
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Agregar actividad esperada
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Complementa la plantilla automática para un caso puntual de esta importación.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAgregarActividad} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Nombre *</Label>
              <Input
                required
                value={actividadForm.nombre}
                onChange={(e) => setActividadForm({ ...actividadForm, nombre: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Etapa</Label>
                <Select
                  value={actividadForm.etapa}
                  onValueChange={(v) =>
                    setActividadForm({ ...actividadForm, etapa: v as EtapaImportacion })
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {ETAPAS_IMPORTACION.map((et) => (
                      <SelectItem key={et} value={et} className="text-xs">
                        {et}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Responsable</Label>
                <Select
                  value={actividadForm.responsableTipo}
                  onValueChange={(v) =>
                    setActividadForm({ ...actividadForm, responsableTipo: v as ResponsableTipo })
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {RESPONSABLE_TIPOS.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {ETIQUETA_RESPONSABLE_TIPO[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Nombre del responsable (opcional)
              </Label>
              <Input
                value={actividadForm.responsableNombre ?? ""}
                onChange={(e) =>
                  setActividadForm({ ...actividadForm, responsableNombre: e.target.value })
                }
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Fecha límite</Label>
              <Input
                type="date"
                value={actividadForm.fechaLimite ?? ""}
                onChange={(e) =>
                  setActividadForm({ ...actividadForm, fechaLimite: e.target.value })
                }
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalActividadOpen(false)}
                disabled={guardandoActividad}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={guardandoActividad}>
                {guardandoActividad ? "Guardando..." : "Agregar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL REGISTRAR NOVEDAD */}
      <Dialog
        open={modalNovedadOpen}
        onOpenChange={(open) => {
          setModalNovedadOpen(open);
          if (!open) setNovedadForm({ ...novedadVacia });
        }}
      >
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Registrar novedad</DialogTitle>
            <DialogDescription className="text-slate-500">
              Un problema real del proceso — daño, faltante, inconsistencia, bloqueo, etc.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAgregarNovedad} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Tipo</Label>
              <Select
                value={novedadForm.tipo}
                disabled={cargandoMotivosNovedad}
                onValueChange={(v) => setNovedadForm({ ...novedadForm, tipo: v as TipoNovedad })}
              >
                <SelectTrigger className="h-9 text-xs border-slate-300">
                  <SelectValue placeholder={cargandoMotivosNovedad ? "Cargando..." : undefined} />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {motivosNovedad.map((m) => (
                    <SelectItem key={m.id} value={m.clave} className="text-xs">
                      {m.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorMotivosNovedad && (
                <p className="text-[11px] text-red-600">
                  No se pudieron cargar los motivos de novedad.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Descripción *</Label>
              <Textarea
                required
                value={novedadForm.descripcion}
                onChange={(e) => setNovedadForm({ ...novedadForm, descripcion: e.target.value })}
                rows={3}
                className="text-xs border-slate-300"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Prioridad</Label>
              <Select
                value={novedadForm.prioridad ?? "Media"}
                onValueChange={(v) =>
                  setNovedadForm({ ...novedadForm, prioridad: v as "Alta" | "Media" | "Baja" })
                }
              >
                <SelectTrigger className="h-9 text-xs border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="Alta" className="text-xs">
                    Alta
                  </SelectItem>
                  <SelectItem value="Media" className="text-xs">
                    Media
                  </SelectItem>
                  <SelectItem value="Baja" className="text-xs">
                    Baja
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalNovedadOpen(false)}
                disabled={guardandoNovedad}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={guardandoNovedad}>
                {guardandoNovedad ? "Guardando..." : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL REGISTRAR PAGO */}
      <Dialog
        open={modalPagoOpen}
        onOpenChange={(open) => {
          setModalPagoOpen(open);
          if (!open) setPagoForm({ ...pagoVacio });
        }}
      >
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Registrar pago / obligación
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Anticipo, saldo, flete, agencia, impuestos u otra obligación de esta importación.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAgregarPago} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Concepto *</Label>
              <Input
                required
                value={pagoForm.concepto}
                onChange={(e) => setPagoForm({ ...pagoForm, concepto: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Valor *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={pagoForm.valor}
                  onChange={(e) => setPagoForm({ ...pagoForm, valor: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Moneda</Label>
                <Input
                  value={pagoForm.moneda ?? "COP"}
                  onChange={(e) => setPagoForm({ ...pagoForm, moneda: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Fecha de vencimiento</Label>
              <Input
                type="date"
                value={pagoForm.fechaVencimiento ?? ""}
                onChange={(e) => setPagoForm({ ...pagoForm, fechaVencimiento: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalPagoOpen(false)}
                disabled={guardandoPago}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={guardandoPago}>
                {guardandoPago ? "Guardando..." : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL CERRAR IMPORTACIÓN */}
      <Dialog
        open={modalCerrarOpen}
        onOpenChange={(open) => {
          setModalCerrarOpen(open);
          if (!open) {
            setJustificacionCierre("");
            setErrorCierre(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Cerrar importación</DialogTitle>
            <DialogDescription className="text-slate-500">
              El sistema verifica: todos los lotes nacionalizados, costeo definitivo en todos los
              ítems, y sin novedades de prioridad alta abiertas.
            </DialogDescription>
          </DialogHeader>
          {errorCierre && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              {errorCierre}
              <p className="mt-2 font-semibold">
                Si de todos modos necesitas cerrarla, escribe una justificación abajo y usa "Forzar
                cierre".
              </p>
            </div>
          )}
          <div className="space-y-1 py-2">
            <Label className="text-xs font-semibold text-slate-700">
              Justificación (solo si forzás el cierre)
            </Label>
            <Textarea
              value={justificacionCierre}
              onChange={(e) => setJustificacionCierre(e.target.value)}
              rows={3}
              className="text-xs border-slate-300"
            />
          </div>
          <DialogFooter className="mt-2 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalCerrarOpen(false)}
              disabled={cerrando}
            >
              Cancelar
            </Button>
            {errorCierre && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => handleCerrar(true)}
                disabled={cerrando || !justificacionCierre.trim()}
              >
                {cerrando ? "Cerrando..." : "Forzar cierre"}
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => handleCerrar(false)} disabled={cerrando}>
              {cerrando ? "Verificando..." : "Cerrar importación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

interface DocumentosInicialesPanelProps {
  ordenId: string;
  documentos: {
    id: string;
    tipo: string;
    nombreOriginal: string;
    mime: string;
    tamano: number;
    subidoPorNombre: string | null;
    createdAt: string;
  }[];
  canManage: boolean;
  onSubir: (ordenId: string, tipo: TipoDocumentoOrdenIntl, file: File) => Promise<void>;
  onEliminar: (ordenId: string, documentoId: string) => Promise<void>;
  onDescargar: (ordenId: string, documentoId: string) => Promise<Blob>;
}

function DocumentosInicialesPanel({
  ordenId,
  documentos,
  canManage,
  onSubir,
  onEliminar,
  onDescargar,
}: DocumentosInicialesPanelProps) {
  const [subiendoTipo, setSubiendoTipo] = useState<TipoDocumentoOrdenIntl | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleSeleccion = async (tipo: TipoDocumentoOrdenIntl, file: File) => {
    setSubiendoTipo(tipo);
    try {
      await onSubir(ordenId, tipo, file);
      toast.success("Documento adjuntado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al subir el documento.");
    } finally {
      setSubiendoTipo(null);
    }
  };

  const handleVer = async (documentoId: string) => {
    try {
      const blob = await onDescargar(ordenId, documentoId);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible abrir el documento.");
    }
  };

  const handleEliminar = async (documentoId: string, nombre: string) => {
    if (!confirm(`¿Eliminar el documento "${nombre}"?`)) return;
    try {
      await onEliminar(ordenId, documentoId);
      toast.success("Documento eliminado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar el documento.");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {TIPOS_DOCUMENTO_ORDEN_INTL.map(({ tipo, etiqueta }) => {
        const documentosDeEsteTipo = documentos.filter((d) => d.tipo === etiqueta);
        return (
          <div key={tipo} className="rounded-md border border-slate-200 p-2.5">
            <p className="text-[10px] uppercase font-bold text-slate-500">{etiqueta}</p>
            <input
              ref={(el) => {
                fileInputRefs.current[tipo] = el;
              }}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleSeleccion(tipo, file);
                e.target.value = "";
              }}
            />
            {documentosDeEsteTipo.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-slate-400">Sin documentos.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {documentosDeEsteTipo.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      className="truncate text-left text-[11px] text-blue-700 hover:underline"
                      onClick={() => handleVer(d.id)}
                      title={d.nombreOriginal}
                    >
                      {d.nombreOriginal}
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        className="shrink-0 text-slate-400 hover:text-red-600"
                        onClick={() => handleEliminar(d.id, d.nombreOriginal)}
                        title="Eliminar"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="mt-1.5 h-7 w-full text-[11px]"
                disabled={subiendoTipo === tipo}
                onClick={() => fileInputRefs.current[tipo]?.click()}
              >
                <Upload className="h-3 w-3 mr-1" />
                {subiendoTipo === tipo ? "Subiendo..." : "Adjuntar"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface DocumentosLotePanelProps {
  lote: LoteImportacion;
  canManage: boolean;
  onSubir: (loteId: string, tipo: TipoDocumentoLote, file: File) => Promise<void>;
  onEliminar: (loteId: string, documentoId: string) => Promise<void>;
  onDescargar: (loteId: string, documentoId: string) => Promise<Blob>;
}

/** B/L o AWB, certificado de análisis (COA) y otros documentos del lote. Solo
 * almacena archivos: la obligatoriedad de cada uno no está definida. */
function DocumentosLotePanel({
  lote,
  canManage,
  onSubir,
  onEliminar,
  onDescargar,
}: DocumentosLotePanelProps) {
  const [subiendoTipo, setSubiendoTipo] = useState<TipoDocumentoLote | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const documentos: DocumentoLote[] = lote.documentos ?? [];

  const handleSeleccion = async (tipo: TipoDocumentoLote, file: File) => {
    setSubiendoTipo(tipo);
    try {
      await onSubir(lote.id, tipo, file);
      toast.success("Documento adjuntado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al subir el documento.");
    } finally {
      setSubiendoTipo(null);
    }
  };

  const handleVer = async (documentoId: string) => {
    try {
      const blob = await onDescargar(lote.id, documentoId);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible abrir el documento.");
    }
  };

  const handleEliminar = async (documentoId: string, nombre: string) => {
    if (!confirm(`¿Eliminar el documento "${nombre}"?`)) return;
    try {
      await onEliminar(lote.id, documentoId);
      toast.success("Documento eliminado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar el documento.");
    }
  };

  return (
    <div className="rounded-md border border-slate-200 p-3 space-y-2">
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Documentos del lote
        </h4>
        <p className="text-[10px] text-slate-500">
          La factura comercial, la DIM y el certificado de origen se adjuntan en el expediente
          aduanero. Aquí no se valida obligatoriedad.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TIPOS_DOCUMENTO_LOTE.map(({ tipo, etiqueta }) => {
          const deEsteTipo = documentos.filter((d) => d.tipo === etiqueta);
          return (
            <div key={tipo} className="rounded-md border border-slate-200 p-2.5">
              <p className="text-[10px] uppercase font-bold text-slate-500">{etiqueta}</p>
              <input
                ref={(el) => {
                  fileInputRefs.current[tipo] = el;
                }}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleSeleccion(tipo, file);
                  e.target.value = "";
                }}
              />
              {deEsteTipo.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-slate-400">Sin documentos.</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {deEsteTipo.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        className="truncate text-left text-[11px] text-blue-700 hover:underline"
                        onClick={() => handleVer(d.id)}
                        title={d.nombreOriginal}
                      >
                        {d.nombreOriginal}
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          className="shrink-0 text-slate-400 hover:text-red-600"
                          onClick={() => handleEliminar(d.id, d.nombreOriginal)}
                          title="Eliminar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canManage && (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="mt-1.5 h-7 w-full text-[11px]"
                  disabled={subiendoTipo === tipo}
                  onClick={() => fileInputRefs.current[tipo]?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {subiendoTipo === tipo ? "Subiendo..." : "Adjuntar"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DocumentoExpedienteSlotProps {
  loteId: string;
  tipo: TipoDocumentoExpediente;
  etiqueta: string;
  archivo: { nombre: string; mime: string | null; tamano: number | null } | null;
  canManage: boolean;
  onSubir: (loteId: string, tipo: TipoDocumentoExpediente, file: File) => Promise<void>;
  onEliminar: (loteId: string, tipo: TipoDocumentoExpediente) => Promise<void>;
  onDescargar: (loteId: string, tipo: TipoDocumentoExpediente) => Promise<Blob>;
}

function DocumentoExpedienteSlot({
  loteId,
  tipo,
  etiqueta,
  archivo,
  canManage,
  onSubir,
  onEliminar,
  onDescargar,
}: DocumentoExpedienteSlotProps) {
  const [subiendo, setSubiendo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSeleccion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      await onSubir(loteId, tipo, file);
      toast.success(`${etiqueta} adjuntado.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Error al subir ${etiqueta}.`);
    } finally {
      setSubiendo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleVer = async () => {
    try {
      const blob = await onDescargar(loteId, tipo);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible abrir el documento.");
    }
  };

  const handleEliminar = async () => {
    if (!confirm(`¿Eliminar el documento "${etiqueta}"?`)) return;
    try {
      await onEliminar(loteId, tipo);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar el documento.");
    }
  };

  return (
    <div className="rounded-md border border-slate-200 p-2.5">
      <p className="text-[10px] uppercase font-bold text-slate-500">{etiqueta}</p>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleSeleccion}
      />
      {archivo ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-slate-700">{archivo.nombre}</p>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={handleVer}
            >
              Ver
            </Button>
            {canManage && (
              <>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  disabled={subiendo}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {subiendo ? "..." : "Reemplazar"}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  className="h-6 px-2 text-[10px]"
                  onClick={handleEliminar}
                >
                  Eliminar
                </Button>
              </>
            )}
          </div>
        </div>
      ) : canManage ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="mt-1.5 h-7 w-full text-[11px]"
          disabled={subiendo}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3 w-3 mr-1" /> {subiendo ? "Subiendo..." : "Adjuntar"}
        </Button>
      ) : (
        <p className="mt-1.5 text-[11px] text-slate-400">Sin adjuntar</p>
      )}
    </div>
  );
}

// Mismo catálogo EXACTO que EVENTOS_CONTENEDOR_VALIDOS en
// maritime-tracking-provider.ts — se usa también como la línea de tiempo
// operacional del embarque (§6/§7 de la especificación): el evento más
// avanzado entre todos los contenedores del lote define "dónde va" el
// embarque. Sin datos de contenedores todavía, el timeline simplemente no
// tiene nada que marcar como completado — nunca se inventa un estado.
const EVENTOS_CONTENEDOR_ORDEN: EventoContenedorTipo[] = [
  "BOOKED",
  "GATE_IN",
  "LOADED",
  "DEPARTED",
  "TRANSSHIPMENT",
  "ARRIVED_PORT",
  "DISCHARGED",
  "DELIVERED",
];
const ETIQUETA_EVENTO_CONTENEDOR: Record<EventoContenedorTipo, string> = {
  BOOKED: "Booking confirmado",
  GATE_IN: "Contenedor en puerto de origen",
  LOADED: "Carga realizada",
  DEPARTED: "Buque zarpó",
  TRANSSHIPMENT: "Transbordo",
  ARRIVED_PORT: "Arribo a puerto",
  DISCHARGED: "Descarga",
  DELIVERED: "Entrega",
};

interface EmbarqueTrackingPanelProps {
  lote: LoteImportacion;
  canManage: boolean;
  onEditar: (loteId: string, data: ActualizarEmbarqueInput) => Promise<void>;
  onAgregarContenedor: (loteId: string, numero: string) => Promise<void>;
  onEliminarContenedor: (loteId: string, contenedorId: string) => Promise<void>;
  onSincronizar: (loteId: string) => Promise<void>;
}

function EmbarqueTrackingPanel({
  lote,
  canManage,
  onEditar,
  onAgregarContenedor,
  onEliminarContenedor,
  onSincronizar,
}: EmbarqueTrackingPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    booking: lote.booking ?? "",
    forwarder: lote.forwarder ?? "",
    buqueNombre: lote.buque?.nombre ?? "",
    buqueImo: lote.buque?.imo ?? "",
    buqueMmsi: lote.buque?.mmsi ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [nuevoContenedor, setNuevoContenedor] = useState("");
  const [agregandoContenedor, setAgregandoContenedor] = useState(false);

  const abrirEditar = () => {
    setForm({
      booking: lote.booking ?? "",
      forwarder: lote.forwarder ?? "",
      buqueNombre: lote.buque?.nombre ?? "",
      buqueImo: lote.buque?.imo ?? "",
      buqueMmsi: lote.buque?.mmsi ?? "",
    });
    setModalOpen(true);
  };

  const handleGuardar = async () => {
    setGuardando(true);
    try {
      await onEditar(lote.id, form);
      toast.success("Datos de embarque actualizados.");
      setModalOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el embarque.");
    } finally {
      setGuardando(false);
    }
  };

  const handleSincronizar = async () => {
    setSincronizando(true);
    try {
      await onSincronizar(lote.id);
      toast.success("Tracking sincronizado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al sincronizar el tracking.");
    } finally {
      setSincronizando(false);
    }
  };

  const handleAgregarContenedor = async () => {
    if (!nuevoContenedor.trim()) return;
    setAgregandoContenedor(true);
    try {
      await onAgregarContenedor(lote.id, nuevoContenedor.trim());
      setNuevoContenedor("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al agregar el contenedor.");
    } finally {
      setAgregandoContenedor(false);
    }
  };

  const tieneAlgoDeEmbarque =
    lote.booking ||
    lote.buque ||
    lote.contenedores.length > 0 ||
    lote.tracking.estado !== "PENDIENTE";
  if (!tieneAlgoDeEmbarque && !canManage) return null;

  // Etapa más avanzada entre todos los contenedores — ver comentario en
  // EVENTOS_CONTENEDOR_ORDEN. -1 = ningún contenedor con eventos todavía.
  const indiceActual = lote.contenedores.reduce((max, c) => {
    const idx = c.ultimoEvento ? EVENTOS_CONTENEDOR_ORDEN.indexOf(c.ultimoEvento) : -1;
    return Math.max(max, idx);
  }, -1);

  return (
    <div className="rounded-md border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
          <Anchor className="h-3.5 w-3.5" /> Embarque
        </h4>
        <div className="flex items-center gap-1.5">
          {canManage && (lote.buque?.imo || lote.buque?.mmsi) && (
            <Button
              size="xs"
              variant="outline"
              disabled={sincronizando}
              onClick={handleSincronizar}
              className="h-7 text-[11px] font-bold gap-1"
            >
              <RefreshCw className={cn("h-3 w-3", sincronizando && "animate-spin")} />
              {sincronizando ? "Sincronizando..." : "Sincronizar ahora"}
            </Button>
          )}
          {canManage && (
            <Button size="xs" variant="outline" onClick={abrirEditar} className="h-7 text-[11px]">
              Editar
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-500">Buque</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-800">
            {lote.buque?.nombre || "Sin configurar"}
          </p>
          {(lote.buque?.imo || lote.buque?.mmsi) && (
            <p className="text-[10px] text-slate-500">
              {lote.buque?.imo && `IMO ${lote.buque.imo}`}
              {lote.buque?.imo && lote.buque?.mmsi && " · "}
              {lote.buque?.mmsi && `MMSI ${lote.buque.mmsi}`}
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-500">Booking / Forwarder</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-800">{lote.booking || "—"}</p>
          {lote.forwarder && <p className="text-[10px] text-slate-500">{lote.forwarder}</p>}
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-500">
            ETA proveedor / ETA actual
          </p>
          <p className="mt-0.5 text-xs font-semibold text-slate-800">
            {lote.fechaLlegadaEstimada
              ? new Date(lote.fechaLlegadaEstimada).toLocaleDateString("es-CO")
              : "—"}
            {lote.tracking.etaActual &&
              ` → ${new Date(lote.tracking.etaActual).toLocaleDateString("es-CO")}`}
          </p>
          {lote.tracking.variacionEtaDias != null && lote.tracking.variacionEtaDias !== 0 && (
            <p
              className={cn(
                "flex items-center gap-1 text-[10px] font-semibold",
                lote.tracking.variacionEtaDias > 0 ? "text-amber-700" : "text-blue-700",
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              {lote.tracking.variacionEtaDias > 0
                ? `Retraso estimado: ${lote.tracking.variacionEtaDias} día(s)`
                : `Adelanto estimado: ${Math.abs(lote.tracking.variacionEtaDias)} día(s)`}
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-500">Tracking</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-800">
            {
              {
                PENDIENTE: "Sin sincronizar",
                ACTIVO: "Activo",
                SIN_DATOS: "Sin datos del proveedor",
                ERROR: "Error en la última sincronización",
              }[lote.tracking.estado]
            }
          </p>
          {lote.tracking.posicion && (
            <p className="flex items-center gap-1 text-[10px] text-slate-500">
              <MapPin className="h-3 w-3 shrink-0" />
              {lote.tracking.posicion.velocidadNudos?.toFixed(1)} kn
              {lote.tracking.posicion.fecha &&
                ` · ${new Date(lote.tracking.posicion.fecha).toLocaleString("es-CO")}`}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Contenedores</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {lote.contenedores.map((c: ContenedorLote) => (
            <Badge
              key={c.id}
              variant="outline"
              className="border-slate-300 bg-slate-50 text-slate-700 gap-1 pr-1 text-[10px]"
            >
              {c.numero}
              {c.ultimoEvento && (
                <span className="text-slate-400">
                  · {ETIQUETA_EVENTO_CONTENEDOR[c.ultimoEvento]}
                </span>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => onEliminarContenedor(lote.id, c.id)}
                  aria-label={`Quitar contenedor ${c.numero}`}
                  className="rounded-full p-0.5 hover:bg-slate-200 text-slate-500 hover:text-slate-900"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </Badge>
          ))}
          {lote.contenedores.length === 0 && (
            <p className="text-[11px] text-slate-500">Sin contenedores registrados.</p>
          )}
        </div>
        {canManage && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Input
              value={nuevoContenedor}
              onChange={(e) => setNuevoContenedor(e.target.value)}
              placeholder='Ej: "MSCU1234567"'
              disabled={agregandoContenedor}
              className="h-8 max-w-[180px] text-[11px] border-slate-300"
            />
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={handleAgregarContenedor}
              disabled={agregandoContenedor || !nuevoContenedor.trim()}
              className="h-8 text-[11px] font-bold gap-1"
            >
              <Plus className="h-3 w-3" /> Agregar
            </Button>
          </div>
        )}
      </div>

      {indiceActual >= 0 && (
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">
            Línea de tiempo del embarque
          </p>
          <ul className="space-y-0.5">
            {EVENTOS_CONTENEDOR_ORDEN.map((evento, idx) => (
              <li
                key={evento}
                className={cn(
                  "flex items-center gap-1.5 text-[11px]",
                  idx < indiceActual
                    ? "text-slate-500"
                    : idx === indiceActual
                      ? "font-bold text-slate-900"
                      : "text-slate-400",
                )}
              >
                <span className="w-3 shrink-0 text-center">
                  {idx < indiceActual ? "✓" : idx === indiceActual ? "●" : "○"}
                </span>
                {ETIQUETA_EVENTO_CONTENEDOR[evento]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Editar datos de embarque</DialogTitle>
            <DialogDescription className="text-slate-500">BL/AWB {lote.blAwb}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Booking</Label>
                <Input
                  value={form.booking}
                  onChange={(e) => setForm({ ...form, booking: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Forwarder</Label>
                <Input
                  value={form.forwarder}
                  onChange={(e) => setForm({ ...form, forwarder: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Nombre del buque</Label>
              <Input
                value={form.buqueNombre}
                onChange={(e) => setForm({ ...form, buqueNombre: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">IMO</Label>
                <Input
                  value={form.buqueImo}
                  onChange={(e) => setForm({ ...form, buqueImo: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">MMSI</Label>
                <Input
                  value={form.buqueMmsi}
                  onChange={(e) => setForm({ ...form, buqueMmsi: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              IMO/MMSI identifican el buque ante el proveedor de tracking marítimo — sin al menos
              uno de los dos, el embarque no puede sincronizarse automáticamente.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleGuardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ExpedienteAduaneroPanelProps {
  lote: LoteImportacion;
  canManage: boolean;
  onActualizar: (loteId: string, data: ActualizarExpedienteInput) => Promise<void>;
  onSubirDocumento: (loteId: string, tipo: TipoDocumentoExpediente, file: File) => Promise<void>;
  onEliminarDocumento: (loteId: string, tipo: TipoDocumentoExpediente) => Promise<void>;
  onDescargarDocumento: (loteId: string, tipo: TipoDocumentoExpediente) => Promise<Blob>;
}

function ExpedienteAduaneroPanel({
  lote,
  canManage,
  onActualizar,
  onSubirDocumento,
  onEliminarDocumento,
  onDescargarDocumento,
}: ExpedienteAduaneroPanelProps) {
  const expediente = lote.expediente;
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<ActualizarExpedienteInput>({
    numeroDIM: expediente?.numeroDIM ?? "",
    fechaDIM: expediente?.fechaDIM ? expediente.fechaDIM.slice(0, 10) : "",
    certificadoOrigenTlc: expediente?.certificadoOrigenTlc ?? "",
    fechaLevante: expediente?.fechaLevante ? expediente.fechaLevante.slice(0, 10) : "",
    estado: expediente?.estado ?? "En trámite",
  });
  const [guardando, setGuardando] = useState(false);

  const handleEditar = () => {
    setForm({
      numeroDIM: expediente?.numeroDIM ?? "",
      fechaDIM: expediente?.fechaDIM ? expediente.fechaDIM.slice(0, 10) : "",
      certificadoOrigenTlc: expediente?.certificadoOrigenTlc ?? "",
      fechaLevante: expediente?.fechaLevante ? expediente.fechaLevante.slice(0, 10) : "",
      estado: expediente?.estado ?? "En trámite",
    });
    setEditando(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await onActualizar(lote.id, form);
      toast.success("Expediente aduanero actualizado.");
      setEditando(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el expediente.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Expediente aduanero
        </h4>
        <div className="flex items-center gap-2">
          {expediente && <EstadoBadge estado={expediente.estado} />}
          {canManage && !editando && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={handleEditar}
            >
              Editar
            </Button>
          )}
        </div>
      </div>

      {editando ? (
        <form onSubmit={handleGuardar} className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-slate-700">Número DIM</Label>
              <Input
                value={form.numeroDIM ?? ""}
                onChange={(e) => setForm({ ...form, numeroDIM: e.target.value })}
                className="h-8 text-[11px] border-slate-300"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-slate-700">Fecha DIM</Label>
              <Input
                type="date"
                value={form.fechaDIM ?? ""}
                onChange={(e) => setForm({ ...form, fechaDIM: e.target.value })}
                className="h-8 text-[11px] border-slate-300"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-slate-700">
                Certificado de origen (TLC)
              </Label>
              <Input
                value={form.certificadoOrigenTlc ?? ""}
                onChange={(e) => setForm({ ...form, certificadoOrigenTlc: e.target.value })}
                className="h-8 text-[11px] border-slate-300"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-slate-700">Fecha de levante</Label>
              <Input
                type="date"
                value={form.fechaLevante ?? ""}
                onChange={(e) => setForm({ ...form, fechaLevante: e.target.value })}
                className="h-8 text-[11px] border-slate-300"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-slate-700">Estado</Label>
            <Select
              value={form.estado ?? "En trámite"}
              onValueChange={(val) => setForm({ ...form, estado: val })}
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="En trámite" className="text-[11px]">
                  En trámite
                </SelectItem>
                <SelectItem value="Levantado" className="text-[11px]">
                  Levantado
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => setEditando(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button type="submit" size="xs" className="h-7 text-[11px]" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div>
            <dt className="text-slate-500">Número DIM</dt>
            <dd className="font-medium text-slate-800">{expediente?.numeroDIM || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Fecha DIM</dt>
            <dd className="font-medium text-slate-800">
              {expediente?.fechaDIM
                ? new Date(expediente.fechaDIM).toLocaleDateString("es-CO")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Certificado origen (TLC)</dt>
            <dd className="font-medium text-slate-800">
              {expediente?.certificadoOrigenTlc || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Fecha de levante</dt>
            <dd className="font-medium text-slate-800">
              {expediente?.fechaLevante
                ? new Date(expediente.fechaLevante).toLocaleDateString("es-CO")
                : "—"}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {TIPOS_DOCUMENTO_EXPEDIENTE.map(({ tipo, etiqueta }) => (
          <DocumentoExpedienteSlot
            key={tipo}
            loteId={lote.id}
            tipo={tipo}
            etiqueta={etiqueta}
            archivo={expediente?.documentos[DOC_KEY[tipo]] ?? null}
            canManage={canManage}
            onSubir={onSubirDocumento}
            onEliminar={onEliminarDocumento}
            onDescargar={onDescargarDocumento}
          />
        ))}
      </div>
    </div>
  );
}

interface VistosBuenosPanelProps {
  lote: LoteImportacion;
  canManage: boolean;
  onCrear: (loteId: string, data: CrearVistoBuenoInput) => Promise<void>;
  onActualizar: (vistoId: string, data: ActualizarVistoBuenoInput) => Promise<void>;
  onSubirDocumento: (vistoId: string, file: File) => Promise<void>;
  onDescargarDocumento: (vistoId: string) => Promise<Blob>;
}

function VistosBuenosPanel({
  lote,
  canManage,
  onCrear,
  onActualizar,
  onSubirDocumento,
  onDescargarDocumento,
}: VistosBuenosPanelProps) {
  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState({ entidad: "", numero: "", fecha: "" });
  const [guardando, setGuardando] = useState(false);
  const [subiendoId, setSubiendoId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.entidad.trim()) return;
    setGuardando(true);
    try {
      await onCrear(lote.id, {
        entidad: form.entidad.trim(),
        numero: form.numero.trim() || undefined,
        fecha: form.fecha || undefined,
      });
      toast.success("Visto bueno registrado.");
      setForm({ entidad: "", numero: "", fecha: "" });
      setFormAbierto(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar el visto bueno.");
    } finally {
      setGuardando(false);
    }
  };

  const handleCambiarEstado = async (vb: VistoBuenoAduanero, estado: string) => {
    try {
      await onActualizar(vb.id, { estado });
      toast.success(`${vb.entidad}: ${estado}.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el visto bueno.");
    }
  };

  const handleSeleccionDocumento = async (vb: VistoBuenoAduanero, file: File) => {
    setSubiendoId(vb.id);
    try {
      await onSubirDocumento(vb.id, file);
      toast.success("Documento adjuntado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al subir el documento.");
    } finally {
      setSubiendoId(null);
    }
  };

  const handleVerDocumento = async (vb: VistoBuenoAduanero) => {
    try {
      const blob = await onDescargarDocumento(vb.id);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible abrir el documento.");
    }
  };

  const vistosBuenos = lote.expediente?.vistosBuenos ?? [];

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Vistos buenos
        </h4>
        {canManage && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            onClick={() => setFormAbierto((v) => !v)}
          >
            <Plus className="h-3 w-3 mr-1" /> Registrar
          </Button>
        )}
      </div>

      {formAbierto && (
        <form onSubmit={handleCrear} className="mt-2 grid grid-cols-3 gap-2">
          <Input
            required
            placeholder="Entidad (INVIMA, ICA...)"
            value={form.entidad}
            onChange={(e) => setForm({ ...form, entidad: e.target.value })}
            className="h-8 text-[11px] border-slate-300"
          />
          <Input
            placeholder="Número"
            value={form.numero}
            onChange={(e) => setForm({ ...form, numero: e.target.value })}
            className="h-8 text-[11px] border-slate-300"
          />
          <div className="flex gap-1">
            <Input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="h-8 text-[11px] border-slate-300"
            />
            <Button
              type="submit"
              size="xs"
              className="h-8 shrink-0 text-[11px]"
              disabled={guardando}
            >
              {guardando ? "..." : "Guardar"}
            </Button>
          </div>
        </form>
      )}

      {vistosBuenos.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">Sin vistos buenos registrados.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {vistosBuenos.map((vb) => (
            <div
              key={vb.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-800">
                  {vb.entidad}
                  {vb.numero ? ` · ${vb.numero}` : ""}
                </p>
                {vb.fecha && (
                  <p className="text-[10px] text-slate-500">
                    {new Date(vb.fecha).toLocaleDateString("es-CO")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {canManage ? (
                  <Select value={vb.estado} onValueChange={(val) => handleCambiarEstado(vb, val)}>
                    <SelectTrigger className="h-6 w-[110px] text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_VISTO_BUENO.map((estado) => (
                        <SelectItem key={estado} value={estado} className="text-[11px]">
                          {estado}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <EstadoBadge estado={vb.estado} />
                )}
                {vb.archivo ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => handleVerDocumento(vb)}
                  >
                    Ver doc.
                  </Button>
                ) : (
                  canManage && (
                    <>
                      <input
                        ref={(el) => {
                          fileInputRefs.current[vb.id] = el;
                        }}
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleSeleccionDocumento(vb, file);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="h-6 px-2 text-[10px]"
                        disabled={subiendoId === vb.id}
                        onClick={() => fileInputRefs.current[vb.id]?.click()}
                      >
                        {subiendoId === vb.id ? "..." : "Adjuntar"}
                      </Button>
                    </>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
