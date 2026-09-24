import { describe, expect, it } from "vitest";
import { accionesProforma, ESTADO_PROFORMA_PARA_PEDIDO } from "./proforma-estados";

const todo = { gestionarProformas: true, gestionarPedidos: true };

describe("accionesProforma", () => {
  it("ENVIADA: solo Aceptar (no Crear Pedido)", () => {
    const a = accionesProforma("ENVIADA", todo);
    expect(a).toMatchObject({ puedeAceptar: true, puedeCrearPedido: false, puedeEditar: true });
  });

  it("ACEPTADA: solo Crear Pedido (no Aceptar)", () => {
    const a = accionesProforma("ACEPTADA", todo);
    expect(a).toMatchObject({ puedeAceptar: false, puedeCrearPedido: true, puedeEditar: true });
  });

  it("PEDIDO_CREADO y ANULADA: ninguna acción de cambio de estado ni edición", () => {
    for (const estado of ["PEDIDO_CREADO", "ANULADA"]) {
      expect(accionesProforma(estado, todo)).toEqual({
        puedeAceptar: false,
        puedeCrearPedido: false,
        puedeEditar: false,
        esInmutable: true,
      });
    }
  });

  it("respeta permisos: sin PROFORMAS_GESTIONAR no acepta; sin PEDIDOS_GESTIONAR no crea pedido", () => {
    const sinProformas = { gestionarProformas: false, gestionarPedidos: true };
    const sinPedidos = { gestionarProformas: true, gestionarPedidos: false };
    expect(accionesProforma("ENVIADA", sinProformas).puedeAceptar).toBe(false);
    expect(accionesProforma("ACEPTADA", sinPedidos).puedeCrearPedido).toBe(false);
  });

  it("el menú Nuevo pedido filtra proformas ACEPTADA", () => {
    expect(ESTADO_PROFORMA_PARA_PEDIDO).toBe("ACEPTADA");
  });
});
