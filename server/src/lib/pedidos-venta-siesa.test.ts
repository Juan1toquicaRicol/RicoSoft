import { describe, it, expect } from "vitest";
import {
  determinarEstadoPedidoVentaSiesa,
  type FlagsPedidoVentaSiesa,
} from "./pedidos-venta-siesa";

const base: FlagsPedidoVentaSiesa = {
  indUltEstadoAprobado: true,
  indBackorderDocto: false,
  indBackorderLinea: false,
  indRetenidoMargen: false,
  indRetenidoCupo: false,
  indRetenidoMora: false,
  indRetenidoBloqueo: false,
  indRetenidoAnticipo: false,
  indRemisionado: false,
  indFacturado: false,
  cantPedida: 100,
  cantRemisionada: 0,
  cantFacturada: 0,
};

describe("determinarEstadoPedidoVentaSiesa", () => {
  it("Pendiente de aprobación: indUltEstadoAprobado === false, sin importar los demás flags", () => {
    expect(
      determinarEstadoPedidoVentaSiesa({
        ...base,
        indUltEstadoAprobado: false,
        indFacturado: true,
      }),
    ).toBe("Pendiente de aprobación");
  });

  it("Backorder: indBackorderDocto true", () => {
    expect(determinarEstadoPedidoVentaSiesa({ ...base, indBackorderDocto: true })).toBe(
      "Backorder",
    );
  });

  it("Backorder: indBackorderLinea true", () => {
    expect(determinarEstadoPedidoVentaSiesa({ ...base, indBackorderLinea: true })).toBe(
      "Backorder",
    );
  });

  it("Retenido: cualquiera de los 5 flags de retención en true", () => {
    expect(determinarEstadoPedidoVentaSiesa({ ...base, indRetenidoMargen: true })).toBe("Retenido");
    expect(determinarEstadoPedidoVentaSiesa({ ...base, indRetenidoCupo: true })).toBe("Retenido");
    expect(determinarEstadoPedidoVentaSiesa({ ...base, indRetenidoMora: true })).toBe("Retenido");
    expect(determinarEstadoPedidoVentaSiesa({ ...base, indRetenidoBloqueo: true })).toBe(
      "Retenido",
    );
    expect(determinarEstadoPedidoVentaSiesa({ ...base, indRetenidoAnticipo: true })).toBe(
      "Retenido",
    );
  });

  it("Remisionado/Facturado completo: indFacturado true", () => {
    expect(determinarEstadoPedidoVentaSiesa({ ...base, indFacturado: true })).toBe(
      "Remisionado/Facturado completo",
    );
  });

  it("Parcialmente facturado: cantFacturada > 0 y < cantPedida, sin indFacturado", () => {
    expect(
      determinarEstadoPedidoVentaSiesa({ ...base, cantFacturada: 40, cantRemisionada: 60 }),
    ).toBe("Parcialmente facturado");
  });

  it("Parcialmente remisionado: indRemisionado true, sin facturación", () => {
    expect(determinarEstadoPedidoVentaSiesa({ ...base, indRemisionado: true })).toBe(
      "Parcialmente remisionado",
    );
  });

  it("Parcialmente remisionado: cantRemisionada > 0 y < cantPedida, sin indRemisionado", () => {
    expect(determinarEstadoPedidoVentaSiesa({ ...base, cantRemisionada: 50 })).toBe(
      "Parcialmente remisionado",
    );
  });

  it("Aprobado: indUltEstadoAprobado true y ninguna otra condición aplica", () => {
    expect(determinarEstadoPedidoVentaSiesa(base)).toBe("Aprobado");
  });

  it("En proceso: fallback neutral cuando indUltEstadoAprobado es null", () => {
    expect(determinarEstadoPedidoVentaSiesa({ ...base, indUltEstadoAprobado: null })).toBe(
      "En proceso",
    );
  });

  it("precedencia: backorder gana sobre retenido y facturado", () => {
    expect(
      determinarEstadoPedidoVentaSiesa({
        ...base,
        indBackorderDocto: true,
        indRetenidoMargen: true,
        indFacturado: true,
      }),
    ).toBe("Backorder");
  });

  it("precedencia: retenido gana sobre facturado completo", () => {
    expect(
      determinarEstadoPedidoVentaSiesa({ ...base, indRetenidoCupo: true, indFacturado: true }),
    ).toBe("Retenido");
  });
});
