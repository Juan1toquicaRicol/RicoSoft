import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  historialCreate: vi.fn(),
  historialFindFirst: vi.fn(),
}));

vi.mock("../../config/prisma", () => {
  const tx = {
    importacionNovedad: { updateMany: m.updateMany },
    importacionHistorial: { create: m.historialCreate },
  };
  return {
    prisma: {
      importacionNovedad: { findUnique: m.findUnique, create: m.create },
      importacionHistorial: { findFirst: m.historialFindFirst },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

const { aplicarNovedadAutomatica } = await import("./importaciones-novedades-automaticas");

const BASE = {
  tenantId: "ten-1",
  ordenCompraId: "ord-1",
  reglaOrigen: "actividad-vencida:a1",
};
const DATOS = {
  tipo: "Retraso",
  descripcion: "Actividad vencida",
  prioridad: "Alta",
  responsable: "Proveedor",
};
const existente = (extra: Record<string, unknown> = {}) => ({
  id: "n1",
  tenantId: "ten-1",
  tipo: "Retraso",
  estado: "Abierta",
  responsableResolucionId: null,
  responsableResolucionNombre: null,
  fechaResolucion: null,
  ...extra,
});

describe("aplicarNovedadAutomatica", () => {
  beforeEach(() => {
    for (const f of Object.values(m)) f.mockReset();
    m.updateMany.mockResolvedValue({ count: 1 });
  });

  it("condición vigente sin fila: la crea con origen PorDeterminar (responsable solo como contexto)", async () => {
    m.findUnique.mockResolvedValue(null);
    const r = await aplicarNovedadAutomatica({ ...BASE, condicionVigente: true, datos: DATOS });
    expect(r).toBe("creada");
    const data = m.create.mock.calls[0][0].data;
    expect(data.origen).toBe("PorDeterminar");
    expect(data.automatica).toBe(true);
    expect(data.responsable).toBe("Proveedor");
    expect(data.tenantId).toBe("ten-1");
  });

  it("carrera: si otra consulta ya la creó (P2002) no falla ni duplica", async () => {
    m.findUnique.mockResolvedValue(null);
    m.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );
    const r = await aplicarNovedadAutomatica({ ...BASE, condicionVigente: true, datos: DATOS });
    expect(r).toBe("sin_cambio");
  });

  it("un error distinto de P2002 al crear sí se propaga", async () => {
    m.findUnique.mockResolvedValue(null);
    m.create.mockRejectedValue(new Error("db caída"));
    await expect(
      aplicarNovedadAutomatica({ ...BASE, condicionVigente: true, datos: DATOS }),
    ).rejects.toThrow("db caída");
  });

  it("ya abierta: no crea ni modifica nada", async () => {
    m.findUnique.mockResolvedValue(existente());
    const r = await aplicarNovedadAutomatica({ ...BASE, condicionVigente: true, datos: DATOS });
    expect(r).toBe("sin_cambio");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it("Resuelta por el SISTEMA y la condición reaparece: la reabre (sin create) y deja historial con la resolución anterior", async () => {
    m.findUnique.mockResolvedValue(
      existente({
        estado: "Resuelta",
        fechaResolucion: new Date("2026-09-01T00:00:00Z"),
        responsableResolucionNombre: "Sistema (condición resuelta)",
      }),
    );
    const r = await aplicarNovedadAutomatica({ ...BASE, condicionVigente: true, datos: DATOS });
    expect(r).toBe("reabierta");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.updateMany.mock.calls[0][0].where).toEqual({
      id: "n1",
      tenantId: "ten-1",
      estado: "Resuelta",
    });
    const h = m.historialCreate.mock.calls[0][0].data;
    expect(h.accion).toContain("reabierta");
    expect(h.detalle).toContain("2026-09-01T00:00:00.000Z");
    expect(h.detalle).toContain("Sistema (condición resuelta)");
  });

  it("Resuelta MANUALMENTE (fila heredada) con la condición vigente: se vuelve a mostrar, sin create, y el evento registra solo los datos ciertos de la fila", async () => {
    m.findUnique.mockResolvedValue(
      existente({
        estado: "Resuelta",
        responsableResolucionId: "u1",
        responsableResolucionNombre: "Ana",
        fechaResolucion: new Date("2026-09-02T10:00:00Z"),
      }),
    );
    const r = await aplicarNovedadAutomatica({ ...BASE, condicionVigente: true, datos: DATOS });
    expect(r).toBe("reabierta");
    expect(m.create).not.toHaveBeenCalled();

    const data = m.updateMany.mock.calls[0][0].data;
    expect(data.estado).toBe("Abierta");
    expect(data.responsableResolucionId).toBeNull();
    const h = m.historialCreate.mock.calls[0][0].data;
    expect(h.detalle).toContain("Ana");
    expect(h.detalle).toContain("id u1");
    expect(h.detalle).toContain("n1");
    expect(h.detalle).toContain("2026-09-02T10:00:00.000Z");
    expect(h.detalle).toContain("resolución manual");
    expect(h.detalle).toContain("permanece en el historial de la orden");
  });

  it("no busca ni copia comentarios del historial por proximidad temporal", async () => {
    m.findUnique.mockResolvedValue(
      existente({
        estado: "Resuelta",
        responsableResolucionId: "u1",
        responsableResolucionNombre: "Ana",
        fechaResolucion: new Date("2026-09-02T10:00:00Z"),
      }),
    );
    await aplicarNovedadAutomatica({ ...BASE, condicionVigente: true, datos: DATOS });
    expect(m.historialFindFirst).not.toHaveBeenCalled();
  });

  it("dos novedades del mismo tipo resueltas por la misma persona en el mismo minuto: cada reapertura cita solo SUS datos, sin atribución cruzada", async () => {
    const mismaFecha = new Date("2026-09-02T10:00:00Z");
    const fila = (id: string) =>
      existente({
        id,
        estado: "Resuelta",
        responsableResolucionId: "u1",
        responsableResolucionNombre: "Ana",
        fechaResolucion: mismaFecha,
      });
    // Dos eventos "Novedad resuelta: Retraso" de Ana existirían en el historial,
    // con comentarios distintos; el helper no debe consultarlos ni copiarlos.
    m.historialFindFirst.mockResolvedValue({ detalle: "Comentario de OTRA novedad" });

    m.findUnique.mockResolvedValueOnce(fila("nov-A"));
    await aplicarNovedadAutomatica({
      ...BASE,
      reglaOrigen: "actividad-vencida:a1",
      condicionVigente: true,
      datos: DATOS,
    });
    m.findUnique.mockResolvedValueOnce(fila("nov-B"));
    await aplicarNovedadAutomatica({
      ...BASE,
      reglaOrigen: "actividad-vencida:a2",
      condicionVigente: true,
      datos: DATOS,
    });

    const [a, b] = m.historialCreate.mock.calls.map((c) => c[0].data.detalle as string);
    expect(a).toContain("nov-A");
    expect(a).not.toContain("nov-B");
    expect(b).toContain("nov-B");
    expect(b).not.toContain("nov-A");
    expect(a).not.toContain("Comentario de OTRA novedad");
    expect(b).not.toContain("Comentario de OTRA novedad");
    expect(m.historialFindFirst).not.toHaveBeenCalled();
  });

  it("reapertura concurrente: si otra corrida ya la cambió (count 0) no escribe historial duplicado", async () => {
    m.findUnique.mockResolvedValue(existente({ estado: "Resuelta" }));
    m.updateMany.mockResolvedValue({ count: 0 });
    const r = await aplicarNovedadAutomatica({ ...BASE, condicionVigente: true, datos: DATOS });
    expect(r).toBe("sin_cambio");
    expect(m.historialCreate).not.toHaveBeenCalled();
  });

  it("condición superada y fila abierta: la resuelve el sistema con historial, sin id de persona", async () => {
    m.findUnique.mockResolvedValue(existente());
    const r = await aplicarNovedadAutomatica({ ...BASE, condicionVigente: false, datos: DATOS });
    expect(r).toBe("resuelta");
    const data = m.updateMany.mock.calls[0][0].data;
    expect(data.estado).toBe("Resuelta");
    expect(data.responsableResolucionNombre).toBe("Sistema (condición resuelta)");
    expect(data.responsableResolucionId).toBeUndefined();
    expect(m.historialCreate.mock.calls[0][0].data.accion).toContain("resuelta");
  });

  it("condición superada sin fila, o con fila ya Resuelta: no hace nada", async () => {
    m.findUnique.mockResolvedValue(null);
    expect(await aplicarNovedadAutomatica({ ...BASE, condicionVigente: false, datos: DATOS })).toBe(
      "sin_cambio",
    );
    m.findUnique.mockResolvedValue(existente({ estado: "Resuelta" }));
    expect(await aplicarNovedadAutomatica({ ...BASE, condicionVigente: false, datos: DATOS })).toBe(
      "sin_cambio",
    );
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it("resolución concurrente (count 0): no duplica el historial", async () => {
    m.findUnique.mockResolvedValue(existente());
    m.updateMany.mockResolvedValue({ count: 0 });
    const r = await aplicarNovedadAutomatica({ ...BASE, condicionVigente: false, datos: DATOS });
    expect(r).toBe("sin_cambio");
    expect(m.historialCreate).not.toHaveBeenCalled();
  });

  it("aislamiento: una fila de otro tenant con la misma regla nunca se toca", async () => {
    m.findUnique.mockResolvedValue(existente({ tenantId: "ten-OTRO", estado: "Resuelta" }));
    const r = await aplicarNovedadAutomatica({ ...BASE, condicionVigente: true, datos: DATOS });
    expect(r).toBe("sin_cambio");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
