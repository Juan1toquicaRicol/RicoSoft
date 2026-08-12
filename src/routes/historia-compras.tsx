import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Eye, History, ShoppingCart, X } from "lucide-react";
import { useMemo, useState } from "react";

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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTenant } from "@/lib/tenant-context";
import { useHistorialCompras } from "@/hooks/use-solicitudes";
import { money } from "@/lib/data";
import type { SolicitudCompra } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/historia-compras")({
  head: () => ({
    meta: [
      { title: "Historia de Compras | RicoSoft" },
      {
        name: "description",
        content: "Consulta histórica de solicitudes de compra ya resueltas (aprobadas o rechazadas).",
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
                  <SelectItem value="__todas__" className="text-xs">Todas las áreas</SelectItem>
                  {AREAS.map((a) => (
                    <SelectItem key={a} value={a} className="text-xs">
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase">Solicitante</Label>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-4 py-3.5">Fecha Resolución</th>
                <th className="px-4 py-3.5">Empresa</th>
                <th className="px-4 py-3.5">Solicitante / Área</th>
                <th className="px-4 py-3.5">Ítem Solicitado</th>
                <th className="px-4 py-3.5 text-right">Valor Estimado</th>
                <th className="px-4 py-3.5">Estado</th>
                <th className="px-4 py-3.5">Resuelto Por</th>
                <th className="px-4 py-3.5 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {paginado.map((sol) => (
                <tr key={sol.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {sol.fechaResolucion ? new Date(sol.fechaResolucion).toLocaleDateString("es-CO") : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-800">
                      {sol.empresaId}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{sol.solicitante}</p>
                    <p className="text-[11px] text-slate-500">{sol.area}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900 text-xs">{sol.item}</p>
                    <p className="text-[11px] text-slate-500 truncate max-w-[200px]">
                      Cant. {sol.cantidad}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-slate-900 text-xs">
                    {money(sol.valorEstimado)}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={sol.estado} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 font-semibold">
                    {sol.resueltoPorNombre || "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setDetalle(sol)}
                      className="h-7 text-[11px] font-bold gap-1"
                    >
                      <Eye className="h-3 w-3" /> Ver
                    </Button>
                  </td>
                </tr>
              ))}
              {paginado.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-xs text-slate-500">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-30 text-slate-400" />
                    {loading
                      ? "Cargando historia de compras..."
                      : error || "No hay solicitudes resueltas para los filtros seleccionados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
                <Campo label="Cantidad" valor={String(detalle.cantidad)} />
                <Campo label="Valor estimado" valor={money(detalle.valorEstimado)} />
                <Campo label="Prioridad" valor={detalle.prioridad} />
                <Campo
                  label="Fecha de solicitud"
                  valor={new Date(detalle.fechaSolicitud).toLocaleString("es-CO")}
                />
                <Campo
                  label="Fecha de resolución"
                  valor={detalle.fechaResolucion ? new Date(detalle.fechaResolucion).toLocaleString("es-CO") : "-"}
                />
                <Campo
                  label={detalle.estado === "Rechazada" ? "Rechazada por" : "Aprobada por"}
                  valor={detalle.resueltoPorNombre || "-"}
                  span2
                />
                <Campo
                  label={detalle.estado === "Rechazada" ? "Motivo del rechazo" : "Comentario de aprobación"}
                  valor={detalle.comentarioResolucion || "Sin comentarios registrados."}
                  span2
                />
                {detalle.descripcion && (
                  <Campo label="Justificación de la compra" valor={detalle.descripcion} span2 />
                )}
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
