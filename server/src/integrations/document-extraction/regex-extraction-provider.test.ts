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

  it("packing list: distingue cantidad comercial de peso total (§ propuesta cantidad vs peso)", async () => {
    const textoPackingList = "PACKING LIST - PO-4587\n500 SACOS DE 25 KG C/U\nPESO NETO: 12.500 KG";
    const resultado = await provider.extraer(Buffer.from(textoPackingList, "utf-8"), "text/plain");
    const porCampo = Object.fromEntries(resultado.campos.map((c) => [c.campo, c.valor]));

    // La cantidad comercial es 500 (lo que va en el ítem de la orden), nunca
    // el peso — mezclarlos es justo el error que un humano puede cometer.
    expect(porCampo.cantidadComercial).toBe("500");
    expect(porCampo.unidadComercial).toBe("SACOS DE 25 KG C/U");
    expect(porCampo.pesoTotalKg).toBe("12.500");
  });

  it("texto de PDF en una sola línea: país, puertos y naviera no arrastran la etiqueta siguiente", async () => {
    // Texto tal como lo entrega pdf-text.ts (fragmentos unidos por espacios).
    const texto =
      "Incoterm: FOB Country of Origin: China Currency: USD Condicion de pago propuesta: 50% anticipo. " +
      "ETD: 04/10/2026 ETA: 18/10/2026 Port of Loading: Shanghai Port of Discharge: Cartagena " +
      "Carrier: Blue Horizon Lines Container: ABCD1234567 BL: BL987654321 Referencia interna de control: IT-TEST-764.";
    const resultado = await provider.extraer(Buffer.from(texto, "utf-8"), "text/plain");
    const porCampo = Object.fromEntries(resultado.campos.map((c) => [c.campo, c.valor]));

    expect(porCampo.paisOrigen).toBe("China");
    expect(porCampo.puertoOrigen).toBe("Shanghai");
    expect(porCampo.puertoDestino).toBe("Cartagena");
    expect(porCampo.naviera).toBe("Blue Horizon Lines");
    expect(porCampo.moneda).toBe("USD");
    expect(porCampo.contenedor).toBe("ABCD1234567");
  });

  it("valores en líneas separadas y al final del texto siguen extrayéndose completos", async () => {
    const texto =
      "País de Origen: Estados Unidos\nPort of Loading: New York, USA\nNaviera: Hapag Lloyd";
    const resultado = await provider.extraer(Buffer.from(texto, "utf-8"), "text/plain");
    const porCampo = Object.fromEntries(resultado.campos.map((c) => [c.campo, c.valor]));

    expect(porCampo.paisOrigen).toBe("Estados Unidos");
    expect(porCampo.puertoOrigen).toBe("New York, USA");
    expect(porCampo.naviera).toBe("Hapag Lloyd");
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

it("lee la razón social y el NIT etiquetados en el texto sin tomar el NIT del comprador", async () => {
  const { extraerIdentidadProveedor } = await import("./regex-extraction-provider");
  const campos = extraerIdentidadProveedor(
    "Proveedor: Viet Nam Hanotech\nNIT comprador: 987654\nNIT proveedor: 0104635981\nPO-26112401",
  );
  expect(campos.map(({ campo, valor }) => [campo, valor])).toEqual([
    ["nombreProveedor", "Viet Nam Hanotech"],
    ["nitProveedor", "0104635981"],
  ]);
});
