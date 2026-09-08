// Import directo a lib/pdf-parse.js (no al índice del paquete): el
// index.js de pdf-parse@1 trae un bloque de "modo debug" que intenta leer
// un PDF de ejemplo de su propia carpeta test/ cuando detecta que corre
// fuera de node_modules (como pasa bajo Vitest) — un bug conocido del
// paquete. La implementación real vive en lib/pdf-parse.js, sin ese bloque.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export interface TextoPdf {
  textoCompleto: string;
  /** Texto de cada página por separado — permite reportar en qué página
   * exacta apareció un dato (provenance, ver ImportacionExtraccion.pagina). */
  paginas: string[];
}

/**
 * Extrae el texto de un PDF nativo (no escaneado) usando pdf-parse, con
 * separación por página vía su hook `pagerender`. Un PDF escaneado (sin
 * capa de texto) devuelve páginas vacías — eso es una señal legítima de
 * "necesita OCR", no un error (V1 no tiene OCR, ver auditoría; el llamador
 * decide qué hacer con páginas vacías, ver regex-extraction-provider.ts).
 */
export async function extraerTextoPdf(buffer: Buffer): Promise<TextoPdf> {
  const paginas: string[] = [];
  await pdfParse(buffer, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pagerender: async (pageData: any) => {
      const contenido = await pageData.getTextContent();
      const texto = contenido.items.map((item: { str: string }) => item.str).join(" ");
      paginas.push(texto);
      return texto;
    },
  });
  return { textoCompleto: paginas.join("\n\f\n"), paginas };
}
