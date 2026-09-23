import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRIMER_NUMERO_PROFORMA,
  calcularSiguienteNumero,
  siguienteNumeroProforma,
} from "./proformas-consecutivo";

describe("calcularSiguienteNumero", () => {
  it("sin ninguna proforma -> piso inicial", () => {
    expect(calcularSiguienteNumero(null)).toBe(PRIMER_NUMERO_PROFORMA);
    expect(PRIMER_NUMERO_PROFORMA).toBe(3890);
  });

  it("con proformas -> MAX + 1, incluso si el máximo es menor que el piso", () => {
    expect(calcularSiguienteNumero(5)).toBe(6);
    expect(calcularSiguienteNumero(3889)).toBe(3890);
    expect(calcularSiguienteNumero(5000)).toBe(5001);
  });
});

describe("siguienteNumeroProforma", () => {
  it("consulta estrictamente acotada a { tenantId } y ordena por numero desc", async () => {
    const findFirst = vi.fn().mockResolvedValue({ numero: 41 });
    const n = await siguienteNumeroProforma({ proforma: { findFirst } } as never, "tenant-1");

    expect(n).toBe(42);
    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
  });

  it("tenant sin proformas -> piso", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    expect(await siguienteNumeroProforma({ proforma: { findFirst } } as never, "t")).toBe(3890);
  });
});

describe("GET siguiente-numero y creación automática comparten UNA sola función de cálculo", () => {
  const fuente = readFileSync(join(__dirname, "proformas.controller.ts"), "utf8");

  it("el controller importa el helper y no redefine el cálculo", () => {
    expect(fuente).toMatch(/import \{ siguienteNumeroProforma \} from "\.\/proformas-consecutivo"/);
    expect(fuente).not.toMatch(/function calcularSiguienteNumero|PRIMER_NUMERO_PROFORMA\s*=/);
  });

  it("tanto el handler GET como la transacción de creación invocan siguienteNumeroProforma", () => {
    expect(fuente).toMatch(/siguienteNumeroProforma\(prisma, tenantId\)/); // GET
    expect(fuente).toMatch(/siguienteNumeroProforma\(tx, tenantId\)/); // creación
  });
});
