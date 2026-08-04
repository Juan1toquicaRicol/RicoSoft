import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Inbox, Star, TriangleAlert, Upload } from "lucide-react";
import { useState } from "react";

import { AppShell, EstadoBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { facturas, money } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bandeja")({
  head: () => ({
    meta: [
      { title: "Bandeja de entrada | Facturaflow" },
      { name: "description", content: "Bandeja tipo Outlook para revisar, aprobar y archivar facturas asignadas." },
      { property: "og:title", content: "Bandeja de entrada | Facturaflow" },
      { property: "og:description", content: "Pendientes, urgentes, favoritas y archivadas en un solo lugar." },
    ],
  }),
  component: Bandeja,
});

const carpetas = [
  { key: "pendientes", label: "Pendientes", icon: Inbox },
  { key: "urgentes", label: "Urgentes", icon: TriangleAlert },
  { key: "favoritos", label: "Favoritos", icon: Star },
  { key: "archivadas", label: "Archivadas", icon: Archive },
] as const;

function Bandeja() {
  const [carpeta, setCarpeta] = useState<(typeof carpetas)[number]["key"]>("pendientes");

  const rows = facturas.filter((f) => {
    if (carpeta === "favoritos") return f.favorito;
    if (carpeta === "urgentes") return f.prioridad === "Alta" || f.prioridad === "Crítica";
    if (carpeta === "archivadas") return f.estado === "Pagada" || f.estado === "Archivada";
    return ["Recibida", "En revisión", "Pendiente"].includes(f.estado);
  });

  return (
    <AppShell
      title="Bandeja de entrada"
      description="Documentos asignados a Laura Restrepo"
      actions={
        <Button size="sm" className="gap-2">
          <Upload className="h-4 w-4" /> Cargar documento
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="panel h-max p-3">
          {carpetas.map((c) => (
            <button
              key={c.key}
              onClick={() => setCarpeta(c.key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                carpeta === c.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <c.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{c.label}</span>
            </button>
          ))}
        </div>

        <div className="panel divide-y divide-border overflow-hidden">
          {rows.map((f) => (
            <Link
              key={f.id}
              to="/facturas/$id"
              params={{ id: f.id }}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 p-4 transition-colors hover:bg-muted/50 sm:flex sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <Star className={cn("h-4 w-4 shrink-0", f.favorito ? "fill-warning text-warning" : "text-muted-foreground/40")} />
                  <p className="truncate text-sm font-semibold">{f.proveedor}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{f.numero}</span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {f.contrato} · {f.area} · vence {f.vence}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5 sm:ml-auto">
                <span className="num text-sm font-semibold">{money(f.total)}</span>
                <EstadoBadge estado={f.estado} />
              </div>
            </Link>
          ))}
          {rows.length === 0 && (
            <div className="p-16 text-center text-sm text-muted-foreground">Esta carpeta está vacía.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
