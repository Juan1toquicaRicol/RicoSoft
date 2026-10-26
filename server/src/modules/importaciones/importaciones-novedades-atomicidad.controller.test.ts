import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Regresiones de importaciones.controller sin BD (prisma simulado):
 *  - el detalle de la orden ya no falla (500) cuando una novedad automática
 *    Resuelta por una persona sigue sugerida por el motor;
 *  - las escrituras relacionadas (lote + actividades + historial, novedad +
 *    historial, cambios de lote + historial) van en UNA transacción.
 * Las pruebas con BD real viven en los *.integration.test.ts.
 */
const m = vi.hoisted(() => ({
  ordenFindFirst: vi.fn(),
  ordenFindUnique: vi.fn(),
  ordenUpdate: vi.fn(),
  actividadFindMany: vi.fn(),
  actividadCreateMany: vi.fn(),
  novedadFindMany: vi.fn(),
  novedadFindUnique: vi.fn(),
  novedadFindUniqueOrThrow: vi.fn(),
  novedadFindFirst: vi.fn(),
  novedadCreate: vi.fn(),
  novedadUpdateMany: vi.fn(),
  historialCreate: vi.fn(),
  historialFindFirst: vi.fn(),
  loteFindFirst: vi.fn(),
  loteCreate: vi.fn(),
  loteUpdate: vi.fn(),
  catalogo: vi.fn(),
}));

vi.mock("../../config/prisma", () => {
  const tx = {
    loteImportacion: { create: m.loteCreate },
    importacionHistorial: { create: m.historialCreate },
    importacionActividad: { createMany: m.actividadCreateMany },
    ordenCompraIntl: { update: m.ordenUpdate },
    importacionNovedad: {
      updateMany: m.novedadUpdateMany,
      findUniqueOrThrow: m.novedadFindUniqueOrThrow,
    },
  };
  return {
    prisma: {
      ordenCompraIntl: {
        findFirst: m.ordenFindFirst,
        findUnique: m.ordenFindUnique,
        update: m.ordenUpdate,
      },
      importacionActividad: { findMany: m.actividadFindMany, createMany: m.actividadCreateMany },
      importacionNovedad: {
        findMany: m.novedadFindMany,
        findUnique: m.novedadFindUnique,
        findFirst: m.novedadFindFirst,
        create: m.novedadCreate,
        updateMany: m.novedadUpdateMany,
      },
      importacionHistorial: { create: m.historialCreate, findFirst: m.historialFindFirst },
      loteImportacion: { findFirst: m.loteFindFirst, create: m.loteCreate, update: m.loteUpdate },
      $transaction: async (arg: unknown) =>
        typeof arg === "function"
          ? (arg as (t: typeof tx) => unknown)(tx)
          : Promise.all(arg as unknown[]),
    },
  };
});
vi.mock("../../lib/tenant-prisma", () => ({ getTenantPrisma: vi.fn() }));
vi.mock("../../lib/motor-destinatarios", () => ({ resolverDestinatarios: vi.fn(async () => []) }));
vi.mock("../../lib/notificaciones", () => ({ crearNotificacion: vi.fn() }));
vi.mock("../../lib/inbox", () => ({ crearItemDeTrabajo: vi.fn() }));
vi.mock("../../integrations/trm/trm.service", () => ({ obtenerTrmOficial: vi.fn() }));
vi.mock("../integraciones-siesa/siesa-inventario.service", () => ({ buscarItemsSiesa: vi.fn() }));
vi.mock("../catalogos/catalogos.controller", () => ({
  obtenerClavesActivasCatalogo: m.catalogo,
}));

const {
  obtenerOrdenCompraIntl,
  crearLoteImportacion,
  crearNovedadImportacion,
  resolverNovedadImportacion,
  actualizarEstadoLote,
  actualizarEmbarqueLote,
} = await import("./importaciones.controller");

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
function peticion(params: Record<string, string>, body: Record<string, unknown> = {}) {
  return { user: { tenantId: "ten-1", id: "u1", nombre: "Ana" }, params, body } as never;
}

