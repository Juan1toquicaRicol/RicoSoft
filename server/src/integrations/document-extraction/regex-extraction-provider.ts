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

// El texto de un PDF llega en una sola línea (pdf-text.ts une los fragmentos
// con espacios), así que un valor libre como "China" o "Shanghai" no tiene un
// delimitador propio: sin un tope, la captura absorbe la etiqueta siguiente
// ("China Currency", "Shanghai Port of Discharge"). VALOR_TEXTO captura lo
// mínimo posible y FIN_VALOR lo corta en la siguiente etiqueta conocida, en
// puntuación de cierre o al final del texto.
const ETIQUETAS_SIGUIENTES = [
  String.raw`Container`,
  String.raw`Carrier`,
  String.raw`Currency`,
  String.raw`Country\s+of\s+Origin`,
  String.raw`Pa[ií]s\s+de\s+Origen`,
  String.raw`Port\s+of\s+(?:Loading|Discharge)`,
  String.raw`POL`,
  String.raw`POD`,
  String.raw`Shipping\s+Line`,
  String.raw`Naviera`,
  String.raw`ETA`,
  String.raw`ETD`,
  String.raw`Incoterm`,
  String.raw`B\/?L`,
  String.raw`AWB`,
  String.raw`Referencia`,
  String.raw`Condici[oó]n`,
  String.raw`Notes?`,
  String.raw`Notas`,
].join("|");
const VALOR_TEXTO = "[A-Za-z][A-Za-z ,]{1,58}?";
const FIN_VALOR = String.raw`(?=\s+(?:${ETIQUETAS_SIGUIENTES})\b|\s*[.;|\n]|\s*$)`;

// Reglas determinísticas (ver §6/§25 de la especificación) — cada una
// intenta un campo concreto y declina en silencio si no encuentra nada.
// Deliberadamente NO exhaustivo en V1: cubre lo que la especificación pide
// como ejemplo obligatorio (PO, ETA, Incoterm, contenedor) más los campos
// logísticos/comerciales de mayor valor operativo inmediato. Ampliar esta
// lista no requiere tocar el resto del pipeline.
const REGLAS_PROVEEDOR: ReglaExtraccion[] = [
  {
    campo: "nombreProveedor",
    patron:
      /(?:^|\n)[ \t]*(?:Proveedor(?:[ \t]+de[ \t]+referencia)?|Supplier|Vendor)[ \t]*(?::|\r?\n)[ \t]*([^\r\n:]{3,140})/im,
  },
  {
    campo: "nitProveedor",
    patron:
      /(?:^|\n)[ \t]*(?:NIT[ \t]+(?:del[ \t]+)?proveedor|Supplier[ \t]+Tax[ \t]+ID|Vendor[ \t]+Tax[ \t]+ID)[ \t]*:[ \t]*([A-Z0-9][A-Z0-9.\- ]{3,39})/im,
  },
];

const REGLAS: ReglaExtraccion[] = [
  ...REGLAS_PROVEEDOR,
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
    patron: new RegExp(
      String.raw`\b(?:Carrier|Shipping\s*Line|Naviera)[\s:]*(${VALOR_TEXTO})${FIN_VALOR}`,
      "i",
    ),
  },
  {
    campo: "moneda",
    patron: /\b(USD|EUR|CNY|GBP|JPY)\b/,
  },
  {
    campo: "paisOrigen",
    patron: new RegExp(
      String.raw`\b(?:Country\s*of\s*Origin|Pa[ií]s\s*de\s*Origen)[\s:]*(${VALOR_TEXTO})${FIN_VALOR}`,
      "i",
    ),
  },
  {
    campo: "puertoOrigen",
    patron: new RegExp(
      String.raw`\b(?:Port\s*of\s*Loading|POL)[\s:]*(${VALOR_TEXTO})${FIN_VALOR}`,
      "i",
    ),
  },
  {
    campo: "puertoDestino",
    patron: new RegExp(
      String.raw`\b(?:Port\s*of\s*Discharge|POD)[\s:]*(${VALOR_TEXTO})${FIN_VALOR}`,
      "i",
    ),
  },
];

