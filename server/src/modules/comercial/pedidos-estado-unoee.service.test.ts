import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  query: vi.fn(),
  input: vi.fn(),
  request: vi.fn(),
  resolverCia: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: { pedidoComercial: { findFirst: mocks.findFirst, findMany: vi.fn() } },
}));
vi.mock("../../config/siesa", () => ({
  getSiesaPool: vi.fn(async () => ({ request: mocks.request })),
}));
vi.mock("../../lib/siesa-tenant", () => ({ resolverCiaSiesa: mocks.resolverCia }));

import { etiquetaEstadoUnoee, SiesaConsultaError } from "./pedidos-compromiso.service";
import {
  estadoItemUnoee,
  formatearConsecutivoPdv,
  obtenerEstadoPedidoUnoee,
} from "./pedidos-estado-unoee.service";

const cabeceraSiesa = {
  pdvRowId: 77,
  pdvNumero: 55444,
  indUltEstadoAprobado: true,
  indBackorderDocto: false,
  indBackorderLinea: 0,
  indRetenidoMargen: false,
  indRetenidoCupo: false,
  indRetenidoMora: false,
  indRetenidoBloqueo: false,
  indRetenidoAnticipo: false,
  indRemisionado: false,
  indFacturado: false,
  cantidadPedida: 15,
  cantidadComprometida: 10,
  cantidadRemisionada: 5,
  cantidadFacturada: 0,
  lineas: 2,
  lineasComprometidas: 1,
};
const lineasSiesa = [
  {
    lineaRowId: 1,
    itemRowId: 900,
    referencia: " REF-A ",
    descripcion: "Producto A",
    cantidadPedida: 10,
    cantidadComprometida: 10,
    cantidadRemisionada: 0,
    cantidadFacturada: 0,
    precioUnitario: 1000,
    descuentoLinea: 100,
    descuentoGlobal: 50,
    impuesto: 1881,
    valorNeto: 9850,
    backorder: 0,
  },
  {
    lineaRowId: 2,
    itemRowId: 901,
    referencia: "REF-B",
    descripcion: "Producto B",
    cantidadPedida: 5,
    cantidadComprometida: 0,
    cantidadRemisionada: 5,
    cantidadFacturada: 0,
    precioUnitario: 2000,
    descuentoLinea: 0,
    descuentoGlobal: 0,
    impuesto: 1900,
    valorNeto: 10000,
    backorder: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolverCia.mockResolvedValue(7);
  const req = { input: mocks.input, query: mocks.query };
  mocks.input.mockReturnValue(req);
  mocks.request.mockReturnValue(req);
});

describe("etiquetas de estado UnoEE", () => {
  it("Aprobado/En proceso: Comprometido (> 0) o No comprometido (0); el resto se conserva", () => {
    expect(etiquetaEstadoUnoee("Aprobado", 3)).toBe("Comprometido");
    expect(etiquetaEstadoUnoee("En proceso", 0)).toBe("No comprometido");
    expect(etiquetaEstadoUnoee("Retenido", 3)).toBe("Retenido");
    expect(etiquetaEstadoUnoee("Remisionado/Facturado completo", 0)).toBe(
      "Remisionado/Facturado completo",
    );
  });

  it("estado de ítem: precedencia facturado > remisionado > backorder > comprometido", () => {
    const base = { cantidad: 10, cantidadComprometida: 0, cantidadRemisionada: 0, cantidadFacturada: 0, backorder: false };
    expect(estadoItemUnoee({ ...base, cantidadFacturada: 10 })).toBe("Facturado");
    expect(estadoItemUnoee({ ...base, cantidadFacturada: 4 })).toBe("Parcialmente facturado");
    expect(estadoItemUnoee({ ...base, cantidadRemisionada: 10 })).toBe("Remisionado");
    expect(estadoItemUnoee({ ...base, cantidadRemisionada: 2 })).toBe("Parcialmente remisionado");
    expect(estadoItemUnoee({ ...base, backorder: true, cantidadComprometida: 5 })).toBe("Backorder");
    expect(estadoItemUnoee({ ...base, cantidadComprometida: 5 })).toBe("Comprometido");
    expect(estadoItemUnoee(base)).toBe("Sin comprometer");
  });

  it("consecutivo con 8 dígitos: PDV-00055444", () => {
    expect(formatearConsecutivoPdv(55444)).toBe("PDV-00055444");
  });
});

