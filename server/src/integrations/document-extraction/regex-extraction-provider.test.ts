import { describe, it, expect, vi } from "vitest";

/**
 * Escenario de ejemplo obligatorio de la especificación (§25): un PDF de
 * confirmación de embarque con PO, ETA, Incoterm y contenedor. Ninguna
 * llamada a un servicio externo — 100% local (mismo principio de "parser
 * determinístico antes de IA", ver auditoría).
 *
 * pdf-text.ts (extracción real de texto de un PDF binario vía pdf-parse) se
 * mockea aquí a propósito: el bundle de pdf.js que trae pdf-parse@1 tiene
 * una incompatibilidad real y confirmada con el entorno de Vitest (falla
 * con "bad XRef entry" incluso ante un PDF válido con xref correcto,
 * verificado ejecutando la MISMA lógica en Node puro fuera de Vitest, donde
 * funciona sin problema). Mockear aísla la lógica que sí es nuestra
 * (RegexDocumentExtractionProvider: aplicar las reglas, atribuir página,
 * armar evidencia) de una incompatibilidad de una librería de terceros con
 * el test runner — no de la lógica del propio parser en producción, que ya
 * se verificó manualmente que funciona.
 */
const TEXTO_FIXTURE =
  "Supplier: Example Supplier Ltd. PO: PO-4587 ETA: 18/10/2026 Incoterm: FOB Container: ABCD1234567";

vi.mock("./pdf-text", () => ({
  extraerTextoPdf: vi.fn(async (buffer: Buffer) => {
    const texto = buffer.toString("utf-8");
    return { textoCompleto: texto, paginas: [texto] };
  }),
}));

const { RegexDocumentExtractionProvider } = await import("./regex-extraction-provider");

describe("RegexDocumentExtractionProvider", () => {
  const provider = new RegexDocumentExtractionProvider();

  it("puedeProcesar acepta PDF y texto plano, rechaza otros MIME", () => {
    expect(provider.puedeProcesar("application/pdf")).toBe(true);
    expect(provider.puedeProcesar("text/plain")).toBe(true);
    expect(provider.puedeProcesar("image/png")).toBe(false);
    expect(provider.puedeProcesar("application/vnd.ms-excel")).toBe(false);
  });

  it("extrae PO, ETA, Incoterm y contenedor de texto plano (fixture §25)", async () => {
    const resultado = await provider.extraer(Buffer.from(TEXTO_FIXTURE, "utf-8"), "text/plain");
    const porCampo = Object.fromEntries(resultado.campos.map((c) => [c.campo, c.valor]));

    expect(resultado.motorUsado).toBe("regex-v1");
    expect(porCampo.numeroOrdenProveedor).toBe("PO-4587");
    expect(porCampo.eta).toBe("18/10/2026");
    expect(porCampo.incoterm).toBe("FOB");
    expect(porCampo.contenedor).toBe("ABCD1234567");
  });

  it("cada campo trae evidencia y confianza (provenance, §7)", async () => {
    const resultado = await provider.extraer(Buffer.from(TEXTO_FIXTURE, "utf-8"), "text/plain");
    for (const campo of resultado.campos) {
      expect(campo.evidencia).toBeTruthy();
      expect(campo.confianza).toBe(1);
    }
  });

  it("extrae del mismo texto de un PDF (pdf-text mockeado), con número de página", async () => {
    const resultado = await provider.extraer(
      Buffer.from(TEXTO_FIXTURE, "utf-8"),
      "application/pdf",
    );
    const porCampo = Object.fromEntries(resultado.campos.map((c) => [c.campo, c.valor]));

    expect(porCampo.eta).toBe("18/10/2026");
    expect(porCampo.contenedor).toBe("ABCD1234567");
    const campoEta = resultado.campos.find((c) => c.campo === "eta");
    expect(campoEta?.pagina).toBe(1);
  });

  it("un documento sin ningún campo reconocible no lanza, solo devuelve una lista vacía", async () => {
    const resultado = await provider.extraer(
      Buffer.from("Este documento no tiene ningún dato reconocible.", "utf-8"),
      "text/plain",
    );
    expect(resultado.campos).toEqual([]);
  });

  it("un PDF sin ningún campo reconocible en su texto (equivalente a 'sin capa de texto útil') no lanza, devuelve campos vacíos", async () => {
    const resultado = await provider.extraer(Buffer.from("", "utf-8"), "application/pdf");
    expect(resultado.campos).toEqual([]);
  });
});
