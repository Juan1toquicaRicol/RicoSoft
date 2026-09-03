import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Gauge } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNovedadesAbiertas } from "@/hooks/use-logistica";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/logistica/novedades-abiertas")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.DESPACHOS_VER),
  head: () => ({
    meta: [
      { title: "Novedades abiertas | RicoSoft" },
      {
        name: "description",
        content: "Cola de novedades de despacho sin resolver, ordenada por antigüedad, con recurrencia por tipo y cliente.",
      },
    ],
  }),
  component: NovedadesAbiertasPage,
});

function NovedadesAbiertasPage() {
  const { novedades, porTipo, porCliente, loading, error } = useNovedadesAbiertas();

  return (
    <AppShell
      title="Novedades abiertas"
      description="¿Qué novedad escalar? — cola ordenada por antigüedad; el sistema no decide el umbral de escalamiento, eso es una decisión operativa."
      actions={
        <Link to="/logistica/cumplimiento">
          <Button variant="outline" size="sm" className="gap-2">
            <Gauge className="h-4 w-4" /> Cumplimiento (OTIF)
          </Button>
        </Link>
      }
    >
      {error && <p className="text-sm font-semibold text-slate-900">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs lg:col-span-2">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-900">Cola por antigüedad</h2>
            <p className="text-xs text-slate-500">La más vieja primero — es la que más urge resolver o escalar.</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow className="hover:bg-slate-100/80">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Antigüedad
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Tipo
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Cliente
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Descripción
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Despacho
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      Cargando...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && novedades.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      Sin novedades abiertas — al día.
                    </TableCell>
                  </TableRow>
                )}
                {novedades.map((n) => (
                  <TableRow key={n.id} className={n.diasAbierta >= 3 ? "bg-slate-50" : undefined}>
                    <TableCell className="text-xs font-semibold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        {n.diasAbierta >= 3 && <AlertTriangle className="h-3.5 w-3.5 text-slate-500" />}
                        {n.diasAbierta} {n.diasAbierta === 1 ? "día" : "días"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {n.tipo.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">{n.clienteNombre}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      <div className="min-w-0 max-w-[280px] truncate">{n.descripcion}</div>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <Link
                        to="/despachos/$id"
                        params={{ id: n.despachoId }}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        Ver despacho
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Recurrencia por tipo</h2>
            <p className="text-xs text-slate-500">¿Dónde estamos fallando más seguido?</p>
            <ul className="mt-3 space-y-2">
              {porTipo.length === 0 && <p className="text-xs text-slate-500">Sin datos.</p>}
              {porTipo.map((t) => (
                <li key={t.clave} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">{t.clave.replace(/_/g, " ")}</span>
                  <span className="num font-bold text-slate-900">{t.cantidad}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">Recurrencia por cliente</h2>
            <p className="text-xs text-slate-500">¿Qué cliente tiene un problema estructural, no un incidente?</p>
            <ul className="mt-3 space-y-2">
              {porCliente.length === 0 && <p className="text-xs text-slate-500">Sin datos.</p>}
              {porCliente.map((c) => (
                <li key={c.clave} className="flex items-center justify-between text-xs">
                  <span className="min-w-0 truncate text-slate-700">{c.clave}</span>
                  <span className="num font-bold text-slate-900">{c.cantidad}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
