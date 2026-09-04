import { describe, it, expect } from "vitest";
import { calcularDisponibilidadComercial } from "./disponibilidad";
import type { ExistenciaItemSiesa } from "../../modules/integraciones-siesa/siesa-inventario.service";
import type { ComponenteBomSiesa } from "../../modules/integraciones-siesa/siesa-manufactura.service";

function existencia(
  itemRowId: number,
  overrides: Partial<ExistenciaItemSiesa> = {},
): ExistenciaItemSiesa {
  return {
    itemRowId,
    descripcion: `Item ${itemRowId}`,
    referencia: null,
    cantidadExistente: 0,
    cantidadComprometida: 0,
    cantidadPendienteEntrar: 0,
    valorTotal: 0,
    fechaUltimaVenta: null,
    esVendible: true,
    naturaleza: "producto",
    unidadMedida: "KG",
    ...overrides,
  };
}

function componente(
  itemPadreRowId: number,
  componenteRowId: number,
  cantRequerida: number,
  cantBase = 100,
): ComponenteBomSiesa {
  return {
    itemPadreRowId,
    componenteRowId,
    descripcionComponente: `Materia ${componenteRowId}`,
    referenciaComponente: null,
    cantBase,
    cantRequerida,
    pctDesperdicio: 0,
  };
}

describe("calcularDisponibilidadComercial", () => {
  it("estado 'disponible' cuando la existencia libre (existente - comprometida) alcanza sola", () => {
    const r = calcularDisponibilidadComercial(
      1,
      1000,
      [existencia(1, { cantidadExistente: 1800, cantidadComprometida: 500 })],
      [],
    );
    expect(r.disponibleLibre).toBe(1300);
    expect(r.estado).toBe("disponible");
    expect(r.deficit).toBe(0);
  });

  it("estado 'requiere_produccion' cuando falta existencia pero la capacidad productiva cubre el déficit completo", () => {
    const bom = [componente(1, 10, 100, 100)]; // 1 kg de materia por unidad
    const r = calcularDisponibilidadComercial(
      1,
      5000,
      [
        existencia(1, { cantidadExistente: 1800, cantidadComprometida: 500 }),
        existencia(10, { cantidadExistente: 10000 }),
      ],
      bom,
    );
    // disponibleLibre=1300, deficit=3700; capacidad = 10000kg materia / 1kg por unidad = 10000 >= 3700
    expect(r.deficit).toBe(3700);
    expect(r.estado).toBe("requiere_produccion");
    expect(r.capacidadProductiva).toBe(10000);
    expect(r.deficitProductivo).toBe(0);
    expect(r.necesidadesCompra).toEqual([]);
  });

  it("estado 'requiere_produccion_y_compra' cuando la materia prima no alcanza para cubrir todo el déficit", () => {
    const bom = [componente(1, 10, 100, 100)];
    const r = calcularDisponibilidadComercial(
      1,
      5000,
      [
        existencia(1, { cantidadExistente: 1800, cantidadComprometida: 500 }),
        existencia(10, { cantidadExistente: 800 }),
      ],
      bom,
    );
    // deficit=3700; capacidad=800kg (1kg/unidad) -> alcanza para 800 unidades, faltan 2900
    expect(r.estado).toBe("requiere_produccion_y_compra");
    expect(r.capacidadProductiva).toBe(800);
    expect(r.deficitProductivo).toBe(2900);
    expect(r.necesidadesCompra).toHaveLength(1);
    expect(r.necesidadesCompra[0].componenteRowId).toBe(10);
    expect(r.materialLimitante).toBe("Materia 10");
  });

  it("estado 'requiere_compra_directa' cuando el producto no tiene receta en Siesa (no se fabrica)", () => {
    const r = calcularDisponibilidadComercial(
      1,
      5000,
      [existencia(1, { cantidadExistente: 1000 })],
      [], // sin BOM para el item 1
    );
    expect(r.estado).toBe("requiere_compra_directa");
    expect(r.capacidadProductiva).toBeNull();
    expect(r.necesidadesCompra).toEqual([]);
  });

  it("un ítem que no existe en Siesa se trata como 0 existencia (déficit total), no lanza", () => {
    const r = calcularDisponibilidadComercial(999, 100, [], []);
    expect(r.cantidadExistente).toBe(0);
    expect(r.deficit).toBe(100);
    expect(r.estado).toBe("requiere_compra_directa");
  });

  it("cantidadComprometida mayor a la existencia no produce disponibleLibre negativo", () => {
    const r = calcularDisponibilidadComercial(
      1,
      10,
      [existencia(1, { cantidadExistente: 100, cantidadComprometida: 500 })],
      [],
    );
    expect(r.disponibleLibre).toBe(0);
    expect(r.deficit).toBe(10);
  });
});
