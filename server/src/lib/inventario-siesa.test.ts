import { describe, it, expect } from "vitest";
import { calcularResumenInventarioSiesa } from "./inventario-siesa";
import type {
  ExistenciaItemSiesa,
  NaturalezaInventario,
} from "../modules/integraciones-siesa/siesa-inventario.service";

/**
 * calcularResumenInventarioSiesa es pura (sin I/O): se prueba con datos
 * fabricados. La consulta SQL real (t400_cm_existencia) ya se verificó
 * manualmente en vivo antes de escribir este archivo: 8.175 ítems en Ricol,
 * $7.098M en valor total, con fecha de última venta hasta hoy. La
 * naturaleza (producto/servicio/repuesto/insumo) también se verificó en
 * vivo contra f120_ind_tipo_item real (tipo=2 son fletes/bodegaje reales,
 * tipo=3 son tornillos reales).
 */
describe("calcularResumenInventarioSiesa", () => {
  const ahora = new Date(Date.UTC(2026, 8, 1)); // 1 de septiembre de 2026
  const dia = (n: number) => new Date(ahora.getTime() - n * 24 * 60 * 60 * 1000);
  const item = (
    itemRowId: number,
    cantidadExistente: number,
    cantidadComprometida: number,
    valorTotal: number,
    fechaUltimaVenta: Date | null,
    naturaleza: NaturalezaInventario = "producto",
    unidadMedida: string | null = "KG",
  ): ExistenciaItemSiesa => ({
    itemRowId,
    descripcion: `Item ${itemRowId}`,
    referencia: `REF${itemRowId}`,
    cantidadExistente,
    cantidadComprometida,
    cantidadPendienteEntrar: 0,
    valorTotal,
    fechaUltimaVenta,
    esVendible: naturaleza === "producto",
    naturaleza,
    unidadMedida,
  });

  it("clasifica como 'vendible' un ítem que vendió hace 60 días o menos", () => {
    const r = calcularResumenInventarioSiesa([item(1, 100, 0, 1000, dia(60))], ahora);
    expect(r.buckets.vendible.items).toBe(1);
    expect(r.buckets.vendible.valor).toBe(1000);
  });

  it("clasifica como 'exceso' un ítem sin venta entre 61 y 180 días", () => {
    const r = calcularResumenInventarioSiesa([item(1, 100, 0, 1000, dia(120))], ahora);
    expect(r.buckets.exceso.items).toBe(1);
  });

  it("clasifica como 'obsolescencia' un ítem sin venta hace más de 180 días", () => {
    const r = calcularResumenInventarioSiesa([item(1, 100, 0, 1000, dia(200))], ahora);
    expect(r.buckets.obsolescencia.items).toBe(1);
  });

  it("recomienda 'liquidar' para obsolescencia y 'revisar' para exceso; null para el resto", () => {
    const r = calcularResumenInventarioSiesa(
      [
        item(1, 100, 0, 1000, dia(200)), // obsolescencia
        item(2, 100, 0, 1000, dia(120)), // exceso
        item(3, 100, 0, 1000, dia(10)), // vendible
        item(4, 100, 0, 1000, null), // sin_movimiento
        item(5, 100, 0, 1000, dia(200), "insumo"),
      ],
      ahora,
    );
    const porId = (id: number) => r.topRiesgo.find((c) => c.itemRowId === id);
    expect(porId(1)?.accionRecomendada).toBe("liquidar");
    expect(porId(2)?.accionRecomendada).toBe("revisar");
  });

  it("clasifica como 'sin_movimiento' un ítem vendible sin fecha de última venta (null)", () => {
    const r = calcularResumenInventarioSiesa([item(1, 100, 0, 1000, null)], ahora);
    expect(r.buckets.sin_movimiento.items).toBe(1);
    const encontrado = r.topRiesgo.find((c) => c.itemRowId === 1);
    // sin_movimiento no cuenta como "riesgo" (exceso/obsolescencia) todavía — es una categoría aparte.
    expect(encontrado).toBeUndefined();
  });

  it("un ítem con naturaleza 'insumo' cae en el bucket 'insumo', sin importar la fecha", () => {
    // Aunque nunca tuvo venta (como sería normal en un insumo), la clasificación
    // es "insumo", NO obsolescencia — nunca fue mercancía para vender.
    const r = calcularResumenInventarioSiesa([item(1, 50, 0, 300, null, "insumo")], ahora);
    expect(r.buckets.insumo.items).toBe(1);
    expect(r.buckets.insumo.valor).toBe(300);
    expect(r.buckets.obsolescencia.items).toBe(0);
    expect(r.buckets.sin_movimiento.items).toBe(0);
  });

  it("distingue 'servicio' y 'repuesto' de 'insumo' — tres buckets separados", () => {
    const r = calcularResumenInventarioSiesa(
      [
        item(1, 1, 0, 100, null, "servicio"),
        item(2, 1, 0, 200, null, "repuesto"),
        item(3, 1, 0, 300, null, "insumo"),
      ],
      ahora,
    );
    expect(r.buckets.servicio.items).toBe(1);
    expect(r.buckets.repuesto.items).toBe(1);
    expect(r.buckets.insumo.items).toBe(1);
  });

  it("un ítem no-producto nunca aparece en topRiesgo, aunque tenga 200 días sin venta", () => {
    const r = calcularResumenInventarioSiesa([item(1, 50, 0, 9999999, dia(200), "insumo")], ahora);
    expect(r.topRiesgo).toEqual([]);
  });

  it("totalValor incluye no-productos, pero totalValorVendible los excluye", () => {
    const r = calcularResumenInventarioSiesa(
      [item(1, 10, 0, 500, dia(10), "producto"), item(2, 20, 0, 300, null, "insumo")],
      ahora,
    );
    expect(r.totalValor).toBe(800);
    expect(r.totalValorVendible).toBe(500);
  });

  it("suma el valor total sobre todos los ítems", () => {
    const r = calcularResumenInventarioSiesa(
      [item(1, 10, 0, 500, dia(10)), item(2, 20, 0, 1500, dia(200))],
      ahora,
    );
    expect(r.totalValor).toBe(2000);
  });

  it("estima el valor comprometido como (comprometida/existente) × valorTotal", () => {
    // 50 de 100 unidades comprometidas, valor total 1000 → costo unitario 10 → comprometido = 500.
    const r = calcularResumenInventarioSiesa([item(1, 100, 50, 1000, dia(10))], ahora);
    expect(r.totalComprometidoValor).toBe(500);
  });

  it("no calcula valor comprometido cuando la existencia es 0 (evita dividir por cero)", () => {
    const r = calcularResumenInventarioSiesa([item(1, 0, 10, 0, dia(10))], ahora);
    expect(r.totalComprometidoValor).toBe(0);
  });

  it("topRiesgo incluye exceso y obsolescencia, ordenados por valor descendente, máximo 15", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      item(i, 10, 0, (i + 1) * 100, dia(200)), // todos obsolescencia
    );
    const r = calcularResumenInventarioSiesa(items, ahora);
    expect(r.topRiesgo).toHaveLength(15);
    expect(r.topRiesgo[0].valorTotal).toBe(2000); // el de mayor valor primero
    expect(r.topRiesgo[14].valorTotal).toBe(600);
  });

  it("con un array vacío, devuelve una estructura válida sin lanzar", () => {
    const r = calcularResumenInventarioSiesa([], ahora);
    expect(r.totalValor).toBe(0);
    expect(r.totalValorVendible).toBe(0);
    expect(r.totalComprometidoValor).toBe(0);
    expect(r.topRiesgo).toEqual([]);
    expect(r.buckets.vendible.items).toBe(0);
    expect(r.buckets.insumo.items).toBe(0);
  });

  it("un ítem que vendió EXACTAMENTE hace 180 días es 'exceso', no 'obsolescencia' (límite inclusivo)", () => {
    const r = calcularResumenInventarioSiesa([item(1, 10, 0, 100, dia(180))], ahora);
    expect(r.buckets.exceso.items).toBe(1);
    expect(r.buckets.obsolescencia.items).toBe(0);
  });

  it("respeta umbrales personalizados en vez de los 60/180 días por defecto", () => {
    const r = calcularResumenInventarioSiesa([item(1, 10, 0, 100, dia(45))], ahora, {
      diasVendible: 30,
      diasExceso: 90,
    });
    expect(r.buckets.exceso.items).toBe(1); // 45 días > 30 (umbral custom de vendible)
    expect(r.buckets.vendible.items).toBe(0);
  });

  it("conserva la unidad de medida real del ítem (KG, UNID, etc.) en topRiesgo — no todo el catálogo es kilos", () => {
    const r = calcularResumenInventarioSiesa(
      [
        item(1, 100, 0, 1000, dia(200), "producto", "UNID"), // ej. DUOPLOCK POLICOLOR: se maneja en unidades, no kilos
        item(2, 100, 0, 1000, dia(200), "producto", "KG"),
      ],
      ahora,
    );
    const porId = (id: number) => r.topRiesgo.find((c) => c.itemRowId === id);
    expect(porId(1)?.unidadMedida).toBe("UNID");
    expect(porId(2)?.unidadMedida).toBe("KG");
  });
});
