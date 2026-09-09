import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Settings, Trash2, Truck, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
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
  useBuscarItemsSiesa,
  useProveedoresConfigurados,
  useRequisitosProveedor,
  type NuevoRequisitoProveedor,
  type RequisitoProveedorImportacion,
} from "@/hooks/use-importaciones";
import { useProveedorBusqueda } from "@/hooks/use-proveedores";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/proveedores-requisitos")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_VER),
  head: () => ({
    meta: [
      { title: "Proveedores y Requisitos | RicoSoft" },
      {
        name: "description",
        content:
          "Configuración de importación por proveedor: país de origen, materiales y requisitos.",
      },
    ],
  }),
  component: ProveedoresRequisitosPage,
});

// Mismo catálogo EXACTO que TIPOS_REQUISITO_VALIDOS en
// importaciones-requisitos-proveedor.controller.ts.
const TIPOS_REQUISITO = [
  { value: "DOCUMENTO", label: "Documento" },
  { value: "ACCION", label: "Acción" },
  { value: "CONDICION", label: "Condición" },
  { value: "INFORMACION", label: "Información" },
  { value: "PAGO", label: "Pago" },
  { value: "ESPECIFICACION", label: "Especificación" },
];

const etiquetaTipo = (tipo: string) => TIPOS_REQUISITO.find((t) => t.value === tipo)?.label ?? tipo;

// Misma lista EXACTA que PAISES_VALIDOS en proveedores.schemas.ts /
// importaciones.controller.ts — sin paquete compartido en este repo (mismo
// criterio que incoterm/moneda, ya duplicados así).
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

const formVacio: NuevoRequisitoProveedor = {
  tipo: "DOCUMENTO",
  nombre: "",
  descripcion: "",
  obligatorio: true,
  orden: 0,
};

// Recuerda el último proveedor elegido en esta pestaña: al navegar a otro
// módulo y volver, el componente se desmonta y el useState de siempre se
// pierde — sessionStorage sobrevive a ese desmontaje/remontaje (no a cerrar
// la pestaña, que es justo el alcance correcto para una simple conveniencia
// de navegación, no un dato de negocio).
const CLAVE_PROVEEDOR_RECORDADO = "ricosoft:proveedores-requisitos:proveedorId";

function leerProveedorRecordado(): string {
  try {
    return sessionStorage.getItem(CLAVE_PROVEEDOR_RECORDADO) ?? "";
  } catch {
    return "";
  }
}

/**
 * Autocompletado de "material" contra el maestro de ítems de Siesa — mismo
 * mecanismo EXACTO que ItemDescripcionAutocomplete en importaciones.index.tsx
 * (reutiliza useBuscarItemsSiesa, ya usado ahí y en la Bandeja de correos).
 * A propósito NO es un <Combobox> estricto: un material que todavía no está
 * en Siesa debe poder escribirse y agregarse igual, las sugerencias son solo
 * una ayuda. Si el tenant no tiene Siesa configurado (`disponible:false`), se
 * comporta como un <Input> plano — cero regresión.
 */
