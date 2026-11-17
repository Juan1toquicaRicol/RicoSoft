import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONOS = {
  error: { caja: "border-red-200 bg-red-50", titulo: "text-red-700", item: "text-red-700" },
  advertencia: {
    caja: "border-amber-200 bg-amber-50",
    titulo: "text-amber-800",
    item: "text-amber-800",
  },
  recomendacion: { caja: "border-slate-200", titulo: "text-slate-500", item: "text-slate-500" },
} as const;

/**
 * Lista de verificación (errores / advertencias / recomendaciones) compartida
 * entre la etapa "Revisar" y el diálogo de verificación final.
 */
export function BloqueVerificacion<T extends { texto: string }>({
  tono,
  titulo,
  items,
  renderItem,
}: {
  tono: keyof typeof TONOS;
  titulo: string;
  items: T[];
  /** Contenido de cada ítem; por defecto "• texto". */
  renderItem?: (item: T) => ReactNode;
}) {
  if (items.length === 0) return null;
  const t = TONOS[tono];
  return (
    <div className={cn("space-y-1 rounded-md border p-3", t.caja)}>
      <p className={cn("text-xs font-bold", t.titulo)}>{titulo}</p>
      <ul className="space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className={cn("text-xs", t.item)}>
            {renderItem ? renderItem(it) : <>• {it.texto}</>}
          </li>
        ))}
      </ul>
    </div>
  );
}
