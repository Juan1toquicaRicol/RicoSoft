import { describe, it, expect } from "vitest";
import { calcularCapacidadProductivaSiesa } from "./capacidad-productiva";
import type { ComponenteBomSiesa } from "../../modules/integraciones-siesa/siesa-manufactura.service";
import type { ExistenciaItemSiesa } from "../../modules/integraciones-siesa/siesa-inventario.service";

function componente(
  itemPadreRowId: number,
  componenteRowId: number,
  cantRequerida: number,
  cantBase = 100,
  pctDesperdicio = 0,
): ComponenteBomSiesa {
  return {
    itemPadreRowId,
    componenteRowId,
    descripcionComponente: `Componente ${componenteRowId}`,
    referenciaComponente: null,
    cantBase,
    cantRequerida,
    pctDesperdicio,
  };
}

function existencia(itemRowId: number, cantidadExistente: number): ExistenciaItemSiesa {
  return {
    itemRowId,
    descripcion: null,
    referencia: null,
    cantidadExistente,
    cantidadComprometida: 0,
    cantidadPendienteEntrar: 0,
    valorTotal: 0,
    fechaUltimaVenta: null,
    esVendible: true,
    naturaleza: "insumo",
  };
}

describe("calcularCapacidadProductivaSiesa", () => {
  it("usa el material más escaso como capacidad real (ejemplo de negocio: X=400u, Y=250u -> 250u)", () => {
    // Materia X = 2 kg/unidad, Materia Y = 1 kg/unidad (cantBase=100 -> cantRequerida=200/100)
    const bom = [componente(1, 10, 200, 100), componente(1, 11, 100, 100)];
    const existencias = [existencia(10, 800), existencia(11, 250)];
    const [r] = calcularCapacidadProductivaSiesa(
      [{ itemRowId: 1, descripcion: "Producto A", referencia: null, unidadMedida: "UND", demandaProyectada: 0, pedidosComprometidos: 0, inventarioDisponible: 0, cantidadPendienteEntrar: 0, produccionRecomendada: 400 }],
      bom,
      existencias,
    );
    expect(r.capacidadMaxima).toBe(250);
    expect(r.materialLimitante?.componenteRowId).toBe(11);
    expect(r.deficitProductivo).toBe(150);
  });

  it("capacidad null (sin restricción) cuando el producto no tiene receta", () => {
    const [r] = calcularCapacidadProductivaSiesa(
      [{ itemRowId: 2, descripcion: "Sin receta", referencia: null, unidadMedida: null, demandaProyectada: 0, pedidosComprometidos: 0, inventarioDisponible: 0, cantidadPendienteEntrar: 0, produccionRecomendada: 100 }],
      [],
      [],
    );
    expect(r.capacidadMaxima).toBeNull();
    expect(r.deficitProductivo).toBe(0);
  });

  it("deficitProductivo es 0 cuando la capacidad alcanza o supera lo recomendado", () => {
    const bom = [componente(1, 10, 100, 100)];
    const existencias = [existencia(10, 1000)];
    const [r] = calcularCapacidadProductivaSiesa(
      [{ itemRowId: 1, descripcion: null, referencia: null, unidadMedida: null, demandaProyectada: 0, pedidosComprometidos: 0, inventarioDisponible: 0, cantidadPendienteEntrar: 0, produccionRecomendada: 200 }],
      bom,
      existencias,
    );
    expect(r.capacidadMaxima).toBe(1000);
    expect(r.deficitProductivo).toBe(0);
  });

  it("componente sin existencia registrada se trata como 0 disponible", () => {
    const bom = [componente(1, 10, 100, 100)];
    const [r] = calcularCapacidadProductivaSiesa(
      [{ itemRowId: 1, descripcion: null, referencia: null, unidadMedida: null, demandaProyectada: 0, pedidosComprometidos: 0, inventarioDisponible: 0, cantidadPendienteEntrar: 0, produccionRecomendada: 50 }],
      bom,
      [],
    );
    expect(r.capacidadMaxima).toBe(0);
    expect(r.deficitProductivo).toBe(50);
  });

  it("con lista vacía de producción recomendada, devuelve un array vacío sin lanzar", () => {
    expect(calcularCapacidadProductivaSiesa([], [], [])).toEqual([]);
  });
});
