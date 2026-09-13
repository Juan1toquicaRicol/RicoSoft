import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ejecutarAnalisis reutiliza las mismas funciones de siesa-ventas.service —
 * se mockean aquí para probar la adaptación (mapeo/orden/límite/filtros) sin
 * depender de una conexión real a Siesa. Las agregaciones SQL en sí ya están
 * cubiertas donde viven (siesa-ventas.service.ts / ventas-siesa.test.ts).
 */
vi.mock("../integraciones-siesa/siesa-ventas.service", () => ({
  leerVentasMensualesSiesa: vi.fn(),
  leerTopClientesVentaSiesa: vi.fn(),
  leerTopClientesPorMargenSiesa: vi.fn(),
  leerTopVendedoresPorMargenSiesa: vi.fn(),
  leerVentasDiariasPorVendedorSiesa: vi.fn(),
  leerVentasPorClienteConsolidadoSiesa: vi.fn(),
}));

import {
  leerVentasMensualesSiesa,
  leerTopClientesVentaSiesa,
  leerTopClientesPorMargenSiesa,
  leerTopVendedoresPorMargenSiesa,
  leerVentasDiariasPorVendedorSiesa,
  leerVentasPorClienteConsolidadoSiesa,
} from "../integraciones-siesa/siesa-ventas.service";
import { ejecutarAnalisis } from "./analitica-analisis.service";
import type { ConfiguracionAnalisis } from "./analitica-catalogo";

const CIA_ID = 1;

