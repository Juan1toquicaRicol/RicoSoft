import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FilaGrupo,
  OPCION_SIN_AGRUPAR,
  SelectorAgrupacion,
} from "@/components/ui/selector-agrupacion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { agruparFilas } from "@/lib/agrupar";
import { fetchAuth, fetchAuthBlob, hasPermission } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

export const Route = createFileRoute("/configuracion/auditoria")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.AUDITORIA_VER),
  component: AuditoriaConfigPage,
});

interface EventoAuditoria {
  id: string;
  accion: string;
  detalle: string;
  usuarioAfectado: string | null;
  createdAt: string;
  usuario: { nombre: string; email: string } | null;
  entidadTipo: string | null;
  entidadId: string | null;
  datosAnteriores: string | null;
  datosNuevos: string | null;
}

/** Compara los campos presentes en `nuevos` contra `anteriores` y devuelve
 * solo los que cambiaron, para no repetir en el diff los campos que no se
 * tocaron en esa edición. */
function calcularCambios(
  anteriores: Record<string, unknown> | null,
  nuevos: Record<string, unknown> | null,
): { campo: string; antes: unknown; despues: unknown }[] {
  if (!nuevos) return [];
  return Object.keys(nuevos)
    .filter((campo) => JSON.stringify(anteriores?.[campo]) !== JSON.stringify(nuevos[campo]))
    .map((campo) => ({ campo, antes: anteriores?.[campo], despues: nuevos[campo] }));
}

function formatearValor(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (Array.isArray(valor)) return valor.length ? valor.join(", ") : "(ninguno)";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  return String(valor);
}

