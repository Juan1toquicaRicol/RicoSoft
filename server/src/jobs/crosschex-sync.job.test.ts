import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Mockea node-cron, prisma y el servicio de sincronización — estos tests no
 * requieren MDB real, BD real, ni esperar minutos reales de reloj: verifican
 * la orquestación (qué se llama, cuándo, y cómo se comporta ante lock
 * ocupado / fallos / ausencia de fuentes) de forma determinista.
 */

const scheduleMock = vi.fn();
const stopMock = vi.fn();

vi.mock("node-cron", () => ({
  schedule: (...args: unknown[]) => {
    scheduleMock(...args);
    return { stop: stopMock };
  },
}));

const fuenteFindManyMock = vi.fn();
vi.mock("../config/prisma", () => ({
  prisma: {
    fuenteBiometrica: {
      findMany: (...args: unknown[]) => fuenteFindManyMock(...args),
    },
  },
}));

const sincronizarFuenteBiometricaMock = vi.fn();

class SincronizacionEnCursoErrorFake extends Error {}

vi.mock("../modules/gestion-humana/biometrico-import.service", () => ({
  sincronizarFuenteBiometrica: (...args: unknown[]) => sincronizarFuenteBiometricaMock(...args),
  SincronizacionEnCursoError: SincronizacionEnCursoErrorFake,
}));

const REPORTE_OK = (overrides: Partial<Record<string, unknown>> = {}) => ({
  fuenteNombre: "fuente-1",
  logIdDesde: 0,
  logIdHasta: 10,
  leidos: 5,
  insertados: 5,
  duplicados: 0,
  sinEmpleado: 0,
  erroresCount: 0,
  estado: "COMPLETADO" as const,
  ...overrides,
});