describe("obtenerEstadoPedidoUnoee", () => {
  it("pedido de otro tenant / inexistente -> null (consulta acotada a tenantId)", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await obtenerEstadoPedidoUnoee("t1", "p")).toBeNull();
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({ id: "p", tenantId: "t1" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("Caso B: sin erpRowId -> vinculado=false, sin consultar Siesa", async () => {
    mocks.findFirst.mockResolvedValue({ id: "p", estado: "BORRADOR", erpRowId: null, erpEstadoSincronizacion: null });
    const dto = await obtenerEstadoPedidoUnoee("t1", "p");
    expect(dto).toMatchObject({
      vinculado: false,
      estadoSincronizacion: "NO_VINCULADO",
      cabecera: null,
      items: [],
    });
    expect(mocks.resolverCia).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("Caso A: cabecera y detalle de ítems del PDV, en 2 consultas (resumen + líneas)", async () => {
    mocks.findFirst.mockResolvedValue({ id: "p", estado: "LISTO_PARA_ERP", erpRowId: 77, erpEstadoSincronizacion: "VINCULADO" });
    mocks.query
      .mockResolvedValueOnce({ recordset: [cabeceraSiesa] })
      .mockResolvedValueOnce({ recordset: lineasSiesa });

    const dto = await obtenerEstadoPedidoUnoee("t1", "p");

    expect(mocks.query).toHaveBeenCalledTimes(2);
    const sqlLineas = mocks.query.mock.calls[1][0] as string;
    expect(sqlLineas).toMatch(/f430_id_cia = @ciaId/);
    expect(sqlLineas).toMatch(/f430_id_tipo_docto = 'PDV'/);
    expect(sqlLineas).not.toMatch(/consec_docto\s*=/);
    expect(mocks.input).toHaveBeenCalledWith("ciaId", 7);

    expect(dto?.vinculado).toBe(true);
    expect(dto?.encontradoEnSiesa).toBe(true);
    expect(dto?.cabecera).toEqual({
      consecutivo: "PDV-00055444",
      estado: "Parcialmente remisionado", // remisionada 5 de 15: manda el flujo de remisión
      valorTotal: 19850,
      descuentos: 150,
      impuestos: 3781,
    });
    expect(dto?.items).toHaveLength(2);
    expect(dto?.items[0]).toEqual({
      lineaRowId: 1,
      itemRowId: 900,
      referencia: "REF-A",
      descripcion: "Producto A",
      cantidad: 10,
      precioUnitario: 1000,
      subtotal: 10000,
      descuentos: 150,
      estado: "Comprometido",
      cantidadRemisionada: 0,
      cantidadPendiente: 10,
    });
    expect(dto?.items[1]).toMatchObject({
      estado: "Remisionado",
      cantidadRemisionada: 5,
      cantidadPendiente: 0,
    });
  });

  it("vinculado pero Siesa no devuelve el PDV -> encontradoEnSiesa=false, sin líneas", async () => {
    mocks.findFirst.mockResolvedValue({ id: "p", estado: "LISTO_PARA_ERP", erpRowId: 77, erpEstadoSincronizacion: "VINCULADO" });
    mocks.query.mockResolvedValueOnce({ recordset: [] });
    const dto = await obtenerEstadoPedidoUnoee("t1", "p");
    expect(dto).toMatchObject({ vinculado: true, encontradoEnSiesa: false, cabecera: null, items: [] });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("falla de Siesa -> SiesaConsultaError", async () => {
    mocks.findFirst.mockResolvedValue({ id: "p", estado: "LISTO_PARA_ERP", erpRowId: 77, erpEstadoSincronizacion: "VINCULADO" });
    mocks.query.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(obtenerEstadoPedidoUnoee("t1", "p")).rejects.toBeInstanceOf(SiesaConsultaError);
  });
});
