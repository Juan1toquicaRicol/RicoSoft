import { describe, it, expect } from "vitest";
import { extraerTextoPdf } from "./pdf-text";

/** PDF mínimo válido de una página con una sola línea de texto y tabla xref
 * exacta (offsets calculados, no hardcodeados). */
function construirPdf(texto: string, segundaLinea?: string): Buffer {
  const renglones = segundaLinea
    ? "(" + texto + ") Tj 0 -18 Td (" + segundaLinea + ") Tj"
    : "(" + texto + ") Tj";
  const stream = "BT /F1 12 Tf 50 700 Td " + renglones + " ET";
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((cuerpo, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

describe("extraerTextoPdf", () => {
  const pdf = construirPdf("PO 4587 Incoterm FOB");

  it("extrae el texto de un PDF con capa de texto", async () => {
    const resultado = await extraerTextoPdf(pdf);
    expect(resultado.paginas).toHaveLength(1);
    expect(resultado.textoCompleto).toContain("Incoterm FOB");
  });

  it("funciona con un Buffer que es una vista con byteOffset distinto de 0", async () => {
    // Reproduce el pool de Node / lectura de disco bajo tsx: mismo PDF, pero
    // dentro de un ArrayBuffer compartido con bytes ajenos delante.
    const compartido = Buffer.alloc(pdf.length + 3176, 0x41);
    pdf.copy(compartido, 3176);
    const vista = compartido.subarray(3176);
    expect(vista.byteOffset).toBeGreaterThan(0);

    const resultado = await extraerTextoPdf(vista);
    expect(resultado.textoCompleto).toContain("Incoterm FOB");
  });
});

it("conserva el cambio de renglón entre la etiqueta y la razón social de un PDF", async () => {
  const resultado = await extraerTextoPdf(
    construirPdf("Proveedor de referencia", "VIET NAM HANOTECH"),
  );
  expect(resultado.textoCompleto).toBe("Proveedor de referencia\nVIET NAM HANOTECH");
});
