import * as React from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  /**
   * Énfasis del ícono. La identidad visual es monocromática: "atencion" NO
   * usa ámbar/rojo, se distingue por el ícono (típicamente AlertTriangle)
   * dentro de un contorno negro sólido en vez del acento azul por defecto.
   */
  enfasis?: "default" | "atencion";
  /** Variación porcentual opcional frente a un periodo anterior, p. ej. 8.2 o -3.5. */
  tendencia?: number;
  tendenciaEtiqueta?: string;
  className?: string;
}

/**
 * Tarjeta de KPI reutilizable para pantallas ejecutivas (Dashboard y
 * similares). Reemplaza los StatCard locales que cada página reinventaba
 * con tonos ámbar/esmeralda — acá el único acento es azul, y "atención" se
 * expresa con contorno negro + ícono, no con un semáforo de colores.
 */
export function StatCard({ label, value, hint, icon: Icon, enfasis = "default", tendencia, tendenciaEtiqueta, className }: StatCardProps) {
  const iconoClasses =
    enfasis === "atencion" ? "bg-slate-900 text-white border-slate-900" : "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <div className={cn("panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
          {typeof tendencia === "number" && (
            <p
              className={cn(
                "mt-1.5 inline-flex items-center gap-1 text-xs font-bold",
                tendencia >= 0 ? "text-blue-700" : "text-slate-600",
              )}
            >
              {tendencia >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {tendencia >= 0 ? "+" : ""}
              {tendencia.toFixed(1)}%{tendenciaEtiqueta ? ` ${tendenciaEtiqueta}` : ""}
            </p>
          )}
        </div>
        <div className={cn("shrink-0 rounded-lg border p-2.5", iconoClasses)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
      <div className="h-3 w-24 rounded bg-slate-100 animate-pulse" />
      <div className="h-7 w-20 rounded bg-slate-100 animate-pulse" />
      <div className="h-3 w-32 rounded bg-slate-100 animate-pulse" />
    </div>
  );
}
