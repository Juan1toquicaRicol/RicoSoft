import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const updateManyMock = vi.fn();

vi.mock("../config/prisma", () => ({
  prisma: {
    sincronizacionBiometricoLog: {
      updateMany: (...args: unknown[]) => updateManyMock(...args),
    },
  },
}));

describe("recuperarSincronizacionesBiometricoInterrumpidas", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    updateManyMock.mockReset();
    updateManyMock.mockResolvedValue({ count: 0 });
    delete process.env.CROSSCHEX_SYNC_STALE_MINUTES;
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it("solo recupera EN_CURSO más viejo que el umbral (15 min por defecto), no todo EN_CURSO", async () => {
    const antes = Date.now();
    const { recuperarSincronizacionesBiometricoInterrumpidas } =
      await import("./crosschex-recovery");

    await recuperarSincronizacionesBiometricoInterrumpidas();

    const args = updateManyMock.mock.calls[0][0];
    expect(args.where.estado).toBe("EN_CURSO");
    expect(args.where.iniciadoEn.lt).toBeInstanceOf(Date);

    const umbralMs = antes - args.where.iniciadoEn.lt.getTime();
    // Debe ser ~15 minutos (con margen para el tiempo de ejecución del test).
    expect(umbralMs).toBeGreaterThan(14 * 60_000);
    expect(umbralMs).toBeLessThan(16 * 60_000);
  });

  it("respeta CROSSCHEX_SYNC_STALE_MINUTES si está configurado", async () => {
    process.env.CROSSCHEX_SYNC_STALE_MINUTES = "5";
    const antes = Date.now();
    const { recuperarSincronizacionesBiometricoInterrumpidas } =
      await import("./crosschex-recovery");

    await recuperarSincronizacionesBiometricoInterrumpidas();

    const args = updateManyMock.mock.calls[0][0];
    const umbralMs = antes - args.where.iniciadoEn.lt.getTime();
    expect(umbralMs).toBeGreaterThan(4 * 60_000);
    expect(umbralMs).toBeLessThan(6 * 60_000);
  });

  it("ignora un CROSSCHEX_SYNC_STALE_MINUTES inválido y cae al default de 15", async () => {
    process.env.CROSSCHEX_SYNC_STALE_MINUTES = "no-es-un-numero";
    const antes = Date.now();
    const { recuperarSincronizacionesBiometricoInterrumpidas } =
      await import("./crosschex-recovery");

    await recuperarSincronizacionesBiometricoInterrumpidas();

    const args = updateManyMock.mock.calls[0][0];
    const umbralMs = antes - args.where.iniciadoEn.lt.getTime();
    expect(umbralMs).toBeGreaterThan(14 * 60_000);
    expect(umbralMs).toBeLessThan(16 * 60_000);
  });

  it("marca FALLIDO con finalizadoEn y mensajeError, y devuelve el count", async () => {
    updateManyMock.mockResolvedValue({ count: 2 });
    const { recuperarSincronizacionesBiometricoInterrumpidas } =
      await import("./crosschex-recovery");

    const count = await recuperarSincronizacionesBiometricoInterrumpidas();

    expect(count).toBe(2);
    const args = updateManyMock.mock.calls[0][0];
    expect(args.data.estado).toBe("FALLIDO");
    expect(args.data.finalizadoEn).toBeInstanceOf(Date);
    expect(args.data.mensajeError).toMatch(/EN_CURSO/);
  });

  it("excluye las corridas que el proceso sigue ejecutando (no son huérfanas) y lo indica en el mensaje del ciclo", async () => {
    const { recuperarSincronizacionesBiometricoInterrumpidas } =
      await import("./crosschex-recovery");

    await recuperarSincronizacionesBiometricoInterrumpidas({
      excluirIds: ["log-vivo"],
      momento: "ciclo",
    });

    const args = updateManyMock.mock.calls[0][0];
    expect(args.where.id).toEqual({ notIn: ["log-vivo"] });
    expect(args.where.estado).toBe("EN_CURSO");
    expect(args.data.mensajeError).toMatch(/ciclo posterior/);
  });

  it("sin exclusiones no agrega filtro por id (al arrancar no hay corridas vivas)", async () => {
    const { recuperarSincronizacionesBiometricoInterrumpidas } =
      await import("./crosschex-recovery");

    await recuperarSincronizacionesBiometricoInterrumpidas();

    expect(updateManyMock.mock.calls[0][0].where.id).toBeUndefined();
  });
});
