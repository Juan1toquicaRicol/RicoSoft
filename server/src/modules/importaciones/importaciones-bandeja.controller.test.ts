import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  correoFindFirst: vi.fn(),
  correoUpdate: vi.fn(),
  correoUpdateMany: vi.fn(),
  excepcionUpdateMany: vi.fn(),
  excepcionFindFirst: vi.fn(),
  excepcionUpdate: vi.fn(),
  excepcionCount: vi.fn(),
  proveedorFindFirst: vi.fn(),
  ordenFindFirst: vi.fn(),
  auditoriaCreate: vi.fn(),
  // auditoria.create del cliente de la transacción interactiva (distinto del
  // de `prisma`, para comprobar qué se escribe dentro de la transacción).
  txAuditoriaCreate: vi.fn(),
  txOrdenCount: vi.fn(),
  txBloquearOrden: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    importacionCorreoOrigen: { findFirst: async () => ({ id: "origen" }) },
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
    m.correoUpdateMany.mockResolvedValue({ count: 1 });
    m.excepcionUpdateMany.mockResolvedValue({ count: 1 });
    m.txOrdenCount.mockResolvedValue(1);
    m.txBloquearOrden.mockResolvedValue([{ id: "ord-1" }]);
    m.transaction.mockImplementation(async (fn) =>
      typeof fn === "function"
        ? fn({
            $queryRaw: m.txBloquearOrden,
            ordenCompraIntl: { count: m.txOrdenCount },
            importacionCorreo: { updateMany: m.correoUpdateMany },
            importacionExcepcion: { updateMany: m.excepcionUpdateMany },
            auditoria: { create: m.txAuditoriaCreate },
          })
        : [],
    );
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
    expect(m.correoUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "c1", tenantId: "ten-1", ordenCompraId: null }),
      data: expect.objectContaining({ ordenCompraId: "ord-1", estadoProcesamiento: "PENDIENTE" }),
    });
    // El paso a RESUELTO del controlador usa importacionCorreo.update, fuera
    // del vínculo: no debe ocurrir al vincular una orden.
    const estados = [...m.correoUpdateMany.mock.calls, ...m.correoUpdate.mock.calls].map(
      (c) => c[0].data.estadoProcesamiento,
    );
    expect(estados).not.toContain("RESUELTO");
    expect(m.correoUpdate).not.toHaveBeenCalled();
  });

  it("SELECCIONAR_ORDEN registra la resolución y el vínculo dentro de la transacción del vínculo", async () => {
    m.ordenFindFirst.mockResolvedValue({ id: "ord-1", proveedorId: "prov-1" });
    const res = respuesta();
    await resolverExcepcionBandeja(
      peticion({ accion: "SELECCIONAR_ORDEN", ordenCompraId: "ord-1" }),
      res as never,
    );
    expect(res.statusCode).toBe(204);
    expect(m.transaction).toHaveBeenCalledTimes(1);
    expect(m.txAuditoriaCreate.mock.calls.map((c) => c[0].data.accion).sort()).toEqual([
      "IMPORTACION_CORREO_ORDEN_VINCULADA",
      "IMPORTACION_EXCEPCION_RESUELTA",
    ]);
    // Mismo formato que el resto de resoluciones (reportes de auditoría).
    expect(m.txAuditoriaCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "ten-1",
        usuarioId: "u1",
        accion: "IMPORTACION_EXCEPCION_RESUELTA",
        detalle:
          'Ana resolvió la excepción "ORDEN_NO_IDENTIFICADA" del correo "x" (SELECCIONAR_ORDEN).',
        entidadTipo: "ImportacionExcepcion",
        entidadId: "e1",
        datosAnteriores: JSON.stringify({ estado: "ABIERTA" }),
        datosNuevos: JSON.stringify({ estado: "RESUELTA", accion: "SELECCIONAR_ORDEN" }),
      },
    });
    expect(m.auditoriaCreate).not.toHaveBeenCalled();
  });

  it("si el vínculo condicional falla, responde 409 sin registrar la resolución", async () => {
    m.ordenFindFirst.mockResolvedValue({ id: "ord-1", proveedorId: "prov-1" });
    m.correoUpdateMany.mockResolvedValue({ count: 0 });
    const res = respuesta();
    await resolverExcepcionBandeja(
      peticion({ accion: "SELECCIONAR_ORDEN", ordenCompraId: "ord-1" }),
      res as never,
    );
    expect(res.statusCode).toBe(409);
    expect(m.txAuditoriaCreate).not.toHaveBeenCalled();
    expect(m.auditoriaCreate).not.toHaveBeenCalled();
  });

  it("una orden anulada entre la validación y el vínculo responde 409 sin tocar el correo", async () => {
    m.ordenFindFirst.mockResolvedValue({ id: "ord-1", proveedorId: "prov-1" });
    m.txBloquearOrden.mockResolvedValue([]);
    const res = respuesta();
    await resolverExcepcionBandeja(
      peticion({ accion: "SELECCIONAR_ORDEN", ordenCompraId: "ord-1" }),
      res as never,
    );
    expect(res.statusCode).toBe(409);
    expect(m.txBloquearOrden).toHaveBeenCalledWith(expect.any(Array), "ord-1", "ten-1");
    expect(m.txOrdenCount).not.toHaveBeenCalled();
    expect(m.correoUpdateMany).not.toHaveBeenCalled();
    expect(m.txAuditoriaCreate).not.toHaveBeenCalled();
  });

  it("DESCARTAR conserva el evento IMPORTACION_EXCEPCION_RESUELTA con el formato existente", async () => {
    const res = respuesta();
    await resolverExcepcionBandeja(peticion({ accion: "DESCARTAR" }), res as never);
    expect(res.statusCode).toBe(204);
    expect(m.auditoriaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: "IMPORTACION_EXCEPCION_RESUELTA",
        entidadId: "e1",
        datosNuevos: JSON.stringify({ estado: "DESCARTADA", accion: "DESCARTAR" }),
      }),
    });
  });
});

describe("reprocesarCorreoBandeja", () => {
  beforeEach(() => {
    for (const f of Object.values(m)) f.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    m.correoUpdateMany.mockResolvedValue({ count: 1 });
    m.transaction.mockImplementation((fn) => fn({
      importacionCorreo: { updateMany: m.correoUpdateMany },
      auditoria: { create: m.txAuditoriaCreate },
    }));
  });

  it("solo reencola correos en ERROR o REQUIERE_REVISION", async () => {
    m.correoFindFirst.mockResolvedValue({ id: "c1", asunto: "x", ingestaCompleta: true, estadoProcesamiento: "RESUELTO" });
    const res = respuesta();
    await reprocesarCorreoBandeja(peticion({}), res as never);
    expect(res.statusCode).toBe(409);
    expect(m.correoUpdateMany).not.toHaveBeenCalled();
  });

  it("reencola un correo en ERROR", async () => {
    m.correoFindFirst.mockResolvedValue({ id: "c1", asunto: "x", ingestaCompleta: true, estadoProcesamiento: "ERROR" });
    const res = respuesta();
    await reprocesarCorreoBandeja(peticion({}), res as never);
    expect(res.statusCode).toBe(204);
    expect(m.correoUpdateMany).toHaveBeenCalled();
  });
});
