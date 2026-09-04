import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, ShieldAlert, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import { useFacturas } from "@/hooks/use-facturas";
import { money } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bandeja")({
  head: () => ({
    meta: [
      { title: "Bandeja de Aprobación | RicoSoft" },
      {
        name: "description",
        content: "Bandeja de entrada para revisar y aprobar facturas asignadas.",
      },
    ],
  }),
  component: Bandeja,
});

const carpetas = [
  { key: "pendientes", label: "Pendientes de Aprobación", icon: Inbox },
  { key: "aprobadas", label: "Facturas Aprobadas", icon: Inbox },
  { key: "pagadas", label: "Facturas Pagadas", icon: Inbox },
] as const;

function Bandeja() {
  const { empresaActiva } = useTenant();
  const { facturas, loading } = useFacturas();
  const [carpeta, setCarpeta] = useState<(typeof carpetas)[number]["key"]>("pendientes");

  const filteredFacturas = useMemo(() => {
    return facturas.filter((f) => {
      const matchEmpresa = empresaActiva === "ALL" || f.empresaId === empresaActiva;
      if (!matchEmpresa) return false;

      if (carpeta === "aprobadas") return f.estado === "Aprobada";
      if (carpeta === "pagadas") return f.estado === "Pagada";
      return f.estado === "Pendiente";
    });
  }, [facturas, empresaActiva, carpeta]);

  return (
    <AppShell
      title="Bandeja de Entrada de Aprobación"
      description="Documentos y facturas requeridas por estado para la empresa activa."
      actions={
        <Link to="/facturas">
          <Button size="sm" className="gap-2 bg-blue-800 text-white hover:bg-blue-900 font-bold">
            <Upload className="h-4 w-4" /> Ir a Facturas
          </Button>
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="panel h-max p-3 bg-white border-slate-200 shadow-2xs">
          {carpetas.map((c) => (
            <button
              key={c.key}
              onClick={() => setCarpeta(c.key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                carpeta === c.key
                  ? "bg-blue-50 text-blue-800 border border-blue-100"
                  : "text-slate-500 hover:bg-slate-100",
              )}
            >
              <c.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{c.label}</span>
            </button>
          ))}
        </div>

        <div className="panel divide-y divide-slate-100 bg-white border-slate-200 shadow-2xs overflow-hidden">
          {filteredFacturas.map((f) => (
            <Link
              key={f.id}
              to="/facturas/$id"
              params={{ id: f.id }}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 p-4 transition-colors hover:bg-slate-50 sm:flex sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-bold text-slate-900">{f.proveedor}</p>
                  <span className="shrink-0 text-[11px] font-mono text-slate-500">{f.numero}</span>
                  <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                    {f.empresaId}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {f.area} · responsable: {f.responsable} · vence {f.vence}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5 sm:ml-auto">
                <span className="num text-sm font-bold text-slate-900">
                  {money(f.total, f.moneda)}
                </span>
                <EstadoBadge estado={f.estado} />
              </div>
            </Link>
          ))}
          {filteredFacturas.length === 0 && (
            <div className="p-16 text-center text-xs text-slate-500">
              {loading ? "Cargando..." : "Esta bandeja está vacía para esta empresa."}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
