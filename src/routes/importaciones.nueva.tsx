import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Ship,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  useImportaciones,
  obtenerTrmOficial,
  subirDocumentoOrdenCompraIntlStandalone,
  useBuscarItemsSiesa,
  useResponsablesImportacion,
  TIPOS_DOCUMENTO_ORDEN_INTL,
  type ItemOrdenInput,
  type TrmOficial,
  type ItemBusquedaSiesa,
  type TipoDocumentoOrdenIntl,
} from "@/hooks/use-importaciones";
import { useProveedorBusqueda } from "@/hooks/use-proveedores";
import { useCatalogo } from "@/hooks/use-catalogos";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money } from "@/lib/data";
import { requirePermisoGuard } from "@/lib/route-guards";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/importaciones/nueva")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  head: () => ({
    meta: [
      { title: "Nueva Orden de Compra Internacional | RicoSoft" },
      {
        name: "description",
        content: "Registrar una nueva orden de compra internacional.",
      },
    ],
  }),
  component: NuevaOrdenIntlPage,
});

const MONEDAS = ["USD", "EUR", "CNY", "GBP", "JPY"];
/** La unidad que trae Siesa es texto libre del ERP (ej. "Kg", "UN", "Ton") —
 * solo se autocompleta si coincide EXACTO (sin distinguir mayúsculas) con
 * una de nuestras unidades válidas (catálogo UNIDAD_MEDIDA); si no, se deja
 * para elegir a mano en vez de forzar un valor que luego el backend
 * rechazaría (400). */
function mapearUnidadSiesa(unidad: string | null, unidadesValidas: string[]): string | undefined {
  if (!unidad) return undefined;
  return unidadesValidas.find((u) => u.toLowerCase() === unidad.trim().toLowerCase());
}
// Umbral a partir del cual se avisa que la tasa pactada se aleja de la
// oficial del día — no bloquea el guardado, solo informa (la tasa pactada
// es una decisión comercial del proveedor, no un dato que deba coincidir).
const UMBRAL_ALERTA_TRM = 0.02;

/** Ítem de formulario: extiende ItemOrdenInput con un marcador puramente
 * de UI (nunca se envía al backend, el schema del servidor ignora campos
 * desconocidos) para distinguir visualmente si vino de una búsqueda en
 * Siesa o fue capturado a mano. */
type ItemFormulario = ItemOrdenInput & { _origen?: "siesa" | "manual" };

