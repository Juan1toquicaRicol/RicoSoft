import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Estado vacío estándar: ícono + qué significa + qué puede hacer el usuario.
 * Reemplaza los textos sueltos ("No hay resultados.") repetidos en cada
 * tabla del sistema. Se usa típicamente dentro de una celda con colSpan
 * completo, o como contenido de un panel.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-12 px-6 text-center", className)}>
      <div className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
