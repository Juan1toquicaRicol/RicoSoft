import { describe, it, expect } from "vitest";
import { clasificarCorreo } from "./importaciones-bandeja-clasificacion.service";

describe("clasificarCorreo", () => {
  it("clasifica una confirmación de embarque como AVISO_DESPACHO", () => {
    expect(
      clasificarCorreo({
        asunto: "Shipment Confirmation PO-4587",
        remitente: "sales@supplier.com",
        nombresAdjuntos: ["Shipping_Confirmation.pdf"],
      }),
    ).toBe("AVISO_DESPACHO");
  });

  it("clasifica por asunto: Quotation -> COTIZACION", () => {
    expect(
      clasificarCorreo({ asunto: "Quotation #123", remitente: "x@y.com", nombresAdjuntos: [] }),
    ).toBe("COTIZACION");
  });

  it("clasifica por nombre de adjunto cuando el asunto no dice nada: Invoice.pdf -> FACTURA", () => {
    expect(
      clasificarCorreo({
        asunto: "Documents attached",
        remitente: "x@y.com",
        nombresAdjuntos: ["Invoice_998.pdf"],
      }),
    ).toBe("FACTURA");
  });

  it("clasifica Packing List -> PACKING_LIST", () => {
    expect(
      clasificarCorreo({
        asunto: "PO-4587 documents",
        remitente: "x@y.com",
        nombresAdjuntos: ["PackingList.pdf"],
      }),
    ).toBe("PACKING_LIST");
  });

  it("clasifica Bill of Lading -> BL", () => {
    expect(
      clasificarCorreo({
        asunto: "Bill of Lading attached",
        remitente: "x@y.com",
        nombresAdjuntos: [],
      }),
    ).toBe("BL");
  });

  it("un correo sin ninguna señal reconocible cae en OTRO (nunca null)", () => {
    expect(
      clasificarCorreo({ asunto: "Hola, ¿cómo estás?", remitente: "x@y.com", nombresAdjuntos: [] }),
    ).toBe("OTRO");
  });
});
