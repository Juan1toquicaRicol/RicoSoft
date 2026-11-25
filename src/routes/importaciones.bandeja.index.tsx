import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Inbox, Paperclip } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCorreosBandeja } from "@/hooks/use-importaciones-bandeja";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/importaciones/bandeja/")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_VER),
  head: () => ({
    meta: [
      { title: "Bandeja de Correos | RicoSoft" },
      {
        name: "description",
        content: "Correos de proveedores de importaciones procesados automáticamente.",
      },
    ],
  }),
  component: BandejaCorreosPage,
});

const ESTADOS_FILTRO = [
  "Todos",
  "PENDIENTE",
  "CLASIFICADO",
  "EXTRAIDO",
  "MATCHEADO",
  "REQUIERE_REVISION",
  "RESUELTO",
  "ERROR",
] as const;

function BandejaCorreosPage() {
  const [estadoSel, setEstadoSel] = useState<(typeof ESTADOS_FILTRO)[number]>("Todos");

  const { correos, loading, error } = useCorreosBandeja(
    estadoSel === "Todos" ? {} : { estado: estadoSel },
  );

  return (
    <AppShell
      title="Bandeja de Correos"
      description="Correos de proveedores de importaciones ingeridos y procesados automáticamente por la Bandeja Inteligente."
      actions={
        <Link
          to="/importaciones"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a Importaciones
        </Link>
      }
    >
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4 bg-slate-50/80">
          {ESTADOS_FILTRO.map((e) => (
            <button
              key={e}
              onClick={() => setEstadoSel(e)}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                estadoSel === e
                  ? "border-blue-700 bg-blue-800 text-white shadow-2xs"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {e === "Todos" ? "Todos" : e.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Cargando...</div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-red-600">{error}</div>
        ) : correos.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No hay correos"
            description="Todavía no ha llegado ningún correo a la Bandeja Inteligente con este filtro."
          />
        ) : (
          <Table>
            <TableHeader className="bg-slate-100/80">
              <TableRow className="hover:bg-slate-100/80">
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3">
                  Fecha
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3">
                  Remitente / Asunto
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3">
                  Proveedor
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3">
                  Orden
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3">
                  Clasificación
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3">
                  Estado
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3 text-right">
                  Adjuntos
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {correos.map((c) => (
                <TableRow key={c.id} className="hover:bg-slate-50">
                  <TableCell className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                    {new Date(c.fechaRecibido).toLocaleDateString("es-CO")}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <Link
                      to="/importaciones/bandeja/$id"
                      params={{ id: c.id }}
                      className="block max-w-xs"
                    >
                      <p className="text-xs font-bold text-slate-900 truncate">{c.asunto}</p>
                      <p className="text-[11px] text-slate-500 truncate">{c.remitente}</p>
                      <p className="text-[11px] text-slate-600">{c.origenes?.map((o) => o.buzon.direccion).join(" · ") || "Origen anterior"}</p>
                      <p className="text-[11px] text-slate-600">{c.responsable?.nombre ?? "Sin responsable"}</p>
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-slate-700">
                    {c.proveedor?.nombre ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-slate-700">
                    {c.ordenCompra?.numeroOrden ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-slate-700">
                    {c.clasificacion?.replace(/_/g, " ") ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={
                          c.estadoProcesamiento === "REQUIERE_REVISION"
                            ? "border-slate-300 bg-slate-900 text-white"
                            : c.estadoProcesamiento === "ERROR"
                              ? "border-red-300 bg-red-50 text-red-700"
                              : "border-slate-300 bg-slate-50 text-slate-700"
                        }
                      >
                        {c.estadoProcesamiento === "REQUIERE_REVISION" && (
                          <AlertTriangle className="h-3 w-3 mr-1 inline" />
                        )}
                        {c.estadoProcesamiento.replace(/_/g, " ")}
                      </Badge>
                      {c._count.excepciones > 0 && (
                        <span className="text-[10px] font-semibold text-slate-500">
                          {c._count.excepciones} excepción(es)
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right text-xs text-slate-600">
                    {c._count.adjuntos > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="h-3 w-3" /> {c._count.adjuntos}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}
