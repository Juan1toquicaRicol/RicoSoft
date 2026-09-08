import type {
  CampoExtraido,
  DocumentExtractionProvider,
  ResultadoExtraccion,
} from "./extraction-provider";
import { extraerTextoPdf } from "./pdf-text";

const NOMBRE_MOTOR = "regex-v1";

interface ReglaExtraccion {
  campo: string;
  patron: RegExp;
  /** Si se da, el valor final es `formatear(match)` en vez de `match[1]`
   * (ej. reconstruir "PO-4587" en vez de solo "4587"). */
  formatear?: (match: RegExpMatchArray) => string;
}

// Reglas determinísticas (ver §6/§25 de la especificación) — cada una
// intenta un campo concreto y declina en silencio si no encuentra nada.
// Deliberadamente NO exhaustivo en V1: cubre lo que la especificación pide
// como ejemplo obligatorio (PO, ETA, Incoterm, contenedor) más los campos
// logísticos/comerciales de mayor valor operativo inmediato. Ampliar esta
// lista no requiere tocar el resto del pipeline.
const REGLAS: ReglaExtraccion[] = [
  {
    campo: "numeroOrdenProveedor",
    patron: /\bP\.?O\.?[\s:#-]*(\d{3,10})\b/i,
    formatear: (m) => `PO-${m[1]}`,
  },
  { campo: "eta", patron: /\bETA[\s:]*([0-3]?\d[/-][01]?\d[/-]\d{2,4})/i },
  { campo: "etd", patron: /\bETD[\s:]*([0-3]?\d[/-][01]?\d[/-]\d{2,4})/i },
  { campo: "incoterm", patron: /\bIncoterm[\s:]*(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/i },
  { campo: "contenedor", patron: /\bContainer[\s:]*([A-Z]{4}\d{7})\b/i },
  { campo: "contenedor", patron: /\b([A-Z]{4}\d{7})\b/ },
  { campo: "bl", patron: /\bB\/?L(?:\s*(?:No\.?|Number|#))?[\s:#-]*([A-Z0-9]{6,20})\b/i },
  { campo: "awb", patron: /\bAWB(?:\s*(?:No\.?|Number|#))?[\s:#-]*(\d{3}-?\d{8})\b/i },
  {
    campo: "naviera",
    patron: /\b(?:Carrier|Shipping\s*Line|Naviera)[\s:]*([A-Z][A-Za-z\s]{2,40})/i,
  },
  {
    campo: "moneda",
    patron: /\b(USD|EUR|CNY|GBP|JPY)\b/,
  },
  {
    campo: "paisOrigen",
    patron: /\b(?:Country\s*of\s*Origin|Pa[ií]s\s*de\s*Origen)[\s:]*([A-Za-z\s]{3,40})/i,
  },
  { campo: "puertoOrigen", patron: /\b(?:Port\s*of\s*Loading|POL)[\s:]*([A-Za-z\s,]{3,60})/i },
  { campo: "puertoDestino", patron: /\b(?:Port\s*of\s*Discharge|POD)[\s:]*([A-Za-z\s,]{3,60})/i },
];

function contextoAlrededorDe(texto: string, indice: number, largo: number): string {
  const inicio = Math.max(0, indice - 30);
  const fin = Math.min(texto.length, indice + largo + 30);
  return texto.slice(inicio, fin).trim();
}

/** Determina en qué página (1-based) aparece un fragmento — comparando
 * contra el texto de cada página por separado. null si no se puede
 * determinar (ej. texto plano sin páginas). */
function paginaDelFragmento(paginas: string[], fragmento: string): number | undefined {
  const idx = paginas.findIndex((p) => p.includes(fragmento));
  return idx >= 0 ? idx + 1 : undefined;
}

function extraerDeTexto(texto: string, paginas: string[]): CampoExtraido[] {
  const encontrados: CampoExtraido[] = [];
  const camposYaEncontrados = new Set<string>();

  for (const regla of REGLAS) {
    if (camposYaEncontrados.has(regla.campo)) continue; // primera coincidencia gana por campo
    const match = texto.match(regla.patron);
    if (!match) continue;

    const valor = (regla.formatear ? regla.formatear(match) : match[1])?.trim();
    if (!valor) continue;

    const evidencia = contextoAlrededorDe(texto, match.index ?? 0, match[0].length);
    encontrados.push({
      campo: regla.campo,
      valor,
      pagina: paginaDelFragmento(paginas, match[0]),
      confianza: 1,
      evidencia,
    });
    camposYaEncontrados.add(regla.campo);
  }

  return encontrados;
}

/**
 * Escalón 1 del pipeline de extracción (§5 de la especificación): reglas
 * determinísticas sobre texto ya extraído — de un PDF con capa de texto
 * (nativo, no escaneado) o de texto plano. Un PDF escaneado (sin texto) no
 * produce campos — es una señal legítima de "esto necesita OCR o revisión
 * manual" (V1 no tiene OCR, ver auditoría), nunca un error.
 */
export class RegexDocumentExtractionProvider implements DocumentExtractionProvider {
  readonly nombre = NOMBRE_MOTOR;

  puedeProcesar(mimeType: string): boolean {
    return mimeType === "application/pdf" || mimeType === "text/plain";
  }

  async extraer(contenido: Buffer, mimeType: string): Promise<ResultadoExtraccion> {
    if (mimeType === "text/plain") {
      const texto = contenido.toString("utf-8");
      return { motorUsado: NOMBRE_MOTOR, campos: extraerDeTexto(texto, [texto]) };
    }

    const { textoCompleto, paginas } = await extraerTextoPdf(contenido);
    return { motorUsado: NOMBRE_MOTOR, campos: extraerDeTexto(textoCompleto, paginas) };
  }
}