function AuditoriaConfigPage() {
  const { user: sesion } = useSession();
  const puedeExportar = hasPermission(sesion, PERMISOS_SISTEMA.AUDITORIA_EXPORTAR);

  const [expandido, setExpandido] = useState<string | null>(null);
  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [page, setPage] = useState(1);
  const [exportando, setExportando] = useState(false);
  const PAGE_SIZE = 50;

  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "accion":
        return (e: EventoAuditoria) => e.accion;
      case "usuario":
        return (e: EventoAuditoria) => e.usuario?.nombre ?? e.usuarioAfectado ?? "Sistema";
      default:
        return null;
    }
  }, [agrupacion]);

  const paramsFiltro = useMemo(() => {
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE), page: String(page) });
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    return params;
  }, [desde, hasta, page]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["auditoria", paramsFiltro.toString()],
    queryFn: () => fetchAuth(`/auditoria?${paramsFiltro.toString()}`),
  });

  const eventos: EventoAuditoria[] = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const gruposEventos = useMemo(
    () => agruparFilas(eventos, claveDeAgrupacion),
    [eventos, claveDeAgrupacion],
  );

  const handleExportar = async () => {
    setExportando(true);
    try {
      const filtroExport = new URLSearchParams();
      if (desde) filtroExport.set("desde", desde);
      if (hasta) filtroExport.set("hasta", hasta);
      const blob = await fetchAuthBlob(`/auditoria/exportar?${filtroExport.toString()}`);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
      toast.success("Registro de auditoría exportado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible exportar el registro.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <History className="h-6 w-6 text-blue-600" />
            Auditoría
          </h1>
          <p className="text-sm text-slate-500">
            Registro de eventos de seguridad y administración, con antes/después de cada cambio.
          </p>
        </div>
        {puedeExportar && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={exportando}
            onClick={handleExportar}
          >
            {exportando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Exportar log
          </Button>
        )}
      </div>

      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-slate-50/80 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase">Desde</Label>
              <Input
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-40 text-xs border-slate-300 bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase">Hasta</Label>
              <Input
                type="date"
                value={hasta}
                onChange={(e) => {
                  setHasta(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-40 text-xs border-slate-300 bg-white"
              />
            </div>
            {(desde || hasta) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDesde("");
                  setHasta("");
                  setPage(1);
                }}
                className="text-xs text-slate-500"
              >
                Limpiar filtro
              </Button>
            )}
          </div>
          <SelectorAgrupacion
            value={agrupacion}
            onChange={setAgrupacion}
            opciones={[
              OPCION_SIN_AGRUPAR,
              { value: "accion", label: "Acción" },
              { value: "usuario", label: "Usuario" },
            ]}
          />
        </div>
        <Table>
          <TableHeader className="bg-slate-100/80">
            <TableRow className="hover:bg-slate-100/80">
              <TableHead className="w-8" />
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Fecha
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Usuario
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Acción
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                Detalle
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-slate-800 font-medium">
            {isLoading && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="px-4 py-6 text-center text-xs text-slate-500">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && eventos.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  {error ? (
                    <div className="px-4 py-6 text-center text-xs text-slate-500">
                      {error instanceof Error
                        ? error.message
                        : "Error cargando el registro de auditoría."}
                    </div>
                  ) : (
                    <EmptyState icon={History} title="No hay eventos registrados todavía" />
                  )}
                </TableCell>
              </TableRow>
            )}
            {gruposEventos.map((grupo) => (
              <Fragment key={grupo.clave || "sin-grupo"}>
                {grupo.clave && (
                  <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={5} />
                )}
                {grupo.filas.map((e) => {
                  let anteriores: Record<string, unknown> | null = null;
                  let nuevos: Record<string, unknown> | null = null;
                  try {
                    anteriores = e.datosAnteriores ? JSON.parse(e.datosAnteriores) : null;
                  } catch {
                    anteriores = null;
                  }
                  try {
                    nuevos = e.datosNuevos ? JSON.parse(e.datosNuevos) : null;
                  } catch {
                    nuevos = null;
                  }
                  const cambios = calcularCambios(anteriores, nuevos);
                  const tieneDetalleTecnico = cambios.length > 0 || (anteriores && !nuevos);
                  const abierta = expandido === e.id;

                  return (
                    <Fragment key={e.id}>
                      <TableRow
                        className={tieneDetalleTecnico ? "cursor-pointer" : ""}
                        onClick={() => tieneDetalleTecnico && setExpandido(abierta ? null : e.id)}
                      >
                        <TableCell className="px-4 py-3 text-slate-400">
                          {tieneDetalleTecnico &&
                            (abierta ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            ))}
                        </TableCell>
                        <TableCell className="num px-4 py-3 text-xs text-slate-500">
                          {new Date(e.createdAt).toLocaleString("es-CO")}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-bold text-xs text-slate-900">
                          {e.usuario?.nombre ?? e.usuarioAfectado ?? "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-100 text-slate-700"
                          >
                            {e.accion}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-xs text-slate-600">
                          {e.detalle}
                        </TableCell>
                      </TableRow>
                      {abierta && tieneDetalleTecnico && (
                        <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                          <TableCell />
                          <TableCell colSpan={4} className="px-4 py-3">
                            {cambios.length > 0 ? (
                              <table className="text-xs">
                                <thead>
                                  <tr className="text-left text-slate-500">
                                    <th className="pr-6 py-1 font-bold">Campo</th>
                                    <th className="pr-6 py-1 font-bold">Antes</th>
                                    <th className="pr-6 py-1 font-bold">Después</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cambios.map((c) => (
                                    <tr key={c.campo}>
                                      <td className="pr-6 py-1 font-mono text-slate-500">
                                        {c.campo}
                                      </td>
                                      <td className="pr-6 py-1 text-slate-600">
                                        {formatearValor(c.antes)}
                                      </td>
                                      <td className="pr-6 py-1 font-semibold text-slate-900">
                                        {formatearValor(c.despues)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-xs text-slate-500">
                                Registro eliminado (no queda estado nuevo).
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        {!isLoading && eventos.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] text-slate-500">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="gap-1"
              >
                Siguiente <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
