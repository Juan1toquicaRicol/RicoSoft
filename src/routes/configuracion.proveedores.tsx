import { createFileRoute } from "@tanstack/react-router";
import React, { Fragment, useMemo, useState } from "react";
import {
  Truck,
  Plus,
  Trash2,
  FileText,
  FileSignature,
  ShoppingCart,
  Cloud,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { useProveedores, type Proveedor } from "@/hooks/use-proveedores";
import { useDepartamentosPublico } from "@/hooks/use-departamentos-publico";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { OPCION_SIN_AGRUPAR, SelectorAgrupacion } from "@/components/ui/selector-agrupacion";
import { agruparFilas } from "@/lib/agrupar";

const SIN_DEPARTAMENTO = "__general__";

export const Route = createFileRoute("/configuracion/proveedores")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.PROVEEDORES_VER),
  component: ProveedoresConfigPage,
});

function ProveedoresConfigPage() {
  const { user: sesion } = useSession();
  const puedeCrear = hasPermission(sesion, PERMISOS_SISTEMA.PROVEEDORES_CREAR);
  const puedeEditar = hasPermission(sesion, PERMISOS_SISTEMA.PROVEEDORES_EDITAR);
  const puedeEliminar = hasPermission(sesion, PERMISOS_SISTEMA.PROVEEDORES_ELIMINAR);

  const {
    proveedores,
    total,
    page,
    totalPages,
    loading,
    error,
    refresh,
    crearProveedor,
    actualizarProveedor,
    eliminarProveedor,
  } = useProveedores();
  const { departamentos } = useDepartamentosPublico();

  const [search, setSearch] = useState("");
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nuevo, setNuevo] = useState({
    nombre: "",
    nit: "",
    contacto: "",
    telefono: "",
    email: "",
    condicionesPago: "",
    datosPago: "",
    departamentoId: SIN_DEPARTAMENTO,
  });
  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);
  const [editandoPago, setEditandoPago] = useState<Proveedor | null>(null);
  const [formPago, setFormPago] = useState({ condicionesPago: "", datosPago: "" });
  const [guardandoPago, setGuardandoPago] = useState(false);

  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "estado":
        return (p: Proveedor) => (p.activo ? "Activo" : "Inactivo");
      default:
        return null;
    }
  }, [agrupacion]);

  const gruposProveedores = useMemo(
    () => agruparFilas(proveedores, claveDeAgrupacion),
    [proveedores, claveDeAgrupacion],
  );

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBuscar = (valor: string) => {
    setSearch(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refresh({ search: valor, page: 1 }), 300);
  };

  const handleCambiarPagina = (nuevaPagina: number) => {
    refresh({ search, page: nuevaPagina });
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevo.nombre.trim() || !nuevo.nit.trim()) return;
    setGuardando(true);
    try {
      await crearProveedor({
        ...nuevo,
        departamentoId: nuevo.departamentoId === SIN_DEPARTAMENTO ? null : nuevo.departamentoId,
      });
      toast.success(`Proveedor "${nuevo.nombre}" registrado.`);
      setNuevo({
        nombre: "",
        nit: "",
        contacto: "",
        telefono: "",
        email: "",
        condicionesPago: "",
        datosPago: "",
        departamentoId: SIN_DEPARTAMENTO,
      });
      setCreando(false);
    } catch (err: any) {
      toast.error(err.message || "Error al registrar el proveedor.");
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleActivo = async (p: Proveedor) => {
    try {
      await actualizarProveedor(p.id, { activo: !p.activo });
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar el proveedor.");
    }
  };

  const handleCambiarDepartamento = async (p: Proveedor, departamentoId: string) => {
    try {
      await actualizarProveedor(p.id, {
        departamentoId: departamentoId === SIN_DEPARTAMENTO ? null : departamentoId,
      });
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar el departamento del proveedor.");
    }
  };

  const handleAbrirEdicionPago = (p: Proveedor) => {
    setEditandoPago(p);
    setFormPago({ condicionesPago: p.condicionesPago || "", datosPago: p.datosPago || "" });
  };

  const handleGuardarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editandoPago) return;
    setGuardandoPago(true);
    try {
      await actualizarProveedor(editandoPago.id, {
        condicionesPago: formPago.condicionesPago,
        datosPago: formPago.datosPago,
      });
      toast.success(`Condiciones de pago de "${editandoPago.nombre}" actualizadas.`);
      setEditandoPago(null);
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar las condiciones de pago.");
    } finally {
      setGuardandoPago(false);
    }
  };

  const handleEliminar = async (p: Proveedor) => {
    if (!confirm(`¿Eliminar el proveedor "${p.nombre}"?`)) return;
    try {
      await eliminarProveedor(p.id);
      toast.success(`Proveedor "${p.nombre}" eliminado.`);
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el proveedor.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <Truck className="h-6 w-6 text-blue-600" />
            Proveedores
          </h1>
          <p className="text-sm text-slate-500">
            Catálogo compartido de proveedores, usado por Facturas y Contratos.
          </p>
        </div>
        {puedeCrear && (
          <Button size="sm" onClick={() => setCreando((c) => !c)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nuevo proveedor
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nombre o NIT..."
          value={search}
          onChange={(e) => handleBuscar(e.target.value)}
          className="max-w-md flex-1 min-w-[220px]"
        />
        <SelectorAgrupacion
          value={agrupacion}
          onChange={setAgrupacion}
          opciones={[OPCION_SIN_AGRUPAR, { value: "estado", label: "Estado" }]}
        />
      </div>

      {creando && (
        <form
          onSubmit={handleCrear}
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <Input
            required
            placeholder="Nombre del proveedor *"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
          />
          <Input
            required
            placeholder="NIT *"
            value={nuevo.nit}
            onChange={(e) => setNuevo({ ...nuevo, nit: e.target.value })}
          />
          <Input
            placeholder="Persona de contacto (opcional)"
            value={nuevo.contacto}
            onChange={(e) => setNuevo({ ...nuevo, contacto: e.target.value })}
          />
          <Input
            placeholder="Teléfono (opcional)"
            value={nuevo.telefono}
            onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
          />
          <Input
            type="email"
            placeholder="Correo (opcional)"
            value={nuevo.email}
            onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
          />
          <Input
            placeholder="Condiciones de pago (ej. 30 días crédito)"
            value={nuevo.condicionesPago}
            onChange={(e) => setNuevo({ ...nuevo, condicionesPago: e.target.value })}
          />
          <Textarea
            placeholder="Datos de pago (banco, cuenta, beneficiario)..."
            value={nuevo.datosPago}
            onChange={(e) => setNuevo({ ...nuevo, datosPago: e.target.value })}
            className="sm:col-span-2"
            rows={2}
          />
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Departamento (opcional)</label>
            <Select
              value={nuevo.departamentoId}
              onValueChange={(val) => setNuevo({ ...nuevo, departamentoId: val })}
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                <SelectItem value={SIN_DEPARTAMENTO}>General (todos los departamentos)</SelectItem>
                {departamentos.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500">
              Si eliges un departamento, este proveedor solo se ofrecerá al crear solicitudes de
              compra de esa área.
            </p>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="success" disabled={guardando}>
              {guardando ? "Guardando..." : "Crear proveedor"}
            </Button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead>NIT</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Usado en</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proveedores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-500 py-6">
                  {loading
                    ? "Cargando proveedores..."
                    : error || 'No hay proveedores registrados. Haz clic en "Nuevo proveedor".'}
                </TableCell>
              </TableRow>
            ) : (
              gruposProveedores.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && (
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableCell
                        colSpan={8}
                        className="text-[11px] font-bold uppercase tracking-wider text-slate-500"
                      >
                        {grupo.clave}{" "}
                        <span className="font-normal text-slate-400">({grupo.filas.length})</span>
                      </TableCell>
                    </TableRow>
                  )}
                  {grupo.filas.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium text-slate-800">{p.nombre}</div>
                        {(p.contacto || p.telefono || p.email) && (
                          <div className="text-xs text-slate-500">{p.email || p.telefono}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{p.nit}</TableCell>
                      <TableCell className="text-slate-600">{p.contacto || "—"}</TableCell>
                      <TableCell>
                        {p.origen === "SIESA" ? (
                          <Badge
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-blue-800 gap-1"
                            title={
                              p.ultimaSincronizacion
                                ? `Última sincronización: ${new Date(p.ultimaSincronizacion).toLocaleString("es-CO")}`
                                : undefined
                            }
                          >
                            <Cloud className="h-3 w-3" /> Siesa
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50 text-slate-600 gap-1"
                          >
                            <User className="h-3 w-3" /> Manual
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {puedeEditar ? (
                          <Select
                            value={p.departamentoId || SIN_DEPARTAMENTO}
                            onValueChange={(val) => handleCambiarDepartamento(p, val)}
                          >
                            <SelectTrigger className="h-8 w-40 bg-white text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white border-slate-200">
                              <SelectItem value={SIN_DEPARTAMENTO}>General</SelectItem>
                              {departamentos.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          p.departamento?.nombre || "General"
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1" title="Facturas">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />{" "}
                            {p.facturasAsociadas}
                          </span>
                          <span className="flex items-center gap-1" title="Contratos">
                            <FileSignature className="h-3.5 w-3.5 text-slate-400" />{" "}
                            {p.contratosAsociados}
                          </span>
                          <span className="flex items-center gap-1" title="Solicitudes de compra">
                            <ShoppingCart className="h-3.5 w-3.5 text-slate-400" />{" "}
                            {p.solicitudesAsociadas}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.activo ? (
                          <Badge
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-blue-800"
                          >
                            Activo
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-slate-900 text-white"
                          >
                            Inactivo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {puedeEditar && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAbrirEdicionPago(p)}
                          >
                            Datos de pago
                          </Button>
                        )}
                        {puedeEditar && (
                          <Button size="sm" variant="outline" onClick={() => handleToggleActivo(p)}>
                            {p.activo ? "Desactivar" : "Activar"}
                          </Button>
                        )}
                        {puedeEliminar &&
                          p.facturasAsociadas === 0 &&
                          p.contratosAsociados === 0 &&
                          p.solicitudesAsociadas === 0 && (
                            <button
                              onClick={() => handleEliminar(p)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-900 transition-colors align-middle cursor-pointer"
                              title="Eliminar proveedor"
                            >
                              <Trash2 className="h-3.5 w-3.5 inline" />
                            </button>
                          )}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <p>
            {proveedores.length} de {total} proveedores — página {page} de {totalPages}
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

      <Dialog open={!!editandoPago} onOpenChange={(open) => !open && setEditandoPago(null)}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Datos de pago — {editandoPago?.nombre}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGuardarPago} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Condiciones de pago</label>
              <Input
                placeholder="Ej. 30 días crédito"
                value={formPago.condicionesPago}
                onChange={(e) => setFormPago({ ...formPago, condicionesPago: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">
                Datos de pago (banco, cuenta, beneficiario)
              </label>
              <Textarea
                value={formPago.datosPago}
                onChange={(e) => setFormPago({ ...formPago, datosPago: e.target.value })}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button type="submit" variant="success" disabled={guardandoPago}>
                {guardandoPago ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
