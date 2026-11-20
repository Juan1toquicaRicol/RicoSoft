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
class FuenteBiometricaSinPropietarioErrorFake extends Error {}

const idsActivasMock = vi.fn();

vi.mock("../modules/gestion-humana/biometrico-import.service", () => ({
  sincronizarFuenteBiometrica: (...args: unknown[]) => sincronizarFuenteBiometricaMock(...args),
  SincronizacionEnCursoError: SincronizacionEnCursoErrorFake,
  idsCorridasBiometricoActivasEnProceso: () => idsActivasMock(),
  FuenteBiometricaSinPropietarioError: FuenteBiometricaSinPropietarioErrorFake,
}));

const recuperarMock = vi.fn();
vi.mock("./crosschex-recovery", () => ({
  recuperarSincronizacionesBiometricoInterrumpidas: (...args: unknown[]) => recuperarMock(...args),
}));

const reportarFalloMock = vi.fn();
vi.mock("../lib/job-registry", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/job-registry")>();
  return {
    ...real,
    reportarFalloEnCorrida: (...args: unknown[]) => reportarFalloMock(...args),
  };
});

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
    idsActivasMock.mockReset();
    idsActivasMock.mockReturnValue([]);
    recuperarMock.mockReset();
    recuperarMock.mockResolvedValue(0);
    reportarFalloMock.mockReset();
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
    it("sincroniza la fuente activa", async () => {
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }]);
      sincronizarFuenteBiometricaMock.mockResolvedValue(REPORTE_OK());

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await ejecutarCicloSincronizacionCrossChex(500);

      expect(fuenteFindManyMock).toHaveBeenCalledWith({
        where: { activa: true },
        select: { nombre: true },
      });
      expect(sincronizarFuenteBiometricaMock).toHaveBeenCalledTimes(1);
      expect(sincronizarFuenteBiometricaMock).toHaveBeenCalledWith("sede-a", { tamanoLote: 500 });
    });

    it("con más de una fuente activa NO sincroniza ninguna (un solo .mdb por instalación) y lo deja registrado", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }, { nombre: "sede-b" }]);

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await expect(ejecutarCicloSincronizacionCrossChex()).resolves.toBeUndefined();

      expect(sincronizarFuenteBiometricaMock).not.toHaveBeenCalled();
      const mensaje = String(error.mock.calls[0]?.[0]);
      expect(mensaje).toContain("2 fuentes biométricas activas");
      // El mensaje no revela nombres de fuentes (podrían ser de otro tenant).
      expect(mensaje).not.toContain("sede-a");
      expect(mensaje).not.toContain("sede-b");
      error.mockRestore();
    });

    it("una fuente con lock ocupado (SincronizacionEnCursoError) se omite sin lanzar", async () => {
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }]);
      sincronizarFuenteBiometricaMock.mockRejectedValueOnce(
        new SincronizacionEnCursoErrorFake("ya en curso"),
      );

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await expect(ejecutarCicloSincronizacionCrossChex()).resolves.toBeUndefined();

      expect(sincronizarFuenteBiometricaMock).toHaveBeenCalledTimes(1);
    });

    it("D-01: sin propietario configurado no sincroniza, no lanza y lo deja visible en Monitoreo con un mensaje genérico", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }]);
      sincronizarFuenteBiometricaMock.mockRejectedValueOnce(
        new FuenteBiometricaSinPropietarioErrorFake("sin propietario"),
      );

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await expect(ejecutarCicloSincronizacionCrossChex()).resolves.toBeUndefined();

      expect(reportarFalloMock).toHaveBeenCalledTimes(1);
      const mensaje = String(reportarFalloMock.mock.calls[0][1]);
      expect(mensaje).toContain("CROSSCHEX_TENANT_PROPIETARIO_ID");
      expect(mensaje).not.toContain("sede-a");
      error.mockRestore();
    });

    it("un error inesperado en la fuente no lanza: queda en el log del proceso", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }]);
      sincronizarFuenteBiometricaMock.mockRejectedValueOnce(new Error("fallo de red inesperado"));

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await expect(ejecutarCicloSincronizacionCrossChex()).resolves.toBeUndefined();

      expect(sincronizarFuenteBiometricaMock).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalled();
      error.mockRestore();
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

    it("en cada ciclo libera candados EN_CURSO huérfanos, sin tocar las corridas vivas de este proceso, y lo reporta a Monitoreo", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      idsActivasMock.mockReturnValue(["log-vivo"]);
      recuperarMock.mockResolvedValue(1);
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }]);
      sincronizarFuenteBiometricaMock.mockResolvedValue(REPORTE_OK());

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await ejecutarCicloSincronizacionCrossChex();

      expect(recuperarMock).toHaveBeenCalledWith({ excluirIds: ["log-vivo"], momento: "ciclo" });
      // La recuperación va ANTES de intentar sincronizar: el candado ya quedó libre.
      expect(recuperarMock.mock.invocationCallOrder[0]).toBeLessThan(
        sincronizarFuenteBiometricaMock.mock.invocationCallOrder[0],
      );
      expect(reportarFalloMock).toHaveBeenCalledTimes(1);
      expect(String(reportarFalloMock.mock.calls[0][1])).not.toContain("sede-a");
      error.mockRestore();
    });

    it("si la recuperación falla, el ciclo sigue y sincroniza igual", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      recuperarMock.mockRejectedValue(new Error("BD no disponible"));
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }]);
      sincronizarFuenteBiometricaMock.mockResolvedValue(REPORTE_OK());

      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await expect(ejecutarCicloSincronizacionCrossChex()).resolves.toBeUndefined();
      expect(sincronizarFuenteBiometricaMock).toHaveBeenCalledTimes(1);
      error.mockRestore();
    });

    it("lo que va a Monitoreo (estado global, visible para otros tenants) no lleva el nombre de la fuente ni el error técnico", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      fuenteFindManyMock.mockResolvedValue([{ nombre: "sede-a" }]);
      sincronizarFuenteBiometricaMock.mockResolvedValueOnce(
        REPORTE_OK({ estado: "FALLIDO", mensajeError: "No se encontró C:\\ruta\\CrossChex.mdb" }),
      );
      const { ejecutarCicloSincronizacionCrossChex } = await import("./crosschex-sync.job");
      await ejecutarCicloSincronizacionCrossChex();

      sincronizarFuenteBiometricaMock.mockRejectedValueOnce(
        new Error("ODBC: C:\\ruta\\CrossChex.mdb bloqueado"),
      );
      await ejecutarCicloSincronizacionCrossChex();

      expect(reportarFalloMock).toHaveBeenCalledTimes(2);
      for (const [, mensaje] of reportarFalloMock.mock.calls) {
        expect(String(mensaje)).not.toContain("sede-a");
        expect(String(mensaje)).not.toContain("CrossChex.mdb");
      }
      error.mockRestore();
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