/**
 * Cantidad comercial (bultos) vs peso total — un Packing List típico dice
 * algo como "500 SACOS DE 25 KG C/U ... PESO NETO: 12.500 KG": la cantidad
 * comercial es 500 (lo que va en el ítem de la orden), NO el peso. Estos dos
 * datos van en campos separados a propósito (misma distinción que
 * ItemOrdenCompraIntl.cantidad vs .pesoKg) — mezclarlos sería justo el error
 * que un humano puede cometer al leer el documento de corrido.
 *
 * El valor extraído se guarda TAL CUAL aparece en el texto (sin normalizar
 * separadores de miles, que son ambiguos entre locales: "12.500" puede ser
 * doce mil quinientos o doce coma cinco) — es un dato para que un humano
 * revise/confirme, no algo que se escriba solo en la orden (§12: la
 * automatización propone, nunca decide cantidades).
 */
const REGLA_BULTOS =
  /(\d[\d.,]*)\s*(SACOS?|BOLSAS?|BAGS?|BULTOS?|CAJAS?|BOXES?|PALLETS?|TAMBORES?|DRUMS?)\s*(?:DE|OF)?\s*(\d[\d.,]*)\s*KG(?:\s*(?:C\/U|CADA\s*UNO|EACH))?/i;
const REGLA_PESO_TOTAL = /\b(?:PESO\s*NETO|NET\s*WEIGHT)[\s:]*(\d[\d.,]*)\s*KG\b/i;

function extraerCantidadYPeso(texto: string, paginas: string[]): CampoExtraido[] {
  const encontrados: CampoExtraido[] = [];

  const matchBultos = texto.match(REGLA_BULTOS);
  if (matchBultos) {
    const [textoCompleto, cantidad, tipoBulto, pesoUnitario] = matchBultos;
    const evidencia = contextoAlrededorDe(texto, matchBultos.index ?? 0, textoCompleto.length);
    const pagina = paginaDelFragmento(paginas, textoCompleto);
    encontrados.push({
      campo: "cantidadComercial",
      valor: cantidad,
      pagina,
      confianza: 1,
      evidencia,
    });
    encontrados.push({
      campo: "unidadComercial",
      valor: `${tipoBulto.toUpperCase()} DE ${pesoUnitario} KG C/U`,
      pagina,
      confianza: 1,
      evidencia,
    });
  }

  const matchPeso = texto.match(REGLA_PESO_TOTAL);
  if (matchPeso) {
    encontrados.push({
      campo: "pesoTotalKg",
      valor: matchPeso[1],
      pagina: paginaDelFragmento(paginas, matchPeso[0]),
      confianza: 1,
      evidencia: contextoAlrededorDe(texto, matchPeso.index ?? 0, matchPeso[0].length),
    });
  }

  return encontrados;
}

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

function extraerDeTexto(texto: string, paginas: string[], reglas = REGLAS): CampoExtraido[] {
  const encontrados: CampoExtraido[] = [];
  const camposYaEncontrados = new Set<string>();

  for (const regla of reglas) {
    if (camposYaEncontrados.has(regla.campo)) continue; // primera coincidencia gana por campo
    const coincidencias =
      regla.campo === "numeroOrdenProveedor"
        ? texto.matchAll(new RegExp(regla.patron.source, regla.patron.flags + "g"))
        : [texto.match(regla.patron)];
    const valores = new Set<string>();
    for (const match of coincidencias) {
      if (!match) continue;
      const valor = (regla.formatear ? regla.formatear(match) : match[1])?.trim();
      if (!valor || valores.has(valor)) continue;
      valores.add(valor);
      encontrados.push({
        campo: regla.campo,
        valor,
        pagina: paginaDelFragmento(paginas, match[0]),
        confianza: 1,
        evidencia: contextoAlrededorDe(texto, match.index ?? 0, match[0].length),
      });
      camposYaEncontrados.add(regla.campo);
    }
  }

  if (reglas === REGLAS) encontrados.push(...extraerCantidadYPeso(texto, paginas));

  return encontrados;
}

export function extraerIdentidadProveedor(texto: string | null | undefined): CampoExtraido[] {
  return extraerDeTexto(texto?.slice(0, 20000) ?? "", [], REGLAS_PROVEEDOR);
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
