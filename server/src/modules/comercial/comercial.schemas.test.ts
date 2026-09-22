import { describe, it, expect } from "vitest";
import { asignarErpPedidoSchema } from "./comercial.schemas";

/**
 * Unit test puro (sin BD/Siesa) del schema de asignar-erp de Pedido —
 * mismo shape/mensajes que asignarErpCotizacionSchema, que no tenía
 * ninguna prueba dedicada (ver microaudit 2026-09-22).
 */
describe("asignarErpPedidoSchema", () => {
  it("acepta un erpRowId entero positivo (incluso como string coercible)", () => {
    expect(asignarErpPedidoSchema.safeParse({ erpRowId: 71001 }).success).toBe(true);
    expect(asignarErpPedidoSchema.safeParse({ erpRowId: "71001" }).success).toBe(true);
    expect(asignarErpPedidoSchema.safeParse({ erpRowId: 1 }).success).toBe(true);
  });

  it("rechaza cero, negativos, decimales, texto no numérico y ausencia del campo", () => {
    expect(asignarErpPedidoSchema.safeParse({ erpRowId: 0 }).success).toBe(false);
    expect(asignarErpPedidoSchema.safeParse({ erpRowId: -5 }).success).toBe(false);
    expect(asignarErpPedidoSchema.safeParse({ erpRowId: 1.5 }).success).toBe(false);
    expect(asignarErpPedidoSchema.safeParse({ erpRowId: "no-es-un-numero" }).success).toBe(false);
    expect(asignarErpPedidoSchema.safeParse({}).success).toBe(false);
    expect(asignarErpPedidoSchema.safeParse({ erpRowId: null }).success).toBe(false);
  });
});
