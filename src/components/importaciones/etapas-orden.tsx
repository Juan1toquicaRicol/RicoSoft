import { AlertTriangle, Check } from "lucide-react";

import { ETAPAS_ORDEN, puedeIrAEtapa, type NumeroEtapa } from "./etapas-orden-config";
import { cn } from "@/lib/utils";

export interface EtapasOrdenNavProps {
  etapaActual: NumeroEtapa;
  /** Mayor etapa a la que ya se llegó (las siguientes quedan deshabilitadas). */
  maxAlcanzada: NumeroEtapa;
  /** Etapas con errores bloqueantes pendientes (solo informativo). */
  etapasConErrores?: ReadonlySet<number>;
  onIr: (etapa: NumeroEtapa) => void;
}

/**
 * Indicador de etapas. Cada etapa es un botón (teclado: Tab/Enter/Espacio) y la
 * actual se marca con aria-current="step".
 *
 * Etapa con errores (no actual): estilo destructive + icono AlertTriangle +
 * texto visible "Con campos pendientes" (no depende solo del color) y pierde la
 * marca de completada. Etapa actual con errores: se mantiene el estilo de
 * etapa actual (aria-current) sin señal de error en el indicador, porque sus
 * errores ya se muestran en la alerta de la propia etapa (el padre no la
 * incluye en `etapasConErrores`).
 */
export function EtapasOrdenNav({
  etapaActual,
  maxAlcanzada,
  etapasConErrores,
  onIr,
}: EtapasOrdenNavProps) {
  return (
    <nav aria-label="Etapas de la orden">
      <ol className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-4">
        {ETAPAS_ORDEN.map(({ numero, etiqueta }) => {
          const actual = numero === etapaActual;
          const habilitada = puedeIrAEtapa(numero, maxAlcanzada);
          const completada = numero < etapaActual && !etapasConErrores?.has(numero);
          const conErrores = !!etapasConErrores?.has(numero) && numero !== etapaActual;
          return (
            <li key={numero} className="flex">
              <button
                type="button"
                aria-current={actual ? "step" : undefined}
                disabled={!habilitada}
                onClick={() => onIr(numero)}
                className={cn(
                  "flex h-full w-full flex-col items-start justify-start gap-0.5 border-b-2 px-1 pb-2 pt-1 text-left text-xs font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                  actual
                    ? "border-blue-600 text-blue-700"
                    : habilitada
                      ? conErrores
                        ? "border-destructive text-destructive hover:border-destructive"
                        : "border-slate-200 text-slate-700 hover:border-slate-400"
                      : "cursor-not-allowed border-slate-200 text-slate-400",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]",
                      actual
                        ? "bg-blue-600 text-white"
                        : conErrores
                          ? "bg-destructive/10 text-destructive"
                          : completada
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {conErrores ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : completada ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      numero
                    )}
                  </span>
                  <span>
                    {numero}. {etiqueta}
                    {completada && <span className="sr-only"> (completada)</span>}
                  </span>
                </span>
                {conErrores && (
                  <span className="pl-8 text-[10px] font-medium">Con campos pendientes</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
