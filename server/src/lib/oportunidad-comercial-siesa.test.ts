import { describe, it, expect } from "vitest";
import { calcularOportunidadComercialSiesa } from "./oportunidad-comercial-siesa";
import type { CompraClienteProductoSiesa } from "../modules/integraciones-siesa/siesa-ventas.service";
import type { ExistenciaItemSiesa } from "../modules/integraciones-siesa/siesa-inventario.service";

describe("calcularOportunidadComercialSiesa", () => {
  const compra = (
    clienteRowId: number,
    clienteNombre: string,
    itemRowId: number,
    cantidadHistorica: number,
    netoHistorico: number,
  ): CompraClienteProductoSiesa => ({
    clienteRowId,
    clienteNombre,
    itemRowId,
    descripcion: `Producto ${itemRowId}`,
    referencia: `REF${itemRowId}`,
    unidadMedida: "KG",
    cantidadHistorica,
    netoHistorico,
  });

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

  it("calcula el potencial de venta: min(existencia, historica/12) × precio promedio", () => {
    // Compró 1200 unidades en 12 meses (100/mes) a $10.000 c/u en promedio (netoHistorico=12.000.000).
    // Existencia disponible: 500 → ofertable = min(500, 100) = 100 → potencial = 100 * 10.000 = 1.000.000.
    const r = calcularOportunidadComercialSiesa(
      [compra(1, "Cliente A", 10, 1200, 12_000_000)],
      [existencia(10, 500)],
    );
    expect(r.clientes[0].productos[0].cantidadOfertable).toBe(100);
    expect(r.clientes[0].productos[0].potencialVenta).toBe(1_000_000);
  });

  it("limita la cantidad ofertable a la existencia disponible cuando esta es menor al promedio mensual histórico", () => {
    // Promedio mensual histórico = 1200/12 = 100, pero solo hay 30 disponibles.
    const r = calcularOportunidadComercialSiesa(
      [compra(1, "Cliente A", 10, 1200, 12_000_000)],
      [existencia(10, 30)],
    );
    expect(r.clientes[0].productos[0].cantidadOfertable).toBe(30);
  });

  it("excluye productos sin existencia disponible (0 o sin match)", () => {
    const r = calcularOportunidadComercialSiesa(
      [compra(1, "Cliente A", 10, 1200, 12_000_000)],
      [existencia(10, 0)],
    );
    expect(r.clientes).toEqual([]);
  });

  it("excluye productos no vendibles (materia prima/insumos)", () => {
    const r = calcularOportunidadComercialSiesa(
      [compra(1, "Cliente A", 10, 1200, 12_000_000)],
      [existencia(10, 500, false)],
    );
    expect(r.clientes).toEqual([]);
  });

  it("agrupa varios productos bajo el mismo cliente y suma el potencial total", () => {
    const compras = [
      compra(1, "Cliente A", 10, 1200, 12_000_000), // potencial 1.000.000
      compra(1, "Cliente A", 20, 600, 6_000_000), // promedio 50, potencial = 50*10000=500.000
    ];
    const existencias = [existencia(10, 500), existencia(20, 500)];
    const r = calcularOportunidadComercialSiesa(compras, existencias);
    expect(r.clientes).toHaveLength(1);
    expect(r.clientes[0].potencialTotal).toBe(1_500_000);
    expect(r.clientes[0].productos).toHaveLength(2);
  });

  it("limita productos por cliente a 5, pero potencialTotal suma todos", () => {
    const compras = Array.from({ length: 8 }, (_, i) =>
      compra(1, "Cliente A", i, 120, (i + 1) * 100_000),
    );
    const existencias = Array.from({ length: 8 }, (_, i) => existencia(i, 100));
    const r = calcularOportunidadComercialSiesa(compras, existencias);
    expect(r.clientes[0].productos).toHaveLength(5);
    const sumaMostrados = r.clientes[0].productos.reduce((a, p) => a + p.potencialVenta, 0);
    expect(r.clientes[0].potencialTotal).toBeGreaterThan(sumaMostrados);
  });

  it("limita a 10 clientes, ordenados por potencial total descendente", () => {
    const compras = Array.from({ length: 15 }, (_, i) =>
      compra(i, `Cliente ${i}`, i, 120, (i + 1) * 100_000),
    );
    const existencias = Array.from({ length: 15 }, (_, i) => existencia(i, 100));
    const r = calcularOportunidadComercialSiesa(compras, existencias);
    expect(r.clientes).toHaveLength(10);
    expect(r.clientes[0].clienteNombre).toBe("Cliente 14"); // mayor potencial primero
  });

  it("totalPotencialVenta suma sobre TODOS los clientes, no solo los 10 mostrados", () => {
    const compras = Array.from({ length: 15 }, (_, i) =>
      compra(i, `Cliente ${i}`, i, 120, (i + 1) * 100_000),
    );
    const existencias = Array.from({ length: 15 }, (_, i) => existencia(i, 100));
    const r = calcularOportunidadComercialSiesa(compras, existencias);
    const sumaMostrados = r.clientes.reduce((a, c) => a + c.potencialTotal, 0);
    expect(r.totalPotencialVenta).toBeGreaterThan(sumaMostrados);
  });

  it("con listas vacías, devuelve una estructura vacía sin lanzar", () => {
    const r = calcularOportunidadComercialSiesa([], []);
    expect(r.totalPotencialVenta).toBe(0);
    expect(r.clientes).toEqual([]);
  });
});
