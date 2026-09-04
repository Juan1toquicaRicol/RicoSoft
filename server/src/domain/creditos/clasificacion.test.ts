import { describe, expect, it } from "vitest";
import { clasificarMonto, calcularResumenCartera } from "./clasificacion";

const AHORA = new Date("2026-09-15T00:00:00Z");
const enDias = (dias: number) => new Date(AHORA.getTime() + dias * 24 * 60 * 60 * 1000);

describe("clasificarMonto", () => {
  it("Caso A — sin saldo pendiente: Al día, todo en 0", () => {
    const r = clasificarMonto(0, enDias(30), "Al día", AHORA);
    expect(r).toEqual({ estado: "Al día", vencido: 0, porVencer: 0, alDia: 0, diasMora: 0 });
  });

  it("Caso B — saldo pendiente pero fecha lejana: Al día, todo el saldo cuenta como alDia", () => {
    const r = clasificarMonto(10_000_000, enDias(30), "Al día", AHORA);
    expect(r.estado).toBe("Al día");
    expect(r.alDia).toBe(10_000_000);
    expect(r.vencido).toBe(0);
  });

  it("dentro de la ventana de alerta (7 días): Por vencer", () => {
    const r = clasificarMonto(10_000_000, enDias(3), "Al día", AHORA);
    expect(r.estado).toBe("Por vencer");
    expect(r.porVencer).toBe(10_000_000);
    expect(r.vencido).toBe(0);
  });

  it("Caso C — fecha ya pasada: Vencido, con días de mora correctos", () => {
    const r = clasificarMonto(4_000_000, enDias(-10), "Al día", AHORA);
    expect(r.estado).toBe("Vencido");
    expect(r.vencido).toBe(4_000_000);
    expect(r.diasMora).toBe(10);
  });

  it("Caso F — Paz y Salvo NO se deriva de fechas, se respeta el cierre formal", () => {
    // Aunque la fecha ya pasó y el saldo (hipotético) fuera > 0, el estado
    // guardado "Paz y Salvo" es autoritativo — nunca se recalcula por fecha.
    const r = clasificarMonto(500_000, enDias(-30), "Paz y Salvo", AHORA);
    expect(r.estado).toBe("Paz y Salvo");
    expect(r.vencido).toBe(0);
  });

  it("saldo <= 0 nunca se marca automáticamente como Paz y Salvo (solo Al día)", () => {
    const r = clasificarMonto(0, enDias(-10), "Al día", AHORA);
    expect(r.estado).toBe("Al día");
  });
});

describe("calcularResumenCartera", () => {
  it("Caso D — separa correctamente el total, vencido, por vencer y al día de un mismo cliente", () => {
    const resumen = calcularResumenCartera(
      [
        { clave: "Cliente ABC", saldo: 6_000_000, vence: enDias(-5) }, // vencido
        { clave: "Cliente ABC", saldo: 2_000_000, vence: enDias(3) }, // por vencer
        { clave: "Cliente ABC", saldo: 2_000_000, vence: enDias(60) }, // al día
      ],
      AHORA,
    );
    expect(resumen.porRecaudar).toBe(10_000_000);
    expect(resumen.vencido).toBe(6_000_000);
    expect(resumen.porVencer).toBe(2_000_000);
    expect(resumen.alDia).toBe(2_000_000);
    expect(resumen.clientesEnMora).toBe(1);
  });

  it("clientesEnMora cuenta clientes distintos, no filas distintas", () => {
    const resumen = calcularResumenCartera(
      [
        { clave: "Cliente A", saldo: 1_000_000, vence: enDias(-1) },
        { clave: "Cliente A", saldo: 500_000, vence: enDias(-2) },
        { clave: "Cliente B", saldo: 300_000, vence: enDias(30) },
      ],
      AHORA,
    );
    expect(resumen.clientesEnMora).toBe(1);
    expect(resumen.vencido).toBe(1_500_000);
  });

  it("Paz y Salvo no aporta a ningún bucket del resumen", () => {
    const resumen = calcularResumenCartera(
      [{ clave: "Cliente Cerrado", saldo: 0, vence: enDias(-100), estadoGuardado: "Paz y Salvo" }],
      AHORA,
    );
    expect(resumen.porRecaudar).toBe(0);
    expect(resumen.vencido).toBe(0);
    expect(resumen.clientesEnMora).toBe(0);
  });

  it("lista vacía produce un resumen todo en cero", () => {
    const resumen = calcularResumenCartera([], AHORA);
    expect(resumen).toEqual({
      porRecaudar: 0,
      vencido: 0,
      porVencer: 0,
      alDia: 0,
      clientesEnMora: 0,
    });
  });
});
