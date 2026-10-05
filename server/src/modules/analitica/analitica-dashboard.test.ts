import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * obtenerDashboardResumen (Fase 1 de rendimiento): solo agregaciones SQL
 * (groupBy/aggregate/count), secciones por permiso, tenant SIEMPRE de la
 * sesión. Se simulan los clientes Prisma (sin BD); la integración real contra
 * SQL Server queda cubierta por la suite *.integration.test.ts.
 */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    factura: { groupBy: fn(), count: fn() },
    solicitudCompra: { groupBy: fn() },
    loteImportacion: { groupBy: fn() },
    expedienteAduanero: { count: fn() },
    servicioSuscripcion: { groupBy: fn(), count: fn() },
    creditoCliente: { aggregate: fn(), count: fn(), findMany: fn() },
    despacho: { groupBy: fn() },
    despachoNovedad: { count: fn() },
    pedidoComercial: { groupBy: fn() },
    proforma: { groupBy: fn() },
  };
});

vi.mock("../../config/prisma", () => ({
  prisma: { pedidoComercial: m.pedidoComercial, proforma: m.proforma },
}));
vi.mock("../integraciones-siesa/siesa-ventas.service", () => ({}));
vi.mock("../integraciones-siesa/siesa-financiero.service", () => ({}));

import { obtenerDashboardResumen } from "./analitica.controller";

const TENANT = "tenant-A";

function llamar(permisos: string[], isSuperadmin = false, body: unknown = {}) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) {
      res.statusCode = c;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
  };
  const req = {
    body,
    query: { tenantId: "tenant-B" },
    user: { id: "u1", tenantId: TENANT, isSuperadmin, permisos },
    tenantPrisma: m,
  };
  return obtenerDashboardResumen(req as never, res as never).then(() => res);
}

beforeEach(() => {
  vi.clearAllMocks();
  m.factura.groupBy.mockImplementation(async (a: { by: string[] }) =>
    a.by[0] === "estado"
      ? [
          { estado: "Pendiente", _count: { _all: 2 }, _sum: { total: 300 } },
          { estado: "Pagada", _count: { _all: 1 }, _sum: { total: 50 } },
        ]
      : [{ proveedor: "ACME", _sum: { total: 350 } }],
  );
  m.factura.count.mockResolvedValue(1);
  m.solicitudCompra.groupBy.mockResolvedValue([{ estado: "Pendiente", _count: { _all: 4 } }]);
  m.loteImportacion.groupBy.mockResolvedValue([
    { estado: "En tránsito", _count: { _all: 2 } },
    { estado: "Nacionalizado", _count: { _all: 1 } },
  ]);
  m.expedienteAduanero.count.mockResolvedValue(3);
  m.servicioSuscripcion.groupBy.mockResolvedValue([
    { periodicidad: "Anual", _count: { _all: 1 }, _sum: { costo: 1200 } },
    { periodicidad: "Mensual", _count: { _all: 2 }, _sum: { costo: 100 } },
  ]);
  m.servicioSuscripcion.count.mockResolvedValue(1);
  m.creditoCliente.aggregate.mockResolvedValue({ _count: { _all: 3 }, _sum: { saldo: 900 } });
  m.creditoCliente.count.mockResolvedValue(2);
  m.creditoCliente.findMany.mockResolvedValue([{ cliente: "C1", saldo: 500 }]);
  m.despacho.groupBy.mockResolvedValue([
    { estado: "RECIBIDO", _count: { _all: 2 } },
    { estado: "ENTREGADO", _count: { _all: 3 } },
    { estado: "CANCELADO", _count: { _all: 1 } },
  ]);
  m.despachoNovedad.count.mockResolvedValue(5);
  m.pedidoComercial.groupBy.mockResolvedValue([{ estado: "BORRADOR", _count: { _all: 7 } }]);
  m.proforma.groupBy.mockResolvedValue([{ estado: "ENVIADA", _count: { _all: 6 } }]);
});

