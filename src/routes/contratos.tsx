import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { AppShell, EstadoBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { contratos, money } from "@/lib/data";

export const Route = createFileRoute("/contratos")({
  head: () => ({
    meta: [
      { title: "Contratos | Facturaflow" },
      { name: "description", content: "Administración de contratos, supervisores, valores ejecutados y vigencias." },
      { property: "og:title", content: "Contratos | Facturaflow" },
      { property: "og:description", content: "Relaciona cada factura con su contrato y responsable automáticamente." },
    ],
  }),
  component: Contratos,
});

function Contratos() {
  return (
    <AppShell
      title="Contratos"
      description={`${contratos.length} contratos registrados · asignación automática de responsables`}
      actions={
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo contrato
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {contratos.map((c) => {
          const pct = Math.round((c.ejecutado / c.valor) * 100);
          return (
            <div key={c.id} className="panel p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="num text-xs font-semibold text-primary">{c.id}</p>
                  <h2 className="mt-1 truncate text-sm font-semibold">{c.proveedor}</h2>
                  <p className="truncate text-xs text-muted-foreground">{c.empresa}</p>
                </div>
                <EstadoBadge estado={c.estado} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Supervisor</dt>
                  <dd className="truncate font-medium">{c.supervisor}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Área</dt>
                  <dd className="truncate font-medium">{c.area}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Centro de costos</dt>
                  <dd className="num truncate font-medium">{c.centroCostos}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Vigencia</dt>
                  <dd className="num truncate font-medium">
                    {c.inicio} → {c.fin}
                  </dd>
                </div>
              </dl>

              <div className="mt-5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Ejecución</span>
                  <span className="num font-medium">{pct}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="num">{money(c.ejecutado)}</span>
                  <span className="num">{money(c.valor)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
