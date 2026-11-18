import { useState } from "react";

import { BiometricoFuentesPanel } from "./biometrico-fuentes-panel";
import { BiometricoMarcacionesPanel } from "./biometrico-marcaciones-panel";
import { BiometricoSincronizacionesPanel } from "./biometrico-sincronizaciones-panel";

export type VistaBiometrico = "fuentes" | "sincronizaciones" | "marcaciones";

const VISTAS: { id: VistaBiometrico; etiqueta: string }[] = [
  { id: "fuentes", etiqueta: "Fuentes y asociaciones" },
  { id: "sincronizaciones", etiqueta: "Sincronizaciones" },
  { id: "marcaciones", etiqueta: "Marcaciones" },
];

type PropsFuentes = Parameters<typeof BiometricoFuentesPanel>[0];

/** Pestaña Biométrico: administración (fuentes/asociaciones) y seguimiento (sincronizaciones/marcaciones). */
export function BiometricoPanel({
  puedeSincronizar,
  visibleVistas,
  empleadosCargando,
  errorEmpleados,
  ...propsFuentes
}: PropsFuentes & {
  puedeSincronizar: boolean;
  visibleVistas?: VistaBiometrico[];
  empleadosCargando?: boolean;
  errorEmpleados?: string;
}) {
  const vistasVisibles = visibleVistas ?? VISTAS.map((v) => v.id);
  const [vista, setVista] = useState<VistaBiometrico>(() => vistasVisibles[0] ?? "fuentes");
  const vistas = VISTAS.filter((v) => vistasVisibles.includes(v.id));

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Biométrico" className="flex gap-2">
        {vistas.map((v) => (
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

      {vista === "fuentes" && vistasVisibles.includes("fuentes") && (
        <BiometricoFuentesPanel
          {...propsFuentes}
          empleadosCargando={empleadosCargando}
          errorEmpleados={errorEmpleados}
        />
      )}
      {vista === "sincronizaciones" && vistasVisibles.includes("sincronizaciones") && (
        <BiometricoSincronizacionesPanel puedeSincronizar={puedeSincronizar} />
      )}
      {vista === "marcaciones" && vistasVisibles.includes("marcaciones") && (
        <BiometricoMarcacionesPanel />
      )}
    </div>
  );
}