const ORDEN = {
  id: "ord-1",
  tenantId: "ten-1",
  numeroOrden: "OC-1",
  estado: "Borrador",
  responsableId: null,
  createdAt: new Date(),
};
const LOTE = {
  id: "lote-1",
  tenantId: "ten-1",
  ordenCompraId: "ord-1",
  blAwb: "BL-1",
  estado: "En tránsito",
};

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  m.catalogo.mockResolvedValue(new Set(["Otro", "Retraso"]));
  m.ordenFindUnique.mockResolvedValue({ numeroOrden: "OC-1", responsableId: null });
});

describe("detalle de la orden con novedades automáticas ya resueltas", () => {
  const actividadVencida = {
    id: "a1",
    ordenCompraId: "ord-1",
    nombre: "Enviar documentos",
    etapa: "Documentación",
    responsableTipo: "Proveedor",
    responsableNombre: null,
    fechaLimite: new Date("2020-01-01T00:00:00Z"),
    fechaReal: null,
    estado: "Pendiente",
    dependeDeId: null,
  };

  beforeEach(() => {
    m.ordenFindFirst.mockResolvedValue({ ...ORDEN, actividades: [actividadVencida] });
    m.actividadFindMany.mockResolvedValue([actividadVencida]);
    m.novedadFindMany.mockResolvedValue([]); // no hay automáticas ABIERTAS
    // El índice único real cubre filas resueltas: un create sería P2002 → 500.
    m.novedadCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );
  });

  it("novedad automática resuelta POR UNA PERSONA (fila heredada) y condición vigente: responde 200, se reabre sin recrearla", async () => {
    m.novedadFindUnique.mockResolvedValue({
      id: "n1",
      tenantId: "ten-1",
      tipo: "Retraso",
      estado: "Resuelta",
      responsableResolucionId: "u9",
      responsableResolucionNombre: "Luis",
      fechaResolucion: new Date("2026-09-02T10:00:00Z"),
    });
    m.novedadUpdateMany.mockResolvedValue({ count: 1 });
    const res = respuesta();
    await obtenerOrdenCompraIntl(peticion({ id: "ord-1" }), res as never);
    expect(res.statusCode).toBe(200);
    expect(m.novedadCreate).not.toHaveBeenCalled();
    const h = m.historialCreate.mock.calls[0][0].data;
    expect(h.detalle).toContain("Luis");
    expect(h.detalle).toContain("id u9");
    expect(h.detalle).toContain("permanece en el historial de la orden");
    expect(m.historialFindFirst).not.toHaveBeenCalled();
  });

  it("novedad resuelta por el sistema y condición recurrente: se reabre con historial, sin create", async () => {
    m.novedadFindUnique.mockResolvedValue({
      id: "n1",
      tenantId: "ten-1",
      tipo: "Retraso",
      estado: "Resuelta",
      responsableResolucionId: null,
      responsableResolucionNombre: "Sistema (condición resuelta)",
      fechaResolucion: new Date("2026-09-01T00:00:00Z"),
    });
    m.novedadUpdateMany.mockResolvedValue({ count: 1 });
    const res = respuesta();
    await obtenerOrdenCompraIntl(peticion({ id: "ord-1" }), res as never);
    expect(res.statusCode).toBe(200);
    expect(m.novedadCreate).not.toHaveBeenCalled();
    expect(m.historialCreate.mock.calls[0][0].data.accion).toContain("reabierta");
  });

  it("consultas concurrentes: si el create pierde la carrera (P2002) el detalle sigue respondiendo 200", async () => {
    m.novedadFindUnique.mockResolvedValue(null);
    const res = respuesta();
    await obtenerOrdenCompraIntl(peticion({ id: "ord-1" }), res as never);
    expect(res.statusCode).toBe(200);
  });

  it("la novedad automática nueva nace con origen PorDeterminar", async () => {
    m.novedadFindUnique.mockResolvedValue(null);
    m.novedadCreate.mockReset();
    m.novedadCreate.mockResolvedValue({});
    const res = respuesta();
    await obtenerOrdenCompraIntl(peticion({ id: "ord-1" }), res as never);
    expect(res.statusCode).toBe(200);
    const data = m.novedadCreate.mock.calls[0][0].data;
    expect(data.origen).toBe("PorDeterminar");
    expect(data.responsable).toBe("Proveedor");
    expect(data.tenantId).toBe("ten-1");
  });
});