describe("obtenerDashboardResumen — agregaciones SQL", () => {
  it("superadmin: mismo contrato + pedidos y proformas; totales, vencidas y rankings", async () => {
    const res = await llamar([], true);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      facturas: {
        total: 3,
        porEstado: { Pendiente: 2, Aprobada: 0, Rechazada: 0, Pagada: 1 },
        valorPendiente: 300,
        valorAprobado: 0,
        valorPagado: 50,
        vencidas: 1,
        topProveedores: [{ nombre: "ACME", valor: 350 }],
      },
      solicitudes: { total: 4, porEstado: { Pendiente: 4 } },
      importaciones: { totalLotes: 3, enTransito: 2, nacionalizados: 1, pendientesDocumentacion: 3 },
      servicios: { activos: 3, costoRecurrenteMensual: 200, proximosVencimientos: 1 },
      creditos: {
        total: 3,
        totalSaldo: 900,
        pendientes: 2,
        topDeudores: [{ cliente: "C1", saldo: 500 }],
      },
      despachos: { total: 6, enProceso: 2, entregados: 3, novedadesAbiertas: 5 },
      pedidos: { total: 7, porEstado: { BORRADOR: 7 } },
      proformas: { total: 6, porEstado: { ENVIADA: 6 } },
    });
  });

  it("rankings con orderBy + take 5 en SQL, y todo acotado al tenant de la sesión", async () => {
    await llamar([], true, { tenantId: "tenant-B" });
    const ranking = m.factura.groupBy.mock.calls
      .map((c) => c[0])
      .find((a) => a.by[0] === "proveedor");
    expect(ranking).toMatchObject({ orderBy: { _sum: { total: "desc" } }, take: 5 });
    expect(m.creditoCliente.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: { saldo: "desc" },
      take: 5,
    });
    const donde = [
      ...m.factura.groupBy.mock.calls,
      ...m.solicitudCompra.groupBy.mock.calls,
      ...m.loteImportacion.groupBy.mock.calls,
      ...m.despacho.groupBy.mock.calls,
      ...m.pedidoComercial.groupBy.mock.calls,
      ...m.proforma.groupBy.mock.calls,
    ].map((c) => c[0].where.tenantId);
    expect(donde.length).toBeGreaterThan(0);
    expect(new Set(donde)).toEqual(new Set([TENANT])); // nunca el tenantId del body/query
    // No se cargan colecciones completas de estas entidades.
    expect(m.creditoCliente.findMany).toHaveBeenCalledTimes(1);
  });

  it("permisos parciales: solo las secciones permitidas; pedidos/proformas solo con su permiso", async () => {
    const res = await llamar(["facturas.ver", "pedidos_comerciales.ver"]);
    expect(Object.keys(res.body as object).sort()).toEqual(["facturas", "pedidos"]);
    expect(m.proforma.groupBy).not.toHaveBeenCalled();
    expect(m.creditoCliente.aggregate).not.toHaveBeenCalled();
  });

  it("sin permisos de sección: objeto vacío y ninguna consulta", async () => {
    const res = await llamar(["analitica.ver"]);
    expect(res.body).toEqual({});
    expect(m.factura.groupBy).not.toHaveBeenCalled();
    expect(m.pedidoComercial.groupBy).not.toHaveBeenCalled();
  });

  it("tenant sin registros: ceros y arreglos vacíos", async () => {
    m.factura.groupBy.mockResolvedValue([]);
    m.factura.count.mockResolvedValue(0);
    m.solicitudCompra.groupBy.mockResolvedValue([]);
    m.loteImportacion.groupBy.mockResolvedValue([]);
    m.expedienteAduanero.count.mockResolvedValue(0);
    m.servicioSuscripcion.groupBy.mockResolvedValue([]);
    m.servicioSuscripcion.count.mockResolvedValue(0);
    m.creditoCliente.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { saldo: null } });
    m.creditoCliente.count.mockResolvedValue(0);
    m.creditoCliente.findMany.mockResolvedValue([]);
    m.despacho.groupBy.mockResolvedValue([]);
    m.despachoNovedad.count.mockResolvedValue(0);
    m.pedidoComercial.groupBy.mockResolvedValue([]);
    m.proforma.groupBy.mockResolvedValue([]);

    const res = await llamar([], true);
    const b = res.body as Record<string, Record<string, unknown>>;
    expect(b.facturas).toMatchObject({ total: 0, valorPendiente: 0, vencidas: 0, topProveedores: [] });
    expect(b.creditos).toEqual({ total: 0, totalSaldo: 0, pendientes: 0, topDeudores: [] });
    expect(b.servicios).toEqual({ activos: 0, costoRecurrenteMensual: 0, proximosVencimientos: 0 });
    expect(b.despachos).toEqual({ total: 0, enProceso: 0, entregados: 0, novedadesAbiertas: 0 });
    expect(b.pedidos).toEqual({ total: 0, porEstado: {} });
    expect(b.proformas).toEqual({ total: 0, porEstado: {} });
  });
});