const itemVacio: ItemFormulario = {
  descripcion: "",
  referencia: "",
  referenciaProveedor: "",
  unidadMedida: "KG",
  cantidad: 1,
  pesoKg: undefined,
  valorUnitarioFob: 0,
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Autocompletado de la Descripción de un ítem de la orden, contra el
 * maestro de ítems de Siesa (mismo dato que ya consulta Configuración →
 * Clasificación de Ítems y Ventas → Disponibilidad). A propósito NO es un
 * <Combobox> (select estricto, solo acepta lo que está en la lista): un
 * ítem de una orden internacional puede no existir todavía en Siesa (un
 * producto nuevo comprado por primera vez), así que el usuario SIEMPRE
 * puede seguir escribiendo texto libre — las sugerencias son una ayuda para
 * autocompletar referencia/unidad, nunca una restricción. Si el tenant no
 * tiene Siesa configurado, se comporta exactamente como el <Input> plano de
 * antes (cero regresión).
 */
function ItemDescripcionAutocomplete({
  value,
  onChange,
  onSeleccionar,
  invalid,
}: {
  value: string;
  onChange: (texto: string) => void;
  onSeleccionar: (item: ItemBusquedaSiesa) => void;
  invalid?: boolean;
}) {
  const { opciones, loading, disponible, buscar } = useBuscarItemsSiesa();
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (texto: string) => {
    onChange(texto);
    if (!disponible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < 2) {
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      buscar(texto);
      setOpen(true);
    }, 300);
  };

  return (
    <Popover open={open && disponible} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          required
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (disponible && opciones.length > 0) setOpen(true);
          }}
          placeholder={disponible ? "Escribe para buscar en Siesa..." : undefined}
          className={cn(
            "h-8 text-[11px] border-slate-300",
            invalid && !value && "border-red-400 focus-visible:ring-red-300",
          )}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-anchor-width) p-1 bg-white border-slate-200"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando en Siesa...
          </div>
        ) : opciones.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-slate-500">
            Ningún ítem de Siesa coincide — puedes seguir escribiendo libremente.
          </p>
        ) : (
          <ul className="max-h-56 overflow-y-auto">
            {opciones.map((op) => (
              <li key={op.itemRowId}>
                <button
                  type="button"
                  onClick={() => {
                    onSeleccionar(op);
                    setOpen(false);
                  }}
                  className="w-full rounded-sm px-2 py-1.5 text-left text-[11px] hover:bg-slate-100"
                >
                  <p className="font-semibold text-slate-800 truncate">{op.descripcion || "—"}</p>
                  <p className="text-slate-500 truncate">
                    {[op.referencia, op.unidadMedida].filter(Boolean).join(" · ")}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface Verificacion {
  texto: string;
}

function NuevaOrdenIntlPage() {
  const navigate = useNavigate();
  const { addOrden } = useImportaciones();
  const {
    opciones: proveedorOpciones,
    loading: buscandoProveedores,
    buscar: buscarProveedores,
  } = useProveedorBusqueda();
  const { opciones: responsableOpciones, loading: cargandoResponsables } =
    useResponsablesImportacion();
  const {
    data: incoterms,
    isLoading: cargandoIncoterms,
    error: errorIncoterms,
  } = useCatalogo("INCOTERM");
  const {
    data: paises,
    isLoading: cargandoPaises,
    error: errorPaises,
  } = useCatalogo("PAIS_ORIGEN");
  const {
    data: formasPago,
    isLoading: cargandoFormasPago,
    error: errorFormasPago,
  } = useCatalogo("FORMA_PAGO");
  const {
    data: unidadesMedida,
    isLoading: cargandoUnidadesMedida,
    error: errorUnidadesMedida,
  } = useCatalogo("UNIDAD_MEDIDA");

  const [guardando, setGuardando] = useState(false);
  // Documentos iniciales (Cotización/Proforma Invoice/Oferta comercial/
  // Otros): la orden todavía no existe en este punto del formulario, así
  // que los archivos se "quedan en memoria" (File del navegador, nunca se
  // suben todavía) y solo se envían al backend DESPUÉS de que la orden se
  // crea exitosamente (ver handleConfirmarRegistro) — mismo id que necesita
  // el endpoint POST /importaciones/:id/documentos/:tipo.
  const [documentosPendientes, setDocumentosPendientes] = useState<
    { tipo: TipoDocumentoOrdenIntl; file: File }[]
  >([]);
  const documentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Explícito: si no hay proveedor catalogado, se debe marcar a propósito
  // "No catalogado / proveedor externo" para habilitar el nombre libre — no
  // es simplemente "dejar el selector vacío", así se evita el caso de una
  // orden a medio llenar donde no quedó claro si el proveedor es nuevo o
  // simplemente no se buscó todavía.
  const [proveedorNoCatalogado, setProveedorNoCatalogado] = useState(false);
  const [form, setForm] = useState({
    numeroOrden: "",
    fechaOrden: hoyISO(),
    incoterm: "FOB",
    lugarPactado: "",
    proveedorId: "",
    proveedorExtranjero: "",
    proveedorNombreCatalogado: "",
    paisOrigen: "",
    moneda: "USD",
    trmPactada: 4000,
    tasaCambioFecha: hoyISO(),
    tasaCambioFuente: "" as "" | "Oficial" | "Pactada" | "Manual",
    formaPago: "",
    condicionPago: "",
    detallePago: "",
    fechaRequeridaLlegada: "",
    responsableId: "",
    observaciones: "",
  });
  const [items, setItems] = useState<ItemFormulario[]>([{ ...itemVacio }]);
  // Validación visible (borde rojo + mensaje) recién después del primer
  // intento fallido de guardar — no se le marca todo en rojo a alguien que
  // apenas entró a la página.
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [trmOficial, setTrmOficial] = useState<TrmOficial | null>(null);
  const [cargandoTrm, setCargandoTrm] = useState(false);
  const [preflightAbierto, setPreflightAbierto] = useState(false);

  const proveedorCatalogado = !!form.proveedorId && !proveedorNoCatalogado;
  const nombreProveedorEfectivo = proveedorCatalogado
    ? form.proveedorNombreCatalogado
    : form.proveedorExtranjero;

  const fobTotal = items.reduce(
    (acc, it) => acc + Number(it.cantidad || 0) * Number(it.valorUnitarioFob || 0),
    0,
  );
  const pesoTotalKg = items.reduce((acc, it) => acc + Number(it.pesoKg || 0), 0);
  const estimadoCop = fobTotal * Number(form.trmPactada || 0);
  const diferenciaTrm =
    trmOficial && trmOficial.valor > 0
      ? Math.abs(Number(form.trmPactada || 0) - trmOficial.valor) / trmOficial.valor
      : 0;
  const trmDifiereMucho = trmOficial != null && diferenciaTrm > UMBRAL_ALERTA_TRM;

  const handleObtenerTrmOficial = async () => {
    setCargandoTrm(true);
    try {
      const trm = await obtenerTrmOficial();
      setTrmOficial(trm);
      // Guarda tasa + fecha + fuente aplicada de una vez — nunca pisa en
      // silencio una tasa manual: el usuario sigue viendo el valor anterior
      // hasta que decide usar este botón explícitamente.
      setForm((f) => ({
        ...f,
        trmPactada: trm.valor,
        tasaCambioFecha: hoyISO(),
        tasaCambioFuente: "Oficial",
      }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible obtener la TRM oficial.");
    } finally {
      setCargandoTrm(false);
    }
  };

  // --- Panel de preparación: errores (bloquean), advertencias (no
  // bloquean) y recomendaciones (sugerencias). Se recalcula en cada render,
  // es puramente derivado del estado — nunca se persiste.
  const { errores, advertencias, recomendaciones } = useMemo(() => {
    const err: Verificacion[] = [];
    const adv: Verificacion[] = [];
    const rec: Verificacion[] = [];

    if (!form.numeroOrden.trim()) err.push({ texto: "Falta el número de orden." });
    if (!form.fechaOrden) err.push({ texto: "Falta la fecha de la orden." });
    if (!form.proveedorId && !proveedorNoCatalogado) {
      err.push({
        texto: 'Selecciona un proveedor catalogado o marca "No catalogado / proveedor externo".',
      });
    }
    if (proveedorNoCatalogado && !form.proveedorExtranjero.trim()) {
      err.push({ texto: "Falta el nombre del proveedor no catalogado." });
    }
    if (!form.paisOrigen) err.push({ texto: "Falta el país de origen de la mercancía." });
    if (!Number.isFinite(form.trmPactada) || form.trmPactada <= 0) {
      err.push({ texto: "La tasa de cambio pactada debe ser mayor a cero." });
    }
    if (items.length === 0) err.push({ texto: "La orden debe tener al menos un ítem." });
    items.forEach((it, idx) => {
      if (!it.descripcion.trim()) err.push({ texto: `Ítem ${idx + 1}: falta la descripción.` });
      if (!it.unidadMedida) err.push({ texto: `Ítem ${idx + 1}: falta la unidad comercial.` });
      if (!(Number(it.cantidad) > 0))
        err.push({ texto: `Ítem ${idx + 1}: la cantidad debe ser mayor a cero.` });
      if (Number(it.valorUnitarioFob) < 0)
        err.push({ texto: `Ítem ${idx + 1}: el FOB unitario no puede ser negativo.` });
      if (it.pesoKg != null && Number(it.pesoKg) < 0)
        err.push({ texto: `Ítem ${idx + 1}: el peso no puede ser negativo.` });
    });
    if (
      form.fechaRequeridaLlegada &&
      form.fechaOrden &&
      new Date(form.fechaRequeridaLlegada) < new Date(form.fechaOrden)
    ) {
      err.push({
        texto: "La fecha requerida de llegada no puede ser anterior a la fecha de la orden.",
      });
    }

    if (!form.lugarPactado.trim()) {
      adv.push({ texto: "No indicaste el lugar pactado del Incoterm." });
    }
    if (trmDifiereMucho) {
      adv.push({
        texto: `La tasa pactada difiere ${(diferenciaTrm * 100).toFixed(1)}% de la oficial del día.`,
      });
    }
    if (!form.formaPago) adv.push({ texto: "No seleccionaste una forma de pago." });
    if (!form.fechaRequeridaLlegada)
      adv.push({ texto: "No indicaste una fecha requerida de llegada." });
    if (!form.responsableId) adv.push({ texto: "No asignaste un responsable de la importación." });

    if (!form.observaciones.trim())
      rec.push({ texto: "Puedes agregar observaciones para el equipo de logística." });
    if (items.some((it) => !it.referencia?.trim())) {
      rec.push({ texto: "Algunos ítems no tienen referencia interna." });
    }
    if (items.some((it) => !it.referenciaProveedor?.trim())) {
      rec.push({
        texto:
          "Algunos ítems no tienen la referencia del proveedor (útil para la Bandeja Inteligente).",
      });
    }

    return { errores: err, advertencias: adv, recomendaciones: rec };
  }, [form, items, proveedorNoCatalogado, trmDifiereMucho, diferenciaTrm]);

  // Completitud simple: proporción de "chequeos" (obligatorios + deseables)
  // que ya están satisfechos — errores y advertencias cuentan,
  // recomendaciones no (son opcionales por diseño).
  const totalChequeos = errores.length + advertencias.length + 8; // 8 = campos ya satisfechos que no generan aviso
  const completitudPct = Math.max(
    0,
    Math.min(100, Math.round((8 / Math.max(totalChequeos, 8)) * 100)),
  );

  const handleAbrirPreflight = (e: React.FormEvent) => {
    e.preventDefault();
    setIntentoGuardar(true);
    setPreflightAbierto(true);
  };

  const handleConfirmarRegistro = async () => {
    if (errores.length > 0) return;
    setGuardando(true);
    try {
      const creada = await addOrden({
        numeroOrden: form.numeroOrden,
        fechaOrden: form.fechaOrden,
        incoterm: form.incoterm,
        lugarPactado: form.lugarPactado || null,
        proveedorId: proveedorCatalogado ? form.proveedorId : null,
        proveedorExtranjero: proveedorCatalogado
          ? nombreProveedorEfectivo
          : form.proveedorExtranjero,
        paisOrigen: form.paisOrigen,
        moneda: form.moneda,
        trmPactada: form.trmPactada,
        tasaCambioFecha: form.tasaCambioFecha || null,
        tasaCambioFuente: form.tasaCambioFuente || null,
        formaPago: form.formaPago || null,
        condicionPago: form.condicionPago || null,
        detallePago: form.detallePago || null,
        fechaRequeridaLlegada: form.fechaRequeridaLlegada || null,
        responsableId: form.responsableId || null,
        observaciones: form.observaciones,
        items: items.map(({ _origen, ...resto }) => resto),
      });
      toast.success(`Orden ${form.numeroOrden} registrada.`);

      // La orden ya existe (tiene id): recién ahora se suben los documentos
      // iniciales que quedaron en memoria. Un documento que falle no revierte
      // la orden ya creada (nunca se pierde el registro por un adjunto) —
      // solo se avisa cuál falló, para que el usuario lo reintente desde el
      // detalle.
      if (documentosPendientes.length > 0) {
        const resultados = await Promise.allSettled(
          documentosPendientes.map(({ tipo, file }) =>
            subirDocumentoOrdenCompraIntlStandalone(creada.id, tipo, file),
          ),
        );
        const fallidos = resultados.filter((r) => r.status === "rejected").length;
        if (fallidos > 0) {
          toast.error(
            `${fallidos} documento(s) no se pudieron adjuntar. Puedes reintentarlo desde el detalle de la orden.`,
          );
        }
      }

      setPreflightAbierto(false);
      navigate({ to: "/importaciones/$id", params: { id: creada.id } });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al registrar la orden de compra internacional.",
      );
    } finally {
      setGuardando(false);
    }
  };

  const handleSeleccionarDocumento = (tipo: TipoDocumentoOrdenIntl, file: File) => {
    setDocumentosPendientes((prev) => [...prev, { tipo, file }]);
  };

  const handleQuitarDocumentoPendiente = (index: number) => {
    setDocumentosPendientes((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <AppShell
      title="Nueva Orden de Compra Internacional"
      description="Registra el acuerdo comercial con el proveedor extranjero. El landed cost definitivo se calcula al liquidar cada lote."
      actions={
        <Link
          to="/importaciones"
          className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2" })}
        >
          <ArrowLeft className="h-4 w-4" /> Volver al listado
        </Link>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
        <form
          onSubmit={handleAbrirPreflight}
          className="panel bg-white border-slate-200 rounded-lg p-5 shadow-2xs space-y-6"
        >
          {/* Identificación */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Identificación
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Número de Orden *</Label>
                <Input
                  required
                  placeholder="Ej: OCI-2026-001"
                  value={form.numeroOrden}
                  onChange={(e) => setForm({ ...form, numeroOrden: e.target.value })}
                  className={cn(
                    "h-9 text-xs border-slate-300",
                    intentoGuardar &&
                      !form.numeroOrden &&
                      "border-red-400 focus-visible:ring-red-300",
                  )}
                />
                {intentoGuardar && !form.numeroOrden && (
                  <p className="text-[11px] text-red-600">El número de orden es obligatorio.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Fecha de Orden *</Label>
                <Input
                  type="date"
                  required
                  value={form.fechaOrden}
                  onChange={(e) => setForm({ ...form, fechaOrden: e.target.value })}
                  className={cn(
                    "h-9 text-xs border-slate-300",
                    intentoGuardar &&
                      !form.fechaOrden &&
                      "border-red-400 focus-visible:ring-red-300",
                  )}
                />
              </div>
            </div>
          </section>

          {/* Proveedor */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Proveedor</h3>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Proveedor catalogado</Label>
              <Combobox
                value={proveedorNoCatalogado ? "" : form.proveedorId}
                onValueChange={(val) => {
                  const seleccionado = proveedorOpciones.find((p) => p.id === val);
                  setProveedorNoCatalogado(false);
                  setForm({
                    ...form,
                    proveedorId: val,
                    proveedorNombreCatalogado: seleccionado?.nombre ?? "",
                    // Solo sugiere el país configurado en el proveedor si el
                    // usuario todavía no eligió uno a mano — nunca pisa una
                    // elección ya hecha.
                    paisOrigen:
                      !form.paisOrigen && seleccionado?.paisOrigen
                        ? seleccionado.paisOrigen
                        : form.paisOrigen,
                  });
                }}
                placeholder="Buscar proveedor por nombre o NIT..."
                searchPlaceholder="Buscar por nombre o NIT..."
                emptyText="Ningún proveedor coincide con el catálogo (SIESA/RicoSoft)."
                onSearchChange={buscarProveedores}
                loadingOptions={buscandoProveedores}
                selectedLabel={
                  !proveedorNoCatalogado ? form.proveedorNombreCatalogado || undefined : undefined
                }
                disabled={proveedorNoCatalogado}
                options={proveedorOpciones.map((p) => ({
                  value: p.id,
                  label: `${p.nombre} (NIT ${p.nit})`,
                }))}
                className="h-9"
              />
              <p className="text-[11px] text-slate-500">
                Ya en el catálogo (Siesa/RicoSoft) — el nombre de la orden se toma directamente de
                aquí, no se puede editar por separado.
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={proveedorNoCatalogado}
                onChange={(e) => {
                  const marcado = e.target.checked;
                  setProveedorNoCatalogado(marcado);
                  if (marcado) {
                    setForm({ ...form, proveedorId: "", proveedorNombreCatalogado: "" });
                  }
                }}
                className="h-3.5 w-3.5"
              />
              No catalogado / proveedor externo
            </label>

            {proveedorCatalogado ? (
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Nombre del Proveedor{" "}
                  <span className="font-normal text-slate-400">(autocompletado)</span>
                </Label>
                <Input
                  disabled
                  value={form.proveedorNombreCatalogado}
                  className="h-9 text-xs border-slate-300 bg-slate-50 text-slate-500"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Nombre del Proveedor no catalogado *
                </Label>
                <Input
                  required
                  disabled={!proveedorNoCatalogado}
                  placeholder='Marca "No catalogado / proveedor externo" para escribirlo'
                  value={form.proveedorExtranjero}
                  onChange={(e) => setForm({ ...form, proveedorExtranjero: e.target.value })}
                  className={cn(
                    "h-9 text-xs border-slate-300 disabled:bg-slate-50 disabled:text-slate-400",
                    intentoGuardar &&
                      proveedorNoCatalogado &&
                      !form.proveedorExtranjero &&
                      "border-red-400 focus-visible:ring-red-300",
                  )}
                />
                <p className="text-[11px] text-slate-500">
                  Se guarda como texto (snapshot) en la orden — NO crea un registro nuevo en el
                  catálogo de proveedores.
                </p>
              </div>
            )}
          </section>

          {/* Condiciones comerciales */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Condiciones comerciales
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Incoterm *</Label>
                <Select
                  value={form.incoterm}
                  disabled={cargandoIncoterms}
                  onValueChange={(val) => setForm({ ...form, incoterm: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue placeholder={cargandoIncoterms ? "Cargando..." : undefined} />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {incoterms.map((i) => (
                      <SelectItem key={i.id} value={i.clave} className="text-xs">
                        {i.clave}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errorIncoterms && (
                  <p className="text-[11px] text-red-600">
                    No se pudieron cargar los Incoterms: {errorIncoterms}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Lugar pactado</Label>
                <Input
                  placeholder="Ej: Shanghai, China"
                  value={form.lugarPactado}
                  onChange={(e) => setForm({ ...form, lugarPactado: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
                <p className="text-[11px] text-slate-500">
                  No se infiere automáticamente del Incoterm ni del país de origen.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  País de origen de la mercancía *
                </Label>
                <Select
                  value={form.paisOrigen || undefined}
                  disabled={cargandoPaises}
                  onValueChange={(val) => setForm({ ...form, paisOrigen: val })}
                >
                  <SelectTrigger
                    className={cn(
                      "h-9 text-xs border-slate-300 bg-white",
                      intentoGuardar &&
                        !form.paisOrigen &&
                        "border-red-400 focus-visible:ring-red-300",
                    )}
                  >
                    <SelectValue
                      placeholder={cargandoPaises ? "Cargando..." : "Selecciona un país..."}
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 max-h-64">
                    {paises.map((p) => (
                      <SelectItem key={p.id} value={p.clave} className="text-xs">
                        {p.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">
                  País donde se fabricó la mercancía — puede diferir del país del proveedor.
                </p>
                {intentoGuardar && !form.paisOrigen && (
                  <p className="text-[11px] text-red-600">El país de origen es obligatorio.</p>
                )}
                {errorPaises && (
                  <p className="text-[11px] text-red-600">
                    No se pudieron cargar los países: {errorPaises}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Moneda *</Label>
                <Select
                  value={form.moneda}
                  onValueChange={(val) => setForm({ ...form, moneda: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {MONEDAS.map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Tasa de cambio pactada (COP) *
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={form.trmPactada}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      trmPactada: Number(e.target.value),
                      // Editar el valor a mano ya no es "Oficial" — nunca se
                      // sobrescribe en silencio, pero tampoco se deja una
                      // fuente desactualizada mostrando lo contrario.
                      tasaCambioFuente: "Pactada",
                    })
                  }
                  className="h-9 text-xs border-slate-300"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cargandoTrm}
                  onClick={handleObtenerTrmOficial}
                  className="h-9 shrink-0 gap-1.5 text-xs font-semibold"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", cargandoTrm && "animate-spin")} />
                  {cargandoTrm ? "Consultando..." : "TRM oficial del día"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-slate-500">Fecha de la tasa</Label>
                  <Input
                    type="date"
                    value={form.tasaCambioFecha}
                    onChange={(e) => setForm({ ...form, tasaCambioFecha: e.target.value })}
                    className="h-8 text-[11px] border-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-slate-500">Fuente</Label>
                  <Select
                    value={form.tasaCambioFuente || undefined}
                    onValueChange={(val) =>
                      setForm({ ...form, tasaCambioFuente: val as typeof form.tasaCambioFuente })
                    }
                  >
                    <SelectTrigger className="h-8 text-[11px] border-slate-300 bg-white">
                      <SelectValue placeholder="Selecciona..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      <SelectItem value="Oficial" className="text-xs">
                        Oficial
                      </SelectItem>
                      <SelectItem value="Pactada" className="text-xs">
                        Pactada
                      </SelectItem>
                      <SelectItem value="Manual" className="text-xs">
                        Manual
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {trmOficial && (
                <p
                  className={cn(
                    "flex items-center gap-1 text-[11px]",
                    trmDifiereMucho ? "text-slate-900 font-semibold" : "text-slate-500",
                  )}
                >
                  {trmDifiereMucho && <AlertTriangle className="h-3 w-3 shrink-0" />}
                  TRM oficial vigente: {money(trmOficial.valor, "COP")}
                  {trmDifiereMucho &&
                    ` · difiere ${(diferenciaTrm * 100).toFixed(1)}% de la pactada — verifica que sea correcto.`}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Forma de Pago</Label>
                <Select
                  value={form.formaPago || undefined}
                  disabled={cargandoFormasPago}
                  onValueChange={(val) => setForm({ ...form, formaPago: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue
                      placeholder={cargandoFormasPago ? "Cargando..." : "Selecciona..."}
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {formasPago.map((f) => (
                      <SelectItem key={f.id} value={f.clave} className="text-xs">
                        {f.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errorFormasPago && (
                  <p className="text-[11px] text-red-600">
                    No se pudieron cargar las formas de pago: {errorFormasPago}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Condición de pago</Label>
                <Input
                  placeholder="Ej: 50% anticipo / 50% contra BL"
                  value={form.condicionPago}
                  onChange={(e) => setForm({ ...form, condicionPago: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Detalle de pago</Label>
              <Textarea
                value={form.detallePago}
                onChange={(e) => setForm({ ...form, detallePago: e.target.value })}
                className="text-xs border-slate-300"
                rows={2}
              />
            </div>
          </section>

          {/* Logística */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Logística</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Fecha requerida de llegada
                </Label>
                <Input
                  type="date"
                  value={form.fechaRequeridaLlegada}
                  onChange={(e) => setForm({ ...form, fechaRequeridaLlegada: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
                {form.fechaRequeridaLlegada &&
                  form.fechaOrden &&
                  new Date(form.fechaRequeridaLlegada) < new Date(form.fechaOrden) && (
                    <p className="text-[11px] text-red-600">
                      No puede ser anterior a la fecha de la orden.
                    </p>
                  )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Responsable de la importación
                </Label>
                <Select
                  value={form.responsableId || undefined}
                  onValueChange={(val) => setForm({ ...form, responsableId: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue
                      placeholder={cargandoResponsables ? "Cargando..." : "Selecciona..."}
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 max-h-64">
                    {responsableOpciones.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {u.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">
                  No reemplaza a quien crea/audita la orden — solo indica quién la gestiona.
                </p>
              </div>
            </div>
          </section>

          {/* Ítems */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Ítems</h3>
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-700">Ítems de la Orden *</Label>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setItems([...items, { ...itemVacio }])}
                className="h-7 text-[11px] font-bold"
              >
                <Plus className="h-3 w-3 mr-1" /> Agregar ítem
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              <strong>Cantidad</strong>: cantidad comercial comprada en la unidad seleccionada
              (define el subtotal y el costo unitario). <strong>Peso total (Kg)</strong>: peso
              físico del ítem completo — un dato aparte que no cambia la cantidad comercial (ej.
              "500 SACOS de 25 Kg c/u" es Cantidad = 500, Unidad = SACO25KG, Peso total = 12.500
              Kg).
            </p>
            <div className="rounded-md border border-slate-200 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="hover:bg-slate-50">
                    <TableHead className="text-slate-600 font-bold px-2 py-2 w-28">
                      Referencia
                    </TableHead>
                    <TableHead className="text-slate-600 font-bold px-2 py-2">
                      Descripción
                    </TableHead>
                    <TableHead className="text-slate-600 font-bold px-2 py-2 w-28">
                      Ref. proveedor
                    </TableHead>
                    <TableHead className="text-slate-600 font-bold px-2 py-2 w-24">
                      Unidad comercial
                    </TableHead>
                    <TableHead className="text-slate-600 font-bold px-2 py-2 w-20">
                      Cantidad
                    </TableHead>
                    <TableHead className="text-slate-600 font-bold px-2 py-2 w-24">
                      Peso total (Kg)
                    </TableHead>
                    <TableHead className="text-slate-600 font-bold px-2 py-2 w-28">
                      FOB unitario
                    </TableHead>
                    <TableHead className="text-slate-600 font-bold px-2 py-2 w-28 text-right">
                      Subtotal
                    </TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => {
                    const filaInvalida =
                      intentoGuardar &&
                      (!item.descripcion || !item.unidadMedida || Number(item.cantidad) <= 0);
                    const subtotal =
                      Number(item.cantidad || 0) * Number(item.valorUnitarioFob || 0);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="px-2 py-1.5">
                          <Input
                            placeholder="Ej: HUNH1024"
                            value={item.referencia ?? ""}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], referencia: e.target.value };
                              setItems(next);
                            }}
                            className="h-8 text-[11px] border-slate-300"
                          />
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <ItemDescripcionAutocomplete
                              value={item.descripcion}
                              invalid={filaInvalida}
                              onChange={(texto) => {
                                const next = [...items];
                                next[idx] = { ...next[idx], descripcion: texto, _origen: "manual" };
                                setItems(next);
                              }}
                              onSeleccionar={(op) => {
                                const next = [...items];
                                next[idx] = {
                                  ...next[idx],
                                  descripcion: op.descripcion || next[idx].descripcion,
                                  referencia: op.referencia || next[idx].referencia,
                                  unidadMedida:
                                    mapearUnidadSiesa(
                                      op.unidadMedida,
                                      unidadesMedida.map((u) => u.clave),
                                    ) ?? next[idx].unidadMedida,
                                  _origen: "siesa",
                                };
                                setItems(next);
                              }}
                            />
                          </div>
                          {item._origen && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "mt-1 text-[9px] px-1.5 py-0",
                                item._origen === "siesa"
                                  ? "border-blue-200 bg-blue-50 text-blue-700"
                                  : "border-slate-300 bg-slate-50 text-slate-500",
                              )}
                            >
                              {item._origen === "siesa" ? "Siesa" : "Manual"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Input
                            placeholder="Ref. del proveedor"
                            value={item.referenciaProveedor ?? ""}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], referenciaProveedor: e.target.value };
                              setItems(next);
                            }}
                            className="h-8 text-[11px] border-slate-300"
                          />
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Select
                            value={item.unidadMedida ?? undefined}
                            disabled={cargandoUnidadesMedida}
                            onValueChange={(val) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], unidadMedida: val };
                              setItems(next);
                            }}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-8 text-[11px] border-slate-300 bg-white",
                                filaInvalida &&
                                  !item.unidadMedida &&
                                  "border-red-400 focus-visible:ring-red-300",
                              )}
                            >
                              <SelectValue
                                placeholder={cargandoUnidadesMedida ? "Cargando..." : "—"}
                              />
                            </SelectTrigger>
                            <SelectContent className="bg-white border-slate-200">
                              {unidadesMedida.map((u) => (
                                <SelectItem key={u.id} value={u.clave} className="text-xs">
                                  {u.clave}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {errorUnidadesMedida && (
                            <p className="mt-0.5 text-[10px] text-red-600">
                              Error cargando unidades.
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            required
                            value={item.cantidad}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], cantidad: Number(e.target.value) };
                              setItems(next);
                            }}
                            className={cn(
                              "h-8 text-[11px] border-slate-300",
                              filaInvalida &&
                                Number(item.cantidad) <= 0 &&
                                "border-red-400 focus-visible:ring-red-300",
                            )}
                          />
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.pesoKg ?? ""}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = {
                                ...next[idx],
                                pesoKg: e.target.value === "" ? undefined : Number(e.target.value),
                              };
                              setItems(next);
                            }}
                            className="h-8 text-[11px] border-slate-300"
                          />
                          {!!item.pesoKg && !!item.cantidad && (
                            <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">
                              {item.cantidad} {item.unidadMedida || "und."} ={" "}
                              {Number(item.pesoKg).toLocaleString("es-CO")} kg
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            required
                            value={item.valorUnitarioFob}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = {
                                ...next[idx],
                                valorUnitarioFob: Number(e.target.value),
                              };
                              setItems(next);
                            }}
                            className={cn(
                              "h-8 text-[11px] border-slate-300",
                              intentoGuardar &&
                                Number(item.valorUnitarioFob) < 0 &&
                                "border-red-400 focus-visible:ring-red-300",
                            )}
                          />
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                          {money(subtotal, form.moneda)}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setItems(items.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-slate-900"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Documentos iniciales */}
          <section className="space-y-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Documentos Iniciales
              </h3>
              <p className="text-[11px] text-slate-500">
                Cotización, Proforma Invoice, oferta comercial u otros documentos de soporte. Se
                adjuntan a la orden justo después de registrarla.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TIPOS_DOCUMENTO_ORDEN_INTL.map(({ tipo, etiqueta }) => (
                <div key={tipo} className="rounded-md border border-slate-200 p-2.5">
                  <p className="text-[10px] uppercase font-bold text-slate-500">{etiqueta}</p>
                  <input
                    ref={(el) => {
                      documentInputRefs.current[tipo] = el;
                    }}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSeleccionarDocumento(tipo, file);
                      e.target.value = "";
                    }}
                  />
                  {documentosPendientes
                    .map((d, i) => ({ ...d, index: i }))
                    .filter((d) => d.tipo === tipo).length === 0 ? (
                    <p className="mt-1.5 text-[11px] text-slate-400">Sin documentos.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1">
                      {documentosPendientes
                        .map((d, i) => ({ ...d, index: i }))
                        .filter((d) => d.tipo === tipo)
                        .map((d) => (
                          <li key={d.index} className="flex items-center justify-between gap-1.5">
                            <span
                              className="truncate text-[11px] text-slate-700"
                              title={d.file.name}
                            >
                              {d.file.name}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 text-slate-400 hover:text-red-600"
                              onClick={() => handleQuitarDocumentoPendiente(d.index)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="mt-1.5 h-7 w-full text-[11px]"
                    onClick={() => documentInputRefs.current[tipo]?.click()}
                  >
                    Adjuntar
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {/* Observaciones */}
          <section className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Observaciones
            </h3>
            <Textarea
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              className="text-xs border-slate-300"
              rows={2}
            />
          </section>

          {/* Resumen */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Resumen</h3>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                FOB total: <strong className="ml-1">{money(fobTotal, form.moneda)}</strong>
              </Badge>
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                Estimado en COP: <strong className="ml-1">{money(estimadoCop, "COP")}</strong>
              </Badge>
              <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                Peso total:{" "}
                <strong className="ml-1">{pesoTotalKg.toLocaleString("es-CO")} Kg</strong>
              </Badge>
              <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                Ítems: <strong className="ml-1">{items.length}</strong>
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500">
              Estimado en COP = FOB total × tasa de cambio pactada, sin flete, seguro, arancel ni
              nacionalización todavía (eso se calcula al liquidar cada lote).
            </p>
          </section>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link
              to="/importaciones"
              className={buttonVariants({ variant: "outline", size: "sm" })}
              aria-disabled={guardando}
            >
              Cancelar
            </Link>
            <Button type="submit" size="sm" disabled={guardando} className="gap-2">
              <Ship className="h-4 w-4" />
              {guardando ? "Guardando..." : "Registrar Orden"}
            </Button>
          </div>
        </form>

        {/* Panel de preparación de la orden */}
        <aside className="panel bg-white border-slate-200 rounded-lg p-4 shadow-2xs space-y-3 lg:sticky lg:top-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Preparación de la orden
          </h3>
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${completitudPct}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500">{completitudPct}% completo</p>
          </div>

          {errores.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-[11px] font-bold text-red-700">
                <AlertTriangle className="h-3 w-3" /> Errores ({errores.length}) — bloquean el
                registro
              </p>
              <ul className="space-y-0.5">
                {errores.map((e, i) => (
                  <li key={i} className="text-[11px] text-red-600">
                    • {e.texto}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {advertencias.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
                <Info className="h-3 w-3" /> Advertencias ({advertencias.length}) — no bloquean
              </p>
              <ul className="space-y-0.5">
                {advertencias.map((a, i) => (
                  <li key={i} className="text-[11px] text-amber-700">
                    • {a.texto}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recomendaciones.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                Recomendaciones
              </p>
              <ul className="space-y-0.5">
                {recomendaciones.map((r, i) => (
                  <li key={i} className="text-[11px] text-slate-500">
                    • {r.texto}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {errores.length === 0 && advertencias.length === 0 && (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Todo listo para registrar.
            </p>
          )}
        </aside>
      </div>

      {/* Pre-flight check */}
      <Dialog open={preflightAbierto} onOpenChange={setPreflightAbierto}>
        <DialogContent className="bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Verificación final antes de registrar</DialogTitle>
            <DialogDescription>
              Orden {form.numeroOrden || "(sin número)"} ·{" "}
              {nombreProveedorEfectivo || "(sin proveedor)"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-80 overflow-y-auto">
            {errores.length > 0 ? (
              <div className="space-y-1 rounded-md border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-bold text-red-700">
                  No se puede registrar — corrige lo siguiente:
                </p>
                <ul className="space-y-0.5">
                  {errores.map((e, i) => (
                    <li key={i} className="text-xs text-red-700">
                      • {e.texto}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Sin errores bloqueantes.
              </p>
            )}

            {advertencias.length > 0 && (
              <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800">
                  Advertencias (puedes continuar igual):
                </p>
                <ul className="space-y-0.5">
                  {advertencias.map((a, i) => (
                    <li key={i} className="text-xs text-amber-800">
                      • {a.texto}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
              <p>
                FOB total: <strong>{money(fobTotal, form.moneda)}</strong>
              </p>
              <p>
                Estimado en COP: <strong>{money(estimadoCop, "COP")}</strong>
              </p>
              <p>
                Peso total: <strong>{pesoTotalKg.toLocaleString("es-CO")} Kg</strong>
              </p>
              <p>
                Ítems: <strong>{items.length}</strong>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreflightAbierto(false)}
            >
              Seguir editando
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={errores.length > 0 || guardando}
              onClick={handleConfirmarRegistro}
              className="gap-2"
            >
              <Ship className="h-4 w-4" />
              {guardando ? "Guardando..." : "Confirmar y registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
