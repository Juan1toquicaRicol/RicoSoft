import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Building2,
  FileText,
  History,
  Pencil,
  Power,
  Receipt,
  TrendingUp,
  Truck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money, PeriodicidadServicio } from "@/lib/data";
import { siglaEmpresa } from "@/lib/tenant-context";
import { useServicio, useServicios } from "@/hooks/use-servicios";
import { useFacturasPorServicio } from "@/hooks/use-facturas";
import { useProveedorBusqueda } from "@/hooks/use-proveedores";
import { useDepartamentosPublico } from "@/hooks/use-departamentos-publico";
import { useUsuariosPorDepartamento } from "@/hooks/use-usuarios-por-departamento";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/servicios/$id")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.SERVICIOS_VER),
  head: () => ({
    meta: [
      { title: "Detalle de Servicio | RicoSoft" },
      { name: "description", content: "Facturas relacionadas y costo histórico del servicio." },
    ],
  }),
  component: DetalleServicio,
});

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function DetalleServicio() {
  const { id } = Route.useParams();
  const { servicio, loading, error, refresh } = useServicio(id);
  const { facturas, loading: cargandoFacturas } = useFacturasPorServicio(id, 20);
  const { toggleEstadoSuscripcion } = useServicios();
  const { user } = useSession();

  const puedeEditar = hasPermission(user, PERMISOS_SISTEMA.SERVICIOS_EDITAR);

  // Costo histórico: agrupa las facturas relacionadas por mes calendario y
  // suma su total. Con esto ya se puede detectar si el costo subió o bajó
  // mes a mes, sin necesitar un gráfico (la variación se marca con ↑ / ↓).
  const costoHistorico = useMemo(() => {
    const porMes = new Map<string, { year: number; month: number; total: number }>();
    for (const f of facturas) {
      const d = new Date(f.fecha);
      const clave = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      const actual = porMes.get(clave) ?? {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        total: 0,
      };
      actual.total += f.total;
      porMes.set(clave, actual);
    }
    return [...porMes.values()]
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map((m, i, arr) => ({
        label: `${MESES[m.month]} ${m.year}`,
        total: m.total,
        variacion: i > 0 ? m.total - arr[i - 1].total : 0,
      }));
  }, [facturas]);

  const [alternandoEstado, setAlternandoEstado] = useState(false);

  const handleToggleEstado = async () => {
    if (!servicio) return;
    setAlternandoEstado(true);
    try {
      await toggleEstadoSuscripcion(servicio.id);
      await refresh();
      toast.success(`Servicio ${servicio.estado === "Activo" ? "desactivado" : "activado"}.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el servicio.");
    } finally {
      setAlternandoEstado(false);
    }
  };

  if (loading && !servicio) {
    return (
      <AppShell title="Cargando servicio..." description="RicoSoft Contabilidad">
        <div className="panel p-12 text-center text-xs text-slate-500 bg-white border-slate-200 shadow-2xs">
          Cargando...
        </div>
      </AppShell>
    );
  }

  if (!servicio) {
    return (
      <AppShell title="Servicio no encontrado" description="RicoSoft Contabilidad">
        <div className="panel p-12 text-center text-xs text-slate-500 bg-white border-slate-200 shadow-2xs">
          <p className="font-semibold text-base mb-2">Servicio no registrado</p>
          <p>{error || `No se encontró el servicio ${id} en esta empresa.`}</p>
          <Link to="/servicios" className="mt-4 inline-block">
            <Button size="sm">Volver a Servicios</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={servicio.nombreServicio}
      description={`${servicio.proveedor} · ${servicio.area}`}
      actions={
        <>
          <Link to="/servicios">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          {puedeEditar && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleEstado}
              disabled={alternandoEstado}
              className="gap-2"
            >
              <Power className="h-4 w-4" />{" "}
              {alternandoEstado ? "..." : servicio.estado === "Activo" ? "Desactivar" : "Activar"}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <DatosServicioPanel servicio={servicio} puedeEditar={puedeEditar} onChange={refresh} />

          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold">
              <Receipt className="h-4 w-4 text-slate-500" /> Facturas relacionadas
            </h2>
            {cargandoFacturas ? (
              <p className="text-xs text-slate-500">Cargando facturas...</p>
            ) : facturas.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <FileText className="mx-auto mb-2 h-7 w-7 opacity-30" />
                Este servicio todavía no tiene facturas asociadas.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-100/80">
                    <TableRow className="hover:bg-slate-100/80">
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold py-2.5 pr-3">
                        Factura
                      </TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold py-2.5 pr-3">
                        Emisión
                      </TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold py-2.5 pr-3">
                        Vencimiento
                      </TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold py-2.5 pr-3 text-right">
                        Valor
                      </TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold py-2.5 pr-3">
                        Estado
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-slate-800 font-medium">
                    {facturas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="py-2.5 pr-3">
                          <Link
                            to="/facturas/$id"
                            params={{ id: f.id }}
                            className="font-bold text-blue-800 hover:underline"
                          >
                            {f.numero}
                          </Link>
                        </TableCell>
                        <TableCell className="py-2.5 pr-3 font-mono text-slate-500">
                          {new Date(f.fecha).toLocaleDateString("es-CO", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell className="py-2.5 pr-3 font-mono text-slate-500">
                          {new Date(f.vence).toLocaleDateString("es-CO", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell className="num py-2.5 pr-3 text-right font-bold text-slate-900">
                          {money(f.total, f.moneda)}
                        </TableCell>
                        <TableCell className="py-2.5 pr-3">
                          <EstadoBadge estado={f.estado} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-slate-500" /> Costo Histórico
            </h2>
            {costoHistorico.length === 0 ? (
              <p className="text-xs text-slate-500">
                Sin facturas suficientes para mostrar histórico.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {costoHistorico.map((m) => (
                  <li key={m.label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{m.label}</span>
                    <span className="flex items-center gap-1.5 font-semibold">
                      {money(m.total)}
                      {m.variacion > 0 && (
                        <span
                          className="flex items-center text-slate-900"
                          title={`Subió ${money(m.variacion)} vs. el mes anterior`}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </span>
                      )}
                      {m.variacion < 0 && (
                        <span
                          className="flex items-center text-slate-400"
                          title={`Bajó ${money(-m.variacion)} vs. el mes anterior`}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-5 space-y-3 bg-white border-slate-200 shadow-2xs">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-slate-500" /> Relaciones
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Truck className="h-3.5 w-3.5" /> Proveedor:{" "}
              <span className="font-semibold text-slate-900">{servicio.proveedor}</span>
            </div>
          </div>

          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold">
              <History className="h-4 w-4 text-slate-500" /> Usos y Actividad
            </h2>
            <HistorialServicio historial={servicio.historial ?? []} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

interface DatosServicioPanelProps {
  servicio: import("@/lib/data").ServicioSuscripcion;
  puedeEditar: boolean;
  onChange: () => void;
}

/**
 * Panel "Datos del Servicio", editable en línea (mismo patrón que
 * CondicionesPagoFactura en facturas.$id.tsx): vista de solo lectura por
 * defecto, que se convierte en formulario al hacer clic en "Editar", sin
 * salir de esta página ni depender del modal del listado.
 */
function DatosServicioPanel({ servicio, puedeEditar, onChange }: DatosServicioPanelProps) {
  const { actualizarSuscripcion } = useServicios();
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [proveedorSeleccionadoNombre, setProveedorSeleccionadoNombre] = useState<
    string | undefined
  >(servicio.proveedor);
  const {
    opciones: proveedorOpciones,
    loading: buscandoProveedores,
    buscar: buscarProveedores,
  } = useProveedorBusqueda();
  const { departamentos } = useDepartamentosPublico();

  const [form, setForm] = useState({
    area: servicio.area,
    nombreServicio: servicio.nombreServicio,
    proveedorId: servicio.proveedorId || "",
    periodicidad: servicio.periodicidad,
    costo: servicio.costo,
    moneda: servicio.moneda,
    fechaRenovacion: servicio.fechaRenovacion.split("T")[0],
    responsableId: servicio.responsableId || "",
  });

  const areaDepartamentoId = departamentos.find((d) => d.nombre === form.area)?.id;
  const { usuarios: usuariosArea, loading: cargandoUsuariosArea } =
    useUsuariosPorDepartamento(areaDepartamentoId);

  const handleAbrir = () => {
    setForm({
      area: servicio.area,
      nombreServicio: servicio.nombreServicio,
      proveedorId: servicio.proveedorId || "",
      periodicidad: servicio.periodicidad,
      costo: servicio.costo,
      moneda: servicio.moneda,
      fechaRenovacion: servicio.fechaRenovacion.split("T")[0],
      responsableId: servicio.responsableId || "",
    });
    setProveedorSeleccionadoNombre(servicio.proveedor);
    setEditando(true);
  };

  const handleGuardar = async () => {
    if (!form.nombreServicio || !form.proveedorId) {
      toast.error("Nombre del servicio y proveedor son obligatorios.");
      return;
    }
    if (!form.responsableId) {
      toast.error("Selecciona el responsable del departamento.");
      return;
    }
    setGuardando(true);
    try {
      await actualizarSuscripcion(servicio.id, {
        empresaId: servicio.empresaId,
        area: form.area,
        nombreServicio: form.nombreServicio,
        descripcion: servicio.descripcion ?? undefined,
        proveedorId: form.proveedorId,
        periodicidad: form.periodicidad,
        costo: Number(form.costo),
        moneda: form.moneda,
        fechaInicio: servicio.fechaInicio ?? undefined,
        fechaFin: servicio.fechaFin ?? undefined,
        diaVencimiento: servicio.diaVencimiento ?? undefined,
        fechaRenovacion: form.fechaRenovacion,
        responsableId: form.responsableId,
        observaciones: servicio.observaciones ?? undefined,
      });
      await onChange();
      toast.success("Servicio actualizado.");
      setEditando(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al editar el servicio.");
    } finally {
      setGuardando(false);
    }
  };

  const campos = [
    ["Proveedor", servicio.proveedor],
    ["Departamento", servicio.area],
    ["Empresa", siglaEmpresa(servicio.empresaId)],
    ["Periodicidad", servicio.periodicidad],
    ["Responsable", servicio.responsableArea],
    [
      "Próxima renovación",
      new Date(servicio.fechaRenovacion).toLocaleDateString("es-CO", { timeZone: "UTC" }),
    ],
    ...(servicio.diaVencimiento
      ? [["Día de vencimiento", `Día ${servicio.diaVencimiento} de cada mes`]]
      : []),
    ...(servicio.fechaInicio
      ? [
          [
            "Activo desde",
            new Date(servicio.fechaInicio).toLocaleDateString("es-CO", { timeZone: "UTC" }),
          ],
        ]
      : []),
    ...(servicio.fechaFin
      ? [
          [
            "Fecha de finalización",
            new Date(servicio.fechaFin).toLocaleDateString("es-CO", { timeZone: "UTC" }),
          ],
        ]
      : []),
  ] as [string, string][];

  return (
    <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 mb-4">
        <h2 className="text-sm font-semibold">Datos del Servicio</h2>
        <div className="flex items-center gap-2">
          <EstadoBadge estado={servicio.estado} />
          {puedeEditar && !editando && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="gap-1.5"
              onClick={handleAbrir}
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
          )}
        </div>
      </div>

      {!editando ? (
        <>
          {servicio.descripcion && (
            <p className="mb-4 text-sm text-slate-500">{servicio.descripcion}</p>
          )}

          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {campos.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Valor recurrente</p>
            <p className="num text-xl font-bold text-blue-800">
              {money(servicio.costo, servicio.moneda)}
            </p>
          </div>

          {servicio.observaciones && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              {servicio.observaciones}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Nombre del Servicio / SaaS *
              </Label>
              <Input
                value={form.nombreServicio}
                onChange={(e) => setForm({ ...form, nombreServicio: e.target.value })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Proveedor *</Label>
              <Combobox
                value={form.proveedorId}
                onValueChange={(val) => {
                  setForm({ ...form, proveedorId: val });
                  const elegido = proveedorOpciones.find((p) => p.id === val);
                  if (elegido) setProveedorSeleccionadoNombre(elegido.nombre);
                }}
                placeholder="Escribe para buscar un proveedor..."
                searchPlaceholder="Buscar por nombre o NIT..."
                emptyText="Ningún proveedor coincide."
                clearable={false}
                onSearchChange={buscarProveedores}
                loadingOptions={buscandoProveedores}
                selectedLabel={proveedorSeleccionadoNombre}
                options={proveedorOpciones.map((p) => ({ value: p.id, label: p.nombre }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Departamento Categorizado *
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
              <Label className="text-xs font-semibold text-slate-700">
                Responsable del Departamento *
              </Label>
              <Select
                value={form.responsableId}
                onValueChange={(val) => setForm({ ...form, responsableId: val })}
                disabled={!areaDepartamentoId || cargandoUsuariosArea || usuariosArea.length === 0}
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

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Costo (Monto)</Label>
              <Input
                type="number"
                value={form.costo}
                onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })}
                className="h-9 text-xs border-slate-300"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Moneda</Label>
              <Select
                value={form.moneda}
                onValueChange={(val: "COP" | "USD") => setForm({ ...form, moneda: val })}
              >
                <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="COP">COP ($)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Periodicidad</Label>
              <Select
                value={form.periodicidad}
                onValueChange={(val: PeriodicidadServicio) =>
                  setForm({ ...form, periodicidad: val })
                }
              >
                <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="Mensual">Mensual</SelectItem>
                  <SelectItem value="Anual">Anual</SelectItem>
                  <SelectItem value="Trimestral">Trimestral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Próxima Fecha de Pago</Label>
            <Input
              type="date"
              value={form.fechaRenovacion}
              onChange={(e) => setForm({ ...form, fechaRenovacion: e.target.value })}
              className="h-9 text-xs border-slate-300 max-w-[220px]"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditando(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleGuardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Usos y Actividad": timeline de lo que ha pasado con este servicio
 * (creación, ediciones, activaciones/desactivaciones), reconstruido en el
 * backend a partir de Auditoria — responde "cuándo se activó" sin necesitar
 * una tabla de historial propia (mismo patrón que la trazabilidad de
 * Solicitudes de Compra).
 */
function HistorialServicio({
  historial,
}: {
  historial: { fecha: string; actor: string; accion: string; detalle?: string }[];
}) {
  if (historial.length === 0) {
    return <p className="text-xs text-slate-500">Sin actividad registrada todavía.</p>;
  }

  const ETIQUETAS: Record<string, string> = {
    SERVICIO_CREADO: "Servicio creado",
    SERVICIO_EDITADO: "Datos editados",
    SERVICIO_ESTADO_CAMBIADO: "Estado cambiado",
  };

  return (
    <ol className="space-y-4">
      {historial.map((ev, i) => (
        <li key={i} className="relative pl-6">
          <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-blue-800" />
          {i < historial.length - 1 && (
            <span className="absolute left-[4.5px] top-5 h-[calc(100%+0.5rem)] w-px bg-border" />
          )}
          <p className="text-xs font-semibold">{ETIQUETAS[ev.accion] ?? ev.accion}</p>
          <p className="text-[10px] text-slate-500">
            {new Date(ev.fecha).toLocaleString("es-CO")} · {ev.actor}
          </p>
          {ev.detalle && <p className="mt-1 text-xs text-slate-500 italic">{ev.detalle}</p>}
        </li>
      ))}
    </ol>
  );
}
