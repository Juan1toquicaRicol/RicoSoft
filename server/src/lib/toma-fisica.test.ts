import { describe, it, expect } from "vitest";
import {
  calcularLineasTomaFisica,
  calcularResumenTomaFisica,
  detectarPatronesRecurrentes,
  type LineaTomaFisicaEntrada,
  type OcurrenciaDiferencia,
} from "./toma-fisica";

describe("calcularLineasTomaFisica", () => {
  const linea = (
    id: string,
    stockSistema: number,
    conteoFisico: number | null,
    valorUnitario = 1000,
  ): LineaTomaFisicaEntrada => ({
    id,
    itemRowId: 1,
    descripcion: "Producto X",
    referencia: "REF1",
    stockSistema,
    conteoFisico,
    valorUnitario,
  });

  it("calcula diferencia, diferenciaPct y valorDiferencia cuando hay conteo físico", () => {
    // Sistema 1000, conteo 970 → diferencia -30, -3%, valor -30*1000=-30000.
    const [r] = calcularLineasTomaFisica([linea("a", 1000, 970)]);
    expect(r.diferencia).toBe(-30);
    expect(r.diferenciaPct).toBe(-3);
    expect(r.valorDiferencia).toBe(-30000);
  });

  it("deja todo en null cuando el conteo físico no se ha registrado", () => {
    const [r] = calcularLineasTomaFisica([linea("a", 1000, null)]);
    expect(r.diferencia).toBeNull();
    expect(r.diferenciaPct).toBeNull();
    expect(r.valorDiferencia).toBeNull();
  });

  it("diferenciaPct es null cuando el stock del sistema es 0 (evita dividir por cero)", () => {
    const [r] = calcularLineasTomaFisica([linea("a", 0, 5)]);
    expect(r.diferencia).toBe(5);
    expect(r.diferenciaPct).toBeNull();
  });

  it("con un array vacío, devuelve un array vacío sin lanzar", () => {
    expect(calcularLineasTomaFisica([])).toEqual([]);
  });
});

describe("calcularResumenTomaFisica", () => {
  it("cuenta líneas contadas/pendientes y suma el valor de diferencia total", () => {
    const lineas = calcularLineasTomaFisica([
      { id: "a", itemRowId: 1, descripcion: null, referencia: null, stockSistema: 100, conteoFisico: 90, valorUnitario: 10 },
      { id: "b", itemRowId: 2, descripcion: null, referencia: null, stockSistema: 50, conteoFisico: null, valorUnitario: 20 },
    ]);
    const r = calcularResumenTomaFisica(lineas);
    expect(r.totalLineas).toBe(2);
    expect(r.lineasContadas).toBe(1);
    expect(r.lineasPendientes).toBe(1);
    expect(r.valorDiferenciaTotal).toBe(-100); // (90-100)*10
  });
});

describe("detectarPatronesRecurrentes", () => {
  const dia = (n: number) => new Date(Date.UTC(2026, 0, n));
  const ocurrencia = (
    itemRowId: number,
    fecha: Date,
    diferenciaPct: number,
    tomaFisicaId = "t1",
  ): OcurrenciaDiferencia => ({ tomaFisicaId, fecha, itemRowId, descripcion: `Item ${itemRowId}`, diferenciaPct });

  it("detecta un patrón cuando las últimas 3 tomas tienen diferencia del mismo signo", () => {
    const historico = [
      ocurrencia(1, dia(1), -2, "t1"),
      ocurrencia(1, dia(2), -3, "t2"),
      ocurrencia(1, dia(3), -4, "t3"),
    ];
    const patrones = detectarPatronesRecurrentes(historico);
    expect(patrones).toHaveLength(1);
    expect(patrones[0].itemRowId).toBe(1);
    expect(patrones[0].signo).toBe("faltante");
    expect(patrones[0].diferenciaPromedioPct).toBeCloseTo(-3, 5);
  });

  it("NO detecta un patrón cuando el signo cambia entre ocurrencias", () => {
    const historico = [
      ocurrencia(1, dia(1), -2, "t1"),
      ocurrencia(1, dia(2), 3, "t2"),
      ocurrencia(1, dia(3), -4, "t3"),
    ];
    expect(detectarPatronesRecurrentes(historico)).toEqual([]);
  });

  it("NO detecta un patrón con menos de 3 ocurrencias", () => {
    const historico = [ocurrencia(1, dia(1), -2, "t1"), ocurrencia(1, dia(2), -3, "t2")];
    expect(detectarPatronesRecurrentes(historico)).toEqual([]);
  });

  it("ignora diferencias menores al umbral (1%) — ruido normal de conteo", () => {
    const historico = [
      ocurrencia(1, dia(1), -0.5, "t1"),
      ocurrencia(1, dia(2), -0.3, "t2"),
      ocurrencia(1, dia(3), -0.8, "t3"),
    ];
    expect(detectarPatronesRecurrentes(historico)).toEqual([]);
  });

  it("solo usa las últimas 3 ocurrencias, ignorando un patrón viejo ya corregido", () => {
    // Las primeras 2 son negativas (viejas), pero las últimas 3 son positivas → patrón "sobrante".
    const historico = [
      ocurrencia(1, dia(1), -5, "t1"),
      ocurrencia(1, dia(2), -5, "t2"),
      ocurrencia(1, dia(3), 3, "t3"),
      ocurrencia(1, dia(4), 4, "t4"),
      ocurrencia(1, dia(5), 5, "t5"),
    ];
    const patrones = detectarPatronesRecurrentes(historico);
    expect(patrones).toHaveLength(1);
    expect(patrones[0].signo).toBe("sobrante");
    expect(patrones[0].ocurrencias).toBe(3);
  });

  it("ordena por magnitud de diferencia promedio descendente", () => {
    const historico = [
      ...[dia(1), dia(2), dia(3)].map((f) => ocurrencia(1, f, -2)),
      ...[dia(1), dia(2), dia(3)].map((f) => ocurrencia(2, f, -10)),
    ];
    const patrones = detectarPatronesRecurrentes(historico);
    expect(patrones[0].itemRowId).toBe(2);
  });

  it("con historial vacío, devuelve un array vacío sin lanzar", () => {
    expect(detectarPatronesRecurrentes([])).toEqual([]);
  });
});
