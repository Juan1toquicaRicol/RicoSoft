import { describe, it, expect } from "vitest";
import { calcularResumenFinancieroSiesa } from "./financiero-siesa";
import type { SaldoAbiertoSiesa } from "../modules/integraciones-siesa/siesa-financiero.service";

/**
 * calcularResumenFinancieroSiesa es pura (sin I/O): se prueba con datos
 * fabricados. La consulta SQL real (t353_co_saldo_abierto) ya se verificó
 * manualmente en vivo antes de escribir este archivo: saldo débito = FV/
 * FVE/FVC (facturas de venta reales, confirmadas por join 1:1 contra
 * t461_cm_docto_factura_venta); saldo crédito = causaciones de gastos a
 * proveedores reales.
 */
describe("calcularResumenFinancieroSiesa", () => {
  const ahora = new Date(Date.UTC(2026, 8, 1)); // 1 de septiembre de 2026
  const dia = (n: number) => new Date(ahora.getTime() + n * 24 * 60 * 60 * 1000);

  it("clasifica por signo: saldo positivo va a cartera, negativo a CxP (invertido a positivo)", () => {
    const saldos: SaldoAbiertoSiesa[] = [
      {
        terceroRowId: 1,
        terceroNombre: "Cliente A",
        terceroNit: "111",
        vence: dia(10),
        saldo: 100,
      },
      {
        terceroRowId: 2,
        terceroNombre: "Proveedor B",
        terceroNit: "222",
        vence: dia(10),
        saldo: -50,
      },
    ];
    const r = calcularResumenFinancieroSiesa(saldos, ahora);
    expect(r.cartera.total).toBe(100);
    expect(r.cuentasPorPagar.total).toBe(50); // invertido a positivo, no -50
  });

  it("agrupa la antigüedad por fecha de vencimiento frente a 'ahora'", () => {
    const saldos: SaldoAbiertoSiesa[] = [
      { terceroRowId: 1, terceroNombre: "A", terceroNit: null, vence: dia(-5), saldo: 10 }, // vencido
      { terceroRowId: 1, terceroNombre: "A", terceroNit: null, vence: dia(20), saldo: 20 }, // 0-30
      { terceroRowId: 1, terceroNombre: "A", terceroNit: null, vence: dia(45), saldo: 30 }, // 31-60
      { terceroRowId: 1, terceroNombre: "A", terceroNit: null, vence: dia(75), saldo: 40 }, // 61-90
      { terceroRowId: 1, terceroNombre: "A", terceroNit: null, vence: dia(200), saldo: 50 }, // +90
    ];
    const r = calcularResumenFinancieroSiesa(saldos, ahora);
    expect(r.cartera.buckets).toEqual({
      vencido: 10,
      dias0a30: 20,
      dias31a60: 30,
      dias61a90: 40,
      mas90: 50,
    });
  });

  it("agrupa por tercero (rowid) sumando varios documentos del mismo tercero", () => {
    const saldos: SaldoAbiertoSiesa[] = [
      {
        terceroRowId: 1,
        terceroNombre: "Cliente A",
        terceroNit: "111",
        vence: dia(10),
        saldo: 100,
      },
      { terceroRowId: 1, terceroNombre: "Cliente A", terceroNit: "111", vence: dia(20), saldo: 50 },
      { terceroRowId: 2, terceroNombre: "Cliente B", terceroNit: "222", vence: dia(10), saldo: 30 },
    ];
    const r = calcularResumenFinancieroSiesa(saldos, ahora);
    expect(r.cartera.topTerceros).toHaveLength(2);
    expect(r.cartera.topTerceros[0]).toMatchObject({ nombre: "Cliente A", saldo: 150 });
    expect(r.cartera.topTerceros[0].porcentaje).toBe(83.3); // 150/180
  });

  it("solo devuelve el top 5, ordenado descendente por saldo", () => {
    const saldos: SaldoAbiertoSiesa[] = Array.from({ length: 7 }, (_, i) => ({
      terceroRowId: i,
      terceroNombre: `Cliente ${i}`,
      terceroNit: null,
      vence: dia(10),
      saldo: (i + 1) * 100,
    }));
    const r = calcularResumenFinancieroSiesa(saldos, ahora);
    expect(r.cartera.topTerceros).toHaveLength(5);
    expect(r.cartera.topTerceros[0].nombre).toBe("Cliente 6");
    expect(r.cartera.topTerceros[4].nombre).toBe("Cliente 2");
  });

  it("con total 0 (cartera vacía), no calcula porcentaje ni concentración (null, no división por cero)", () => {
    const r = calcularResumenFinancieroSiesa([], ahora);
    expect(r.cartera.total).toBe(0);
    expect(r.cartera.topTerceros).toEqual([]);
    expect(r.cartera.concentracionTopTercero).toBeNull();
    expect(r.cuentasPorPagar.total).toBe(0);
  });

  it("un tercero sin rowid (null) usa el nombre como clave de agrupación", () => {
    const saldos: SaldoAbiertoSiesa[] = [
      {
        terceroRowId: null,
        terceroNombre: "Tercero X",
        terceroNit: null,
        vence: dia(10),
        saldo: 10,
      },
      {
        terceroRowId: null,
        terceroNombre: "Tercero X",
        terceroNit: null,
        vence: dia(20),
        saldo: 5,
      },
      {
        terceroRowId: null,
        terceroNombre: "Tercero Y",
        terceroNit: null,
        vence: dia(10),
        saldo: 7,
      },
    ];
    const r = calcularResumenFinancieroSiesa(saldos, ahora);
    expect(r.cartera.topTerceros).toHaveLength(2);
    expect(r.cartera.topTerceros.find((t) => t.nombre === "Tercero X")?.saldo).toBe(15);
  });
});
