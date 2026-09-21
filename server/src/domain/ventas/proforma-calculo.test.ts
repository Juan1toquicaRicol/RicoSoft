import { describe, it, expect } from "vitest";
import { calcularTotalesProforma, type EncabezadoRetencionProforma } from "./proforma-calculo";

const SIN_RETENCIONES: EncabezadoRetencionProforma = {
  aplicaRetencion: false,
  retencionPct: 2.5,
  aplicaRetencionIva: false,
  retencionIvaPct: 15,
  aplicaIca: false,
  icaPct: 0.7,
};

describe("calcularTotalesProforma", () => {
  it("totalBruto usa cantidad × precio ANTES de descuento (no el subtotal)", () => {
    const r = calcularTotalesProforma(
      [{ cantidad: 10, precioUnitario: 1000, descuentoPct: 20, ivaPct: 0 }],
      SIN_RETENCIONES,
    );
    expect(r.totalBruto).toBe(10_000); // sin descuento
    expect(r.subtotal).toBe(8_000); // con 20% de descuento
  });

  it("subtotal aplica el descuento por línea y suma varias líneas", () => {
    const r = calcularTotalesProforma(
      [
        { cantidad: 2, precioUnitario: 500, descuentoPct: 10, ivaPct: 0 }, // 1000 -> 900
        { cantidad: 1, precioUnitario: 300, descuentoPct: 0, ivaPct: 0 }, // 300
      ],
      SIN_RETENCIONES,
    );
    expect(r.totalBruto).toBe(1300);
    expect(r.subtotal).toBe(1200);
  });

  it("iva se calcula sobre el subtotal por línea (después de descuento), no sobre el bruto", () => {
    const r = calcularTotalesProforma(
      [{ cantidad: 1, precioUnitario: 1000, descuentoPct: 50, ivaPct: 19 }],
      SIN_RETENCIONES,
    );
    // subtotalLinea = 500 -> iva = 500 * 19% = 95, NO 1000*19%=190
    expect(r.iva).toBe(95);
  });

  it("retención en la fuente usa TOTAL BRUTO (no subtotal), al 2.5%", () => {
    const r = calcularTotalesProforma(
      [{ cantidad: 1, precioUnitario: 1000, descuentoPct: 50, ivaPct: 0 }],
      { ...SIN_RETENCIONES, aplicaRetencion: true, retencionPct: 2.5 },
    );
    expect(r.totalBruto).toBe(1000);
    expect(r.subtotal).toBe(500);
    expect(r.retencionFuente).toBe(25); // 1000 * 2.5%, NO 500 * 2.5% = 12.5
  });

  it("retención de IVA usa el VALOR IVA (no el bruto), al 15%", () => {
    const r = calcularTotalesProforma(
      [{ cantidad: 1, precioUnitario: 1000, descuentoPct: 0, ivaPct: 19 }],
      { ...SIN_RETENCIONES, aplicaRetencionIva: true, retencionIvaPct: 15 },
    );
    expect(r.iva).toBe(190); // 1000 * 19%
    expect(r.retencionIva).toBe(28.5); // 190 * 15%, NO 1000 * 15% = 150
  });

  it("retención ICA usa TOTAL BRUTO (no subtotal), al 0.7%", () => {
    const r = calcularTotalesProforma(
      [{ cantidad: 1, precioUnitario: 1000, descuentoPct: 50, ivaPct: 0 }],
      { ...SIN_RETENCIONES, aplicaIca: true, icaPct: 0.7 },
    );
    expect(r.retencionIca).toBe(7); // 1000 * 0.7%, NO 500 * 0.7% = 3.5
  });

  it("total final resta las TRES retenciones sobre subtotal + iva", () => {
    const r = calcularTotalesProforma(
      [{ cantidad: 1, precioUnitario: 1000, descuentoPct: 0, ivaPct: 19 }],
      {
        aplicaRetencion: true,
        retencionPct: 2.5,
        aplicaRetencionIva: true,
        retencionIvaPct: 15,
        aplicaIca: true,
        icaPct: 0.7,
      },
    );
    // totalBruto = subtotal = 1000, iva = 190
    // reteFuente = 1000*2.5% = 25, reteIva = 190*15% = 28.5, reteIca = 1000*0.7% = 7
    // total = 1000 + 190 - 25 - 28.5 - 7 = 1129.5
    expect(r.total).toBe(1129.5);
  });

  it("sin ninguna retención activada, todas quedan en 0", () => {
    const r = calcularTotalesProforma(
      [{ cantidad: 1, precioUnitario: 1000, descuentoPct: 0, ivaPct: 19 }],
      SIN_RETENCIONES,
    );
    expect(r.retencionFuente).toBe(0);
    expect(r.retencionIva).toBe(0);
    expect(r.retencionIca).toBe(0);
    expect(r.total).toBe(1190); // subtotal + iva, sin restar nada
  });
});