function MaterialAutocomplete({
  value,
  onChange,
  onSeleccionar,
  onEnter,
  disabled,
}: {
  value: string;
  onChange: (texto: string) => void;
  onSeleccionar: (descripcion: string) => void;
  onEnter: () => void;
  disabled?: boolean;
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
          value={value}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (disponible && opciones.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setOpen(false);
              onEnter();
            }
          }}
          placeholder={
            disponible
              ? "Escribe para buscar en Siesa..."
              : 'Ej: "Telas" — presiona Enter para agregar'
          }
          className="h-9 text-xs border-slate-300"
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
                    onSeleccionar(op.descripcion || value);
                    setOpen(false);
                  }}
                  className="w-full rounded-sm px-2 py-1.5 text-left text-[11px] hover:bg-slate-100"
                >
                  <p className="font-semibold text-slate-800 truncate">{op.descripcion || "—"}</p>
                  {op.referencia && <p className="text-slate-500 truncate">{op.referencia}</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ProveedoresRequisitosPage() {
  const { user } = useSession();
  const puedeCrear = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_CREAR);
  const puedeEditar = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_EDITAR);
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_ELIMINAR);
  const puedeConfigurar = puedeCrear || puedeEditar || puedeEliminar;

  const [proveedorId, setProveedorIdState] = useState(leerProveedorRecordado);
  const setProveedorId = (id: string) => {
    setProveedorIdState(id);
    try {
      if (id) sessionStorage.setItem(CLAVE_PROVEEDOR_RECORDADO, id);
      else sessionStorage.removeItem(CLAVE_PROVEEDOR_RECORDADO);
    } catch {
      // Almacenamiento no disponible (modo privado, etc.) — la selección
      // simplemente no sobrevive a cambiar de módulo, sin romper la página.
    }
  };
  const {
    opciones: proveedorOpciones,
    loading: buscandoProveedores,
    buscar: buscarProveedores,
  } = useProveedorBusqueda();

  const {
    proveedor,
    requisitos,
    loading,
    crearRequisito,
    actualizarRequisito,
    eliminarRequisito,
    actualizarConfiguracionProveedor,
  } = useRequisitosProveedor(proveedorId || undefined, true);

  const {
    proveedores: proveedoresConfigurados,
    loading: cargandoConfigurados,
    refresh: refrescarConfigurados,
  } = useProveedoresConfigurados();

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [guardandoPais, setGuardandoPais] = useState(false);
  const [nuevoMaterial, setNuevoMaterial] = useState("");
  const [guardandoMateriales, setGuardandoMateriales] = useState(false);

  const handleCambiarPais = async (pais: string) => {
    setGuardandoPais(true);
    try {
      await actualizarConfiguracionProveedor({ paisOrigen: pais });
      toast.success("País de origen actualizado.");
      refrescarConfigurados();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el país de origen.");
    } finally {
      setGuardandoPais(false);
    }
  };

  const handleAgregarMaterial = async (textoDirecto?: string) => {
    const material = (textoDirecto ?? nuevoMaterial).trim();
    if (!material || !proveedor) return;
    if (proveedor.materialesHabituales.includes(material)) {
      setNuevoMaterial("");
      return;
    }
    setGuardandoMateriales(true);
    try {
      await actualizarConfiguracionProveedor({
        materialesHabituales: [...proveedor.materialesHabituales, material],
      });
      setNuevoMaterial("");
      refrescarConfigurados();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al agregar el material.");
    } finally {
      setGuardandoMateriales(false);
    }
  };

  const handleQuitarMaterial = async (material: string) => {
    if (!proveedor) return;
    setGuardandoMateriales(true);
    try {
      await actualizarConfiguracionProveedor({
        materialesHabituales: proveedor.materialesHabituales.filter((m) => m !== material),
      });
      refrescarConfigurados();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al quitar el material.");
    } finally {
      setGuardandoMateriales(false);
    }
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<RequisitoProveedorImportacion | null>(null);
  const [form, setForm] = useState<NuevoRequisitoProveedor>({ ...formVacio });
  const [guardando, setGuardando] = useState(false);
  const [requisitoAEliminar, setRequisitoAEliminar] =
    useState<RequisitoProveedorImportacion | null>(null);

  const abrirCrear = () => {
    setEditando(null);
    setForm({ ...formVacio, orden: requisitos.length });
    setModalOpen(true);
  };

  const abrirEditar = (r: RequisitoProveedorImportacion) => {
    setEditando(r);
    setForm({
      tipo: r.tipo,
      nombre: r.nombre,
      descripcion: r.descripcion ?? "",
      obligatorio: r.obligatorio,
      orden: r.orden,
    });
    setModalOpen(true);
  };

  const handleGuardar = async () => {
    if (!form.nombre.trim()) {
      toast.error("El nombre del requisito es obligatorio.");
      return;
    }
    setGuardando(true);
    try {
      if (editando) {
        await actualizarRequisito(editando.id, form);
        toast.success("Requisito actualizado.");
      } else {
        await crearRequisito(form);
        toast.success("Requisito creado.");
      }
      setModalOpen(false);
      refrescarConfigurados();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el requisito.");
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleActivo = async (r: RequisitoProveedorImportacion) => {
    try {
      await actualizarRequisito(r.id, { activo: !r.activo });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cambiar el estado.");
    }
  };

  const handleEliminar = async () => {
    if (!requisitoAEliminar) return;
    try {
      await eliminarRequisito(requisitoAEliminar.id);
      toast.success("Requisito eliminado.");
      setRequisitoAEliminar(null);
      refrescarConfigurados();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar el requisito.");
    }
  };

  const requisitosOrdenados = requisitos.slice().sort((a, b) => a.orden - b.orden);

  return (
    <AppShell
      title="Proveedores y Requisitos"
      description="País de origen, materiales habituales y requisitos de importación por proveedor."
    >
      <div className="panel bg-white border-slate-200 rounded-lg p-5 shadow-2xs">
        <Label className="block text-xs font-semibold text-slate-700 mb-1.5">Proveedor</Label>
        <Combobox
          value={proveedorId}
          onValueChange={setProveedorId}
          placeholder="Buscar proveedor por nombre o NIT..."
          searchPlaceholder="Buscar por nombre o NIT..."
          emptyText="Ningún proveedor coincide."
          onSearchChange={buscarProveedores}
          loadingOptions={buscandoProveedores}
          selectedLabel={proveedor?.nombre}
          options={proveedorOpciones.map((p) => ({
            value: p.id,
            label: `${p.nombre} (NIT ${p.nit})`,
          }))}
          className="max-w-md"
        />
        {proveedor?.nit && <p className="mt-1 text-[11px] text-slate-500">NIT {proveedor.nit}</p>}
      </div>

      {!proveedorId ? (
        <div className="mt-4">
          <EmptyState
            icon={Truck}
            title="Selecciona un proveedor"
            description="Elige un proveedor arriba para ver y administrar su configuración de importación."
          />
        </div>
      ) : (
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs mt-4">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 bg-slate-50/80">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Configuración de {proveedor?.nombre}
            </h3>
            {puedeConfigurar && (
              <Button
                size="xs"
                onClick={() => setConfigModalOpen(true)}
                className="h-7 text-[11px] font-bold gap-1"
              >
                <Settings className="h-3 w-3" /> Configurar
              </Button>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Cargando...</div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500">País de origen</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {proveedor?.paisOrigen ?? "Sin configurar"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500">
                    Materiales habituales
                  </p>
                  {proveedor && proveedor.materialesHabituales.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {proveedor.materialesHabituales.map((m) => (
                        <Badge
                          key={m}
                          variant="outline"
                          className="border-slate-300 bg-slate-50 text-slate-700 text-[10px]"
                        >
                          {m}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">Sin materiales registrados.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">
                  Requisitos de importación
                </p>
                {requisitosOrdenados.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Este proveedor no tiene requisitos registrados todavía.
                  </p>
                ) : (
                  <ul className="rounded-md border border-slate-200 divide-y divide-slate-100">
                    {requisitosOrdenados.map((r) => (
                      <li
                        key={r.id}
                        className={`flex items-center gap-3 px-3 py-2 ${!r.activo ? "opacity-50" : ""}`}
                      >
                        <Badge
                          variant="outline"
                          className="border-slate-300 bg-slate-50 text-slate-600 text-[10px] shrink-0"
                        >
                          {etiquetaTipo(r.tipo)}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {r.nombre}
                          </p>
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
                        {!r.activo && (
                          <Badge
                            variant="outline"
                            className="border-slate-300 bg-slate-100 text-slate-500 text-[10px] shrink-0"
                          >
                            Inactivo
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Proveedores ya configurados — quedan aquí de una vez, sin tener que
          volver a buscarlos en el selector cada vez que se entra a la página. */}
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs mt-4">
        <div className="border-b border-slate-200 p-4 bg-slate-50/80">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
            Proveedores configurados
          </h3>
        </div>
        {cargandoConfigurados ? (
          <div className="p-8 text-center text-xs text-slate-500">Cargando...</div>
        ) : proveedoresConfigurados.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Todavía no has configurado ningún proveedor — selecciona uno arriba para empezar.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {proveedoresConfigurados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setProveedorId(p.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${
                    p.id === proveedorId ? "bg-blue-50/60" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 truncate">{p.nombre}</p>
                    <p className="text-[11px] text-slate-500">NIT {p.nit}</p>
                  </div>
                  {p.paisOrigen && (
                    <Badge
                      variant="outline"
                      className="border-slate-300 bg-slate-50 text-slate-700 text-[10px] shrink-0"
                    >
                      {p.paisOrigen}
                    </Badge>
                  )}
                  {p.materialesHabituales.length > 0 && (
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {p.materialesHabituales.length} material
                      {p.materialesHabituales.length === 1 ? "" : "es"}
                    </span>
                  )}
                  {p.totalRequisitos > 0 && (
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {p.totalRequisitos} requisito{p.totalRequisitos === 1 ? "" : "s"}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* MODAL CONFIGURACIÓN DE PROVEEDOR — país, materiales y requisitos, todo junto. */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-white border-slate-200 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              Configuración de proveedor
            </DialogTitle>
            <DialogDescription className="text-slate-500">{proveedor?.nombre}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">País de origen</Label>
              <Select
                value={proveedor?.paisOrigen ?? undefined}
                onValueChange={handleCambiarPais}
                disabled={guardandoPais || !puedeEditar}
              >
                <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                  <SelectValue placeholder="Sin configurar..." />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 max-h-64">
                  {PAISES.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Materiales que usualmente se importan
              </Label>
              {puedeEditar && (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <MaterialAutocomplete
                      value={nuevoMaterial}
                      onChange={setNuevoMaterial}
                      onSeleccionar={(descripcion) => handleAgregarMaterial(descripcion)}
                      onEnter={() => handleAgregarMaterial()}
                      disabled={guardandoMateriales}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleAgregarMaterial()}
                    disabled={guardandoMateriales || !nuevoMaterial.trim()}
                    className="h-9 shrink-0 gap-1.5 text-xs font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {proveedor && proveedor.materialesHabituales.length === 0 && (
                  <p className="text-[11px] text-slate-500">Sin materiales registrados.</p>
                )}
                {proveedor?.materialesHabituales.map((m) => (
                  <Badge
                    key={m}
                    variant="outline"
                    className="border-slate-300 bg-slate-50 text-slate-700 gap-1 pr-1"
                  >
                    {m}
                    {puedeEditar && (
                      <button
                        type="button"
                        onClick={() => handleQuitarMaterial(m)}
                        disabled={guardandoMateriales}
                        aria-label={`Quitar ${m}`}
                        className="rounded-full p-0.5 hover:bg-slate-200 text-slate-500 hover:text-slate-900"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">
                  Requisitos de importación
                </Label>
                {puedeCrear && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={abrirCrear}
                    className="h-7 text-[11px] font-bold gap-1"
                  >
                    <Plus className="h-3 w-3" /> Agregar requisito
                  </Button>
                )}
              </div>

              {requisitosOrdenados.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  Este proveedor no tiene requisitos registrados todavía.
                </p>
              ) : (
                <ul className="rounded-md border border-slate-200 divide-y divide-slate-100">
                  {requisitosOrdenados.map((r) => (
                    <li
                      key={r.id}
                      className={`flex items-center gap-3 px-3 py-2 ${!r.activo ? "opacity-50" : ""}`}
                    >
                      <span className="w-5 shrink-0 text-center text-[11px] font-mono text-slate-400">
                        {r.orden}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-slate-300 bg-slate-50 text-slate-600 text-[10px] shrink-0"
                      >
                        {etiquetaTipo(r.tipo)}
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
                      {puedeEditar && (
                        <Switch
                          checked={r.activo}
                          onCheckedChange={() => handleToggleActivo(r)}
                          aria-label={r.activo ? "Desactivar" : "Activar"}
                        />
                      )}
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => abrirEditar(r)}
                          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 shrink-0"
                        >
                          Editar
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          type="button"
                          onClick={() => setRequisitoAEliminar(r)}
                          className="text-slate-400 hover:text-slate-900 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" size="sm" onClick={() => setConfigModalOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL NUEVO/EDITAR REQUISITO — se abre sobre "Configuración de proveedor". */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              {editando ? "Editar requisito" : "Nuevo requisito"}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Para {proveedor?.nombre}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Tipo *</Label>
                <Select value={form.tipo} onValueChange={(val) => setForm({ ...form, tipo: val })}>
                  <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {TIPOS_REQUISITO.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Orden</Label>
                <Input
                  type="number"
                  value={form.orden ?? 0}
                  onChange={(e) => setForm({ ...form, orden: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Nombre *</Label>
              <Input
                required
                placeholder='Ej: "Certificado de origen"'
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Descripción</Label>
              <Textarea
                value={form.descripcion ?? ""}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className="text-xs border-slate-300"
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.obligatorio ?? true}
                onCheckedChange={(checked) => setForm({ ...form, obligatorio: checked })}
              />
              <Label className="text-xs font-semibold text-slate-700">
                Obligatorio para completar la solicitud
              </Label>
            </div>
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

      <Dialog
        open={!!requisitoAEliminar}
        onOpenChange={(open) => !open && setRequisitoAEliminar(null)}
      >
        <DialogContent className="bg-white border-slate-200 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Eliminar requisito</DialogTitle>
            <DialogDescription className="text-slate-500">
              ¿Eliminar "{requisitoAEliminar?.nombre}"? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRequisitoAEliminar(null)}
            >
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleEliminar}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
