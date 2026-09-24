/** Resultado de POST /comercial/cotizaciones/siesa/sincronizar (ver cotizaciones-siesa.service.ts). */
export interface ResultadoSincronizacionCotizaciones {
  modo: "SIMULACION" | "GUARDADO";
  total: number;
  nuevas: number;
  yaVinculadas: number;
  creadas: number;
  actualizadas: number;
  omitidas: number;
  errores: { erpRowId: number; consecutivo: string; motivo: string }[];
  advertencias: string[];
}

export interface LineaResumenSincronizacion {
  etiqueta: string;
  valor: number;
  /** Tono del semáforo de estado (lib/estado-tono.ts). */
  tono: "success" | "info" | "warning" | "danger" | "neutral";
}

/**
 * Líneas del resumen que muestra el diálogo. Guardado: "Nuevas creadas" /
 * "Ya vinculadas" (+ actualizadas, omitidas y errores si los hay). Simulación:
 * lo que SE HARÍA ("Nuevas por crear" / "Ya vinculadas").
 */
export function resumenSincronizacion(
  r: ResultadoSincronizacionCotizaciones,
): LineaResumenSincronizacion[] {
  const guardado = r.modo === "GUARDADO";
  const lineas: LineaResumenSincronizacion[] = [
    {
      etiqueta: guardado ? "Nuevas creadas" : "Nuevas por crear",
      valor: guardado ? r.creadas : r.nuevas,
      tono: "success",
    },
    { etiqueta: "Ya vinculadas", valor: r.yaVinculadas, tono: "info" },
  ];
  if (guardado) {
    lineas.push({ etiqueta: "Actualizadas (borrador)", valor: r.actualizadas, tono: "info" });
    if (r.omitidas > 0) {
      lineas.push({
        etiqueta: "Omitidas (ya no son borrador)",
        valor: r.omitidas,
        tono: "neutral",
      });
    }
    if (r.errores.length > 0) {
      lineas.push({ etiqueta: "Con error", valor: r.errores.length, tono: "danger" });
    }
  }
  return lineas;
}

/** Fecha por defecto del selector "desde": hoy menos N días, en formato YYYY-MM-DD. */
export function fechaDesdePorDefecto(hoy: Date = new Date(), dias = 30): string {
  const d = new Date(hoy);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
