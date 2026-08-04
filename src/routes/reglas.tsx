import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { reglas } from "@/lib/data";

export const Route = createFileRoute("/reglas")({
  head: () => ({
    meta: [
      { title: "Motor de reglas | Facturaflow" },
      { name: "description", content: "Constructor visual de reglas SI/ENTONCES para enrutar y priorizar facturas." },
      { property: "og:title", content: "Motor de reglas | Facturaflow" },
      { property: "og:description", content: "Automatiza la distribución de facturas según proveedor, monto o contrato." },
    ],
  }),
  component: Reglas,
});

function Reglas() {
  return (
    <AppShell
      title="Motor de reglas"
      description="Distribución automática de facturas según condiciones de negocio"
      actions={
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Nueva regla
        </Button>
      }
    >
      <div className="space-y-4">
        {reglas.map((r) => (
          <div key={r.id} className="panel p-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="num shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {r.id}
                  </span>
                  <h2 className="truncate text-sm font-semibold">{r.nombre}</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Prioridad {r.prioridad} · {r.ejecuciones.toLocaleString("es-CO")} ejecuciones
                </p>
              </div>
              <Switch defaultChecked={r.activa} aria-label={`Activar ${r.nombre}`} />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Si</p>
                <ul className="mt-2 space-y-1.5">
                  {r.condiciones.map((c) => (
                    <li key={c} className="text-sm">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="hidden justify-center lg:flex">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="rounded-xl border border-primary/25 bg-primary/8 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Entonces</p>
                <ul className="mt-2 space-y-1.5">
                  {r.acciones.map((a) => (
                    <li key={a} className="text-sm">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
