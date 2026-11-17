/**
 * Preserva el espíritu de la validación nativa `step="0.01"` que el formulario
 * de nueva orden tenía cuando todos los inputs estaban montados a la vez. Con
 * las etapas solo se monta la visible, así que el navegador ya no valida los
 * campos de las demás; esta función las revisa sobre el ESTADO, sin importar
 * qué etapa esté visible. No es una regla de negocio nueva.
 *
 * Regla implementada: el formulario aplica una regla CONSERVADORA de máximo dos
 * decimales sobre la representación numérica que conserva el estado (la
 * representación decimal más corta de ida y vuelta, String(n)), contando
 * dígitos fraccionarios: más de 2 => rechazado. No hay tolerancia proporcional.
 * Esta lógica no pretende replicar exactamente la evaluación del navegador.
 *
 * LÍMITES (no se aproximan en silencio):
 * - El estado guarda Number(texto): si el usuario escribió más de ~17 dígitos
 *   significativos, el double ya perdió el texto original (p. ej.
 *   "0.1000000000000000001" queda 0.1) y esta validación no lo ve; detectarlo
 *   exigiría guardar el texto crudo.
 * - Un double calculado como 0.1 + 0.2 (0.30000000000000004) se RECHAZA: su
 *   representación tiene 17 decimales. Un usuario no puede escribir ese valor.
 */

const PASO = 0.01;
const MAX_DECIMALES = 2;

/** Cantidad de dígitos fraccionarios de la representación decimal más corta del número. */
export function digitosFraccionarios(valor: number): number {
  const texto = String(Math.abs(valor));
  const iExp = texto.search(/e/i);
  const mantisa = iExp === -1 ? texto : texto.slice(0, iExp);
  const exponente = iExp === -1 ? 0 : Number(texto.slice(iExp + 1));
  const punto = mantisa.indexOf(".");
  const fraccion = punto === -1 ? 0 : mantisa.length - punto - 1;
  return Math.max(0, fraccion - exponente);
}

/** true si el valor es múltiplo de 0.01 (decimal exacto, sin tolerancia). */
export function cumplePasoCentavos(valor: number): boolean {
  if (!Number.isFinite(valor)) return true; // otras reglas existentes lo cubren
  return digitosFraccionarios(valor) <= MAX_DECIMALES;
}

/** Equivalente al mensaje nativo: los dos valores válidos más cercanos. */
export function valoresValidosCercanos(valor: number): [number, number] {
  const abajo = Math.floor(Number((valor / PASO).toFixed(6))) * PASO;
  return [Number(abajo.toFixed(2)), Number((abajo + PASO).toFixed(2))];
}

const formatoEsCo = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });

export interface ErrorPrecision {
  /** Etapa visual donde vive el campo (1 = Datos comerciales, 2 = Ítems). */
  etapa: 1 | 2;
  /** id del input en el DOM, para llevar el foco cuando su etapa esté montada. */
  campoId: string;
  texto: string;
}

export function idCampoItem(idx: number, campo: "cantidad" | "peso" | "fob"): string {
  return `item-${idx}-${campo}`;
}

export const ID_CAMPO_TRM = "trm-pactada";

function mensaje(etiqueta: string, valor: number): string {
  const [a, b] = valoresValidosCercanos(valor);
  return `${etiqueta}: introduce un valor válido (múltiplo de 0,01). Los dos valores válidos más cercanos son ${formatoEsCo(a)} y ${formatoEsCo(b)}.`;
}

export interface EntradaPrecision {
  trmPactada: number;
  items: ReadonlyArray<{
    cantidad: number;
    pesoKg?: number | null;
    valorUnitarioFob: number;
  }>;
}

/** Revisa TRM pactada y TODOS los ítems (visibles o no). */
export function validarPrecisionDecimales(entrada: EntradaPrecision): ErrorPrecision[] {
  const errores: ErrorPrecision[] = [];
  if (!cumplePasoCentavos(entrada.trmPactada)) {
    errores.push({
      etapa: 1,
      campoId: ID_CAMPO_TRM,
      texto: mensaje("Tasa de cambio pactada", entrada.trmPactada),
    });
  }
  entrada.items.forEach((it, idx) => {
    const n = idx + 1;
    if (!cumplePasoCentavos(Number(it.cantidad))) {
      errores.push({
        etapa: 2,
        campoId: idCampoItem(idx, "cantidad"),
        texto: mensaje(`Ítem ${n}: Cantidad`, Number(it.cantidad)),
      });
    }
    if (it.pesoKg != null && !cumplePasoCentavos(Number(it.pesoKg))) {
      errores.push({
        etapa: 2,
        campoId: idCampoItem(idx, "peso"),
        texto: mensaje(`Ítem ${n}: Peso total (Kg)`, Number(it.pesoKg)),
      });
    }
    if (!cumplePasoCentavos(Number(it.valorUnitarioFob))) {
      errores.push({
        etapa: 2,
        campoId: idCampoItem(idx, "fob"),
        texto: mensaje(`Ítem ${n}: FOB unitario`, Number(it.valorUnitarioFob)),
      });
    }
  });
  return errores;
}
