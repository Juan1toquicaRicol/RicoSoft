import { useState } from "react";

import { BiometricoFuentesPanel } from "./biometrico-fuentes-panel";
import { BiometricoMarcacionesPanel } from "./biometrico-marcaciones-panel";
import { BiometricoSincronizacionesPanel } from "./biometrico-sincronizaciones-panel";

type Vista = "fuentes" | "sincronizaciones" | "marcaciones";

const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: "fuentes", etiqueta: "Fuentes y asociaciones" },
  { id: "sincronizaciones", etiqueta: "Sincronizaciones" },
  { id: "marcaciones", etiqueta: "Marcaciones" },
];

type PropsFuentes = Parameters<typeof BiometricoFuentesPanel>[0];

/** Pestaña Biométrico: administración (fuentes/asociaciones) y seguimiento (sincronizaciones/marcaciones). */
export function BiometricoPanel({
  puedeSincronizar,
  ...propsFuentes
}: PropsFuentes & { puedeSincronizar: boolean }) {
  const [vista, setVista] = useState<Vista>("fuentes");

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Biométrico" className="flex gap-2">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={vista === v.id}
            onClick={() => setVista(v.id)}
            className={`rounded-md border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
              vista === v.id
                ? "border-blue-800 bg-blue-800 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:text-slate-900"
            }`}
          >
            {v.etiqueta}
          </button>
        ))}
      </div>

      {vista === "fuentes" && <BiometricoFuentesPanel {...propsFuentes} />}
      {vista === "sincronizaciones" && (
        <BiometricoSincronizacionesPanel puedeSincronizar={puedeSincronizar} />
      )}
      {vista === "marcaciones" && <BiometricoMarcacionesPanel />}
    </div>
  );
}
