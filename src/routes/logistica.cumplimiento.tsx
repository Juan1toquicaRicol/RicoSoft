import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Truck } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCumplimientoLogistico } from "@/hooks/use-logistica";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/logistica/cumplimiento")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.DESPACHOS_VER),
  head: () => ({
    meta: [
      { title: "Cumplimiento logístico | RicoSoft" },
      {
        name: "description",
        content:
          "OTIF: % de despachos entregados a tiempo, calculado sobre datos reales del tenant.",
      },
    ],
  }),
  component: CumplimientoLogisticoPage,
});

function CumplimientoLogisticoPage() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const { cumplimiento, loading, error } = useCumplimientoLogistico({
    desde: desde || undefined,
    hasta: hasta || undefined,
  });

  return (
    <AppShell
      title="Cumplimiento logístico"
      description="¿Estamos entregando a tiempo? — OTIF calculado sobre los despachos reales del tenant."
      actions={
        <Link to="/logistica/novedades-abiertas">
          <Button variant="outline" size="sm" className="gap-2">
            <Truck className="h-4 w-4" /> Novedades abiertas
          </Button>
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase">Desde</Label>
          <Input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="h-9 w-40 text-xs border-slate-300 bg-white"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase">Hasta</Label>
          <Input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="h-9 w-40 text-xs border-slate-300 bg-white"
          />
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-slate-900">{error}</p>}

      {loading && (
        <div className="panel p-12 text-center text-xs text-slate-500 bg-white border-slate-200 shadow-2xs">
          Cargando...
        </div>
      )}

      {!loading && cumplimiento && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              OTIF (a tiempo)
            </p>
            <p className="num mt-1 flex items-center gap-2 text-3xl font-bold text-slate-900">
              {cumplimiento.otifPct === null ? "—" : `${cumplimiento.otifPct}%`}
              {cumplimiento.otifPct !== null && cumplimiento.otifPct >= 90 && (
                <CheckCircle2 className="h-6 w-6 text-blue-700" />
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {cumplimiento.otifPct === null
                ? "Sin despachos evaluables en el período (falta fecha estimada o real)."
                : `${cumplimiento.aTiempo} de ${cumplimiento.totalEvaluable} despachos entregados a tiempo.`}
            </p>
          </div>
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Despachos evaluados
            </p>
            <p className="num mt-1 text-3xl font-bold text-slate-900">
              {cumplimiento.totalEvaluable}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              ENTREGADO o ENTREGA_PARCIAL con fecha estimada y real registradas.
            </p>
          </div>
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Sin datos para evaluar
            </p>
            <p className="num mt-1 text-3xl font-bold text-slate-900">
              {cumplimiento.sinFechaEstimada}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Despachos entregados sin fecha estimada u real — no cuentan ni a favor ni en contra.
            </p>
          </div>
        </div>
      )}

      <p className="mt-6 text-[11px] text-slate-400">
        OTIF mide únicamente "a tiempo" (fecha real ≤ fecha estimada). No mide "en full" (cantidad
        completa por línea) — esa comparación requiere un umbral de negocio todavía no definido (ver
        Fase 2.1 del Motor de Decisiones).
      </p>
    </AppShell>
  );
}
