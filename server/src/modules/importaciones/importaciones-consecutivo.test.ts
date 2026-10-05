import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  ConsecutivoConcurrenteError,
  ConsecutivoInferiorError,
  anioActualImportaciones,
  calcularSiguiente,
  esConflictoReintentableConsecutivo,
  extraerConsecutivo,
  fijarConsecutivo,
  formatearCodigoImportacion,
  reservarConsecutivo,
} from "./importaciones-consecutivo";

function dbSimulada(opts: {
  fila?: { id: string; siguienteConsecutivo: number } | null;
  ordenes?: { codigo: string | null; numeroOrden: string }[];
  count?: number;
}) {
  const db = {
    consecutivoImportacion: {
      findUnique: vi.fn(async () => opts.fila ?? null),
      updateMany: vi.fn(async () => ({ count: opts.count ?? 1 })),
      create: vi.fn(async () => ({})),
    },
    ordenCompraIntl: { findMany: vi.fn(async () => opts.ordenes ?? []) },
  };
  return db;
}

describe("formato y lectura de códigos", () => {
  it("IMP-año-n con mínimo 3 dígitos, sin truncar números mayores", () => {
    expect(formatearCodigoImportacion(2026, 10)).toBe("IMP-2026-010");
    expect(formatearCodigoImportacion(2026, 7)).toBe("IMP-2026-007");
    expect(formatearCodigoImportacion(2026, 1234)).toBe("IMP-2026-1234");
  });

  it("extrae el consecutivo solo del año pedido y solo de códigos IMP válidos", () => {
    expect(extraerConsecutivo("IMP-2026-009", 2026)).toBe(9);
    expect(extraerConsecutivo("IMP-2025-050", 2026)).toBeNull();
    expect(extraerConsecutivo("PO-2026-009", 2026)).toBeNull();
    expect(extraerConsecutivo("IMP-2026-9-x", 2026)).toBeNull();
    expect(extraerConsecutivo(null, 2026)).toBeNull();
  });

  it("el año de la serie es el de Colombia, no el UTC", () => {
    // 2027-01-01 02:00 UTC = 2026-12-31 21:00 en Bogotá → sigue la serie 2026.
    expect(anioActualImportaciones(new Date("2027-01-01T02:00:00Z"))).toBe(2026);
    expect(anioActualImportaciones(new Date("2027-01-01T06:00:00Z"))).toBe(2027);
  });

  it("siguiente efectivo = max(contador, MAX existente + 1)", () => {
    expect(calcularSiguiente(null, 0)).toBe(1);
    expect(calcularSiguiente(null, 9)).toBe(10); // tras IMP-2026-009 → 010
    expect(calcularSiguiente(5, 9)).toBe(10); // el contador atrasado no baja el mínimo
    expect(calcularSiguiente(20, 9)).toBe(20); // un contador fijado más alto se respeta
  });
});

describe("reservarConsecutivo", () => {
  it("sin fila: usa MAX+1 de los códigos y números existentes (incluidas anuladas) y crea el contador", async () => {
    const db = dbSimulada({
      ordenes: [
        { codigo: "IMP-2026-009", numeroOrden: "XX" },
        { codigo: null, numeroOrden: "IMP-2026-012" },
      ],
    });
    const r = await reservarConsecutivo(db as never, "ten-1", 2026);
    expect(r).toEqual({ consecutivo: 13, codigo: "IMP-2026-013" });
    expect(db.consecutivoImportacion.create).toHaveBeenCalledWith({
      data: { tenantId: "ten-1", anio: 2026, siguienteConsecutivo: 14 },
    });
    // Acotado al tenant
    expect(db.ordenCompraIntl.findMany.mock.calls[0]).toBeTruthy();
  });

  it("con fila: avance compare-and-set sobre el valor leído", async () => {
    const db = dbSimulada({ fila: { id: "f1", siguienteConsecutivo: 4 } });
    const r = await reservarConsecutivo(db as never, "ten-1", 2026);
    expect(r.consecutivo).toBe(4);
    expect(db.consecutivoImportacion.updateMany).toHaveBeenCalledWith({
      where: { id: "f1", tenantId: "ten-1", siguienteConsecutivo: 4 },
      data: { siguienteConsecutivo: 5 },
    });
  });

  it("carrera perdida (count 0): lanza el error reintentable y no devuelve número", async () => {
    const db = dbSimulada({ fila: { id: "f1", siguienteConsecutivo: 4 }, count: 0 });
    await expect(reservarConsecutivo(db as never, "ten-1", 2026)).rejects.toBeInstanceOf(
      ConsecutivoConcurrenteError,
    );
  });
});

describe("fijarConsecutivo", () => {
  it("rechaza un valor inferior al efectivo (incluye códigos existentes)", async () => {
    const db = dbSimulada({ ordenes: [{ codigo: "IMP-2026-009", numeroOrden: "IMP-2026-009" }] });
    await expect(fijarConsecutivo(db as never, "ten-1", 2026, 9)).rejects.toBeInstanceOf(
      ConsecutivoInferiorError,
    );
    expect(db.consecutivoImportacion.create).not.toHaveBeenCalled();
    expect(db.consecutivoImportacion.updateMany).not.toHaveBeenCalled();
  });

  it("acepta el mínimo exacto y valores superiores", async () => {
    const db = dbSimulada({ ordenes: [{ codigo: "IMP-2026-009", numeroOrden: "IMP-2026-009" }] });
    await fijarConsecutivo(db as never, "ten-1", 2026, 10);
    expect(db.consecutivoImportacion.create).toHaveBeenCalledWith({
      data: { tenantId: "ten-1", anio: 2026, siguienteConsecutivo: 10 },
    });
  });

  it("si una creación avanzó el contador entre lectura y escritura (count 0) no pisa: reintentable", async () => {
    const db = dbSimulada({ fila: { id: "f1", siguienteConsecutivo: 4 }, count: 0 });
    await expect(fijarConsecutivo(db as never, "ten-1", 2026, 8)).rejects.toBeInstanceOf(
      ConsecutivoConcurrenteError,
    );
  });
});

describe("esConflictoReintentableConsecutivo", () => {
  it("reconoce la carrera propia, P2034 y el P2002 del contador; no otros P2002", () => {
    const err = (code: string, modelName?: string) =>
      new Prisma.PrismaClientKnownRequestError("x", {
        code,
        clientVersion: "x",
        meta: modelName ? { modelName } : undefined,
      });
    expect(esConflictoReintentableConsecutivo(new ConsecutivoConcurrenteError())).toBe(true);
    expect(esConflictoReintentableConsecutivo(err("P2034"))).toBe(true);
    expect(esConflictoReintentableConsecutivo(err("P2002", "ConsecutivoImportacion"))).toBe(true);
    expect(esConflictoReintentableConsecutivo(err("P2002", "OrdenCompraIntl"))).toBe(false);
    expect(esConflictoReintentableConsecutivo(new Error("otro"))).toBe(false);
  });
});
