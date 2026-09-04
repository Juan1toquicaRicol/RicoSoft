import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Building2,
  FileSignature,
  FileText,
  Power,
  Receipt,
  TrendingUp,
  Truck,
} from "lucide-react";
import { useMemo } from "react";
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
import { money } from "@/lib/data";
import { siglaEmpresa } from "@/lib/tenant-context";
import { useServicio, useServicios } from "@/hooks/use-servicios";
import { useFacturasPorServicio } from "@/hooks/use-facturas";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

export const Route = createFileRoute("/servicios/$id")({
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
      const clave = `${d.getFullYear()}-${d.getMonth()}`;
      const actual = porMes.get(clave) ?? { year: d.getFullYear(), month: d.getMonth(), total: 0 };
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

  const handleToggleEstado = async () => {
    if (!servicio) return;
    try {
      await toggleEstadoSuscripcion(servicio.id);
      await refresh();
      toast.success(`Servicio ${servicio.estado === "Activo" ? "desactivado" : "activado"}.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el servicio.");
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

  const campos = [
    ["Proveedor", servicio.proveedor],
    ["Departamento", servicio.area],
    ["Empresa", siglaEmpresa(servicio.empresaId)],
    ["Periodicidad", servicio.periodicidad],
    ["Responsable", servicio.responsableArea],
    ["Próxima renovación", new Date(servicio.fechaRenovacion).toLocaleDateString("es-CO")],
    ...(servicio.diaVencimiento
      ? [["Día de vencimiento", `Día ${servicio.diaVencimiento} de cada mes`]]
      : []),
    ...(servicio.fechaInicio
      ? [["Fecha de inicio", new Date(servicio.fechaInicio).toLocaleDateString("es-CO")]]
      : []),
    ...(servicio.fechaFin
      ? [["Fecha de finalización", new Date(servicio.fechaFin).toLocaleDateString("es-CO")]]
      : []),
  ] as [string, string][];

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
            <Button size="sm" variant="outline" onClick={handleToggleEstado} className="gap-2">
              <Power className="h-4 w-4" />{" "}
              {servicio.estado === "Activo" ? "Desactivar" : "Activar"}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 mb-4">
              <h2 className="text-sm font-semibold">Datos del Servicio</h2>
              <EstadoBadge estado={servicio.estado} />
            </div>

            {servicio.contratoRel && (
              <div className="mb-4">
                <Badge
                  variant="outline"
                  className="gap-1.5 border-slate-200 bg-slate-50 text-slate-700 py-1"
                >
                  <FileSignature className="h-3.5 w-3.5" /> Contrato con{" "}
                  {servicio.contratoRel.proveedor}
                </Badge>
              </div>
            )}

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
          </div>

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
                        {new Date(f.fecha).toLocaleDateString("es-CO")}
                      </TableCell>
                      <TableCell className="py-2.5 pr-3 font-mono text-slate-500">
                        {new Date(f.vence).toLocaleDateString("es-CO")}
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
            {servicio.contratoRel ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <FileSignature className="h-3.5 w-3.5" /> Contrato vinculado
              </div>
            ) : (
              <p className="text-xs text-slate-500">Sin contrato vinculado.</p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