describe("crosschex-sync.job", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    scheduleMock.mockReset();
    stopMock.mockReset();
    fuenteFindManyMock.mockReset();
    sincronizarFuenteBiometricaMock.mockReset();
    process.env = { ...envOriginal };
    delete process.env.CROSSCHEX_SYNC_ENABLED;
    delete process.env.CROSSCHEX_SYNC_CRON;
    delete process.env.CROSSCHEX_SYNC_BATCH_SIZE;
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  describe("leerConfigSchedulerCrossChex", () => {
    it("está deshabilitado por defecto (nunca corre automáticamente sin configuración explícita)", async () => {
      const { leerConfigSchedulerCrossChex } = await import("./crosschex-sync.job");
      expect(leerConfigSchedulerCrossChex().habilitado).toBe(false);
    });

    it("usa cron cada minuto y lote 1000 por defecto cuando está habilitado", async () => {
      process.env.CROSSCHEX_SYNC_ENABLED = "true";
      const { leerConfigSchedulerCrossChex } = await import("./crosschex-sync.job");
      const config = leerConfigSchedulerCrossChex();
      expect(config.habilitado).toBe(true);
      expect(config.expresionCron).toBe("* * * * *");
      expect(config.tamanoLote).toBe(1000);
    });

    it("respeta overrides de cron y tamaño de lote", async () => {
      process.env.CROSSCHEX_SYNC_ENABLED = "true";
      process.env.CROSSCHEX_SYNC_CRON = "*/5 * * * *";
      process.env.CROSSCHEX_SYNC_BATCH_SIZE = "250";
      const { leerConfigSchedulerCrossChex } = await import("./crosschex-sync.job");
      const config = leerConfigSchedulerCrossChex();
      expect(config.expresionCron).toBe("*/5 * * * *");
      expect(config.tamanoLote).toBe(250);
    });
  });

  describe("iniciarSchedulerCrossChex", () => {
    it("no registra nada en node-cron si el scheduler está deshabilitado", async () => {
      const { iniciarSchedulerCrossChex } = await import("./crosschex-sync.job");
      const tarea = iniciarSchedulerCrossChex();
      expect(tarea).toBeNull();
      expect(scheduleMock).not.toHaveBeenCalled();
    });

    it("registra la tarea con la expresión cron configurada y noOverlap activado", async () => {
      process.env.CROSSCHEX_SYNC_ENABLED = "true";
      process.env.CROSSCHEX_SYNC_CRON = "*/2 * * * *";
      const { iniciarSchedulerCrossChex } = await import("./crosschex-sync.job");

      iniciarSchedulerCrossChex();

      expect(scheduleMock).toHaveBeenCalledTimes(1);
      const [expresion, , opciones] = scheduleMock.mock.calls[0];
      expect(expresion).toBe("*/2 * * * *");
      expect(opciones).toMatchObject({ noOverlap: true });
    });

    it("no arranca nada de inmediato al registrar: solo se llama sincronizarFuenteBiometrica cuando el cron dispara el callback", async () => {
      process.env.CROSSCHEX_SYNC_ENABLED = "true";
      const { iniciarSchedulerCrossChex } = await import("./crosschex-sync.job");

      iniciarSchedulerCrossChex();

      expect(fuenteFindManyMock).not.toHaveBeenCalled();
      expect(sincronizarFuenteBiometricaMock).not.toHaveBeenCalled();
    });

    it("llamar dos veces no duplica la tarea registrada", async () => {
      process.env.CROSSCHEX_SYNC_ENABLED = "true";
      const { iniciarSchedulerCrossChex } = await import("./crosschex-sync.job");

      iniciarSchedulerCrossChex();
      iniciarSchedulerCrossChex();

      expect(scheduleMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("ejecutarCicloSincronizacionCrossChex", () => {
    it("sincroniza cada fuente activa, una por una", async () => {
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }, { nombre: "sede-b" }]);
      sincronizarFuenteBiometricaMock.mockResolvedValue(REPORTE_OK());

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await ejecutarCicloSincronizacionCrossChex(500);

      expect(fuenteFindManyMock).toHaveBeenCalledWith({
        where: { activa: true },
        select: { nombre: true },
      });
      expect(sincronizarFuenteBiometricaMock).toHaveBeenCalledTimes(2);
      expect(sincronizarFuenteBiometricaMock).toHaveBeenNthCalledWith(1, "sede-a", {
        tamanoLote: 500,
      });
      expect(sincronizarFuenteBiometricaMock).toHaveBeenNthCalledWith(2, "sede-b", {
        tamanoLote: 500,
      });
    });

    it("una fuente con lock ocupado (SincronizacionEnCursoError) se omite sin detener el ciclo para las demás", async () => {
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }, { nombre: "sede-b" }]);
      sincronizarFuenteBiometricaMock
        .mockRejectedValueOnce(new SincronizacionEnCursoErrorFake("ya en curso"))
        .mockResolvedValueOnce(REPORTE_OK({ fuenteNombre: "sede-b" }));

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await expect(ejecutarCicloSincronizacionCrossChex()).resolves.toBeUndefined();

      expect(sincronizarFuenteBiometricaMock).toHaveBeenCalledTimes(2);
    });

    it("un error inesperado en una fuente no detiene el ciclo para las demás", async () => {
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }, { nombre: "sede-b" }]);
      sincronizarFuenteBiometricaMock
        .mockRejectedValueOnce(new Error("fallo de red inesperado"))
        .mockResolvedValueOnce(REPORTE_OK({ fuenteNombre: "sede-b" }));

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await expect(ejecutarCicloSincronizacionCrossChex()).resolves.toBeUndefined();

      expect(sincronizarFuenteBiometricaMock).toHaveBeenCalledTimes(2);
    });

    it("una corrida que termina en estado FALLIDO no lanza excepción (ya viene resuelta con el reporte)", async () => {
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }]);
      sincronizarFuenteBiometricaMock.mockResolvedValue(
        REPORTE_OK({ estado: "FALLIDO", mensajeError: "columna inválida" }),
      );

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await expect(ejecutarCicloSincronizacionCrossChex()).resolves.toBeUndefined();
    });

    it("sin fuentes activas, no llama a sincronizarFuenteBiometrica y termina sin error", async () => {
      fuenteFindManyMock.mockResolvedValue([]);

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await ejecutarCicloSincronizacionCrossChex();

      expect(sincronizarFuenteBiometricaMock).not.toHaveBeenCalled();
    });

    it("una corrida sin marcaciones nuevas (leidos=0) se procesa igual, sin error", async () => {
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }]);
      sincronizarFuenteBiometricaMock.mockResolvedValue(REPORTE_OK({ leidos: 0, insertados: 0 }));

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await expect(ejecutarCicloSincronizacionCrossChex()).resolves.toBeUndefined();
      expect(sincronizarFuenteBiometricaMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("detenerSchedulerCrossChex", () => {
    it("detiene la tarea programada y permite volver a iniciar después", async () => {
      process.env.CROSSCHEX_SYNC_ENABLED = "true";
      const { iniciarSchedulerCrossChex, detenerSchedulerCrossChex } =
        await import("./crosschex-sync.job");

      iniciarSchedulerCrossChex();
      detenerSchedulerCrossChex();
      expect(stopMock).toHaveBeenCalledTimes(1);

      iniciarSchedulerCrossChex();
      expect(scheduleMock).toHaveBeenCalledTimes(2);
    });
  });
});
