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
  // pdf.js lee `data.buffer` ignorando `byteOffset`: un Buffer de Node que
  // es una vista dentro de un ArrayBuffer compartido (pool de Node, o
  // fs.readFileSync bajo tsx/Vitest) se interpreta con bytes ajenos y falla
  // con errores erráticos ("bad XRef entry", "Illegal character"). Copiar a
  // un Uint8Array propio garantiza byteOffset 0.
  await pdfParse(new Uint8Array(buffer) as unknown as Buffer, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pagerender: async (pageData: any) => {
      const contenido = await pageData.getTextContent();
      const lineas: string[][] = [];
      let alturaAnterior: number | undefined;
      for (const item of contenido.items as { str: string; transform?: number[] }[]) {
        if (!item.str.trim()) continue;
        const altura = item.transform?.[5];
        if (
          !lineas.length ||
          (altura != null && alturaAnterior != null && Math.abs(altura - alturaAnterior) >= 1)
        ) {
          lineas.push([]);
        }
        lineas[lineas.length - 1].push(item.str);
        alturaAnterior = altura;
      }
      const texto = lineas.map((linea) => linea.join(" ")).join("\n");
      paginas.push(texto);
      return texto;
    },
  });
  return { textoCompleto: paginas.join("\n\f\n"), paginas };
}
