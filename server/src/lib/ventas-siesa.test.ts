import { describe, it, expect } from "vitest";
import {
  calcularResumenVentas,
  calcularVentasPorVendedor,
  calcularClientesEnRiesgoSiesa,
  calcularParetoClientes,
  type ClienteVentaConsolidadaSiesa,
} from "./ventas-siesa";
import type {
  VentaMensualSiesa,
  TopClienteVentaSiesa,
  VentaDiariaVendedorSiesa,
  ActividadMensualClienteSiesa,
  ActividadMensualKilosClienteSiesa,
  UltimaCompraClienteSiesa,
} from "../modules/integraciones-siesa/siesa-ventas.service";

/**
 * calcularResumenVentas es una función pura (sin I/O): se prueba con datos
 * fabricados, sin depender del túnel VPN hacia Siesa. La conexión real ya
 * se verificó manualmente con datos en vivo (cia 1, 85.661 documentos desde
 * 2013) antes de escribir este archivo.
 */
describe("calcularResumenVentas", () => {
  const serie: VentaMensualSiesa[] = [
    { anio: 2026, mes: 6, bruto: 1000, dscto: 0, neto: 1190, documentos: 5 },
    { anio: 2026, mes: 7, bruto: 2000, dscto: 100, neto: 2261, documentos: 8 },
    { anio: 2026, mes: 8, bruto: 3000, dscto: 0, neto: 3570, documentos: 10 },
  ];
  const topClientes: TopClienteVentaSiesa[] = [
    { clienteRowId: 1, clienteNombre: "Cliente A", clienteNit: "111", neto: 2000, documentos: 4 },
  ];

  it("usa UTC (no la hora local) para determinar el mes actual/anterior", () => {
    // 31 de agosto 23:00 hora local negativa (p. ej. UTC-5) sería ya 1 de
    // septiembre en UTC — la función debe usar el componente UTC, no local.
    const ahoraUTC = new Date(Date.UTC(2026, 7, 31, 23, 0, 0)); // 31 ago 2026 UTC
    const r = calcularResumenVentas(serie, topClientes, ahoraUTC);
    expect(r.periodoActual.anio).toBe(2026);
    expect(r.periodoActual.mes).toBe(8); // agosto, no septiembre
  });

  it("calcula el período actual, el anterior, y la variación porcentual correctamente", () => {
    const ahora = new Date(Date.UTC(2026, 7, 15)); // agosto 2026
    const r = calcularResumenVentas(serie, topClientes, ahora);

    expect(r.periodoActual.neto).toBe(3570);
    expect(r.periodoActual.documentos).toBe(10);
    expect(r.periodoActual.ticketPromedio).toBe(357);
    expect(r.periodoAnterior).toEqual({ anio: 2026, mes: 7, neto: 2261 });
    // (3570 - 2261) / 2261 * 100 = 57.9%
    expect(r.variacionNetaPct).toBe(57.9);
  });

  it("maneja el cambio de año: enero compara contra diciembre del año anterior", () => {
    const serieConDiciembre: VentaMensualSiesa[] = [
      { anio: 2025, mes: 12, bruto: 500, dscto: 0, neto: 595, documentos: 2 },
      { anio: 2026, mes: 1, bruto: 800, dscto: 0, neto: 952, documentos: 3 },
    ];
    const ahora = new Date(Date.UTC(2026, 0, 10)); // enero 2026
    const r = calcularResumenVentas(serieConDiciembre, [], ahora);

    expect(r.periodoActual.anio).toBe(2026);
    expect(r.periodoActual.mes).toBe(1);
    expect(r.periodoAnterior).toEqual({ anio: 2025, mes: 12, neto: 595 });
  });

  it("no calcula variación (null) cuando no hay período anterior, en vez de dividir por cero", () => {
    const soloUnMes: VentaMensualSiesa[] = [
      { anio: 2026, mes: 8, bruto: 1000, dscto: 0, neto: 1190, documentos: 5 },
    ];
    const ahora = new Date(Date.UTC(2026, 7, 15));
    const r = calcularResumenVentas(soloUnMes, [], ahora);

    expect(r.periodoAnterior).toBeNull();
    expect(r.variacionNetaPct).toBeNull();
  });

  it("no calcula variación (null) cuando el período anterior existe pero su neto es cero", () => {
    const serieConCero: VentaMensualSiesa[] = [
      { anio: 2026, mes: 7, bruto: 0, dscto: 0, neto: 0, documentos: 0 },
      { anio: 2026, mes: 8, bruto: 1000, dscto: 0, neto: 1190, documentos: 5 },
    ];
    const ahora = new Date(Date.UTC(2026, 7, 15));
    const r = calcularResumenVentas(serieConCero, [], ahora);

    expect(r.periodoAnterior).toEqual({ anio: 2026, mes: 7, neto: 0 });
    expect(r.variacionNetaPct).toBeNull();
  });

  it("cuando el mes actual no tiene ventas todavía, reporta ceros en vez de fallar", () => {
    const ahora = new Date(Date.UTC(2026, 8, 1)); // septiembre 2026, sin datos en `serie`
    const r = calcularResumenVentas(serie, topClientes, ahora);

    expect(r.periodoActual.neto).toBe(0);
    expect(r.periodoActual.documentos).toBe(0);
    expect(r.periodoActual.ticketPromedio).toBe(0);
    // agosto (el último mes de la serie) sigue siendo el "período anterior" correcto.
    expect(r.periodoAnterior).toEqual({ anio: 2026, mes: 8, neto: 3570 });
  });

  it("la serie mensual devuelta nunca supera 7 meses, aunque venga una serie más larga", () => {
    const serieLarga: VentaMensualSiesa[] = Array.from({ length: 13 }, (_, i) => ({
      anio: 2025,
      mes: i + 1,
      bruto: 100 * (i + 1),
      dscto: 0,
      neto: 100 * (i + 1),
      documentos: i + 1,
    }));
    const ahora = new Date(Date.UTC(2026, 0, 1));
    const r = calcularResumenVentas(serieLarga, [], ahora);
    expect(r.serieMensual).toHaveLength(7);
    // Debe conservar los últimos 7 (meses 7-13 del array fabricado).
    expect(r.serieMensual[0].mes).toBe(7);
    expect(r.serieMensual[6].mes).toBe(13);
  });

  it("propaga el top de clientes tal cual, sin transformarlo", () => {
    const ahora = new Date(Date.UTC(2026, 7, 15));
    const r = calcularResumenVentas(serie, topClientes, ahora);
    expect(r.topClientes).toEqual(topClientes);
  });

  it("con serie y topClientes vacíos, devuelve una estructura válida sin lanzar", () => {
    const ahora = new Date(Date.UTC(2026, 7, 15));
    const r = calcularResumenVentas([], [], ahora);
    expect(r.disponible).toBe(true);
    expect(r.periodoActual.neto).toBe(0);
    expect(r.periodoAnterior).toBeNull();
    expect(r.variacionNetaPct).toBeNull();
    expect(r.serieMensual).toEqual([]);
    expect(r.topClientes).toEqual([]);
  });
});

