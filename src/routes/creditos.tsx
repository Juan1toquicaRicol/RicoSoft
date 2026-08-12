import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { useCreditos } from "@/hooks/use-creditos";
import { money } from "@/lib/data";

export const Route = createFileRoute("/creditos")({
  head: () => ({
    meta: [
      { title: "Créditos de clientes | RicoSoft" },
      { name: "description", content: "Cupos, saldos y vencimientos de crédito por cliente con historial de pagos." },
      { property: "og:title", content: "Créditos de clientes | RicoSoft" },
      { property: "og:description", content: "Créditos activos, pendientes y vencidos en un solo panel." },
    ],
  }),
  component: Creditos,
});

function Creditos() {
  const { creditos, loading, error } = useCreditos();
  const total = creditos.reduce((acc, c) => acc + c.cupo, 0);
  const saldo = creditos.reduce((acc, c) => acc + c.saldo, 0);

  return (
    <AppShell title="Créditos de clientes" description="Cupos otorgados y saldos vigentes">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="text-xs text-muted-foreground">Cupo total otorgado</p>
          <p className="num mt-2 text-xl font-semibold">{money(total)}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs text-muted-foreground">Saldo por recaudar</p>
          <p className="num mt-2 text-xl font-semibold">{money(saldo)}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs text-muted-foreground">Utilización del cupo</p>
          <p className="num mt-2 text-xl font-semibold">{total > 0 ? Math.round((saldo / total) * 100) : 0}%</p>
        </div>
      </div>

      <div className="panel mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 text-right font-medium">Cupo</th>
                <th className="px-5 py-3 text-right font-medium">Saldo</th>
                <th className="px-5 py-3 font-medium">Vence</th>
                <th className="px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {creditos.map((c) => (
                <tr key={c.id} className="border-t border-border transition-colors hover:bg-muted/40">
                  <td className="px-5 py-3 font-medium">{c.cliente}</td>
                  <td className="num px-5 py-3 text-right">{money(c.cupo)}</td>
                  <td className="num px-5 py-3 text-right font-medium">{money(c.saldo)}</td>
                  <td className="num px-5 py-3 text-muted-foreground">
                    {new Date(c.vence).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-5 py-3">
                    <EstadoBadge estado={c.estado} />
                  </td>
                </tr>
              ))}
              {creditos.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-sm text-muted-foreground">
                    {loading ? "Cargando créditos..." : error || "No hay créditos registrados."}
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
