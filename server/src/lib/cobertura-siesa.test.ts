import { describe, it, expect } from "vitest";
import { calcularResumenCoberturaSiesa } from "./cobertura-siesa";
import type { ExistenciaItemSiesa } from "../modules/integraciones-siesa/siesa-inventario.service";
import type { PronosticoProductoSiesa } from "./demanda-siesa";

describe("calcularResumenCoberturaSiesa", () => {
  const existencia = (
    itemRowId: number,
    cantidadExistente: number,
    esVendible = true,
  ): ExistenciaItemSiesa => ({
    itemRowId,
    descripcion: `Producto ${itemRowId}`,
    referencia: `REF${itemRowId}`,
    cantidadExistente,
    cantidadComprometida: 0,
    cantidadPendienteEntrar: 0,
    valorTotal: 0,
    fechaUltimaVenta: new Date(),
    esVendible,
  });

  const demanda = (itemRowId: number, ventaPromedioMensual: number): PronosticoProductoSiesa => ({
    itemRowId,
    descripcion: `Producto ${itemRowId}`,
    referencia: `REF${itemRowId}`,
    unidadMedida: "KG",
    ventaPromedioMensual,
    tendenciaPct: null,
    coeficienteVariacion: null,
    demandaIrregular: false,
    perdiendoRotacion: false,
    mesesConVenta: 12,
  });

  it("calcula días de cobertura como existencia / (venta promedio mensual / 30)", () => {
    // Venta diaria = 300/30 = 10. Existencia = 300 → cobertura = 30 días.
    const r = calcularResumenCoberturaSiesa([existencia(1, 300)], [demanda(1, 300)]);
    expect(r.sobreCobertura.length + r.riesgoRuptura.length).toBeLessThanOrEqual(1);
    expect(r.coberturaPromedioDias).toBe(30);
  });

  it("diasCobertura es null cuando el producto no tiene demanda calculada (no en el pronóstico)", () => {
    const r = calcularResumenCoberturaSiesa([existencia(1, 300)], []);
    expect(r.coberturaPromedioDias).toBeNull();
    expect(r.riesgoRuptura).toEqual([]);
    expect(r.sobreCobertura).toEqual([]);
  });

  it("marca riesgoRuptura cuando la cobertura es menor a 15 días", () => {
    // Venta diaria = 100/30 ≈ 3.33. Existencia = 20 → cobertura ≈ 6 días.
    const r = calcularResumenCoberturaSiesa([existencia(1, 20)], [demanda(1, 100)]);
    expect(r.riesgoRuptura).toHaveLength(1);
    expect(r.riesgoRuptura[0].itemRowId).toBe(1);
  });

  it("marca sobreCobertura cuando la cobertura supera 180 días", () => {
    // Venta diaria = 10/30 ≈ 0.33. Existencia = 1000 → cobertura ≈ 3000 días.
    const r = calcularResumenCoberturaSiesa([existencia(1, 1000)], [demanda(1, 10)]);
    expect(r.sobreCobertura).toHaveLength(1);
  });

  it("excluye ítems no vendibles (materia prima/insumos) del cálculo de cobertura", () => {
    const r = calcularResumenCoberturaSiesa([existencia(1, 20, false)], [demanda(1, 100)]);
    expect(r.riesgoRuptura).toEqual([]);
    expect(r.coberturaPromedioDias).toBeNull();
  });

  it("el promedio de cobertura solo considera ítems con dato calculable", () => {
    const r = calcularResumenCoberturaSiesa(
      [existencia(1, 300), existencia(2, 500)], // item 2 sin demanda
      [demanda(1, 300)],
    );
    expect(r.coberturaPromedioDias).toBe(30); // solo el ítem 1 cuenta
  });

  it("con listas vacías, devuelve una estructura válida sin lanzar", () => {
    const r = calcularResumenCoberturaSiesa([], []);
    expect(r.coberturaPromedioDias).toBeNull();
    expect(r.riesgoRuptura).toEqual([]);
    expect(r.sobreCobertura).toEqual([]);
  });
});
