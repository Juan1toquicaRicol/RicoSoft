/**
 * Prorrateo de gastos de una liquidación de importación entre los ítems de la
 * orden — función pura, sin I/O.
 *
 * Métodos (la elección la hace quien liquida; el sistema NO escoge uno por su
 * cuenta ni cambia de método en silencio si faltan datos):
 *  - FOB:     participación = valor FOB del ítem / suma de FOB (comportamiento
 *             histórico de liquidarCosteoImportacion).
 *  - PESO:    participación = peso del ítem / suma de pesos.
 *  - VOLUMEN: participación = volumen del ítem / suma de volúmenes.
 *
 * PESO y VOLUMEN exigen dato válido (> 0) en TODOS los ítems: si alguno falta o
 * es cero se devuelve error con la lista de ítems afectados, nunca se divide
 * por cero ni se reparte con otro método.
 *
 * No redondea: devuelve fracciones que suman 1 (salvo error de coma flotante).
 * La regla de redondeo de centavos entre ítems no está definida por negocio
 * (ver Reportes/IMPORTACIONES_AUDITORIA_EVOLUCION_2026-10-26.md, decisión D-3).
 */

export const METODOS_PRORRATEO = ["FOB", "PESO", "VOLUMEN"] as const;
export type MetodoProrrateo = (typeof METODOS_PRORRATEO)[number];

/**
 * Métodos que el negocio ha aprobado para usarse. SOLO FOB está resuelto
 * (Reportes/ARCHITECTURAL_DECISIONS_PENDING.md #2); PESO y VOLUMEN esperan la
 * decisión contable #3 y el cálculo existe pero NO se puede invocar desde la API.
 * Para aprobar un método se amplía esta lista por decisión explícita.
 */
export const METODOS_PRORRATEO_APROBADOS: readonly MetodoProrrateo[] = ["FOB"];

export function esMetodoAprobado(metodo: MetodoProrrateo): boolean {
  return METODOS_PRORRATEO_APROBADOS.includes(metodo);
}

export function esMetodoProrrateo(valor: unknown): valor is MetodoProrrateo {
  return typeof valor === "string" && (METODOS_PRORRATEO as readonly string[]).includes(valor);
}

export interface ItemParaProrrateo {
  itemId: string;
  descripcion: string;
  fobUsd: number;
  pesoKg: number | null;
  volumenM3: number | null;
}

export type ResultadoProrrateo =
  | { ok: true; metodo: MetodoProrrateo; participaciones: Map<string, number> }
  | { ok: false; mensaje: string; itemsSinDato: string[] };

const ETIQUETA_BASE: Record<MetodoProrrateo, string> = {
  FOB: "valor FOB",
  PESO: "peso (kg)",
  VOLUMEN: "volumen (m³)",
};

function valorBase(item: ItemParaProrrateo, metodo: MetodoProrrateo): number | null {
  if (metodo === "FOB") return item.fobUsd;
  if (metodo === "PESO") return item.pesoKg;
  return item.volumenM3;
}

export function calcularParticipaciones(
  items: ItemParaProrrateo[],
  metodo: MetodoProrrateo,
): ResultadoProrrateo {
  if (items.length === 0) {
    return { ok: false, mensaje: "La orden no tiene ítems para prorratear.", itemsSinDato: [] };
  }

  const invalidos = items.filter((item) => {
    const base = valorBase(item, metodo);
    return base === null || !Number.isFinite(base) || base <= 0;
  });

  if (invalidos.length > 0) {
    const nombres = invalidos.map((i) => i.descripcion);
    if (metodo === "FOB") {
      // Un ítem con FOB 0 es legítimo (muestra sin cargo) mientras la suma sea
      // positiva: solo es error que NADIE aporte valor (no se puede repartir).
      const suma = items.reduce((acc, i) => acc + (Number.isFinite(i.fobUsd) ? i.fobUsd : 0), 0);
      if (suma <= 0) {
        return {
          ok: false,
          mensaje: "El valor FOB total de la orden debe ser mayor a cero para prorratear costos.",
          itemsSinDato: nombres,
        };
      }
    } else {
      return {
        ok: false,
        mensaje: `No se puede prorratear por ${ETIQUETA_BASE[metodo]}: falta el dato o es cero en ${invalidos.length} ítem(s): ${nombres.join(", ")}.`,
        itemsSinDato: nombres,
      };
    }
  }

  const suma = items.reduce((acc, item) => {
    const base = valorBase(item, metodo);
    return acc + (base !== null && Number.isFinite(base) && base > 0 ? base : 0);
  }, 0);
  if (!(suma > 0)) {
    return {
      ok: false,
      mensaje: `La suma de ${ETIQUETA_BASE[metodo]} de los ítems debe ser mayor a cero para prorratear costos.`,
      itemsSinDato: [],
    };
  }

  const participaciones = new Map<string, number>();
  for (const item of items) {
    const base = valorBase(item, metodo);
    const valido = base !== null && Number.isFinite(base) && base > 0 ? base : 0;
    participaciones.set(item.itemId, valido / suma);
  }
  return { ok: true, metodo, participaciones };
}
