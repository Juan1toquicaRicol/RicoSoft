import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  correoFindFirst: vi.fn(),
  correoUpdate: vi.fn(),
  excepcionFindFirst: vi.fn(),
  excepcionUpdate: vi.fn(),
  excepcionCount: vi.fn(),
  proveedorFindFirst: vi.fn(),
  ordenFindFirst: vi.fn(),
  auditoriaCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    importacionCorreo: { findFirst: m.correoFindFirst, update: m.correoUpdate },
    importacionExcepcion: {
      findFirst: m.excepcionFindFirst,
      update: m.excepcionUpdate,
      count: m.excepcionCount,
    },
    proveedor: { findFirst: m.proveedorFindFirst },
    ordenCompraIntl: { findFirst: m.ordenFindFirst },
    auditoria: { create: m.auditoriaCreate },
    $transaction: m.transaction,
  },
}));
vi.mock("../../lib/tenant-prisma", () => ({ getTenantPrisma: vi.fn() }));
vi.mock("../../lib/inbox", () => ({ resolverItemDeTrabajo: vi.fn() }));

const { resolverExcepcionBandeja, reprocesarCorreoBandeja } =
  await import("./importaciones-bandeja.controller");

function respuesta() {
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
    send() {
      return res;
    },
  };
  return res;
}
function peticion(body: Record<string, unknown>) {
  return {
    user: { tenantId: "ten-1", id: "u1", nombre: "Ana" },
    params: { id: "c1", excepcionId: "e1" },
    body,
  } as never;
}

describe("resolverExcepcionBandeja: validaciones", () => {
  beforeEach(() => {
    for (const f of Object.values(m)) f.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    m.correoFindFirst.mockResolvedValue({ id: "c1", asunto: "x", proveedorId: "prov-1" });
    m.excepcionFindFirst.mockResolvedValue({
      id: "e1",
      tipo: "ORDEN_NO_IDENTIFICADA",
      estado: "ABIERTA",
    });
    m.excepcionCount.mockResolvedValue(0);
    m.transaction.mockResolvedValue([]);
  });

  it("rechaza una acción desconocida en vez de marcar la excepción como resuelta", async () => {
    const res = respuesta();
    await resolverExcepcionBandeja(peticion({ accion: "LO_QUE_SEA" }), res as never);
    expect(res.statusCode).toBe(400);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("no permite vincular una orden de OTRO proveedor", async () => {
    m.ordenFindFirst.mockResolvedValue({ id: "ord-9", proveedorId: "prov-OTRO" });
    const res = respuesta();
    await resolverExcepcionBandeja(
      peticion({ accion: "SELECCIONAR_ORDEN", ordenCompraId: "ord-9" }),
      res as never,
    );
    expect(res.statusCode).toBe(409);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("SELECCIONAR_ORDEN solo aplica a excepciones de orden no identificada", async () => {
    m.excepcionFindFirst.mockResolvedValue({
      id: "e1",
      tipo: "REQUISITO_FALTANTE",
      estado: "ABIERTA",
    });
    const res = respuesta();
    await resolverExcepcionBandeja(
      peticion({ accion: "SELECCIONAR_ORDEN", ordenCompraId: "ord-1" }),
      res as never,
    );
    expect(res.statusCode).toBe(400);
  });

  it("una orden válida del mismo proveedor reencola el correo (PENDIENTE), no lo da por RESUELTO", async () => {
    m.ordenFindFirst.mockResolvedValue({ id: "ord-1", proveedorId: "prov-1" });
    const res = respuesta();
    await resolverExcepcionBandeja(
      peticion({ accion: "SELECCIONAR_ORDEN", ordenCompraId: "ord-1" }),
      res as never,
    );
    expect(res.statusCode).toBe(204);
    expect(m.correoUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ ordenCompraId: "ord-1", estadoProcesamiento: "PENDIENTE" }),
    });
    const estados = m.correoUpdate.mock.calls.map((c) => c[0].data.estadoProcesamiento);
    expect(estados).not.toContain("RESUELTO");
  });
});

describe("reprocesarCorreoBandeja", () => {
  beforeEach(() => {
    for (const f of Object.values(m)) f.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("solo reencola correos en ERROR o REQUIERE_REVISION", async () => {
    m.correoFindFirst.mockResolvedValue({ id: "c1", asunto: "x", estadoProcesamiento: "RESUELTO" });
    const res = respuesta();
    await reprocesarCorreoBandeja(peticion({}), res as never);
    expect(res.statusCode).toBe(409);
    expect(m.correoUpdate).not.toHaveBeenCalled();
  });

  it("reencola un correo en ERROR", async () => {
    m.correoFindFirst.mockResolvedValue({ id: "c1", asunto: "x", estadoProcesamiento: "ERROR" });
    const res = respuesta();
    await reprocesarCorreoBandeja(peticion({}), res as never);
    expect(res.statusCode).toBe(204);
    expect(m.correoUpdate).toHaveBeenCalled();
  });
});
