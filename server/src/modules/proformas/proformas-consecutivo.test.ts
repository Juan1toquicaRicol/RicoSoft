import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRIMER_NUMERO_PROFORMA,
  avanzarContadorProforma,
  calcularSiguienteNumero,
  siguienteNumeroProforma,
} from "./proformas-consecutivo";

describe("calcularSiguienteNumero = max(contador, MAX(numero) + 1)", () => {
  it("default inicial: sin config ni proformas -> 3890", () => {
    expect(PRIMER_NUMERO_PROFORMA).toBe(3890);
    expect(calcularSiguienteNumero(null, null)).toBe(3890);
  });

  it("el contador manda mientras sea mayor que MAX+1 (un número manual bajo no lo baja)", () => {
    expect(calcularSiguienteNumero(3890, 5)).toBe(3890);
    expect(calcularSiguienteNumero(4001, 20)).toBe(4001);
  });

  it("MAX+1 manda si supera al contador (proformas altas previas al contador)", () => {
    expect(calcularSiguienteNumero(3890, 5000)).toBe(5001);
    expect(calcularSiguienteNumero(null, 3890)).toBe(3891);
  });
});

describe("siguienteNumeroProforma", () => {
  it("consulta config y MAX estrictamente acotados a { tenantId }", async () => {
    const configFindFirst = vi.fn().mockResolvedValue({ siguienteConsecutivoProforma: 3900 });
    const proformaFindFirst = vi.fn().mockResolvedValue({ numero: 41 });
    const n = await siguienteNumeroProforma(
      {
        configuracionComercial: { findFirst: configFindFirst },
        proforma: { findFirst: proformaFindFirst },
      } as never,
      "tenant-1",
    );

    expect(n).toBe(3900);
    expect(configFindFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      select: { siguienteConsecutivoProforma: true },
    });
    expect(proformaFindFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
  });

  it("tenant sin config ni proformas -> 3890", async () => {
    const vacio = vi.fn().mockResolvedValue(null);
    const n = await siguienteNumeroProforma(
      { configuracionComercial: { findFirst: vacio }, proforma: { findFirst: vacio } } as never,
      "t",
    );
    expect(n).toBe(3890);
  });
});

describe("avanzarContadorProforma (monotónico)", () => {
  const fake = (count: number, existente: { id: string } | null) => ({
    configuracionComercial: {
      updateMany: vi.fn().mockResolvedValue({ count }),
      findFirst: vi.fn().mockResolvedValue(existente),
      create: vi.fn().mockResolvedValue({}),
    },
  });

  it("UPDATE condicional (contador < numero+1) acotado a tenantId", async () => {
    const tx = fake(1, { id: "c" });
    await avanzarContadorProforma(tx as never, "t1", 3890);

    expect(tx.configuracionComercial.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", siguienteConsecutivoProforma: { lt: 3891 } },
      data: { siguienteConsecutivoProforma: 3891 },
    });
    expect(tx.configuracionComercial.create).not.toHaveBeenCalled();
  });

  it("número manual menor al contador: el UPDATE no aplica y NO se crea ni reduce nada", async () => {
    const tx = fake(0, { id: "c" });
    await avanzarContadorProforma(tx as never, "t1", 5);
    expect(tx.configuracionComercial.create).not.toHaveBeenCalled();
  });

  it("tenant sin fila: la crea con max(3890, numero+1)", async () => {
    const bajo = fake(0, null);
    await avanzarContadorProforma(bajo as never, "t1", 5);
    expect(bajo.configuracionComercial.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", siguienteConsecutivoProforma: 3890 },
    });

    const alto = fake(0, null);
    await avanzarContadorProforma(alto as never, "t1", 4000);
    expect(alto.configuracionComercial.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", siguienteConsecutivoProforma: 4001 },
    });
  });
});

describe("GET siguiente-numero y creación automática comparten UNA sola función de cálculo", () => {
  const fuente = readFileSync(join(__dirname, "proformas.controller.ts"), "utf8");

  it("el controller importa el helper y no redefine el cálculo", () => {
    expect(fuente).toMatch(/from "\.\/proformas-consecutivo"/);
    expect(fuente).not.toMatch(/function calcularSiguienteNumero|PRIMER_NUMERO_PROFORMA\s*=/);
  });

  it("GET, configuración comercial y la transacción de creación invocan siguienteNumeroProforma; la creación avanza el contador", () => {
    expect(fuente).toMatch(/siguienteNumeroProforma\(prisma, tenantId\)/); // GET
    expect(fuente).toMatch(/siguienteNumeroProforma\(db, tenantId\)/); // GET/PUT config
    expect(fuente).toMatch(/siguienteNumeroProforma\(tx, tenantId\)/); // creación
    expect(fuente).toMatch(/avanzarContadorProforma\(tx, tenantId, proformaCreada\.numero\)/);
  });
});
