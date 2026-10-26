import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  query: vi.fn(),
  input: vi.fn(),
  request: vi.fn(),
  resolverCia: vi.fn(),
  proformaTocada: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    pedidoComercial: { findMany: mocks.findMany },
    // Cualquier acceso a proforma sería un error de diseño: no cuentan como comprometidas.
    proforma: new Proxy({}, { get: () => mocks.proformaTocada }),
  },
}));
vi.mock("../../config/siesa", () => ({
  getSiesaPool: vi.fn(async () => ({ request: mocks.request })),
}));
vi.mock("../../lib/siesa-tenant", () => ({ resolverCiaSiesa: mocks.resolverCia }));

import {
  construirCompromiso,
  leerCompromisoSiesaPorPdv,
  obtenerCompromisoInventarioPedidos,
  SiesaConsultaError,
  SiesaNoConfiguradoError,
  TAMANO_LOTE_SIESA,
} from "./pedidos-compromiso.service";

function filaSiesa(pdvRowId: number, comprometida: number, extra: Record<string, unknown> = {}) {
  return {
    pdvRowId,
    pdvNumero: 5000 + pdvRowId,
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
    cantidadPedida: 10,
    cantidadComprometida: comprometida,
    cantidadRemisionada: 0,
    cantidadFacturada: 0,
    lineas: 2,
    lineasComprometidas: comprometida > 0 ? 2 : 0,
    ...extra,
  };
}

const pedido = (id: string, erpRowId: number | null, numero = 1) => ({
  id,
  numero,
  estado: "LISTO_PARA_ERP",
  erpRowId,
  erpEstadoSincronizacion: erpRowId === null ? null : "VINCULADO",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolverCia.mockResolvedValue(7);
  const req = { input: mocks.input, query: mocks.query };
  mocks.input.mockReturnValue(req);
  mocks.request.mockReturnValue(req);
  mocks.query.mockResolvedValue({ recordset: [] });
});

describe("construirCompromiso — clasificación", () => {
  it("sin erpRowId -> SIN_VINCULO_ERP y estadoSincronizacion NO_VINCULADO", () => {
    const dto = construirCompromiso(pedido("a", null), undefined);
    expect(dto.compromiso).toBe("SIN_VINCULO_ERP");
    expect(dto.estadoSincronizacion).toBe("NO_VINCULADO");
    expect(dto.siesa).toBeNull();
  });

  it("vinculado pero Siesa no lo devuelve -> SIESA_NO_ENCONTRADO", () => {
    expect(construirCompromiso(pedido("a", 10), undefined).compromiso).toBe("SIESA_NO_ENCONTRADO");
  });

  it("existe en Siesa con comprometido 0 -> NO_COMPROMETIDO; > 0 -> COMPROMETIDO", () => {
    const resumen = (c: number) => ({
      pdvRowId: 10,
      pdvNumero: 1,
      estadoOperativo: "Aprobado" as const,
      estadoUnoee: c > 0 ? "Comprometido" : "No comprometido",
      cantidadPedida: 10,
      cantidadComprometida: c,
      cantidadRemisionada: 0,
      cantidadFacturada: 0,
      lineas: 1,
      lineasComprometidas: c > 0 ? 1 : 0,
    });
    expect(construirCompromiso(pedido("a", 10), resumen(0)).compromiso).toBe("NO_COMPROMETIDO");
    expect(construirCompromiso(pedido("a", 10), resumen(4)).compromiso).toBe("COMPROMETIDO");
  });

  it("separa estado comercial, de sincronización y operativo de Siesa", () => {
    const dto = construirCompromiso(pedido("a", 10), {
      pdvRowId: 10,
      pdvNumero: 1,
      estadoOperativo: "Retenido",
      estadoUnoee: "Retenido",
      cantidadPedida: 1,
      cantidadComprometida: 1,
      cantidadRemisionada: 0,
      cantidadFacturada: 0,
      lineas: 1,
      lineasComprometidas: 1,
    });
    expect(dto.estadoComercial).toBe("LISTO_PARA_ERP");
    expect(dto.estadoSincronizacion).toBe("VINCULADO");
    expect(dto.siesa?.estadoOperativo).toBe("Retenido");
  });
});

