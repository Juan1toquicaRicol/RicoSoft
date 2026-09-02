import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { useOportunidadComercial } from "@/hooks/use-oportunidades";
import { formatCantidad, money } from "@/lib/data";

export const Route = createFileRoute("/oportunidades")({
  head: () => ({
    meta: [
      { title: "Oportunidades | RicoSoft" },
      {
        name: "description",
        content:
          "Oportunidad comercial: qué le podemos vender a cada cliente con el inventario disponible hoy, según su historial real de compras.",
      },
      { property: "og:title", content: "Oportunidades | RicoSoft" },
      { property: "og:description", content: "A quién le podemos vender el inventario disponible." },
    ],
  }),
  component: Oportunidades,
});

function Oportunidades() {
  const { oportunidad, loading } = useOportunidadComercial();

  return (
    <AppShell
      title="Oportunidades"
      description="Clientes que ya compran productos que tenemos disponibles hoy — según su historial real de compras en Siesa"
    >
      {loading && <p className="text-xs text-slate-500">Cargando...</p>}

      {!loading && !oportunidad.disponible && (
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
          {oportunidad.motivo ?? "Oportunidad comercial no disponible."}
        </div>
      )}

      {!loading && oportunidad.disponible && (
        <>
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">A quién le podemos vender</h2>
                <p className="text-xs text-slate-500">
                  Clientes que ya compran productos que tenemos disponibles hoy — hasta ~1 mes de su
                  ritmo de compra histórico
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold text-slate-500">Potencial total</p>
                <p className="num text-lg font-bold text-emerald-600">
                  {money(oportunidad.totalPotencialVenta ?? 0)}
                </p>
              </div>
            </div>

            {(oportunidad.clientes ?? []).length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">
                No hay coincidencias entre lo disponible y el historial de compras reciente.
              </p>
            ) : (
              <div className="mt-4 space-y-5">
                {(oportunidad.clientes ?? []).map((cl) => (
                  <div key={cl.clienteRowId ?? cl.clienteNombre} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-800">
                        {cl.clienteNombre ?? "Cliente sin nombre"}
                      </span>
                      <span className="num text-xs font-bold text-emerald-600">
                        {money(cl.potencialTotal)}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {cl.productos.map((p) => (
                        <li key={p.itemRowId} className="flex items-center justify-between text-xs">
                          <span className="min-w-0 truncate text-slate-600">
                            {p.descripcion ?? "Producto sin descripción"}
                            {p.referencia && <span className="text-slate-400"> · {p.referencia}</span>}
                          </span>
                          <span className="num shrink-0 text-slate-500">
                            {formatCantidad(p.cantidadOfertable, p.unidadMedida)} · {money(p.potencialVenta)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Cruza qué le compra cada cliente (últimos 12 meses reales) contra qué hay disponible
              hoy — la cantidad ofertable se limita a ~1 mes de ritmo histórico de compra, nunca más.
            </span>
          </div>
        </>
      )}
    </AppShell>
  );
}