describe("resolverNovedadImportacion", () => {
  const novedad = { id: "n1", ordenCompraId: "ord-1", tipo: "Retraso", estado: "Abierta" };

  it("resolución condicional: si otra ya la resolvió (count 0) responde 400 y no escribe historial", async () => {
    m.novedadFindFirst.mockResolvedValue(novedad);
    m.novedadUpdateMany.mockResolvedValue({ count: 0 });
    const res = respuesta();
    await resolverNovedadImportacion(peticion({ id: "n1" }, { comentario: "ok" }), res as never);
    expect(res.statusCode).toBe(400);
    expect(m.historialCreate).not.toHaveBeenCalled();
    expect(m.novedadUpdateMany.mock.calls[0][0].where).toEqual({
      id: "n1",
      tenantId: "ten-1",
      estado: { not: "Resuelta" },
    });
  });

  it("una novedad AUTOMÁTICA no se puede resolver a mano: 409 y no escribe nada", async () => {
    m.novedadFindFirst.mockResolvedValue({ ...novedad, automatica: true });
    const res = respuesta();
    await resolverNovedadImportacion(peticion({ id: "n1" }, { comentario: "ok" }), res as never);
    expect(res.statusCode).toBe(409);
    expect(m.novedadUpdateMany).not.toHaveBeenCalled();
    expect(m.historialCreate).not.toHaveBeenCalled();
  });

  it("resuelve y deja el historial en la misma transacción, con la persona como resolutora", async () => {
    m.novedadFindFirst.mockResolvedValue(novedad);
    m.novedadUpdateMany.mockResolvedValue({ count: 1 });
    m.novedadFindUniqueOrThrow.mockResolvedValue({ ...novedad, estado: "Resuelta" });
    const res = respuesta();
    await resolverNovedadImportacion(peticion({ id: "n1" }, { comentario: "ok" }), res as never);
    expect(res.statusCode).toBe(200);
    expect(m.novedadUpdateMany.mock.calls[0][0].data.responsableResolucionId).toBe("u1");
    expect(m.historialCreate).toHaveBeenCalledTimes(1);
  });
});

