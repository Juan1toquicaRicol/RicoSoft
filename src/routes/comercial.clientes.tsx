import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCentroComercial } from "@/hooks/use-ventas";
import { useOportunidadComercial } from "@/hooks/use-oportunidades";
import { money } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Comercial > Clientes — Motor de Decisiones, Fase 2.1 P0: responde "¿qué
 * cliente recuperar?" y "¿a quién debo venderle?" en un solo lugar. NO
 * recalcula nada: reutiliza tal cual GET /ventas/centro (clientes en
 * riesgo, calcularClientesEnRiesgoSiesa) y GET /inventario/oportunidad-
 * comercial (a quién ofrecerle lo disponible hoy) — ambos ya existían,
 * dispersos en /ventas y /oportunidades. Esta página es solo agrupación de
 * presentación, no un cálculo nuevo.
 */
export const Route = createFileRoute("/comercial/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes | RicoSoft" },
      {
        name: "description",
        content:
          "Qué cliente recuperar y a quién venderle: clientes en riesgo y oportunidad comercial en un solo lugar.",
      },
    ],
  }),
  component: ComercialClientesPage,
});

function ComercialClientesPage() {
  const { centro, loading: cargandoRiesgo } = useCentroComercial();
  const { oportunidad, loading: cargandoOportunidad } = useOportunidadComercial();

  return (
    <AppShell
      title="Comercial · Clientes"
      description="Qué cliente recuperar (en riesgo) y a quién venderle (oportunidad) — mismo cálculo que ya existe, en un solo lugar."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Clientes en riesgo — reutiliza GET /ventas/centro tal cual. */}
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                <TrendingDown className="h-4 w-4 text-slate-500" /> Clientes en riesgo
              </h2>
              <p className="text-xs text-slate-500">Inactivos o con caída fuerte este mes</p>
            </div>
            {(centro.totalVentaEnRiesgo ?? 0) > 0 && (
              <div className="text-right">
                <p className="text-[11px] font-semibold text-slate-500">Venta en riesgo (est.)</p>
                <p className="num text-sm font-bold text-slate-900">
                  {money(centro.totalVentaEnRiesgo ?? 0)}
                </p>
              </div>
            )}
          </div>

          {cargandoOportunidad && cargandoRiesgo && (
            <p className="p-5 text-xs text-slate-500">Cargando...</p>
          )}
          {!cargandoRiesgo && !centro.disponible && (
            <p className="p-5 text-xs text-slate-500">
              {centro.motivo ?? "Clientes en riesgo no disponible."}
            </p>
          )}
          {!cargandoRiesgo && centro.disponible && (
            <>
              {(centro.clientesInactivos ?? []).length === 0 &&
                (centro.caidasClientesTop ?? []).length === 0 && (
                  <p className="p-5 text-xs text-slate-500">Sin clientes en riesgo detectados.</p>
                )}

              {(centro.clientesInactivos ?? []).length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/80">
                      <TableRow className="hover:bg-slate-100/80">
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Cliente
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Inactivo hace
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                          Venta estimada perdida
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(centro.clientesInactivos ?? []).map((c) => (
                        <TableRow key={c.clienteRowId} className="hover:bg-slate-50/80">
                          <TableCell className="text-xs font-semibold text-slate-800">
                            {c.clienteNombre ?? "Cliente sin nombre"}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <span
                              className={cn(
                                "num font-semibold",
                                c.severidad === "alta" ? "text-slate-900" : "text-slate-500",
                              )}
                            >
                              {c.diasInactivo} días
                            </span>
                          </TableCell>
                          <TableCell className="num text-right text-xs font-bold text-slate-900">
                            {money(c.ventaEstimadaPerdida)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {(centro.caidasClientesTop ?? []).length > 0 && (
                <div className="border-t border-slate-200 p-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <AlertTriangle className="h-3.5 w-3.5" /> Caídas fuertes este mes
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {(centro.caidasClientesTop ?? []).map((c) => (
                      <li
                        key={c.clienteRowId ?? c.clienteNombre}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="min-w-0 truncate text-slate-700">
                          {c.clienteNombre ?? "Cliente sin nombre"}
                        </span>
                        <span className="num shrink-0 font-semibold text-slate-900">
                          -{c.caidaPct}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-slate-200 px-5 py-3">
                <Link to="/ventas" className="text-xs font-semibold text-blue-700 hover:underline">
                  Ver Centro Operativo Comercial completo (incluye riesgo de quiebre)
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Oportunidad por cliente — reutiliza GET /inventario/oportunidad-comercial tal cual. */}
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                <TrendingUp className="h-4 w-4 text-slate-500" /> A quién venderle
              </h2>
              <p className="text-xs text-slate-500">
                Ya lo compran, hay stock hoy — hasta ~1 mes de su ritmo histórico
              </p>
            </div>
            {(oportunidad.totalPotencialVenta ?? 0) > 0 && (
              <div className="text-right">
                <p className="text-[11px] font-semibold text-slate-500">Potencial total</p>
                <p className="num text-sm font-bold text-slate-900">
                  {money(oportunidad.totalPotencialVenta ?? 0)}
                </p>
              </div>
            )}
          </div>

          {cargandoOportunidad && <p className="p-5 text-xs text-slate-500">Cargando...</p>}
          {!cargandoOportunidad && !oportunidad.disponible && (
            <p className="p-5 text-xs text-slate-500">
              {oportunidad.motivo ?? "Oportunidad comercial no disponible."}
            </p>
          )}
          {!cargandoOportunidad && oportunidad.disponible && (
            <>
              {(oportunidad.clientes ?? []).length === 0 ? (
                <p className="p-5 text-xs text-slate-500">
                  No hay coincidencias entre lo disponible y el historial de compras reciente.
                </p>
              ) : (
                <ul className="max-h-[420px] space-y-3 overflow-y-auto p-4">
                  {(oportunidad.clientes ?? []).slice(0, 15).map((cl) => (
                    <li
                      key={cl.clienteRowId ?? cl.clienteNombre}
                      className="rounded-lg border border-slate-200 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-xs font-bold text-slate-800">
                          {cl.clienteNombre ?? "Cliente sin nombre"}
                        </span>
                        <span className="num shrink-0 text-xs font-bold text-slate-900">
                          {money(cl.potencialTotal)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {cl.productos.length} producto{cl.productos.length === 1 ? "" : "s"} con
                        stock disponible hoy
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-slate-200 px-5 py-3">
                <Link
                  to="/oportunidades"
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Ver detalle completo por producto
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
