import { describe, it, expect, vi, beforeEach } from "vitest";

const { request: requestMock, query: queryMock } = vi.hoisted(() => {
  const query = vi.fn();
  const request = vi.fn(() => {
    const req = {
      input: vi.fn(() => req),
      query,
    };
    return req;
  });
  return { request, query };
});

vi.mock("../../config/siesa", () => ({
  getSiesaPool: vi.fn(async () => ({ request: requestMock })),
}));

const { listarFacturasCompraSiesa, contarFacturasCompraSiesa } =
  await import("./siesa-facturas-compra.service");

describe("siesa-facturas-compra.service", () => {
  beforeEach(() => {
    requestMock.mockClear();
    queryMock.mockReset();
  });

  it("listarFacturasCompraSiesa: mapea filas, incluye tercero y nunca lanza por vlr null", async () => {
    queryMock.mockResolvedValueOnce({
      recordset: [
        {
          facturaRowId: 788841,
          ciaId: 1,
          terceroRowId: 25998,
          terceroNombre: "LINEAS LOGISTICAS DE COLOMBIA S.A.S.   ",
          terceroNit: "901167319 ",
          prefijo: "LLCD",
          numero: 13284,
          fechaDocumentoProveedor: new Date("2026-09-28"),
          fechaEmision: new Date("2026-09-29"),
          valorNeto: 8000000,
          valorCxpRegistrado: 7920000,
          valorImpuesto: null,
          valorDescuento: null,
          valorRetencion: 80000,
          monedaCausacion: "COP",
        },
      ],
    });

    const resultado = await listarFacturasCompraSiesa(1, {}, 1, 25);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      facturaRowId: 788841,
      terceroNombre: "LINEAS LOGISTICAS DE COLOMBIA S.A.S.",
      terceroNit: "901167319",
      valorImpuesto: 0,
      valorDescuento: 0,
      valorCxpRegistrado: 7920000,
    });
  });

  it("filtra siempre por ciaId, y agrega search/desde/hasta solo cuando vienen", async () => {
    queryMock.mockResolvedValueOnce({ recordset: [] });
    const req = requestMock();

    await listarFacturasCompraSiesa(
      3,
      { search: "Boreal", desde: new Date("2026-01-01"), hasta: new Date("2026-12-31") },
      2,
      10,
    );

    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("f.f455_id_cia = @ciaId");
    expect(sql).toContain("t.f200_razon_social LIKE @search OR t.f200_nit LIKE @search");
    expect(sql).toContain("f.f455_fecha_docto_prov >= @desde");
    expect(sql).toContain("f.f455_fecha_docto_prov <= @hasta");
    void req;
  });

  it("sin filtros opcionales, el WHERE solo tiene la condición de ciaId", async () => {
    queryMock.mockResolvedValueOnce({ recordset: [] });
    await listarFacturasCompraSiesa(1, {}, 1, 25);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/WHERE\s+f\.f455_id_cia = @ciaId\s+ORDER BY/);
  });

  it("contarFacturasCompraSiesa: devuelve 0 si el recordset viene vacío", async () => {
    queryMock.mockResolvedValueOnce({ recordset: [] });
    const total = await contarFacturasCompraSiesa(1, {});
    expect(total).toBe(0);
  });

  it("contarFacturasCompraSiesa: devuelve el conteo real", async () => {
    queryMock.mockResolvedValueOnce({ recordset: [{ n: 42 }] });
    const total = await contarFacturasCompraSiesa(1, {});
    expect(total).toBe(42);
  });

  it("la paginación usa OFFSET/FETCH, nunca trae todo a memoria", async () => {
    queryMock.mockResolvedValueOnce({ recordset: [] });
    await listarFacturasCompraSiesa(1, {}, 3, 20);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY");
  });
});
