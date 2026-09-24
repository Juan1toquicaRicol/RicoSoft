import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MENSAJE_PEDIDO_NO_ENVIADO, VistaEstadoPedidoUnoee } from "./panel-estado-pedido-unoee";
import type { EstadoPedidoUnoee } from "@/hooks/use-comercial";

const base = {
  pedidoId: "p1",
  estadoComercial: "LISTO_PARA_ERP",
  estadoSincronizacion: "VINCULADO",
};

const conVinculo: EstadoPedidoUnoee = {
  ...base,
  vinculado: true,
  erpRowId: 77,
  encontradoEnSiesa: true,
  cabecera: {
    consecutivo: "PDV-00055444",
    estado: "Comprometido",
    valorTotal: 19850,
    descuentos: 150,
    impuestos: 3781,
  },
  items: [
    {
      lineaRowId: 1,
      itemRowId: 900,
      referencia: "REF-A",
      descripcion: "Producto A",
      cantidad: 10,
      precioUnitario: 1000,
      subtotal: 10000,
      descuentos: 150,
      estado: "Comprometido",
      cantidadRemisionada: 4,
      cantidadPendiente: 6,
    },
  ],
};

const sinVinculo: EstadoPedidoUnoee = {
  ...base,
  estadoSincronizacion: "NO_VINCULADO",
  vinculado: false,
  erpRowId: null,
  encontradoEnSiesa: false,
  cabecera: null,
  items: [],
};

const render = (estado: EstadoPedidoUnoee | null, extra = {}) =>
  renderToStaticMarkup(
    <VistaEstadoPedidoUnoee
      estado={estado}
      loading={false}
      error=""
      onReintentar={() => undefined}
      {...extra}
    />,
  );

describe("VistaEstadoPedidoUnoee", () => {
  it("Caso A (con PDV): cabecera con consecutivo/estado/totales e ítems con todas las columnas", () => {
    const html = render(conVinculo);

    expect(html).toContain("Estado del Pedido UnoEE");
    // Cabecera
    expect(html).toContain("PDV-00055444");
    expect(html).toContain("Comprometido");
    for (const etiqueta of ["Consecutivo", "Estado", "Valor total", "Descuentos", "Impuestos"]) {
      expect(html).toContain(etiqueta);
    }
    // Ítems
    for (const columna of [
      "Referencia",
      "ID Item",
      "Descripción",
      "Cantidad",
      "Precio unitario",
      "Subtotal",
      "Cant. remisionada",
      "Cant. pendiente",
    ]) {
      expect(html).toContain(columna);
    }
    expect(html).toContain("REF-A");
    expect(html).toContain("Producto A");
    expect(html).toContain(">900<");
    // No muestra el banner del Caso B
    expect(html).not.toContain(MENSAJE_PEDIDO_NO_ENVIADO);
  });

  it("Caso B (sin PDV): banner rojo 'El pedido no ha sido enviado' y ninguna tabla de ítems", () => {
    const html = render(sinVinculo);

    expect(html).toContain("⚠️ El pedido no ha sido enviado");
    expect(html).toContain("border-estado-danger-border");
    expect(html).toContain("bg-estado-danger-bg");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("PDV-");
    expect(html).not.toContain("<table");
  });

  it("vinculado pero inexistente en Siesa: aviso ámbar, sin banner rojo ni tabla", () => {
    const html = render({ ...conVinculo, encontradoEnSiesa: false, cabecera: null, items: [] });
    expect(html).toContain("no existe en la compañía Siesa");
    expect(html).not.toContain(MENSAJE_PEDIDO_NO_ENVIADO);
    expect(html).not.toContain("<table");
  });

  it("carga y error: 'Consultando Siesa...' y mensaje con Reintentar; sin banner mientras tanto", () => {
    const cargando = render(null, { loading: true });
    expect(cargando).toContain("Consultando Siesa...");
    expect(cargando).not.toContain(MENSAJE_PEDIDO_NO_ENVIADO);

    const conError = render(null, { error: "No fue posible conectar con Siesa." });
    expect(conError).toContain("No fue posible conectar con Siesa.");
    expect(conError).toContain("Reintentar");
    expect(conError).not.toContain(MENSAJE_PEDIDO_NO_ENVIADO);
  });
});
