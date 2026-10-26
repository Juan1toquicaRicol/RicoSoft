import { describe, expect, it } from "vitest";
import { accionesProforma, ESTADO_PROFORMA_PARA_PEDIDO } from "./proforma-estados";

const todo = { gestionarProformas: true, aceptarProformas: true, gestionarPedidos: true };

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

  it("respeta permisos: Aceptar exige comercial.proformas.aceptar (no basta gestionar); Crear Pedido exige gestionar pedidos", () => {
    const soloGestionar = {
      gestionarProformas: true,
      aceptarProformas: false,
      gestionarPedidos: true,
    };
    const soloAceptar = {
      gestionarProformas: false,
      aceptarProformas: true,
      gestionarPedidos: true,
    };
    const sinPedidos = {
      gestionarProformas: true,
      aceptarProformas: true,
      gestionarPedidos: false,
    };
    expect(accionesProforma("ENVIADA", soloGestionar).puedeAceptar).toBe(false);
    expect(accionesProforma("ENVIADA", soloAceptar).puedeAceptar).toBe(true);
    expect(accionesProforma("ACEPTADA", sinPedidos).puedeCrearPedido).toBe(false);
  });

  it("el menú Nuevo pedido filtra proformas ACEPTADA", () => {
    expect(ESTADO_PROFORMA_PARA_PEDIDO).toBe("ACEPTADA");
  });
});
