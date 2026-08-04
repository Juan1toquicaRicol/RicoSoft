import { createFileRoute, Link } from "@tanstack/react-router";
import { Filter, Star, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, EstadoBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { facturas, money, type EstadoFactura } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/facturas/")({
  head: () => ({
    meta: [
      { title: "Facturas | Facturaflow" },
      { name: "description", content: "Listado avanzado de facturas con filtros por estado, área, proveedor y contrato." },
      { property: "og:title", content: "Facturas | Facturaflow" },
      { property: "og:description", content: "Consulta, clasifica y aprueba facturas desde una tabla profesional." },
    ],
  }),
  component: Facturas,
});

const estados: (EstadoFactura | "Todas")[] = [
  "Todas",
  "Recibida",
  "En revisión",
  "Pendiente",
  "Aprobada",
  "Rechazada",
  "Pagada",
];

function Facturas() {
  const [estado, setEstado] = useState<(typeof estados)[number]>("Todas");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      facturas.filter((f) => {
        const matchEstado = estado === "Todas" || f.estado === estado;
        const term = q.trim().toLowerCase();
        const matchQ =
          !term ||
          [f.numero, f.proveedor, f.nit, f.contrato, f.responsable, f.area].some((v) =>
            v.toLowerCase().includes(term),
          );
        return matchEstado && matchQ;
      }),
    [estado, q],
  );

  return (
    <AppShell
      title="Facturas"
      description={`${rows.length} documentos · clasificación automática activa`}
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" /> Filtros
          </Button>
          <Button size="sm" className="gap-2">
            <Upload className="h-4 w-4" /> Recepción
          </Button>
        </>
      }
    >
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-b border-border p-4 lg:flex lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {estados.map((e) => (
              <button
                key={e}
                onClick={() => setEstado(e)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  estado === e
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por número, NIT, contrato…"
            className="h-9 w-full max-w-xs bg-muted/40"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">Factura</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Contrato</th>
                <th className="px-4 py-3 font-medium">Responsable</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Prioridad</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-t border-border transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Star className={cn("h-4 w-4", f.favorito ? "fill-warning text-warning" : "text-muted-foreground/40")} />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link to="/facturas/$id" params={{ id: f.id }} className="hover:text-primary hover:underline">
                      {f.numero}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">{f.origen}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[220px] truncate">{f.proveedor}</p>
                    <p className="num text-[11px] text-muted-foreground">{f.nit}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{f.contrato}</td>
                  <td className="px-4 py-3 text-muted-foreground">{f.responsable}</td>
                  <td className="num px-4 py-3 text-muted-foreground">{f.vence}</td>
                  <td className="num px-4 py-3 text-right font-medium">{money(f.total)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{f.prioridad}</td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={f.estado} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-sm text-muted-foreground">
                    No hay facturas que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
