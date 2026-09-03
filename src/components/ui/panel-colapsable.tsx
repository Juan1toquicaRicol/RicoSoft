import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanelColapsableProps {
  title: ReactNode;
  description?: ReactNode;
  /** Contenido a la derecha del header (KPI, badge, total) — visible incluso cerrado. */
  actions?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Panel con header clickeable que se puede contraer, para que páginas con
 * muchas secciones (ej. Analítica) no abrumen al usuario por defecto. El
 * contenido se desmonta al cerrar (no solo se oculta con CSS) para que los
 * gráficos de recharts (ResponsiveContainer) se midan de nuevo limpios al
 * reabrir, en vez de heredar un tamaño 0 de cuando estaban ocultos.
 */
export function PanelColapsable({
  title,
  description,
  actions,
  defaultOpen = true,
  className,
  children,
}: PanelColapsableProps) {
  const [abierto, setAbierto] = useState(defaultOpen);

  return (
    <div className={cn("panel bg-white border-slate-200 shadow-2xs", className)}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-5 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {actions}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-400 transition-transform",
              abierto ? "rotate-180" : "rotate-0",
            )}
          />
        </div>
      </button>
      {abierto && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}