describe("calcularVentasPorVendedor", () => {
  const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

  it("calcula hoy/ayer/últimos 7 días/mes actual correctamente para un vendedor", () => {
    const ahora = new Date(Date.UTC(2026, 8, 10)); // 10 de septiembre de 2026 (jueves)
    const filas: VentaDiariaVendedorSiesa[] = [
      {
        vendedorRowId: 1,
        vendedorNombre: "Vendedor A",
        dia: dia(2026, 9, 10),
        neto: 100,
        documentos: 2,
      },
      {
        vendedorRowId: 1,
        vendedorNombre: "Vendedor A",
        dia: dia(2026, 9, 9),
        neto: 50,
        documentos: 1,
      },
      {
        vendedorRowId: 1,
        vendedorNombre: "Vendedor A",
        dia: dia(2026, 9, 5),
        neto: 30,
        documentos: 1,
      },
      {
        vendedorRowId: 1,
        vendedorNombre: "Vendedor A",
        dia: dia(2026, 9, 1),
        neto: 20,
        documentos: 2,
      },
    ];

    const [r] = calcularVentasPorVendedor(filas, ahora);
    expect(r.hoy).toBe(100);
    expect(r.ayer).toBe(50);
    // Ventana de 7 días = 4 al 10 de sept: incluye 10, 9 y 5; excluye el 1.
    expect(r.ultimos7Dias).toBe(180);
    expect(r.mesActual).toBe(200);
    expect(r.documentosMesActual).toBe(6);
  });

  it("la ventana de 'últimos 7 días' cruza correctamente al mes anterior", () => {
    const ahora = new Date(Date.UTC(2026, 8, 3)); // 3 de septiembre de 2026
    const filas: VentaDiariaVendedorSiesa[] = [
      {
        vendedorRowId: 1,
        vendedorNombre: "Vendedor A",
        dia: dia(2026, 9, 3),
        neto: 10,
        documentos: 1,
      }, // hoy
      {
        vendedorRowId: 1,
        vendedorNombre: "Vendedor A",
        dia: dia(2026, 8, 30),
        neto: 40,
        documentos: 1,
      }, // dentro de 7 días, agosto
      {
        vendedorRowId: 1,
        vendedorNombre: "Vendedor A",
        dia: dia(2026, 8, 20),
        neto: 999,
        documentos: 5,
      }, // fuera de la ventana
    ];

    const [r] = calcularVentasPorVendedor(filas, ahora);
    // Ventana de 7 días = 28 ago al 3 sept: incluye el 3 (hoy) y el 30 de agosto.
    expect(r.ultimos7Dias).toBe(50);
    // "mes actual" (septiembre) NO incluye las ventas de agosto.
    expect(r.mesActual).toBe(10);
  });

  it("agrupa por vendedor y ordena el resultado por venta del mes actual, descendente", () => {
    const ahora = new Date(Date.UTC(2026, 8, 10));
    const filas: VentaDiariaVendedorSiesa[] = [
      { vendedorRowId: 1, vendedorNombre: "Bajo", dia: dia(2026, 9, 10), neto: 50, documentos: 1 },
      { vendedorRowId: 2, vendedorNombre: "Alto", dia: dia(2026, 9, 10), neto: 500, documentos: 1 },
      { vendedorRowId: 2, vendedorNombre: "Alto", dia: dia(2026, 9, 9), neto: 200, documentos: 1 },
    ];

    const resultado = calcularVentasPorVendedor(filas, ahora);
    expect(resultado).toHaveLength(2);
    expect(resultado[0].vendedorNombre).toBe("Alto");
    expect(resultado[0].mesActual).toBe(700);
    expect(resultado[1].vendedorNombre).toBe("Bajo");
    expect(resultado[1].mesActual).toBe(50);
  });

  it("un vendedor sin rowid (null) no se mezcla con otro vendedor sin rowid pero con nombre distinto", () => {
    const ahora = new Date(Date.UTC(2026, 8, 10));
    const filas: VentaDiariaVendedorSiesa[] = [
      {
        vendedorRowId: null,
        vendedorNombre: "Mostrador 1",
        dia: dia(2026, 9, 10),
        neto: 10,
        documentos: 1,
      },
      {
        vendedorRowId: null,
        vendedorNombre: "Mostrador 2",
        dia: dia(2026, 9, 10),
        neto: 20,
        documentos: 1,
      },
    ];
    const resultado = calcularVentasPorVendedor(filas, ahora);
    expect(resultado).toHaveLength(2);
  });

  it("con un array vacío, devuelve un array vacío sin lanzar", () => {
    const ahora = new Date(Date.UTC(2026, 8, 10));
    expect(calcularVentasPorVendedor([], ahora)).toEqual([]);
  });
});

