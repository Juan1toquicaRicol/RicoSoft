import { CheckCircle2, Copy, FileText, Ship, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { copiarTexto } from "./orden-creada";
import { Button } from "@/components/ui/button";

export interface OrdenCreadaAvisoProps {
  /** Número DEFINITIVO devuelto por el servidor (orden.codigo). */
  codigo: string;
  /** Si se omite, no se muestra la acción (p. ej. falta de permiso). */
  onAdjuntarDocumentos?: () => void;
  onCrearLotes?: () => void;
  onCerrar: () => void;
}

/**
 * Confirmación posterior a registrar una orden: número definitivo destacado,
 * "Copiar número" con feedback accesible y siguiente paso. Los documentos se
 * adjuntan DESPUÉS de persistir la orden, por eso el paso 1 es documentos.
 */
export function OrdenCreadaAviso({
  codigo,
  onAdjuntarDocumentos,
  onCrearLotes,
  onCerrar,
}: OrdenCreadaAvisoProps) {
  const [mensajeCopia, setMensajeCopia] = useState("");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  const handleCopiar = async () => {
    const ok = await copiarTexto(codigo);
    setMensajeCopia(
      ok ? `Número ${codigo} copiado al portapapeles.` : "No se pudo copiar el número.",
    );
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setMensajeCopia(""), 4000);
  };

  const haySiguientePaso = !!onAdjuntarDocumentos || !!onCrearLotes;

  return (
    <section
      aria-labelledby="orden-creada-titulo"
      className="mb-4 rounded-lg border border-emerald-200 bg-white shadow-2xs"
    >
      <div className="flex items-start justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <h2 id="orden-creada-titulo" className="text-sm font-bold text-slate-900">
              Orden creada
            </h2>
            <p className="text-xs text-slate-600">
              La orden de importación se guardó correctamente.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar aviso de orden creada"
          className="rounded p-1 text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-4 py-3">
        <div>
          <p className="text-[11px] text-slate-500">Número de orden (definitivo)</p>
          <p data-testid="numero-definitivo" className="text-3xl font-extrabold text-slate-900">
            {codigo}
          </p>
        </div>
        <Button type="button" size="sm" onClick={handleCopiar} className="gap-2">
          <Copy className="h-4 w-4" aria-hidden="true" /> Copiar número
        </Button>
        <p role="status" aria-live="polite" className="text-xs font-medium text-emerald-700">
          {mensajeCopia}
        </p>
      </div>

      {haySiguientePaso && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-xs font-bold text-slate-700">Siguiente paso:</span>
          {onAdjuntarDocumentos && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onAdjuntarDocumentos}
              className="gap-2 border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
            >
              <FileText className="h-4 w-4" aria-hidden="true" /> Adjuntar documentos
            </Button>
          )}
          {onAdjuntarDocumentos && onCrearLotes && (
            <span aria-hidden="true" className="text-slate-400">
              ›
            </span>
          )}
          {onCrearLotes && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCrearLotes}
              className="gap-2 border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
            >
              <Ship className="h-4 w-4" aria-hidden="true" /> Crear lotes de embarque
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
