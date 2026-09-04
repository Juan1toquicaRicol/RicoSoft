import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { Tags, Plus, ChevronLeft, ChevronRight, Cloud } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import {
  useClasificacionesFuncionales,
  useItemsConClasificacion,
  type ClasificacionFuncionalItem,
  type ItemConClasificacion,
} from "@/hooks/use-item-clasificaciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

const TODAS = "__todas__";
const SIN_CLASIFICAR = "__sin_clasificar__";

export const Route = createFileRoute("/configuracion/clasificacion-items")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.CONFIGURACION_VER),
  component: ClasificacionItemsPage,
});

function ClasificacionItemsPage() {
  const { user: sesion } = useSession();
  const puedeEditar = hasPermission(sesion, PERMISOS_SISTEMA.CONFIGURACION_EDITAR);

  const {
    clasificaciones,
    loading: loadingClasificaciones,
    crearClasificacion,
    actualizarClasificacion,
    cambiarActivo,
  } = useClasificacionesFuncionales();

  const {
    items,
    disponible,
    motivo,
    total,
    page,
    totalPages,
    loading: loadingItems,
    error,
    refresh,
    actualizarClasificacionesDeItem,
    asignacionMasiva,
  } = useItemsConClasificacion();

  const [tab, setTab] = useState<"clasificaciones" | "items">("items");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <Tags className="h-6 w-6 text-blue-600" />
          Clasificación de ítems
        </h1>
        <p className="text-sm text-slate-500">
          Define en qué partes de RicoSoft debe gestionarse cada ítem del catálogo. Esta
          clasificación es configuración propia de RicoSoft: nunca modifica el maestro de ítems.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("items")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "items"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Clasificar ítems
        </button>
        <button
          onClick={() => setTab("clasificaciones")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "clasificaciones"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Clasificaciones
        </button>
      </div>

      {tab === "clasificaciones" ? (
        <PanelClasificaciones
          clasificaciones={clasificaciones}
          loading={loadingClasificaciones}
          puedeEditar={puedeEditar}
          crearClasificacion={crearClasificacion}
          actualizarClasificacion={actualizarClasificacion}
          cambiarActivo={cambiarActivo}
        />
      ) : (
        <PanelItems
          clasificaciones={clasificaciones}
          items={items}
          disponible={disponible}
          motivo={motivo}
          total={total}
          page={page}
          totalPages={totalPages}
          loading={loadingItems}
          error={error}
          refresh={refresh}
          puedeEditar={puedeEditar}
          actualizarClasificacionesDeItem={actualizarClasificacionesDeItem}
          asignacionMasiva={asignacionMasiva}
        />
      )}
    </div>
  );
}

