import { describe, it, expect } from "vitest";
import { calcularCandidatosLiquidacionSiesa } from "./liquidacion";
import type { ItemInventarioClasificado } from "../../lib/inventario-siesa";

function item(
  itemRowId: number,
  overrides: Partial<ItemInventarioClasificado> = {},
): ItemInventarioClasificado {
  return {
    itemRowId,
    descripcion: `Item ${itemRowId}`,
    referencia: null,
    naturaleza: "producto",
    cantidadExistente: 100,
    cantidadComprometida: 0,
    valorTotal: 1_000_000,
    diasSinVenta: 200,
    clasificacion: "obsolescencia",
    accionRecomendada: "liquidar",
    unidadMedida: "KG",
    ...overrides,
  };
}

describe("calcularCandidatosLiquidacionSiesa", () => {
  it("un ítem de alto valor, muy antiguo y sin demanda reciente obtiene score CRITICA", () => {
    const [c] = calcularCandidatosLiquidacionSiesa(
      [item(1, { valorTotal: 85_000_000, diasSinVenta: 400 })],
      new Map(),
    );
    expect(c.score).toBe(100);
    expect(c.prioridad).toBe("CRITICA");
  });

  it("un ítem reciente en exceso pero de bajo valor y con demanda activa obtiene score BAJA", () => {
    const [c] = calcularCandidatosLiquidacionSiesa(
      [item(1, { clasificacion: "exceso", valorTotal: 500_000, diasSinVenta: 65 })],
      new Map([[1, 50]]),
    );
    expect(c.prioridad).toBe("BAJA");
  });

  it("sin_movimiento (nunca vendió) puntúa el máximo de antigüedad aunque diasSinVenta sea null", () => {
    const [c] = calcularCandidatosLiquidacionSiesa(
      [item(1, { clasificacion: "sin_movimiento", diasSinVenta: null })],
      new Map(),
    );
    expect(c.score).toBeGreaterThanOrEqual(40 + 5 + 30);
  });

  it("excluye ítems vendibles, servicios, repuestos e insumos aunque estén en el listado", () => {
    const items = [
      item(1, { clasificacion: "vendible" }),
      item(2, { naturaleza: "servicio", clasificacion: "servicio" }),
      item(3, { naturaleza: "repuesto", clasificacion: "repuesto" }),
      item(4, { naturaleza: "insumo", clasificacion: "insumo" }),
    ];
    expect(calcularCandidatosLiquidacionSiesa(items, new Map())).toEqual([]);
  });

  it("un ítem sin entrada en el mapa de demanda se trata como demanda 0 (no como dato faltante silencioso)", () => {
    const [c] = calcularCandidatosLiquidacionSiesa([item(1)], new Map());
    expect(c.ventaPromedioMensual).toBe(0);
  });

  it("ordena por score descendente y limita a 20", () => {
    const items = Array.from({ length: 25 }, (_, i) =>
      item(i, { valorTotal: (i + 1) * 1_000_000 }),
    );
    const candidatos = calcularCandidatosLiquidacionSiesa(items, new Map());
    expect(candidatos).toHaveLength(20);
    expect(candidatos[0].score).toBeGreaterThanOrEqual(candidatos[1].score);
  });

  it("conserva la unidad de medida real del ítem — no todo el catálogo es kilos (ej. DUOPLOCK POLICOLOR se maneja en UNID)", () => {
    const [c] = calcularCandidatosLiquidacionSiesa([item(1, { unidadMedida: "UNID" })], new Map());
    expect(c.unidadMedida).toBe("UNID");
  });
});