function config(overrides: Partial<ConfiguracionAnalisis>): ConfiguracionAnalisis {
  return {
    metrica: "margen",
    dimensionPrincipal: "cliente",
    fechaInicio: "2026-01-01",
    fechaFin: "2026-02-01",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ejecutarAnalisis", () => {
  it("margen por cliente: mapea, reutiliza leerTopClientesPorMargenSiesa y ordena por margen desc", async () => {
    vi.mocked(leerTopClientesPorMargenSiesa).mockResolvedValue([
      { clienteRowId: 1, clienteNombre: "A", neto: 100, costo: 40, margen: 60 },
      { clienteRowId: 2, clienteNombre: "B", neto: 200, costo: 150, margen: 50 },
    ]);

    const resultado = await ejecutarAnalisis(
      CIA_ID,
      config({ metrica: "margen", dimensionPrincipal: "cliente", ordenarPor: "margen", orden: "desc" }),
    );

    expect(resultado.disponible).toBe(true);
    expect(resultado.filas.map((f) => f.etiqueta)).toEqual(["A", "B"]);
    expect(resultado.totales.margen).toBe(110);
  });

  it("margen por vendedor: reutiliza leerTopVendedoresPorMargenSiesa", async () => {
    vi.mocked(leerTopVendedoresPorMargenSiesa).mockResolvedValue([
      { vendedorRowId: 9, vendedorNombre: "Vendedor 1", neto: 500, costo: 300, margen: 200 },
    ]);

    const resultado = await ejecutarAnalisis(
      CIA_ID,
      config({ metrica: "margen", dimensionPrincipal: "vendedor" }),
    );

    expect(resultado.disponible).toBe(true);
    expect(resultado.filas).toHaveLength(1);
    expect(resultado.filas[0].etiqueta).toBe("Vendedor 1");
    expect(leerTopVendedoresPorMargenSiesa).toHaveBeenCalled();
  });

  it("ventas por fecha: reutiliza leerVentasMensualesSiesa y filtra al rango pedido", async () => {
    vi.mocked(leerVentasMensualesSiesa).mockResolvedValue([
      { anio: 2025, mes: 12, bruto: 10, dscto: 0, neto: 10, documentos: 1 },
      { anio: 2026, mes: 1, bruto: 100, dscto: 0, neto: 100, documentos: 5 },
      { anio: 2026, mes: 2, bruto: 200, dscto: 0, neto: 200, documentos: 8 },
    ]);

    const resultado = await ejecutarAnalisis(
      CIA_ID,
      config({ metrica: "ventas", dimensionPrincipal: "fecha" }),
    );

    // fechaInicio=2026-01-01, fechaFin=2026-02-01: solo enero cae dentro del rango [desde, hasta).
    expect(resultado.filas.map((f) => f.etiqueta)).toEqual(["2026-01"]);
    expect(resultado.totales.neto).toBe(100);
  });

  it("ventas por cliente: reutiliza leerTopClientesVentaSiesa", async () => {
    vi.mocked(leerTopClientesVentaSiesa).mockResolvedValue([
      { clienteRowId: 1, clienteNombre: "A", clienteNit: "1", neto: 300, documentos: 2 },
    ]);

    const resultado = await ejecutarAnalisis(
      CIA_ID,
      config({ metrica: "ventas", dimensionPrincipal: "cliente" }),
    );

    expect(resultado.filas[0].neto).toBe(300);
  });

  it("ventas por vendedor: agrega en Node sobre leerVentasDiariasPorVendedorSiesa (suma por vendedor)", async () => {
    vi.mocked(leerVentasDiariasPorVendedorSiesa).mockResolvedValue([
      { vendedorRowId: 1, vendedorNombre: "V1", dia: new Date("2026-01-05"), neto: 100, documentos: 2 },
      { vendedorRowId: 1, vendedorNombre: "V1", dia: new Date("2026-01-06"), neto: 50, documentos: 1 },
      { vendedorRowId: 2, vendedorNombre: "V2", dia: new Date("2026-01-05"), neto: 10, documentos: 1 },
    ]);

    const resultado = await ejecutarAnalisis(
      CIA_ID,
      config({ metrica: "ventas", dimensionPrincipal: "vendedor", ordenarPor: "neto", orden: "desc" }),
    );

    expect(resultado.filas).toHaveLength(2);
    const v1 = resultado.filas.find((f) => f.etiqueta === "V1")!;
    expect(v1.neto).toBe(150);
    expect(v1.documentos).toBe(3);
  });

  it("clientes: reutiliza leerVentasPorClienteConsolidadoSiesa (venta + margen + kilos + documentos)", async () => {
    vi.mocked(leerVentasPorClienteConsolidadoSiesa).mockResolvedValue([
      {
        clienteRowId: 1,
        clienteNombre: "A",
        clienteNit: "1",
        neto: 100,
        costo: 60,
        margen: 40,
        kilos: 25,
        documentos: 3,
      },
    ]);

    const resultado = await ejecutarAnalisis(
      CIA_ID,
      config({ metrica: "clientes", dimensionPrincipal: "cliente" }),
    );

    expect(resultado.filas[0]).toMatchObject({ neto: 100, margen: 40, kilos: 25, documentos: 3 });
  });

  it("aplica el filtro de cliente sobre el resultado ya agregado", async () => {
    vi.mocked(leerTopClientesPorMargenSiesa).mockResolvedValue([
      { clienteRowId: 1, clienteNombre: "A", neto: 100, costo: 40, margen: 60 },
      { clienteRowId: 2, clienteNombre: "B", neto: 200, costo: 150, margen: 50 },
    ]);

    const resultado = await ejecutarAnalisis(
      CIA_ID,
      config({ metrica: "margen", dimensionPrincipal: "cliente", filtros: { clienteId: 2 } }),
    );

    expect(resultado.filas).toHaveLength(1);
    expect(resultado.filas[0].etiqueta).toBe("B");
  });

  it("aplica el límite sobre el resultado agregado", async () => {
    vi.mocked(leerTopClientesPorMargenSiesa).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        clienteRowId: i,
        clienteNombre: `C${i}`,
        neto: i,
        costo: 0,
        margen: i,
      })),
    );

    const resultado = await ejecutarAnalisis(
      CIA_ID,
      config({ metrica: "margen", dimensionPrincipal: "cliente", limite: 2, orden: "desc", ordenarPor: "margen" }),
    );

    expect(resultado.filas).toHaveLength(2);
  });

  it("responde disponible:true con filas vacías cuando no hay datos en el rango (estado sin datos)", async () => {
    vi.mocked(leerTopClientesPorMargenSiesa).mockResolvedValue([]);

    const resultado = await ejecutarAnalisis(
      CIA_ID,
      config({ metrica: "margen", dimensionPrincipal: "cliente" }),
    );

    expect(resultado.disponible).toBe(true);
    expect(resultado.filas).toEqual([]);
    expect(resultado.totales.margen).toBe(0);
  });
});
