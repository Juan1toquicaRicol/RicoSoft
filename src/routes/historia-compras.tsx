import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  History,
  Paperclip,
  ShoppingCart,
  X,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTenant } from "@/lib/tenant-context";
import { useHistorialCompras, descargarCotizacionSolicitud } from "@/hooks/use-solicitudes";
import { money } from "@/lib/data";
import type { SolicitudCompra } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/historia-compras")({
  head: () => ({
    meta: [
      { title: "Historia de Compras | RicoSoft" },
      {
        name: "description",
        content:
          "Consulta histórica de solicitudes de compra ya resueltas (aprobadas o rechazadas).",
      },
    ],
  }),
  component: HistoriaComprasPage,
});

const ESTADOS_FILTRO = ["Todas", "Aprobada", "Rechazada", "Comprado"] as const;
type EstadoFiltro = (typeof ESTADOS_FILTRO)[number];

const AREAS = [
  "Sistemas",
  "Comercial",
  "Produccion",
  "Gestion Humana",
  "Contabilidad",
  "Mantenimiento",
  "Compras",
  "Logistica",
  "Gerencia",
];

const PAGE_SIZE = 10;

function HistoriaComprasPage() {
  const { empresaActiva, empresas } = useTenant();

  const [estadoSel, setEstadoSel] = useState<EstadoFiltro>("Todas");
  const [area, setArea] = useState<string>("__todas__");
  const [solicitante, setSolicitante] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [page, setPage] = useState(1);
  const [detalle, setDetalle] = useState<SolicitudCompra | null>(null);
  const [descargandoCotizacion, setDescargandoCotizacion] = useState(false);
  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);

  const handleVerCotizacion = async (id: string) => {
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

  const { historial, loading, error } = useHistorialCompras({
    empresaId: empresaActiva === "ALL" ? undefined : empresaActiva,
    estado: estadoSel === "Todas" ? undefined : estadoSel,
    area: area === "__todas__" ? undefined : area,
    solicitante: solicitante.trim() || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  });

  const totalPages = Math.max(1, Math.ceil(historial.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const paginado = useMemo(
    () => historial.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE),
    [historial, pageClamped],
  );

  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "area":
        return (s: SolicitudCompra) => s.area;
      case "proveedor":
        return (s: SolicitudCompra) => s.proveedor || "Sin proveedor";
      case "estado":
        return (s: SolicitudCompra) => s.estado;
      default:
        return null;
      case "empresa":
        return (s: SolicitudCompra) => {
          const empresa = empresas.find((e) => e.id === s.empresaId);
          return empresa ? empresa.nombre : "Sin empresa";
        };
    }
  }, [agrupacion, empresas]);

  const gruposHistorial = useMemo(
    () => agruparFilas(paginado, claveDeAgrupacion),
    [paginado, claveDeAgrupacion],
  );

  const limpiarFiltros = () => {
    setEstadoSel("Todas");
    setArea("__todas__");
    setSolicitante("");
    setDesde("");
    setHasta("");
    setPage(1);
  };

  return (
    <AppShell
      title="Historia de Compras"
      description="Consulta de solo lectura sobre solicitudes de compra ya resueltas. Ninguna solicitud se elimina: aquí queda el registro permanente."
      actions={
        <Link to="/solicitudes-compra">
          <Button variant="outline" size="sm" className="gap-2">
            <ShoppingCart className="h-4 w-4" /> Ver Solicitudes Activas
          </Button>
        </Link>
      }
    >
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        {/* ── Barra de filtros ── */}
        <div className="border-b border-slate-200 bg-slate-50/80 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <History className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">
                Estado
              </span>
              {ESTADOS_FILTRO.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    setEstadoSel(e);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    estadoSel === e
                      ? "border-slate-900 bg-slate-900 text-white shadow-2xs"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            <SelectorAgrupacion
              value={agrupacion}
              onChange={setAgrupacion}
              opciones={[
                OPCION_SIN_AGRUPAR,
                { value: "area", label: "Área" },
                { value: "proveedor", label: "Proveedor" },
                { value: "estado", label: "Estado" },
                { value: "empresa", label: "Empresa" },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase">Área</Label>
              <Select
                value={area}
                onValueChange={(val) => {
                  setArea(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs border-slate-300 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="__todas__" className="text-xs">
                    Todas las áreas
                  </SelectItem>
                  {AREAS.map((a) => (
                    <SelectItem key={a} value={a} className="text-xs">
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase">
                Solicitante
              </Label>
              <Input
                value={solicitante}
                onChange={(e) => {
                  setSolicitante(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por nombre..."
                className="h-9 text-xs border-slate-300 bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase">Desde</Label>
              <Input
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setPage(1);
                }}
                className="h-9 text-xs border-slate-300 bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase">Hasta</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={hasta}
                  onChange={(e) => {
                    setHasta(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 text-xs border-slate-300 bg-white"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Limpiar filtros"
                  onClick={limpiarFiltros}
                  className="h-9 w-9 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabla histórica ── */}
        <Table>
          <TableHeader className="bg-slate-100/80">
            <TableRow className="hover:bg-slate-100/80">
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Fecha Resolución
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Empresa
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Solicitante / Área
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Ítem Solicitado
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Proveedor
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Valor Estimado
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Estado
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Factura
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Resuelto Por
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                Detalle
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-slate-800 font-medium">
            {gruposHistorial.map((grupo) => (
              <Fragment key={grupo.clave || "sin-grupo"}>
                {grupo.clave && (
                  <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={10} />
                )}
                {grupo.filas.map((sol) => (
                  <TableRow key={sol.id}>
                    <TableCell className="px-4 py-3 font-mono text-xs text-slate-500">
                      {sol.fechaResolucion
                        ? new Date(sol.fechaResolucion).toLocaleDateString("es-CO")
                        : "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="border-blue-200 bg-blue-50 text-blue-800 font-bold"
                      >
                        {sol.empresaId}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{sol.solicitante}</p>
                      <p className="text-[11px] text-slate-500">{sol.area}</p>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <p className="font-bold text-slate-900 text-xs">{sol.item}</p>
                      <p className="text-[11px] text-slate-500 truncate max-w-[200px]">
                        Cant. {sol.cantidad}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs font-semibold text-slate-800">
                      {sol.proveedor || "—"}
                    </TableCell>
                    <TableCell className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">
                      {money(sol.valorEstimado)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <EstadoBadge estado={sol.estado} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs">
                      {sol.factura ? (
                        <Link
                          to="/facturas/$id"
                          params={{ id: sol.factura.id }}
                          className="font-semibold text-blue-800 hover:underline"
                        >
                          {sol.factura.numero}
                        </Link>
                      ) : sol.estado === "Comprado" ? (
                        <span className="text-slate-400">Sin factura aún</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-600 font-semibold">
                      {sol.resueltoPorNombre || "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setDetalle(sol)}
                        className="h-7 text-[11px] gap-1"
                      >
                        <Eye className="h-3 w-3" /> Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
            {paginado.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={10} className="p-0">
                  {loading ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      Cargando historia de compras...
                    </div>
                  ) : error ? (
                    <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                  ) : (
                    <EmptyState
                      icon={History}
                      title="No hay solicitudes resueltas para los filtros seleccionados"
                      description="Ajusta el rango de fechas o los filtros de arriba."
                    />
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* ── Paginación ── */}
        {historial.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold text-slate-500">
              Mostrando {(pageClamped - 1) * PAGE_SIZE + 1}–
              {Math.min(pageClamped * PAGE_SIZE, historial.length)} de {historial.length} registros
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant="outline"
                disabled={pageClamped <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 gap-1 text-[11px] font-bold"
              >
                <ChevronLeft className="h-3 w-3" /> Anterior
              </Button>
              <span className="text-[11px] font-bold text-slate-600 px-1">
                {pageClamped} / {totalPages}
              </span>
              <Button
                size="xs"
                variant="outline"
                disabled={pageClamped >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 gap-1 text-[11px] font-bold"
              >
                Siguiente <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de detalle completo ── */}
      <Dialog open={!!detalle} onOpenChange={(open) => !open && setDetalle(null)}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
                  Solicitud de Compra
                  <EstadoBadge estado={detalle.estado} />
                </DialogTitle>
                <DialogDescription className="text-slate-500">
                  Registro histórico permanente. Empresa {detalle.empresaId}.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-2 text-sm">
                <Campo label="Solicitante" valor={detalle.solicitante} />
                <Campo label="Área" valor={detalle.area} />
                <Campo label="Ítem solicitado" valor={detalle.item} span2 />
                <Campo
                  label="Proveedor"
                  valor={detalle.proveedor || "Sin proveedor asociado"}
                  span2
                />
                {detalle.factura && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Factura final
                    </p>
                    <Link
                      to="/facturas/$id"
                      params={{ id: detalle.factura.id }}
                      className="font-semibold text-blue-800 hover:underline"
                    >
                      {detalle.factura.numero} ({detalle.factura.estado})
                    </Link>
                  </div>
                )}
                <Campo label="Cantidad" valor={String(detalle.cantidad)} />
                <Campo label="Valor estimado" valor={money(detalle.valorEstimado)} />
                <Campo label="Prioridad" valor={detalle.prioridad} />
                <Campo
                  label="Fecha de solicitud"
                  valor={new Date(detalle.fechaSolicitud).toLocaleString("es-CO")}
                />
                <Campo
                  label="Fecha de resolución"
                  valor={
                    detalle.fechaResolucion
                      ? new Date(detalle.fechaResolucion).toLocaleString("es-CO")
                      : "-"
                  }
                />
                <Campo
                  label={detalle.estado === "Rechazada" ? "Rechazada por" : "Aprobada por"}
                  valor={detalle.resueltoPorNombre || "-"}
                  span2
                />
                <Campo
                  label={
                    detalle.estado === "Rechazada"
                      ? "Motivo del rechazo"
                      : "Comentario de aprobación"
                  }
                  valor={detalle.comentarioResolucion || "Sin comentarios registrados."}
                  span2
                />
                {detalle.descripcion && (
                  <Campo label="Justificación de la compra" valor={detalle.descripcion} span2 />
                )}
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Cotización
                  </p>
                  {detalle.cotizacion ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={descargandoCotizacion}
                      onClick={() => handleVerCotizacion(detalle.id)}
                      className="mt-1 h-7 gap-1.5 text-[11px] font-bold"
                    >
                      <Paperclip className="h-3 w-3" />
                      {descargandoCotizacion ? "Abriendo..." : detalle.cotizacion.nombre}
                      <Download className="h-3 w-3" />
                    </Button>
                  ) : (
                    <p className="text-slate-500 font-semibold">Sin cotización adjunta.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Campo({ label, valor, span2 }: { label: string; valor: string; span2?: boolean }) {
  return (
    <div className={span2 ? "col-span-2" : undefined}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-slate-900 font-semibold">{valor}</p>
    </div>
  );
}
