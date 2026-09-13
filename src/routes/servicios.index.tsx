import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CreditCard,
  Pencil,
  Plus,
  Power,
  Trash2,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { BarraVencimiento } from "@/components/ui/barra-vencimiento";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useServicios } from "@/hooks/use-servicios";
import { useProveedorBusqueda } from "@/hooks/use-proveedores";
import { useDepartamentosPublico } from "@/hooks/use-departamentos-publico";
import { useUsuariosPorDepartamento } from "@/hooks/use-usuarios-por-departamento";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money, PeriodicidadServicio, type ServicioSuscripcion } from "@/lib/data";
import { PLAZO_CREDITO_DIAS_DEFECTO } from "@/lib/constantes-negocio";

export const Route = createFileRoute("/servicios/")({
  head: () => ({
    meta: [
      { title: "Servicios y Suscripciones | RicoSoft" },
      {
        name: "description",
        content:
          "Inventario y control de suscripciones y servicios activos categorizados por departamento y empresa.",
      },
    ],
  }),
  component: ServiciosPage,
});

function ServiciosPage() {
  const { empresaActiva, empresas } = useTenant();
  const {
    suscripciones,
    loading,
    error,
    addSuscripcion,
    actualizarSuscripcion,
    toggleEstadoSuscripcion,
    eliminarSuscripcion,
  } = useServicios();
  const {
    opciones: proveedorOpciones,
    loading: buscandoProveedores,
    buscar: buscarProveedores,
  } = useProveedorBusqueda();
  const [proveedorSeleccionadoNombre, setProveedorSeleccionadoNombre] = useState<
    string | undefined
  >();
  const { departamentos } = useDepartamentosPublico();
  const { user } = useSession();
  const empresaBloqueada =
    empresaIdDeTenant(user?.tenantNombre) || (empresaActiva !== "ALL" ? empresaActiva : null);
  const puedeEliminar = hasPermission(user, PERMISOS_SISTEMA.SERVICIOS_ELIMINAR);
  const puedeEditar = hasPermission(user, PERMISOS_SISTEMA.SERVICIOS_EDITAR);

  const [modalOpen, setModalOpen] = useState(false);
  // Servicio en edición (null = el modal está creando uno nuevo). Guardamos
  // el registro completo, no solo el id, para poder reenviar al backend los
  // campos que este formulario no expone (descripción, fechas, observaciones)
  // sin borrarlos — actualizarServicio reemplaza el registro completo.
  const [editando, setEditando] = useState<ServicioSuscripcion | null>(null);
  const [servicioAEliminar, setServicioAEliminar] = useState<{ id: string; nombre: string } | null>(
    null,
  );
  const [eliminando, setEliminando] = useState(false);
  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);

  const handleEliminarServicio = async () => {
    if (!servicioAEliminar) return;
    setEliminando(true);
    try {
      await eliminarSuscripcion(servicioAEliminar.id);
      toast.success(`Servicio "${servicioAEliminar.nombre}" eliminado.`);
      setServicioAEliminar(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar el servicio.");
    } finally {
      setEliminando(false);
    }
  };

  const [form, setForm] = useState({
    empresaId: empresaBloqueada || "RC",
    area: "Sistemas",
    nombreServicio: "",
    proveedorId: "",
    periodicidad: "Mensual" as PeriodicidadServicio,
    costo: 350000,
    moneda: "COP" as "COP" | "USD",
    fechaRenovacion: new Date(Date.now() + PLAZO_CREDITO_DIAS_DEFECTO * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    responsableId: "",
  });

  const areaDepartamentoId = departamentos.find((d) => d.nombre === form.area)?.id;
  const { usuarios: usuariosArea, loading: cargandoUsuariosArea } =
    useUsuariosPorDepartamento(areaDepartamentoId);

  const filteredSuscripciones = useMemo(() => {
    if (empresaActiva === "ALL") return suscripciones;
    return suscripciones.filter((s) => s.empresaId === empresaActiva);
  }, [suscripciones, empresaActiva]);

  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "area":
        return (s: (typeof filteredSuscripciones)[number]) => s.area;
      case "proveedor":
        return (s: (typeof filteredSuscripciones)[number]) => s.proveedor;
      case "estado":
        return (s: (typeof filteredSuscripciones)[number]) => s.estado;
      default:
        return null;
    }
  }, [agrupacion]);

  const [orden, setOrden] = useState<{ campo: CampoOrdenServicio; dir: "asc" | "desc" } | null>(
    null,
  );
  const cambiarOrden = (campo: CampoOrdenServicio) => {
    setOrden((actual) => {
      if (actual?.campo !== campo) return { campo, dir: "asc" };
      return actual.dir === "asc" ? { campo, dir: "desc" } : null;
    });
  };

  const sortedSuscripciones = useMemo(() => {
    if (!orden) return filteredSuscripciones;
    const factor = orden.dir === "asc" ? 1 : -1;
    return [...filteredSuscripciones].sort((a, b) => {
      switch (orden.campo) {
        case "servicio":
          return a.nombreServicio.localeCompare(b.nombreServicio) * factor;
        case "area":
          return a.area.localeCompare(b.area) * factor;
        case "costo":
          return (a.costo - b.costo) * factor;
        case "periodicidad":
          return a.periodicidad.localeCompare(b.periodicidad) * factor;
        case "fechaRenovacion":
          return (
            (new Date(a.fechaRenovacion).getTime() - new Date(b.fechaRenovacion).getTime()) * factor
          );
        default:
          return 0;
      }
    });
  }, [filteredSuscripciones, orden]);

  const gruposSuscripciones = useMemo(
    () => agruparFilas(sortedSuscripciones, claveDeAgrupacion),
    [sortedSuscripciones, claveDeAgrupacion],
  );

  // Total recurrente acumulado por empresa
  const costoMensualTotal = useMemo(() => {
    return filteredSuscripciones
      .filter((s) => s.estado === "Activo")
      .reduce((acc, curr) => {
        let val = curr.costo;
        if (curr.periodicidad === "Anual") val = val / 12;
        return acc + val;
      }, 0);
  }, [filteredSuscripciones]);

  // Servicios activos cuya próxima renovación cae dentro de los próximos 30
  // días — hoy esa señal solo se ve fila por fila (BarraVencimiento), sin un
  // resumen que permita saber de un vistazo si hay renovaciones inminentes.
  const proximosAVencer = useMemo(() => {
    const ahora = Date.now();
    const en30Dias = ahora + 30 * 24 * 60 * 60 * 1000;
    return filteredSuscripciones.filter((s) => {
      if (s.estado !== "Activo") return false;
      const fecha = new Date(s.fechaRenovacion).getTime();
      return fecha >= ahora && fecha <= en30Dias;
    }).length;
  }, [filteredSuscripciones]);

  const resetForm = () => {
    setForm({
      empresaId: empresaBloqueada || "RC",
      area: "Sistemas",
      nombreServicio: "",
      proveedorId: "",
      periodicidad: "Mensual",
      costo: 350000,
      moneda: "COP",
      fechaRenovacion: new Date(Date.now() + PLAZO_CREDITO_DIAS_DEFECTO * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      responsableId: "",
    });
    setProveedorSeleccionadoNombre(undefined);
    setEditando(null);
  };

  const abrirEdicion = (sub: ServicioSuscripcion) => {
    setEditando(sub);
    setForm({
      empresaId: sub.empresaId,
      area: sub.area,
      nombreServicio: sub.nombreServicio,
      proveedorId: sub.proveedorId || "",
      periodicidad: sub.periodicidad,
      costo: sub.costo,
      moneda: sub.moneda,
      fechaRenovacion: sub.fechaRenovacion.split("T")[0],
      responsableId: sub.responsableId || "",
    });
    setProveedorSeleccionadoNombre(sub.proveedor);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombreServicio || !form.proveedorId) return;
    if (!form.responsableId) {
      toast.error("Selecciona el responsable del departamento.");
      return;
    }
    try {
      if (editando) {
        await actualizarSuscripcion(editando.id, {
          empresaId: form.empresaId,
          area: form.area,
          nombreServicio: form.nombreServicio,
          descripcion: editando.descripcion ?? undefined,
          proveedorId: form.proveedorId,
          periodicidad: form.periodicidad,
          costo: Number(form.costo),
          moneda: form.moneda,
          fechaInicio: editando.fechaInicio ?? undefined,
          fechaFin: editando.fechaFin ?? undefined,
          diaVencimiento: editando.diaVencimiento ?? undefined,
          fechaRenovacion: form.fechaRenovacion,
          responsableId: form.responsableId,
          observaciones: editando.observaciones ?? undefined,
        });
        toast.success(`Servicio "${form.nombreServicio}" actualizado.`);
      } else {
        await addSuscripcion({
          empresaId: form.empresaId,
          area: form.area,
          nombreServicio: form.nombreServicio,
          proveedorId: form.proveedorId,
          periodicidad: form.periodicidad,
          costo: Number(form.costo),
          moneda: form.moneda,
          fechaRenovacion: form.fechaRenovacion,
          responsableId: form.responsableId,
        });
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Error al ${editando ? "editar" : "registrar"} el servicio.`,
      );
      return;
    }
    setModalOpen(false);
    resetForm();
  };

  return (
    <AppShell
      title="Servicios y Suscripciones Activas"
      description="Inventario de licencias SaaS, infraestructura y servicios recurrentes categorizados por departamento."
      actions={
        <Button onClick={() => setModalOpen(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Registrar Servicio / Suscripción
        </Button>
      }
    >
      {/* KPI Resumen */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Servicios Activos
          </p>
          <p className="text-2xl font-bold mt-1 text-blue-900">
            {filteredSuscripciones.filter((s) => s.estado === "Activo").length} /{" "}
            {filteredSuscripciones.length}
          </p>
        </div>
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Costo Mensual Recurrente Estimado
          </p>
          <p className="num text-2xl font-bold mt-1 text-slate-900">{money(costoMensualTotal)}</p>
        </div>
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Próximos a Vencer
          </p>
          <p
            className={`text-2xl font-bold mt-1 ${proximosAVencer > 0 ? "text-amber-600" : "text-slate-900"}`}
          >
            {proximosAVencer}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">En los próximos 30 días</p>
        </div>
      </div>

      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/80">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Inventario de Servicios Recurrentes
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Software, licencias, conectividad y servicios públicos activos por departamento.
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
            ]}
          />
        </div>
        <Table>
          <TableHeader className="bg-slate-100/80">
            <TableRow className="hover:bg-slate-100/80">
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                <EncabezadoOrdenable campo="servicio" orden={orden} onClick={cambiarOrden}>
                  Servicio / Licencia
                </EncabezadoOrdenable>
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Empresa
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                <EncabezadoOrdenable campo="area" orden={orden} onClick={cambiarOrden}>
                  Departamento Categorizado
                </EncabezadoOrdenable>
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Proveedor
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                <EncabezadoOrdenable campo="periodicidad" orden={orden} onClick={cambiarOrden}>
                  Periodicidad
                </EncabezadoOrdenable>
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                <EncabezadoOrdenable
                  campo="costo"
                  orden={orden}
                  onClick={cambiarOrden}
                  alinearDerecha
                >
                  Costo
                </EncabezadoOrdenable>
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                <EncabezadoOrdenable campo="fechaRenovacion" orden={orden} onClick={cambiarOrden}>
                  Próxima Renovación
                </EncabezadoOrdenable>
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Estado
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Acción
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-slate-800 font-medium">
            {gruposSuscripciones.map((grupo) => (
              <Fragment key={grupo.clave || "sin-grupo"}>
                {grupo.clave && (
                  <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={9} />
                )}
                {grupo.filas.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="px-4 py-3 font-bold text-xs text-slate-900">
                      <Link
                        to="/servicios/$id"
                        params={{ id: sub.id }}
                        className="hover:underline hover:text-blue-800"
                      >
                        {sub.nombreServicio}
                      </Link>
                      <p className="text-[10px] text-slate-400 font-normal">
                        Resp: {sub.responsableArea}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="border-blue-200 bg-blue-50 text-blue-800 font-bold"
                      >
                        {siglaEmpresa(sub.empresaId)}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-100 text-slate-700"
                      >
                        {sub.area}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs font-semibold text-slate-800">
                      {sub.proveedor}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-500 font-medium">
                      {sub.periodicidad}
                    </TableCell>
                    <TableCell className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">
                      {money(sub.costo, sub.moneda)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <p className="font-mono text-xs text-slate-500">
                        {new Date(sub.fechaRenovacion).toLocaleDateString("es-CO", {
                          timeZone: "UTC",
                        })}
                      </p>
                      {sub.estado === "Activo" && (
                        <BarraVencimiento
                          fecha={sub.fechaRenovacion}
                          etiquetaVencido="Venció"
                          className="mt-1"
                          semaforo
                        />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <EstadoBadge estado={sub.estado} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {puedeEditar && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => abrirEdicion(sub)}
                            className="h-7 text-[11px] gap-1"
                          >
                            <Pencil className="h-3 w-3" /> Editar
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            toggleEstadoSuscripcion(sub.id).catch((err: unknown) =>
                              toast.error(
                                err instanceof Error ? err.message : "Error al cambiar el estado.",
                              ),
                            )
                          }
                          className="h-7 text-[11px] gap-1"
                        >
                          <Power className="h-3 w-3" />{" "}
                          {sub.estado === "Activo" ? "Desactivar" : "Activar"}
                        </Button>
                        {puedeEliminar && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              setServicioAEliminar({ id: sub.id, nombre: sub.nombreServicio })
                            }
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
            {filteredSuscripciones.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="p-0">
                  {loading ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      Cargando servicios...
                    </div>
                  ) : error ? (
                    <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                  ) : (
                    <EmptyState
                      icon={CreditCard}
                      title="No hay servicios o suscripciones registradas en esta empresa"
                      description='Haz clic en "Registrar Servicio / Suscripción" para agregar el primero.'
                      action={
                        <Button size="sm" onClick={() => setModalOpen(true)} className="gap-2">
                          <Plus className="h-4 w-4" /> Registrar Servicio / Suscripción
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

      {/* MODAL REGISTRAR/EDITAR SUSCRIPCION */}
      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              {editando
                ? "Editar Servicio o Suscripción"
                : "Registrar Servicio o Suscripción Activa"}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Control de costos recurrentes y licencias por departamento.
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="nombreServicio" className="text-xs font-semibold text-slate-700">
                  Nombre del Servicio / SaaS *
                </Label>
                <Input
                  required
                  id="nombreServicio"
                  placeholder="Ej: Licencias Microsoft 365"
                  value={form.nombreServicio}
                  onChange={(e) => setForm({ ...form, nombreServicio: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="proveedor" className="text-xs font-semibold text-slate-700">
                  Proveedor *
                </Label>
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
            {form.proveedorId === "" && proveedorOpciones.length === 0 && !buscandoProveedores && (
              <p className="-mt-2 text-[11px] font-semibold text-slate-600">
                No hay proveedores registrados.{" "}
                <Link to="/configuracion/proveedores" className="font-semibold underline">
                  Créalos en Configuración
                </Link>{" "}
                antes de registrar un servicio.
              </p>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="costo" className="text-xs font-semibold text-slate-700">
                  Costo (Monto)
                </Label>
                <Input
                  type="number"
                  id="costo"
                  value={form.costo}
                  onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="moneda" className="text-xs font-semibold text-slate-700">
                  Moneda
                </Label>
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
                <Label htmlFor="periodicidad" className="text-xs font-semibold text-slate-700">
                  Periodicidad
                </Label>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fechaRenovacion" className="text-xs font-semibold text-slate-700">
                  Próxima Fecha de Pago
                </Label>
                <Input
                  type="date"
                  id="fechaRenovacion"
                  value={form.fechaRenovacion}
                  onChange={(e) => setForm({ ...form, fechaRenovacion: e.target.value })}
                  className="h-9 text-xs border-slate-300"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="responsable" className="text-xs font-semibold text-slate-700">
                  Responsable del Departamento *
                </Label>
                <Select
                  value={form.responsableId}
                  onValueChange={(val) => setForm({ ...form, responsableId: val })}
                  disabled={
                    !areaDepartamentoId || cargandoUsuariosArea || usuariosArea.length === 0
                  }
                >
                  <SelectTrigger id="responsable" className="h-9 text-xs border-slate-300 bg-white">
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
              <p className="-mt-2 text-[11px] font-semibold text-slate-600">
                No hay usuarios asignados a "{form.area}". Asígnalos en Configuración &gt; Usuarios.
              </p>
            )}

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-blue-800 text-white hover:bg-blue-900 font-bold"
              >
                {editando ? "Guardar Cambios" : "Guardar Servicio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!servicioAEliminar}
        onOpenChange={(open) => !open && setServicioAEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar el servicio "{servicioAEliminar?.nombre}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. El servicio dejará de aparecer en el inventario, pero queda
              registrado en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={handleEliminarServicio}
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

type CampoOrdenServicio = "servicio" | "area" | "costo" | "periodicidad" | "fechaRenovacion";

/** Encabezado de columna clicable para ordenar la tabla — asc en el primer
 * clic, desc en el segundo, sin orden en el tercero (vuelve al orden
 * original de la lista). */
function EncabezadoOrdenable({
  campo,
  orden,
  onClick,
  alinearDerecha,
  children,
}: {
  campo: CampoOrdenServicio;
  orden: { campo: CampoOrdenServicio; dir: "asc" | "desc" } | null;
  onClick: (campo: CampoOrdenServicio) => void;
  alinearDerecha?: boolean;
  children: React.ReactNode;
}) {
  const activo = orden?.campo === campo;
  const Icono = activo ? (orden.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      title="Ordenar"
      onClick={() => onClick(campo)}
      // Deliberadamente sin color de texto azul ni subrayado: esto ordena la
      // tabla, no navega a ningún lado, así que no debe verse como un link
      // (que sí navega, ver el nombre del servicio en cada fila).
      className={`inline-flex select-none items-center gap-1 rounded px-1 py-0.5 -mx-1 hover:bg-slate-200/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 ${alinearDerecha ? "flex-row-reverse" : ""} ${activo ? "bg-slate-200/70" : ""}`}
    >
      {children}
      <Icono className={`h-3 w-3 ${activo ? "opacity-100" : "opacity-40"}`} />
    </button>
  );
}
