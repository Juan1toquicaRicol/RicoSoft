import { describe, it, expect } from "vitest";
import {
  ESTADO_PROFORMA,
  esProformaInmutable,
  mensajeProformaInmutable,
  puedeAceptarProforma,
  puedeCrearPedidoDesdeProforma,
} from "./proformas-estados";

describe("máquina de estados de Proforma", () => {
  it("ENVIADA -> ACEPTADA -> PEDIDO_CREADO; ANULADA aparte", () => {
    expect(Object.values(ESTADO_PROFORMA)).toEqual(["ENVIADA", "ACEPTADA", "PEDIDO_CREADO", "ANULADA"]);
  });

  it("solo ENVIADA puede aceptarse", () => {
    expect(puedeAceptarProforma("ENVIADA")).toBe(true);
    for (const e of ["ACEPTADA", "PEDIDO_CREADO", "ANULADA", "activa"]) {
      expect(puedeAceptarProforma(e)).toBe(false);
    }
  });

  it("solo ACEPTADA puede originar un pedido", () => {
    expect(puedeCrearPedidoDesdeProforma("ACEPTADA")).toBe(true);
    for (const e of ["ENVIADA", "PEDIDO_CREADO", "ANULADA"]) {
      expect(puedeCrearPedidoDesdeProforma(e)).toBe(false);
    }
  });

  it("PEDIDO_CREADO y ANULADA son inmutables; ENVIADA y ACEPTADA no", () => {
    expect(esProformaInmutable("PEDIDO_CREADO")).toBe(true);
    expect(esProformaInmutable("ANULADA")).toBe(true);
    expect(esProformaInmutable("ENVIADA")).toBe(false);
    expect(esProformaInmutable("ACEPTADA")).toBe(false);
  });

  it("mensajes claros por estado inmutable", () => {
    expect(mensajeProformaInmutable("PEDIDO_CREADO")).toMatch(/pedido/i);
    expect(mensajeProformaInmutable("ANULADA")).toMatch(/anulada/i);
  });
});