describe("calcularClientesEnRiesgoSiesa", () => {
  // 10 de septiembre 2026: mes1 = agosto, mes2 = julio, mes3 = junio (todos completos).
  const ahora = new Date(Date.UTC(2026, 8, 10));
  const act = (
    clienteRowId: number | null,
    clienteNombre: string,
    anio: number,
    mes: number,
    neto: number,
  ): ActividadMensualClienteSiesa => ({ clienteRowId, clienteNombre, anio, mes, neto });
  const kg = (clienteRowId: number, anio: number, mes: number, kilos: number): ActividadMensualKilosClienteSiesa => ({
    clienteRowId,
    anio,
    mes,
    kilos,
  });

  it("detecta una caída fuerte (>=40%) en un cliente top del último mes completo vs. el anterior", () => {
    const actividad = [
      act(1, "Cliente Top", 2026, 8, 600), // agosto (mes1)
      act(1, "Cliente Top", 2026, 7, 1000), // julio (mes2) — caída de 40%
    ];
    const r = calcularClientesEnRiesgoSiesa(actividad, [], [], ahora);
    expect(r.caidasClientesTop).toEqual([
      { clienteRowId: 1, clienteNombre: "Cliente Top", netoUltimoMes: 600, netoMesAnterior: 1000, caidaPct: 40 },
    ]);
  });

  it("NO reporta caída cuando es menor al 40%", () => {
    const actividad = [act(1, "Cliente Top", 2026, 8, 700), act(1, "Cliente Top", 2026, 7, 1000)]; // -30%
    const r = calcularClientesEnRiesgoSiesa(actividad, [], [], ahora);
    expect(r.caidasClientesTop).toEqual([]);
  });

  it("NO reporta caída cuando el mes anterior no tuvo ventas (evita dividir por cero)", () => {
    const actividad = [act(1, "Cliente Nuevo", 2026, 8, 500)]; // solo agosto, julio en 0
    const r = calcularClientesEnRiesgoSiesa(actividad, [], [], ahora);
    expect(r.caidasClientesTop).toEqual([]);
  });

  it("detecta un cliente recurrente (2+ de los últimos 3 meses) inactivo hace más de 45 días, con venta/kilos estimados", () => {
    const actividad = [
      act(2, "Cliente Recurrente", 2026, 7, 600), // julio
      act(2, "Cliente Recurrente", 2026, 6, 400), // junio — promedio = 500
    ];
    const kilos = [kg(2, 2026, 7, 60), kg(2, 2026, 6, 40)]; // promedio = 50 kg
    const ultimas: UltimaCompraClienteSiesa[] = [
      { clienteRowId: 2, ultimaCompra: new Date(Date.UTC(2026, 6, 1)) }, // hace 71 días
    ];
    const r = calcularClientesEnRiesgoSiesa(actividad, kilos, ultimas, ahora);
    expect(r.clientesInactivos).toHaveLength(1);
    const c = r.clientesInactivos[0];
    expect(c.clienteNombre).toBe("Cliente Recurrente");
    expect(c.diasInactivo).toBe(71);
    expect(c.promedioMensualNeto).toBe(500);
    expect(c.promedioMensualKilos).toBe(50);
    expect(c.severidad).toBe("media"); // 71 días: >45 pero no >90
    // 500 * (71/30) ≈ 1183.33
    expect(c.ventaEstimadaPerdida).toBeCloseTo(500 * (71 / 30), 5);
    expect(c.kilosEstimadosPerdidos).toBeCloseTo(50 * (71 / 30), 5);
    expect(r.totalVentaEnRiesgo).toBeCloseTo(c.ventaEstimadaPerdida, 5);
    expect(r.totalKilosEnRiesgo).toBeCloseTo(c.kilosEstimadosPerdidos, 5);
  });

  it("sube la severidad a 'alta' cuando la inactividad supera 90 días", () => {
    const actividad = [act(2, "Cliente Recurrente", 2026, 7, 500), act(2, "Cliente Recurrente", 2026, 6, 500)];
    const ultimas: UltimaCompraClienteSiesa[] = [
      { clienteRowId: 2, ultimaCompra: new Date(Date.UTC(2026, 4, 1)) }, // hace >90 días
    ];
    const r = calcularClientesEnRiesgoSiesa(actividad, [], ultimas, ahora);
    expect(r.clientesInactivos[0]?.severidad).toBe("alta");
  });

  it("NO reporta un comprador ocasional (solo 1 de los últimos 3 meses) como en riesgo", () => {
    const actividad = [act(3, "Comprador Ocasional", 2026, 6, 500)]; // solo junio
    const ultimas: UltimaCompraClienteSiesa[] = [
      { clienteRowId: 3, ultimaCompra: new Date(Date.UTC(2026, 5, 15)) },
    ];
    const r = calcularClientesEnRiesgoSiesa(actividad, [], ultimas, ahora);
    expect(r.clientesInactivos).toEqual([]);
  });

  it("NO reporta inactividad cuando es de 45 días o menos", () => {
    const actividad = [act(2, "Cliente Recurrente", 2026, 7, 500), act(2, "Cliente Recurrente", 2026, 6, 500)];
    const ultimas: UltimaCompraClienteSiesa[] = [
      { clienteRowId: 2, ultimaCompra: new Date(Date.UTC(2026, 7, 20)) }, // hace 21 días
    ];
    const r = calcularClientesEnRiesgoSiesa(actividad, [], ultimas, ahora);
    expect(r.clientesInactivos).toEqual([]);
  });

  it("ignora clientes sin rowid (ventas de mostrador) para clientes en riesgo", () => {
    const actividad = [act(null, "Mostrador", 2026, 7, 500), act(null, "Mostrador", 2026, 6, 500)];
    const r = calcularClientesEnRiesgoSiesa(actividad, [], [], ahora);
    expect(r.clientesInactivos).toEqual([]);
  });

  it("cuando un cliente inactivo no tiene kilos registrados, promedioMensualKilos y kilosEstimadosPerdidos son 0", () => {
    const actividad = [act(2, "Solo Facturación", 2026, 7, 500), act(2, "Solo Facturación", 2026, 6, 500)];
    const ultimas: UltimaCompraClienteSiesa[] = [
      { clienteRowId: 2, ultimaCompra: new Date(Date.UTC(2026, 6, 1)) },
    ];
    const r = calcularClientesEnRiesgoSiesa(actividad, [], ultimas, ahora);
    expect(r.clientesInactivos[0]?.promedioMensualKilos).toBe(0);
    expect(r.clientesInactivos[0]?.kilosEstimadosPerdidos).toBe(0);
  });

  it("limita clientesInactivos a los 8 con mayor venta estimada perdida, pero el total suma todos", () => {
    const actividad = Array.from({ length: 10 }, (_, i) => [
      act(i, `Cliente ${i}`, 2026, 7, (i + 1) * 100),
      act(i, `Cliente ${i}`, 2026, 6, (i + 1) * 100),
    ]).flat();
    const ultimas: UltimaCompraClienteSiesa[] = Array.from({ length: 10 }, (_, i) => ({
      clienteRowId: i,
      ultimaCompra: new Date(Date.UTC(2026, 6, 1)),
    }));
    const r = calcularClientesEnRiesgoSiesa(actividad, [], ultimas, ahora);
    expect(r.clientesInactivos).toHaveLength(8);
    expect(r.clientesInactivos[0].clienteNombre).toBe("Cliente 9"); // mayor promedio, mayor venta estimada
    const sumaMostrados = r.clientesInactivos.reduce((acc, c) => acc + c.ventaEstimadaPerdida, 0);
    expect(r.totalVentaEnRiesgo).toBeGreaterThan(sumaMostrados); // el total incluye a los 2 no mostrados
  });

  it("con actividad, kilos y última compra vacíos, devuelve estructura vacía sin lanzar", () => {
    const r = calcularClientesEnRiesgoSiesa([], [], [], ahora);
    expect(r).toEqual({
      clientesInactivos: [],
      caidasClientesTop: [],
      totalVentaEnRiesgo: 0,
      totalKilosEnRiesgo: 0,
    });
  });
});

