import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HitoLote, LoteImportacion, TipoHitoLoteManual } from "@/hooks/use-importaciones";

function formatoFechaUtc(valor: string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

const HITOS_MANUALES: TipoHitoLoteManual[] = [
  "EMBARQUE_REAL",
  "LLEGADA_PUERTO",
  "INSPECCION_ADUANERA",
];

export interface HitosLotePanelProps {
  lote: LoteImportacion;
  canManage: boolean;
  onRegistrar: (
    loteId: string,
    tipo: TipoHitoLoteManual,
    fecha: string,
    nota?: string,
  ) => Promise<void>;
  onEliminar: (loteId: string, tipo: TipoHitoLoteManual) => Promise<void>;
}

/**
 * Hechos reales del recorrido del lote, con su origen. Las estimaciones (ETA del
 * proveedor y ETA del tracking) se muestran aparte y NUNCA reemplazan a un hito:
 * son datos con dueños distintos. La recepción en planta la registra el sistema
 * al recibir el lote; el levante viene del expediente aduanero.
 */
export function HitosLotePanel({ lote, canManage, onRegistrar, onEliminar }: HitosLotePanelProps) {
  const [fechas, setFechas] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  const hitos: HitoLote[] = lote.hitos ?? [];

  const registrar = async (tipo: TipoHitoLoteManual) => {
    const fecha = fechas[tipo];
    if (!fecha) {
      toast.error("Selecciona la fecha del hito.");
      return;
    }
    setGuardando(tipo);
    try {
      await onRegistrar(lote.id, tipo, fecha);
      setFechas((prev) => ({ ...prev, [tipo]: "" }));
      toast.success("Hito registrado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible registrar el hito.");
    } finally {
      setGuardando(null);
    }
  };

  const eliminar = async (tipo: TipoHitoLoteManual, etiqueta: string) => {
    if (!confirm(`¿Retirar el hito "${etiqueta}"? Quedará constancia en el historial.`)) return;
    setGuardando(tipo);
    try {
      await onEliminar(lote.id, tipo);
      toast.success("Hito retirado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible retirar el hito.");
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="rounded-md border border-slate-200 p-3 space-y-2">
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Hitos reales del lote
        </h4>
        <p className="text-[10px] text-slate-500">
          Hechos con fecha y origen. Las estimaciones no los reemplazan.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
        <p>
          <span className="font-semibold">ETA informada por el proveedor (estimación):</span>{" "}
          {formatoFechaUtc(lote.fechaLlegadaEstimada)}
        </p>
        <p>
          <span className="font-semibold">ETA del tracking marítimo (estimación):</span>{" "}
          {formatoFechaUtc(lote.tracking?.etaActual ?? null)}
        </p>
      </div>

      <ul className="divide-y divide-slate-100">
        {hitos.length === 0 && (
          <li className="py-1.5 text-[11px] text-slate-400">Sin información de hitos.</li>
        )}
        {hitos.map((h) => {
          const manual = HITOS_MANUALES.includes(h.tipo as TipoHitoLoteManual);
          const tipoManual = h.tipo as TipoHitoLoteManual;
          return (
            <li key={h.tipo} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="w-48 text-[11px] font-semibold text-slate-700">{h.etiqueta}</span>
              <span className="w-28 text-[11px] text-slate-800">{formatoFechaUtc(h.fecha)}</span>
              <span className="text-[10px] text-slate-500">
                {h.fecha
                  ? `${h.origen ?? "—"}${h.registradoPor ? ` · ${h.registradoPor}` : ""}${
                      h.fuente ? ` · ${h.fuente}` : ""
                    }`
                  : "Sin registrar"}
              </span>
              {manual && canManage && (
                <span className="ml-auto flex items-center gap-1">
                  <Input
                    type="date"
                    value={fechas[h.tipo] ?? ""}
                    onChange={(e) => setFechas((prev) => ({ ...prev, [h.tipo]: e.target.value }))}
                    className="h-7 w-36 text-[11px] border-slate-300"
                  />
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={guardando === h.tipo}
                    onClick={() => registrar(tipoManual)}
                  >
                    {h.fecha ? "Corregir" : "Registrar"}
                  </Button>
                  {h.fecha && (
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      title="Retirar hito"
                      disabled={guardando === h.tipo}
                      onClick={() => eliminar(tipoManual, h.etiqueta)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
