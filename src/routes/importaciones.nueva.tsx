import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Loader2, Plus, RefreshCw, Ship, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
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
  useBuscarItemsSiesa,
  type ItemOrdenInput,
  type TrmOficial,
  type ItemBusquedaSiesa,
} from "@/hooks/use-importaciones";
import { useProveedorBusqueda } from "@/hooks/use-proveedores";
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

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const MONEDAS = ["USD", "EUR", "CNY", "GBP", "JPY"];
// Mismo catálogo que FORMAS_PAGO_VALIDAS/UNIDADES_MEDIDA_VALIDAS en
// importaciones.controller.ts — si cambia uno, cambia el otro.
const FORMAS_PAGO = [
  "Anticipado",
  "Carta de crédito",
  "Crédito 30 días",
  "Crédito 60 días",
  "Crédito 90 días",
  "Contra entrega",
];
const UNIDADES_MEDIDA = ["KG", "TON", "SACO25KG", "SACO50KG", "LT", "UND"];
// Misma lista EXACTA que PAISES_VALIDOS en importaciones.controller.ts —
// país de origen normalizado (antes era texto libre: "China"/"china"/
// "CHINA" como valores distintos). Sin paquete compartido en este repo
// (mismo criterio que INCOTERMS/MONEDAS, ya duplicados así).
const PAISES = [
  "Alemania",
  "Arabia Saudita",
  "Argentina",
  "Bélgica",
  "Bolivia",
  "Brasil",
  "Canadá",
  "Chile",
  "China",
  "Colombia",
  "Corea del Sur",
  "Costa Rica",
  "Ecuador",
  "Emiratos Árabes Unidos",
  "España",
  "Estados Unidos",
  "Francia",
  "Guatemala",
  "Hong Kong",
  "India",
  "Indonesia",
  "Israel",
  "Italia",
  "Japón",
  "Malasia",
  "México",
  "Países Bajos",
  "Panamá",
  "Perú",
  "Polonia",
  "Portugal",
  "Reino Unido",
  "República Dominicana",
  "Singapur",
  "Sudáfrica",
  "Suiza",
  "Tailandia",
  "Taiwán",
  "Turquía",
  "Vietnam",
];
/** La unidad que trae Siesa es texto libre del ERP (ej. "Kg", "UN", "Ton") —
 * solo se autocompleta si coincide EXACTO (sin distinguir mayúsculas) con
 * una de nuestras unidades válidas; si no, se deja para elegir a mano en vez
 * de forzar un valor que luego el backend rechazaría (400). */
function mapearUnidadSiesa(unidad: string | null): string | undefined {
  if (!unidad) return undefined;
  return UNIDADES_MEDIDA.find((u) => u.toLowerCase() === unidad.trim().toLowerCase());
}
// Umbral a partir del cual se avisa que la TRM pactada se aleja de la
// oficial del día — no bloquea el guardado, solo informa (la TRM pactada es
// una decisión comercial del proveedor, no un dato que deba coincidir).
const UMBRAL_ALERTA_TRM = 0.02;

const itemVacio: ItemOrdenInput = {
  descripcion: "",
  referencia: "",
  unidadMedida: "KG",
  cantidad: 1,
  pesoKg: undefined,
  valorUnitarioFob: 0,
};

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

