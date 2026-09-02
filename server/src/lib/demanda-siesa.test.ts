import { describe, it, expect } from "vitest";
import { calcularPronosticoDemandaSiesa } from "./demanda-siesa";
import type { VentaMensualProductoSiesa } from "../modules/integraciones-siesa/siesa-ventas.service";

/**
 * calcularPronosticoDemandaSiesa es pura (sin I/O): se prueba con datos
 * fabricados. La consulta SQL real (v470_ventas agregada por producto/mes)
 * ya se verificó en vivo antes de escribir este archivo.
 */
describe("calcularPronosticoDemandaSiesa", () => {
  // 10 de septiembre 2026: los 12 meses completos van de agosto 2026 hacia atrás hasta septiembre 2025.
  const ahora = new Date(Date.UTC(2026, 8, 10));
  const v = (
    itemRowId: number,
    anio: number,
    mes: number,
    cantidad: number,
  ): VentaMensualProductoSiesa => ({
    itemRowId,
    descripcion: `Producto ${itemRowId}`,
    referencia: `REF${itemRowId}`,
    unidadMedida: "KG",
    anio,
    mes,
    cantidad,
  });

  it("calcula el promedio mensual sobre los 12 meses completos, incluyendo meses sin venta", () => {
    // Solo vendió en agosto (1200) — los otros 11 meses completos están en 0.
    const r = calcularPronosticoDemandaSiesa([v(1, 2026, 8, 1200)], ahora);
    const p = r.topDemanda.find((x) => x.itemRowId === 1)!;
    expect(p.ventaPromedioMensual).toBe(100); // 1200 / 12
    expect(p.mesesConVenta).toBe(1);
  });

  it("nunca usa el mes actual (parcial) en el cálculo", () => {
    // Venta en septiembre 2026 (mes actual, parcial) — no debe contarse.
    const r = calcularPronosticoDemandaSiesa([v(1, 2026, 9, 999999)], ahora);
    const p = r.topDemanda.find((x) => x.itemRowId === 1);
    expect(p).toBeUndefined(); // no aparece porque su único dato queda fuera de los 12 meses completos
  });

  it("calcula la tendencia como variación % entre los últimos 3 meses completos y los 3 anteriores a esos", () => {
    // mes1=agosto, mes2=julio, mes3=junio (últimos 3); mes4=mayo, mes5=abril, mes6=marzo (anteriores 3).
    const ventas = [
      v(1, 2026, 8, 150),
      v(1, 2026, 7, 150),
      v(1, 2026, 6, 150), // promedio últimos 3 = 150
      v(1, 2026, 5, 100),
      v(1, 2026, 4, 100),
      v(1, 2026, 3, 100), // promedio anteriores 3 = 100
    ];
    const r = calcularPronosticoDemandaSiesa(ventas, ahora);
    const p = r.topDemanda.find((x) => x.itemRowId === 1)!;
    expect(p.tendenciaPct).toBe(50); // (150-100)/100 * 100
  });

  it("tendenciaPct es null cuando no hay base de comparación (3 meses anteriores en 0)", () => {
    const r = calcularPronosticoDemandaSiesa([v(1, 2026, 8, 100)], ahora);
    const p = r.topDemanda.find((x) => x.itemRowId === 1)!;
    expect(p.tendenciaPct).toBeNull();
  });

  it("tendenciaPct es null cuando la base anterior es 'ruido' frente al volumen típico (evita porcentajes absurdos)", () => {
    // Pasó de 1 unidad/mes a 300 — matemáticamente sería +29.900%, pero no es una señal útil.
    const ventas = [
      v(1, 2026, 8, 300),
      v(1, 2026, 7, 300),
      v(1, 2026, 6, 300),
      v(1, 2026, 5, 1),
    ];
    const r = calcularPronosticoDemandaSiesa(ventas, ahora);
    const p = r.topDemanda.find((x) => x.itemRowId === 1)!;
    expect(p.tendenciaPct).toBeNull();
  });

  it("marca perdiendoRotacion cuando los últimos 3 meses caen a menos de la mitad de los 9 anteriores", () => {
    // meses 4..12 hacia atrás desde septiembre 2026 = mayo 2026 .. septiembre 2025.
    const nueveAnteriores = Array.from({ length: 9 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 8 - (i + 4), 1));
      return v(2, d.getUTCFullYear(), d.getUTCMonth() + 1, 100);
    });
    const ventas = [
      v(2, 2026, 8, 10),
      v(2, 2026, 7, 10),
      v(2, 2026, 6, 10), // últimos 3, promedio 10
      ...nueveAnteriores, // promedio 100
    ];
    const r = calcularPronosticoDemandaSiesa(ventas, ahora);
    const p = [...r.topDemanda, ...r.perdiendoRotacion].find((x) => x.itemRowId === 2)!;
    expect(p.perdiendoRotacion).toBe(true);
  });

  it("NO marca perdiendoRotacion cuando el producto nunca vendió antes (no puede perder lo que no tenía)", () => {
    const r = calcularPronosticoDemandaSiesa([v(3, 2026, 8, 5)], ahora);
    const p = r.topDemanda.find((x) => x.itemRowId === 3)!;
    expect(p.perdiendoRotacion).toBe(false);
  });

  it("marca demandaIrregular cuando el coeficiente de variación supera 0.75", () => {
    // Un solo mes con venta muy alta, el resto en 0: variabilidad extrema.
    const r = calcularPronosticoDemandaSiesa([v(1, 2026, 8, 10000)], ahora);
    const p = r.topDemanda.find((x) => x.itemRowId === 1)!;
    expect(p.coeficienteVariacion).toBeGreaterThan(0.75);
    expect(p.demandaIrregular).toBe(true);
  });

  it("NO marca demandaIrregular para un producto con venta mensual estable", () => {
    const ventas = Array.from({ length: 12 }, (_, i) => {
      const mesesAtras = i + 1;
      const d = new Date(Date.UTC(2026, 8 - mesesAtras, 1));
      return v(1, d.getUTCFullYear(), d.getUTCMonth() + 1, 100);
    });
    const r = calcularPronosticoDemandaSiesa(ventas, ahora);
    const p = r.topDemanda.find((x) => x.itemRowId === 1)!;
    expect(p.coeficienteVariacion).toBe(0);
    expect(p.demandaIrregular).toBe(false);
  });

  it("topDemanda tiene máximo 15, ordenado por venta promedio mensual descendente", () => {
    const ventas = Array.from({ length: 20 }, (_, i) => v(i, 2026, 8, (i + 1) * 100));
    const r = calcularPronosticoDemandaSiesa(ventas, ahora);
    expect(r.topDemanda).toHaveLength(15);
    expect(r.topDemanda[0].itemRowId).toBe(19); // mayor venta promedio primero
  });

  it("tendenciaFuerte solo incluye productos con |tendenciaPct| >= 20%", () => {
    const ventas = [
      // Producto 1: tendencia fuerte (+50%)
      v(1, 2026, 8, 150),
      v(1, 2026, 7, 150),
      v(1, 2026, 6, 150),
      v(1, 2026, 5, 100),
      v(1, 2026, 4, 100),
      v(1, 2026, 3, 100),
      // Producto 2: tendencia débil (+5%)
      v(2, 2026, 8, 105),
      v(2, 2026, 7, 105),
      v(2, 2026, 6, 105),
      v(2, 2026, 5, 100),
      v(2, 2026, 4, 100),
      v(2, 2026, 3, 100),
    ];
    const r = calcularPronosticoDemandaSiesa(ventas, ahora);
    expect(r.tendenciaFuerte.map((p) => p.itemRowId)).toEqual([1]);
  });

  it("con un array vacío, devuelve listas vacías sin lanzar", () => {
    const r = calcularPronosticoDemandaSiesa([], ahora);
    expect(r.topDemanda).toEqual([]);
    expect(r.perdiendoRotacion).toEqual([]);
    expect(r.tendenciaFuerte).toEqual([]);
    expect(r.todos).toEqual([]);
  });
});