describe("leerCompromisoSiesaPorPdv — lote y unión", () => {
  it("UNA sola consulta para muchos rowids, parametrizada, filtrada por cia y tipo PDV", async () => {
    mocks.query.mockResolvedValue({ recordset: [filaSiesa(1, 5), filaSiesa(2, 0)] });

    const mapa = await leerCompromisoSiesaPorPdv(7, [1, 2, 3, 2]); // 2 repetido

    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const sql = mocks.query.mock.calls[0][0] as string;
    expect(sql).toMatch(/f430_id_cia = @ciaId/);
    expect(sql).toMatch(/f430_id_tipo_docto = 'PDV'/);
    expect(sql).toMatch(/f430_rowid IN \(@r0, @r1, @r2\)/);
    expect(sql).not.toMatch(/f430_consec_docto\s*=/); // nunca une por número visible
    expect(mocks.input).toHaveBeenCalledWith("ciaId", 7);
    expect(mapa.get(1)?.cantidadComprometida).toBe(5);
    expect(mapa.get(2)?.cantidadComprometida).toBe(0);
    expect(mapa.has(3)).toBe(false);
  });

  it("más de TAMANO_LOTE_SIESA rowids -> ceil(n/lote) consultas, nunca una por pedido", async () => {
    const ids = Array.from({ length: TAMANO_LOTE_SIESA * 2 + 1 }, (_, i) => i + 1);
    await leerCompromisoSiesaPorPdv(7, ids);
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });

  it("sin rowids no consulta Siesa", async () => {
    await leerCompromisoSiesaPorPdv(7, []);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("deriva el estado operativo con las reglas existentes (flags reales de Siesa)", async () => {
    mocks.query.mockResolvedValue({
      recordset: [
        filaSiesa(1, 5, { indRetenidoCupo: true }),
        filaSiesa(2, 5, { indBackorderLinea: 1 }),
      ],
    });
    const mapa = await leerCompromisoSiesaPorPdv(7, [1, 2]);
    expect(mapa.get(1)?.estadoOperativo).toBe("Retenido");
    expect(mapa.get(2)?.estadoOperativo).toBe("Backorder");
  });
});

describe("obtenerCompromisoInventarioPedidos", () => {
  it("acota por tenantId, agrupa TODOS los vinculados en un lote y no toca Proformas", async () => {
    mocks.findMany.mockResolvedValue([
      pedido("a", 11, 3),
      pedido("b", null, 2),
      pedido("c", 12, 1),
    ]);
    mocks.query.mockResolvedValue({ recordset: [filaSiesa(11, 6), filaSiesa(12, 0)] });

    const dtos = await obtenerCompromisoInventarioPedidos("tenant-1", ["a", "b", "c"]);

    expect(mocks.findMany.mock.calls[0][0].where).toEqual({
      tenantId: "tenant-1",
      id: { in: ["a", "b", "c"] },
    });
    expect(mocks.resolverCia).toHaveBeenCalledWith("tenant-1");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(dtos.map((d) => d.compromiso)).toEqual([
      "COMPROMETIDO",
      "SIN_VINCULO_ERP",
      "NO_COMPROMETIDO",
    ]);
    expect(mocks.proformaTocada).not.toHaveBeenCalled();
  });

  it("solo pedidos sin vínculo: no resuelve compañía ni consulta Siesa", async () => {
    mocks.findMany.mockResolvedValue([pedido("a", null)]);
    const dtos = await obtenerCompromisoInventarioPedidos("t", ["a"]);
    expect(dtos[0].compromiso).toBe("SIN_VINCULO_ERP");
    expect(mocks.resolverCia).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("tenant sin siesaCiaId y pedidos vinculados -> SiesaNoConfiguradoError", async () => {
    mocks.findMany.mockResolvedValue([pedido("a", 5)]);
    mocks.resolverCia.mockResolvedValue(null);
    await expect(obtenerCompromisoInventarioPedidos("t", ["a"])).rejects.toBeInstanceOf(
      SiesaNoConfiguradoError,
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("falla de Siesa -> SiesaConsultaError (sin filtrar el error original en el mensaje)", async () => {
    mocks.findMany.mockResolvedValue([pedido("a", 5)]);
    mocks.query.mockRejectedValue(new Error("ECONNREFUSED host-secreto"));
    const error = await obtenerCompromisoInventarioPedidos("t", ["a"]).catch((e) => e);
    expect(error).toBeInstanceOf(SiesaConsultaError);
    expect(error.message).not.toMatch(/host-secreto|ECONNREFUSED/);
  });

  it("lista vacía o pedidos de otro tenant (findMany vacío) -> []", async () => {
    expect(await obtenerCompromisoInventarioPedidos("t", [])).toEqual([]);
    mocks.findMany.mockResolvedValue([]);
    expect(await obtenerCompromisoInventarioPedidos("t", ["ajeno"])).toEqual([]);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