function NuevaOrdenIntlPage() {
  const navigate = useNavigate();
  const { addOrden } = useImportaciones();
  const {
    opciones: proveedorOpciones,
    loading: buscandoProveedores,
    buscar: buscarProveedores,
  } = useProveedorBusqueda();

  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    numeroOrden: "",
    incoterm: "FOB",
    proveedorId: "",
    proveedorExtranjero: "",
    paisOrigen: "",
    moneda: "USD",
    trmPactada: 4000,
    formaPago: "",
    observaciones: "",
  });
  const [items, setItems] = useState<ItemOrdenInput[]>([{ ...itemVacio }]);
  // Validación visible (borde rojo + mensaje) recién después del primer
  // intento fallido de guardar — no se le marca todo en rojo a alguien que
  // apenas entró a la página.
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [trmOficial, setTrmOficial] = useState<TrmOficial | null>(null);
  const [cargandoTrm, setCargandoTrm] = useState(false);

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
      setForm((f) => ({ ...f, trmPactada: trm.valor }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible obtener la TRM oficial.");
    } finally {
      setCargandoTrm(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntentoGuardar(true);
    if (!form.numeroOrden || !form.proveedorExtranjero || !form.paisOrigen) return;
    if (
      items.some(
        (it) =>
          !it.descripcion ||
          !it.unidadMedida ||
          Number(it.cantidad) <= 0 ||
          Number(it.valorUnitarioFob) <= 0,
      )
    ) {
      toast.error(
        "Cada ítem necesita descripción, unidad, cantidad y valor unitario FOB mayores a cero.",
      );
      return;
    }

    setGuardando(true);
    try {
      await addOrden({ ...form, proveedorId: form.proveedorId || null, items });
      toast.success(`Orden ${form.numeroOrden} registrada.`);
      navigate({ to: "/importaciones" });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al registrar la orden de compra internacional.",
      );
    } finally {
      setGuardando(false);
    }
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
      <form
        onSubmit={handleSave}
        className="panel bg-white border-slate-200 rounded-lg p-5 shadow-2xs space-y-4"
      >
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
                intentoGuardar && !form.numeroOrden && "border-red-400 focus-visible:ring-red-300",
              )}
            />
            {intentoGuardar && !form.numeroOrden && (
              <p className="text-[11px] text-red-600">El número de orden es obligatorio.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Incoterm *</Label>
            <Select
              value={form.incoterm}
              onValueChange={(val) => setForm({ ...form, incoterm: val })}
            >
              <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                {INCOTERMS.map((i) => (
                  <SelectItem key={i} value={i} className="text-xs">
                    {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Proveedor</Label>
            <Combobox
              value={form.proveedorId}
              onValueChange={(val) => {
                const seleccionado = proveedorOpciones.find((p) => p.id === val);
                setForm({
                  ...form,
                  proveedorId: val,
                  proveedorExtranjero: seleccionado?.nombre ?? form.proveedorExtranjero,
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
              emptyText="Ningún proveedor coincide — es un proveedor nuevo, escríbelo abajo."
              onSearchChange={buscarProveedores}
              loadingOptions={buscandoProveedores}
              selectedLabel={form.proveedorExtranjero || undefined}
              options={proveedorOpciones.map((p) => ({
                value: p.id,
                label: `${p.nombre} (NIT ${p.nit})`,
              }))}
              className="h-9"
            />
            <p className="text-[11px] text-slate-500">
              Ya en el catálogo (Siesa/RicoSoft). Si es un proveedor nuevo, déjalo vacío y escribe
              el nombre abajo.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">País de Origen *</Label>
            <Select
              value={form.paisOrigen || undefined}
              onValueChange={(val) => setForm({ ...form, paisOrigen: val })}
            >
              <SelectTrigger
                className={cn(
                  "h-9 text-xs border-slate-300 bg-white",
                  intentoGuardar && !form.paisOrigen && "border-red-400 focus-visible:ring-red-300",
                )}
              >
                <SelectValue placeholder="Selecciona un país..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 max-h-64">
                {PAISES.map((p) => (
                  <SelectItem key={p} value={p} className="text-xs">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {intentoGuardar && !form.paisOrigen && (
              <p className="text-[11px] text-red-600">El país de origen es obligatorio.</p>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-700">
            Nombre del Proveedor *{" "}
            {form.proveedorId && (
              <span className="font-normal text-slate-400">(autocompletado)</span>
            )}
          </Label>
          <Input
            required
            disabled={!!form.proveedorId}
            value={form.proveedorExtranjero}
            onChange={(e) => setForm({ ...form, proveedorExtranjero: e.target.value })}
            className={cn(
              "h-9 text-xs border-slate-300 disabled:bg-slate-50 disabled:text-slate-500",
              intentoGuardar &&
                !form.proveedorExtranjero &&
                "border-red-400 focus-visible:ring-red-300",
            )}
          />
          {intentoGuardar && !form.proveedorExtranjero && (
            <p className="text-[11px] text-red-600">El nombre del proveedor es obligatorio.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Moneda *</Label>
            <Select value={form.moneda} onValueChange={(val) => setForm({ ...form, moneda: val })}>
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
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Forma de Pago</Label>
            <Select
              value={form.formaPago || undefined}
              onValueChange={(val) => setForm({ ...form, formaPago: val })}
            >
              <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                <SelectValue placeholder="Selecciona..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                {FORMAS_PAGO.map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-700">TRM Pactada (COP) *</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              required
              value={form.trmPactada}
              onChange={(e) => setForm({ ...form, trmPactada: Number(e.target.value) })}
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

        <div className="space-y-2">
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
            <strong>Cantidad</strong>: cantidad comercial comprada en la unidad seleccionada (define
            el subtotal y el costo unitario). <strong>Peso total (Kg)</strong>: peso físico del ítem
            completo — un dato aparte que no cambia la cantidad comercial (ej. "500 SACOS de 25 Kg
            c/u" es Cantidad = 500, Unidad = SACO25KG, Peso total = 12.500 Kg).
          </p>
          <div className="rounded-md border border-slate-200 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-slate-50">
                  <TableHead className="text-slate-600 font-bold px-2 py-2 w-28">
                    Referencia
                  </TableHead>
                  <TableHead className="text-slate-600 font-bold px-2 py-2">Descripción</TableHead>
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
                  const subtotal = Number(item.cantidad || 0) * Number(item.valorUnitarioFob || 0);
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
                        <ItemDescripcionAutocomplete
                          value={item.descripcion}
                          invalid={filaInvalida}
                          onChange={(texto) => {
                            const next = [...items];
                            next[idx] = { ...next[idx], descripcion: texto };
                            setItems(next);
                          }}
                          onSeleccionar={(op) => {
                            const next = [...items];
                            next[idx] = {
                              ...next[idx],
                              descripcion: op.descripcion || next[idx].descripcion,
                              referencia: op.referencia || next[idx].referencia,
                              unidadMedida:
                                mapearUnidadSiesa(op.unidadMedida) ?? next[idx].unidadMedida,
                            };
                            setItems(next);
                          }}
                        />
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <Select
                          value={item.unidadMedida ?? undefined}
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
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-200">
                            {UNIDADES_MEDIDA.map((u) => (
                              <SelectItem key={u} value={u} className="text-xs">
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                            next[idx] = { ...next[idx], valorUnitarioFob: Number(e.target.value) };
                            setItems(next);
                          }}
                          className={cn(
                            "h-8 text-[11px] border-slate-300",
                            intentoGuardar &&
                              Number(item.valorUnitarioFob) <= 0 &&
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
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
              FOB total: <strong className="ml-1">{money(fobTotal, form.moneda)}</strong>
            </Badge>
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
              Estimado en COP: <strong className="ml-1">{money(estimadoCop, "COP")}</strong>
            </Badge>
            <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
              Peso total: <strong className="ml-1">{pesoTotalKg.toLocaleString("es-CO")} Kg</strong>
            </Badge>
          </div>
          <p className="text-[11px] text-slate-500">
            Estimado en COP = FOB × TRM pactada, sin arancel ni flete todavía (eso se calcula al
            liquidar cada lote).
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-semibold text-slate-700">Observaciones</Label>
          <Textarea
            value={form.observaciones}
            onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
            className="text-xs border-slate-300"
            rows={2}
          />
        </div>

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
    </AppShell>
  );
}