describe("calcularParetoClientes", () => {
  const cliente = (
    nombre: string,
    neto: number,
    overrides: Partial<ClienteVentaConsolidadaSiesa> = {},
  ): ClienteVentaConsolidadaSiesa => ({
    clienteRowId: null,
    clienteNombre: nombre,
    clienteNit: null,
    neto,
    costo: 0,
    margen: 0,
    kilos: 0,
    documentos: 1,
    ...overrides,
  });

  it("ordena de mayor a menor venta y calcula % individual y acumulado correctamente", () => {
    const r = calcularParetoClientes([cliente("A", 200), cliente("B", 500), cliente("C", 300)]);
    // Total = 1000. Orden esperado: B (500), C (300), A (200).
    expect(r.map((c) => c.clienteNombre)).toEqual(["B", "C", "A"]);
    expect(r[0].pctIndividual).toBe(50);
    expect(r[0].pctAcumulado).toBe(50);
    expect(r[1].pctIndividual).toBe(30);
    expect(r[1].pctAcumulado).toBe(80);
    expect(r[2].pctIndividual).toBe(20);
    expect(r[2].pctAcumulado).toBe(100);
  });

  it("con una lista vacía, devuelve una lista vacía sin lanzar (no divide por cero)", () => {
    expect(calcularParetoClientes([])).toEqual([]);
  });

  it("con un solo cliente, ese cliente concentra el 100% individual y acumulado", () => {
    const r = calcularParetoClientes([cliente("Único", 1000)]);
    expect(r).toHaveLength(1);
    expect(r[0].pctIndividual).toBe(100);
    expect(r[0].pctAcumulado).toBe(100);
  });

  it("no muta el array de entrada (copia antes de ordenar)", () => {
    const entrada = [cliente("A", 100), cliente("B", 900)];
    const copiaOriginal = [...entrada];
    calcularParetoClientes(entrada);
    expect(entrada).toEqual(copiaOriginal);
  });
});
