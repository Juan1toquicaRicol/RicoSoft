import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";

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
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-12 px-6 text-center",
        className,
      )}
    >
      <div className="rounded-full border border-estado-neutral-border bg-estado-neutral-bg p-3 text-estado-neutral-fg">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Estado de carga estándar (fuera de tablas; dentro de una tabla usar
 * TableMessageRow kind="loading"): spinner + texto, con role="status" para
 * lectores de pantalla.
 */
export function EstadoCarga({
  texto = "Cargando...",
  className,
}: {
  texto?: string;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn("flex items-center gap-2 py-6 text-xs text-slate-500", className)}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      {texto}
    </p>
  );
}