function PanelClasificaciones({
  clasificaciones,
  loading,
  puedeEditar,
  crearClasificacion,
  actualizarClasificacion,
  cambiarActivo,
}: {
  clasificaciones: ClasificacionFuncionalItem[];
  loading: boolean;
  puedeEditar: boolean;
  crearClasificacion: (data: {
    codigo: string;
    nombre: string;
    descripcion?: string;
  }) => Promise<unknown>;
  actualizarClasificacion: (
    id: string,
    data: { nombre?: string; descripcion?: string },
  ) => Promise<void>;
  cambiarActivo: (id: string, activo: boolean) => Promise<void>;
}) {
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState({ codigo: "", nombre: "", descripcion: "" });
  const [editando, setEditando] = useState<ClasificacionFuncionalItem | null>(null);
  const [formEdicion, setFormEdicion] = useState({ nombre: "", descripcion: "" });

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nueva.codigo.trim() || !nueva.nombre.trim()) return;
    setGuardando(true);
    try {
      await crearClasificacion(nueva);
      toast.success(`Clasificación "${nueva.nombre}" creada.`);
      setNueva({ codigo: "", nombre: "", descripcion: "" });
      setCreando(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear la clasificación.");
    } finally {
      setGuardando(false);
    }
  };

  const handleAbrirEdicion = (c: ClasificacionFuncionalItem) => {
    setEditando(c);
    setFormEdicion({ nombre: c.nombre, descripcion: c.descripcion || "" });
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    try {
      await actualizarClasificacion(editando.id, formEdicion);
      toast.success("Clasificación actualizada.");
      setEditando(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar la clasificación.");
    }
  };

  const handleToggleActivo = async (c: ClasificacionFuncionalItem) => {
    try {
      await cambiarActivo(c.id, !c.activo);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar la clasificación.");
    }
  };

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreando((c) => !c)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nueva clasificación
          </Button>
        </div>
      )}

      {creando && (
        <form
          onSubmit={handleCrear}
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <Input
            required
            placeholder="Código (ej. LOGISTICA) *"
            value={nueva.codigo}
            onChange={(e) => setNueva({ ...nueva, codigo: e.target.value })}
          />
          <Input
            required
            placeholder="Nombre visible (ej. Logística) *"
            value={nueva.nombre}
            onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
          />
          <Input
            placeholder="Descripción (opcional)"
            value={nueva.descripcion}
            onChange={(e) => setNueva({ ...nueva, descripcion: e.target.value })}
            className="sm:col-span-2"
          />
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="success" disabled={guardando}>
              {guardando ? "Guardando..." : "Crear clasificación"}
            </Button>
          </div>
        </form>
      )}

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Ítems asociados</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clasificaciones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-500 py-6">
                  {loading ? "Cargando clasificaciones..." : "No hay clasificaciones registradas."}
                </TableCell>
              </TableRow>
            ) : (
              clasificaciones.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-slate-800">{c.nombre}</TableCell>
                  <TableCell className="text-slate-600">{c.descripcion || "—"}</TableCell>
                  <TableCell className="text-slate-600">{c.itemsAsociados}</TableCell>
                  <TableCell>
                    {c.activo ? (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                        Activa
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-slate-900 text-white"
                      >
                        Inactiva
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {puedeEditar && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleAbrirEdicion(c)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleToggleActivo(c)}>
                          {c.activo ? "Desactivar" : "Activar"}
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Editar clasificación — {editando?.nombre}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGuardarEdicion} className="space-y-3">
            <Input
              placeholder="Nombre"
              value={formEdicion.nombre}
              onChange={(e) => setFormEdicion({ ...formEdicion, nombre: e.target.value })}
            />
            <Input
              placeholder="Descripción"
              value={formEdicion.descripcion}
              onChange={(e) => setFormEdicion({ ...formEdicion, descripcion: e.target.value })}
            />
            <DialogFooter>
              <Button type="submit" variant="success">
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PanelItems({
  clasificaciones,
  items,
  disponible,
  motivo,
  total,
  page,
  totalPages,
  loading,
  error,
  refresh,
  puedeEditar,
  actualizarClasificacionesDeItem,
  asignacionMasiva,
}: {
  clasificaciones: ClasificacionFuncionalItem[];
  items: ItemConClasificacion[];
  disponible: boolean;
  motivo: string;
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string;
  refresh: (opts?: {
    search?: string;
    page?: number;
    clasificacionId?: string;
    sinClasificar?: boolean;
  }) => Promise<void>;
  puedeEditar: boolean;
  actualizarClasificacionesDeItem: (itemRowId: number, clasificacionIds: string[]) => Promise<void>;
  asignacionMasiva: (
    itemRowIds: number[],
    clasificacionId: string,
    accion: "asignar" | "quitar",
  ) => Promise<{ solicitados: number; afectados: number; mensaje: string }>;
}) {
  const [search, setSearch] = useState("");
  const [filtroClasificacion, setFiltroClasificacion] = useState(TODAS);
  const [editandoItem, setEditandoItem] = useState<ItemConClasificacion | null>(null);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [clasificacionMasiva, setClasificacionMasiva] = useState("");
  const [aplicandoMasiva, setAplicandoMasiva] = useState(false);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const aplicarFiltros = (overrides?: { search?: string; filtroClasificacion?: string }) => {
    const s = overrides?.search ?? search;
    const f = overrides?.filtroClasificacion ?? filtroClasificacion;
    refresh({
      search: s,
      page: 1,
      clasificacionId: f !== TODAS && f !== SIN_CLASIFICAR ? f : undefined,
      sinClasificar: f === SIN_CLASIFICAR,
    });
  };

  const handleBuscar = (valor: string) => {
    setSearch(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => aplicarFiltros({ search: valor }), 300);
  };

  const handleCambiarFiltro = (valor: string) => {
    setFiltroClasificacion(valor);
    aplicarFiltros({ filtroClasificacion: valor });
  };

  const handleCambiarPagina = (nuevaPagina: number) => {
    refresh({
      search,
      page: nuevaPagina,
      clasificacionId:
        filtroClasificacion !== TODAS && filtroClasificacion !== SIN_CLASIFICAR
          ? filtroClasificacion
          : undefined,
      sinClasificar: filtroClasificacion === SIN_CLASIFICAR,
    });
  };

  const toggleSeleccion = (itemRowId: number) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(itemRowId)) next.delete(itemRowId);
      else next.add(itemRowId);
      return next;
    });
  };

  const toggleSeleccionarTodos = () => {
    setSeleccion((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.itemRowId)),
    );
  };

  const handleAplicarMasiva = async () => {
    if (!clasificacionMasiva || seleccion.size === 0) return;
    setAplicandoMasiva(true);
    try {
      const resultado = await asignacionMasiva(
        Array.from(seleccion),
        clasificacionMasiva,
        "asignar",
      );
      toast.success(resultado.mensaje);
      setSeleccion(new Set());
      setClasificacionMasiva("");
      await refresh({ search, page });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al aplicar la clasificación masiva.");
    } finally {
      setAplicandoMasiva(false);
    }
  };

  if (!disponible) {
    return (
      <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg p-6 text-center">
        {motivo || "No fue posible conectar con el catálogo de ítems."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por descripción o referencia..."
          value={search}
          onChange={(e) => handleBuscar(e.target.value)}
          className="max-w-md flex-1 min-w-[220px]"
        />
        <Select value={filtroClasificacion} onValueChange={handleCambiarFiltro}>
          <SelectTrigger className="w-56 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white border-slate-200">
            <SelectItem value={TODAS}>Todas las clasificaciones</SelectItem>
            <SelectItem value={SIN_CLASIFICAR}>Sin clasificar</SelectItem>
            {clasificaciones
              .filter((c) => c.activo)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {total > 0 && <span className="text-xs text-slate-500">{total} ítem(s) encontrados</span>}
      </div>

      {puedeEditar && seleccion.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <span className="text-sm text-blue-800 font-medium">
            {seleccion.size} ítem(s) seleccionados
          </span>
          <Select value={clasificacionMasiva} onValueChange={setClasificacionMasiva}>
            <SelectTrigger className="w-56 bg-white h-8 text-xs">
              <SelectValue placeholder="Asignar clasificación..." />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              {clasificaciones
                .filter((c) => c.activo)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="success"
            disabled={!clasificacionMasiva || aplicandoMasiva}
            onClick={handleAplicarMasiva}
          >
            {aplicandoMasiva ? "Aplicando..." : "Asignar"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSeleccion(new Set())}>
            Cancelar
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              {puedeEditar && (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && seleccion.size === items.length}
                    onChange={toggleSeleccionarTodos}
                  />
                </TableHead>
              )}
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Clasificaciones</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={puedeEditar ? 5 : 4}
                  className="text-center text-slate-500 py-6"
                >
                  {loading ? "Cargando ítems..." : "No se encontraron ítems con estos filtros."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => (
                <TableRow key={it.itemRowId}>
                  {puedeEditar && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={seleccion.has(it.itemRowId)}
                        onChange={() => toggleSeleccion(it.itemRowId)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1" title="Origen: Siesa">
                      <Cloud className="h-3 w-3 text-blue-400" />
                      {it.referencia || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-800">{it.descripcion || "—"}</TableCell>
                  <TableCell>
                    {it.clasificaciones.length === 0 ? (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-50 text-slate-500"
                      >
                        Sin clasificar
                      </Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {it.clasificaciones.map((c) => (
                          <Badge
                            key={c.id}
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-blue-800"
                          >
                            {c.nombre}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {puedeEditar && (
                      <Button size="sm" variant="outline" onClick={() => setEditandoItem(it)}>
                        Clasificar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <p>
            {items.length} de {total} ítems — página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => handleCambiarPagina(page - 1)}
              className="gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => handleCambiarPagina(page + 1)}
              className="gap-1"
            >
              Siguiente <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <DialogEdicionItem
        item={editandoItem}
        clasificaciones={clasificaciones}
        onClose={() => setEditandoItem(null)}
        onGuardar={async (clasificacionIds) => {
          if (!editandoItem) return;
          await actualizarClasificacionesDeItem(editandoItem.itemRowId, clasificacionIds);
          toast.success("Clasificaciones actualizadas.");
          setEditandoItem(null);
          await refresh({ search, page });
        }}
      />
    </div>
  );
}

function DialogEdicionItem({
  item,
  clasificaciones,
  onClose,
  onGuardar,
}: {
  item: ItemConClasificacion | null;
  clasificaciones: ClasificacionFuncionalItem[];
  onClose: () => void;
  onGuardar: (clasificacionIds: string[]) => Promise<void>;
}) {
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  React.useEffect(() => {
    if (item) setSeleccionadas(new Set(item.clasificaciones.map((c) => c.id)));
  }, [item]);

  const toggle = (id: string) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGuardar = async () => {
    setGuardando(true);
    try {
      await onGuardar(Array.from(seleccionadas));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle>Clasificar ítem — {item?.descripcion || item?.referencia}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-2">
          Origen: Siesa. Solo se edita la configuración de RicoSoft — el código, la descripción y la
          unidad de este ítem se gestionan en Siesa.
        </p>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {clasificaciones
            .filter((c) => c.activo)
            .map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2.5 p-2 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={seleccionadas.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <div>
                  <div className="text-sm text-slate-800">{c.nombre}</div>
                  {c.descripcion && <div className="text-xs text-slate-500">{c.descripcion}</div>}
                </div>
              </label>
            ))}
        </div>
        <DialogFooter>
          <Button variant="success" disabled={guardando} onClick={handleGuardar}>
            {guardando ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
