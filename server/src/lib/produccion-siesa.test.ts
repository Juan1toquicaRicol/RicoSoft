import { describe, it, expect } from "vitest";
import { calcularProduccionRecomendadaSiesa } from "./produccion-siesa";
import type { PronosticoProductoSiesa } from "./demanda-siesa";
import type { ExistenciaItemSiesa } from "../modules/integraciones-siesa/siesa-inventario.service";

/**
 * calcularProduccionRecomendadaSiesa es pura (sin I/O): se prueba con datos
 * fabricados. Las dos fuentes reales (pronóstico de demanda, existencias)
 * ya se verificaron en vivo por separado en sus propios módulos.
 */
describe("calcularProduccionRecomendadaSiesa", () => {
  const pronostico = (
    itemRowId: number,
    ventaPromedioMensual: number,
    tendenciaPct: number | null = null,
  ): PronosticoProductoSiesa => ({
    itemRowId,
    descripcion: `Producto ${itemRowId}`,
    referencia: `REF${itemRowId}`,
    unidadMedida: "UNID",
    ventaPromedioMensual,
    tendenciaPct,
    coeficienteVariacion: null,
    demandaIrregular: false,
    perdiendoRotacion: false,
    mesesConVenta: 12,
  });

  const existencia = (
    itemRowId: number,
    cantidadExistente: number,
    cantidadComprometida = 0,
    cantidadPendienteEntrar = 0,
    esVendible = true,
  ): ExistenciaItemSiesa => ({
    itemRowId,
    descripcion: `Producto ${itemRowId}`,
    referencia: `REF${itemRowId}`,
    cantidadExistente,
    cantidadComprometida,
    cantidadPendienteEntrar,
    valorTotal: 0,
    fechaUltimaVenta: new Date(),
    esVendible,
  });

  it("recomienda 0 (se omite de la lista) cuando el stock ya cubre la demanda + comprometido — ejemplo del enunciado", () => {
    // Producto X: venta promedio 1.200, stock 2.800, comprometido 1.500 → 1200+1500-2800 = -100 → 0.
    const r = calcularProduccionRecomendadaSiesa(
      [pronostico(1, 1200)],
      [existencia(1, 2800, 1500)],
    );
    expect(r).toEqual([]);
  });

  it("recomienda producir cuando el stock no alcanza — ejemplo del enunciado", () => {
    // Producto Y: venta promedio 2.000, stock 600, comprometido 1.100 → 2000+1100-600 = 2500.
    const r = calcularProduccionRecomendadaSiesa(
      [pronostico(2, 2000)],
      [existencia(2, 600, 1100)],
    );
    expect(r).toHaveLength(1);
    expect(r[0].produccionRecomendada).toBe(2500);
  });

  it("resta la cantidad ya pendiente de entrar (compra o producción en camino)", () => {
    const r = calcularProduccionRecomendadaSiesa(
      [pronostico(1, 1000)],
      [existencia(1, 0, 0, 800)], // 1000 - 0 - 0 - 800 = 200
    );
    expect(r[0].produccionRecomendada).toBe(200);
  });

  it("aplica la tendencia a la demanda proyectada, dentro del rango [-50%, +100%]", () => {
    // +30% de tendencia: 1000 * 1.3 = 1300.
    const r = calcularProduccionRecomendadaSiesa(
      [pronostico(1, 1000, 30)],
      [existencia(1, 0)],
    );
    expect(r[0].demandaProyectada).toBe(1300);
  });

  it("limita la tendencia a +100% (no proyecta un pico atípico como la norma)", () => {
    // +500% de tendencia — se limita a factor 2.0 → 1000 * 2 = 2000, no 6000.
    const r = calcularProduccionRecomendadaSiesa(
      [pronostico(1, 1000, 500)],
      [existencia(1, 0)],
    );
    expect(r[0].demandaProyectada).toBe(2000);
  });

  it("limita la tendencia a -50% (no proyecta demanda negativa por una caída fuerte)", () => {
    // -90% de tendencia — se limita a factor 0.5 → 1000 * 0.5 = 500.
    const r = calcularProduccionRecomendadaSiesa(
      [pronostico(1, 1000, -90)],
      [existencia(1, 0)],
    );
    expect(r[0].demandaProyectada).toBe(500);
  });

  it("ignora productos no vendibles (materia prima/insumos) — nunca se les recomienda producción", () => {
    const r = calcularProduccionRecomendadaSiesa(
      [pronostico(1, 1000)],
      [existencia(1, 0, 0, 0, false)],
    );
    expect(r).toEqual([]);
  });

  it("ignora productos del pronóstico sin existencia registrada (sin match)", () => {
    const r = calcularProduccionRecomendadaSiesa([pronostico(1, 1000)], []);
    expect(r).toEqual([]);
  });

  it("ordena por producción recomendada descendente y limita a 20 resultados", () => {
    const pronosticos = Array.from({ length: 25 }, (_, i) => pronostico(i, (i + 1) * 100));
    const existencias = Array.from({ length: 25 }, (_, i) => existencia(i, 0));
    const r = calcularProduccionRecomendadaSiesa(pronosticos, existencias);
    expect(r).toHaveLength(20);
    expect(r[0].itemRowId).toBe(24); // mayor demanda → mayor producción recomendada, primero
  });

  it("con listas vacías, devuelve un array vacío sin lanzar", () => {
    expect(calcularProduccionRecomendadaSiesa([], [])).toEqual([]);
  });
});