describe("atomicidad de escrituras relacionadas", () => {
  it("crearLote: lote, historial, actividades y confirmación de la orden van dentro de la transacción", async () => {
    m.ordenFindFirst.mockResolvedValue(ORDEN);
    m.loteCreate.mockResolvedValue({ ...LOTE });
    const res = respuesta();
    await crearLoteImportacion(
      peticion(
        { id: "ord-1" },
        { blAwb: "BL-1", puertoOrigen: "A", puertoDestino: "B", fechaEmbarque: "2026-10-01" },
      ),
      res as never,
    );
    expect(res.statusCode).toBe(201);
    expect(m.loteCreate).toHaveBeenCalledTimes(1);
    expect(m.historialCreate).toHaveBeenCalledTimes(1);
    expect(m.actividadCreateMany.mock.calls[0][0].data).toHaveLength(2);
    expect(m.ordenUpdate).toHaveBeenCalledWith({
      where: { id: "ord-1" },
      data: { estado: "Confirmada" },
    });
  });

  it("crearLote: si falla una escritura posterior responde 500 (la transacción revierte, el lote no se devuelve)", async () => {
    m.ordenFindFirst.mockResolvedValue(ORDEN);
    m.loteCreate.mockResolvedValue({ ...LOTE });
    m.actividadCreateMany.mockRejectedValue(new Error("fallo"));
    const res = respuesta();
    await crearLoteImportacion(
      peticion({ id: "ord-1" }, { blAwb: "BL-1", puertoOrigen: "A", puertoDestino: "B" }),
      res as never,
    );
    expect(res.statusCode).toBe(500);
  });

  it("crearNovedad: novedad e historial se envían juntos a la transacción", async () => {
    m.ordenFindFirst.mockResolvedValue(ORDEN);
    m.novedadCreate.mockReturnValue(Promise.resolve({ id: "n1", prioridad: "Media" }));
    m.historialCreate.mockReturnValue(Promise.resolve({}));
    const res = respuesta();
    await crearNovedadImportacion(
      peticion({ id: "ord-1" }, { tipo: "Otro", descripcion: "algo" }),
      res as never,
    );
    expect(res.statusCode).toBe(201);
    expect(m.novedadCreate).toHaveBeenCalledTimes(1);
    expect(m.historialCreate).toHaveBeenCalledTimes(1);
  });

  it("crearNovedad: si el historial falla responde 500 y no devuelve la novedad", async () => {
    m.ordenFindFirst.mockResolvedValue(ORDEN);
    m.novedadCreate.mockReturnValue(Promise.resolve({ id: "n1", prioridad: "Media" }));
    m.historialCreate.mockReturnValue(Promise.reject(new Error("fallo")));
    const res = respuesta();
    await crearNovedadImportacion(
      peticion({ id: "ord-1" }, { tipo: "Otro", descripcion: "algo" }),
      res as never,
    );
    expect(res.statusCode).toBe(500);
  });

  it("cambio de estado del lote: update + historial juntos; el historial conserva 'antes → después'", async () => {
    m.loteFindFirst.mockResolvedValue({
      ...LOTE,
      ordenCompra: { eliminado: false, estado: "Confirmada" },
    });
    m.loteUpdate.mockResolvedValue({ ...LOTE, estado: "En puerto" });
    m.historialCreate.mockResolvedValue({});
    const res = respuesta();
    await actualizarEstadoLote(peticion({ id: "lote-1" }, { estado: "En puerto" }), res as never);
    expect(res.statusCode).toBe(200);
    expect(m.historialCreate.mock.calls[0][0].data.detalle).toBe("En tránsito → En puerto");
  });

  it("edición de embarque: update + historial juntos, con el BL vigente en el detalle", async () => {
    m.loteFindFirst.mockResolvedValue({
      ...LOTE,
      ordenCompra: { eliminado: false, estado: "Confirmada" },
    });
    m.loteUpdate.mockResolvedValue({ ...LOTE, blAwb: "BL-NUEVO", contenedores: [] });
    m.historialCreate.mockResolvedValue({});
    const res = respuesta();
    await actualizarEmbarqueLote(peticion({ id: "lote-1" }, { blAwb: "BL-NUEVO" }), res as never);
    expect(res.statusCode).toBe(200);
    expect(m.historialCreate.mock.calls[0][0].data.detalle).toContain("BL-NUEVO");
  });

  it("edición de embarque: si el historial falla responde 500 (no se confirma el cambio)", async () => {
    m.loteFindFirst.mockResolvedValue({
      ...LOTE,
      ordenCompra: { eliminado: false, estado: "Confirmada" },
    });
    m.loteUpdate.mockResolvedValue({ ...LOTE, contenedores: [] });
    m.historialCreate.mockRejectedValue(new Error("fallo"));
    const res = respuesta();
    await actualizarEmbarqueLote(peticion({ id: "lote-1" }, { naviera: "X" }), res as never);
    expect(res.statusCode).toBe(500);
  });
});
