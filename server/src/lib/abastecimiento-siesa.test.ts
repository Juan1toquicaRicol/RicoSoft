import { describe, it, expect } from "vitest";
import { calcularNecesidadesAbastecimientoSiesa } from "./abastecimiento-siesa";
import type { ComponenteBomSiesa } from "../modules/integraciones-siesa/siesa-manufactura.service";
import type { RecomendacionProduccionSiesa } from "./produccion-siesa";
import type { ExistenciaItemSiesa } from "../modules/integraciones-siesa/siesa-inventario.service";

describe("calcularNecesidadesAbastecimientoSiesa", () => {
  const prod = (
    itemRowId: number,
    produccionRecomendada: number,
  ): RecomendacionProduccionSiesa => ({
    itemRowId,
    descripcion: `Producto ${itemRowId}`,
    referencia: `REF${itemRowId}`,
    unidadMedida: "KG",
    demandaProyectada: 0,
    pedidosComprometidos: 0,
    inventarioDisponible: 0,
    cantidadPendienteEntrar: 0,
    produccionRecomendada,
  });

  const bomLinea = (
    itemPadreRowId: number,
    componenteRowId: number,
    cantBase: number,
    cantRequerida: number,
    pctDesperdicio = 0,
  ): ComponenteBomSiesa => ({
    itemPadreRowId,
    componenteRowId,
    descripcionComponente: `Componente ${componenteRowId}`,
    referenciaComponente: `COMP${componenteRowId}`,
    cantBase,
    cantRequerida,
    pctDesperdicio,
  });

  const existencia = (itemRowId: number, cantidadExistente: number): ExistenciaItemSiesa => ({
    itemRowId,
    descripcion: `Componente ${itemRowId}`,
    referencia: `COMP${itemRowId}`,
    cantidadExistente,
    cantidadComprometida: 0,
    cantidadPendienteEntrar: 0,
    valorTotal: 0,
    fechaUltimaVenta: null,
    esVendible: false,
  });

  it("calcula la necesidad usando la proporción cantRequerida/cantBase, no el valor absoluto", () => {
    // Receta: por cada 100 unidades del padre, se necesitan 40 del componente (40%).
    // Producción recomendada: 100 → necesidad = 100 * (40/100) = 40.
    const r = calcularNecesidadesAbastecimientoSiesa(
      [prod(1, 100)],
      [bomLinea(1, 10, 100, 40)],
      [existencia(10, 0)],
    );
    expect(r[0].cantidadNecesaria).toBe(40);
  });

  it("aplica el % de desperdicio a la cantidad necesaria", () => {
    // 100 * (40/100) * 1.05 (5% desperdicio) = 42.
    const r = calcularNecesidadesAbastecimientoSiesa(
      [prod(1, 100)],
      [bomLinea(1, 10, 100, 40, 5)],
      [existencia(10, 0)],
    );
    expect(r[0].cantidadNecesaria).toBe(42);
  });

  it("calcula el déficit como necesidad menos disponible, nunca negativo", () => {
    const r = calcularNecesidadesAbastecimientoSiesa(
      [prod(1, 100)],
      [bomLinea(1, 10, 100, 40)],
      [existencia(10, 15)],
    );
    expect(r[0].deficit).toBe(25); // 40 - 15
  });

  it("NO reporta un componente cuando la existencia ya cubre la necesidad (déficit <= 0)", () => {
    const r = calcularNecesidadesAbastecimientoSiesa(
      [prod(1, 100)],
      [bomLinea(1, 10, 100, 40)],
      [existencia(10, 100)], // 100 disponible >= 40 necesario
    );
    expect(r).toEqual([]);
  });

  it("suma la necesidad de un mismo componente cuando lo usan varios productos", () => {
    const r = calcularNecesidadesAbastecimientoSiesa(
      [prod(1, 100), prod(2, 50)],
      [bomLinea(1, 10, 100, 40), bomLinea(2, 10, 100, 20)],
      [existencia(10, 0)],
    );
    // Producto 1: 100*(40/100)=40. Producto 2: 50*(20/100)=10. Total = 50.
    expect(r[0].cantidadNecesaria).toBe(50);
  });

  it("ignora productos sin receta (sin BOM) — es un caso válido, no un error", () => {
    const r = calcularNecesidadesAbastecimientoSiesa([prod(1, 100)], [], [existencia(10, 0)]);
    expect(r).toEqual([]);
  });

  it("ignora líneas de BOM con cantBase 0 (evita dividir por cero)", () => {
    const r = calcularNecesidadesAbastecimientoSiesa(
      [prod(1, 100)],
      [bomLinea(1, 10, 0, 40)],
      [existencia(10, 0)],
    );
    expect(r).toEqual([]);
  });

  it("ordena por déficit descendente y limita a 20 resultados", () => {
    const productos = Array.from({ length: 25 }, (_, i) => prod(i, 100));
    const bom = Array.from({ length: 25 }, (_, i) => bomLinea(i, i, 100, i + 1));
    const existencias = Array.from({ length: 25 }, (_, i) => existencia(i, 0));
    const r = calcularNecesidadesAbastecimientoSiesa(productos, bom, existencias);
    expect(r).toHaveLength(20);
    expect(r[0].componenteRowId).toBe(24); // mayor déficit primero
  });

  it("con listas vacías, devuelve un array vacío sin lanzar", () => {
    expect(calcularNecesidadesAbastecimientoSiesa([], [], [])).toEqual([]);
  });
});
