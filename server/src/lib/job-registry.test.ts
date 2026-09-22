import { beforeEach, describe, it, expect } from "vitest";
import {
  JOBS_CONOCIDOS,
  ejecutarRegistrado,
  listarEstadoJobs,
  quitarScheduler,
  registrarScheduler,
  reiniciarRegistroJobs,
  reportarFalloEnCorrida,
  resumirError,
} from "./job-registry";
import {
  componerJobsMonitoreados,
  estadoSincronizacionProveedores,
} from "../modules/monitoreo/jobs-monitoreo";

const estadoDe = (id: string) => listarEstadoJobs().find((j) => j.id === id)!;

beforeEach(() => reiniciarRegistroJobs());

describe("registro de jobs", () => {
  it("un job cuyo scheduler no se registró figura NO_CONFIGURADO, con cómo habilitarlo y sin ejecuciones inventadas", () => {
    const job = estadoDe("tracking-maritimo");
    expect(job.estado).toBe("NO_CONFIGURADO");
    expect(job.motivo).toMatch(/TRACKING_MARITIMO_SYNC_ENABLED/);
    expect(job.ultimaEjecucion).toBeNull();
    expect(job.proximaEjecucion).toBeNull();
    expect(listarEstadoJobs()).toHaveLength(JOBS_CONOCIDOS.length);
  });

  it("registrado y sin haber corrido: PROGRAMADO con su cron y próxima ejecución", () => {
    const proxima = new Date("2026-09-22T06:00:00Z");
    registrarScheduler("servicios-renovacion", "0 6 * * *", { getNextRun: () => proxima });
    const job = estadoDe("servicios-renovacion");
    expect(job.estado).toBe("PROGRAMADO");
    expect(job.cron).toBe("0 6 * * *");
    expect(job.proximaEjecucion).toBe(proxima.toISOString());
    expect(job.ultimaEjecucion).toBeNull();
  });

  it("una corrida exitosa queda OK, con última ejecución, última exitosa y duración", async () => {
    registrarScheduler("crosschex-sync", "* * * * *", null);
    await ejecutarRegistrado("crosschex-sync", async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    const job = estadoDe("crosschex-sync");
    expect(job.estado).toBe("OK");
    expect(job.ultimaEjecucion).not.toBeNull();
    expect(job.ultimaEjecucionExitosa).toBe(job.ultimaEjecucion);
    expect(job.ultimaEjecucionFallida).toBeNull();
    expect(job.duracionUltimaMs).toBeGreaterThanOrEqual(10);
    expect(job.mensajeUltimoError).toBeNull();
  });

  it("una corrida que lanza queda FALLIDO con el error RESUMIDO, y el error se relanza", async () => {
    registrarScheduler("bandeja-ingesta", "*/5 * * * *", null);
    const stack = "Fallo al leer el buzón\n    at leer (C:\\secretos\\ruta.ts:10:5)";
    await expect(
      ejecutarRegistrado("bandeja-ingesta", async () => {
        throw new Error(stack);
      }),
    ).rejects.toThrow("Fallo al leer el buzón");
    const job = estadoDe("bandeja-ingesta");
    expect(job.estado).toBe("FALLIDO");
    expect(job.ultimaEjecucionFallida).not.toBeNull();
    expect(job.ultimaEjecucionExitosa).toBeNull();
    expect(job.mensajeUltimoError).toBe("Fallo al leer el buzón");
    expect(JSON.stringify(job)).not.toContain("secretos");
  });

  it("conserva la última exitosa y la última fallida por separado, y el estado es el de la MÁS reciente", async () => {
    registrarScheduler("bandeja-procesamiento", "* * * * *", null);
    await ejecutarRegistrado("bandeja-procesamiento", async () => undefined);
    await expect(
      ejecutarRegistrado("bandeja-procesamiento", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow();
    let job = estadoDe("bandeja-procesamiento");
    expect(job.estado).toBe("FALLIDO");
    expect(job.ultimaEjecucionExitosa).not.toBeNull();
    expect(job.ultimaEjecucionFallida).not.toBeNull();

    await ejecutarRegistrado("bandeja-procesamiento", async () => undefined);
    job = estadoDe("bandeja-procesamiento");
    expect(job.estado).toBe("OK");
    expect(job.mensajeUltimoError).toBeNull();
    expect(job.ultimaEjecucionFallida).not.toBeNull(); // el historial de fallos se conserva
  });

  it("mientras corre figura EN_EJECUCION", async () => {
    registrarScheduler("tracking-maritimo", "0 * * * *", null);
    let liberar!: () => void;
    const corrida = ejecutarRegistrado(
      "tracking-maritimo",
      () => new Promise<void>((r) => (liberar = r)),
    );
    expect(estadoDe("tracking-maritimo").estado).toBe("EN_EJECUCION");
    liberar();
    await corrida;
    expect(estadoDe("tracking-maritimo").estado).toBe("OK");
  });

  it("un ciclo que atrapa sus propios errores puede reportar el fallo sin lanzar", async () => {
    registrarScheduler("crosschex-sync", "* * * * *", null);
    await ejecutarRegistrado("crosschex-sync", async () => {
      reportarFalloEnCorrida("crosschex-sync", '"Sede Norte": columna inválida');
    });
    const job = estadoDe("crosschex-sync");
    expect(job.estado).toBe("FALLIDO");
    expect(job.mensajeUltimoError).toBe('"Sede Norte": columna inválida');
    // La corrida siguiente, limpia, no arrastra el fallo anterior.
    await ejecutarRegistrado("crosschex-sync", async () => undefined);
    expect(estadoDe("crosschex-sync").estado).toBe("OK");
  });

  it("reportar un fallo fuera de una corrida no ensucia el estado", () => {
    registrarScheduler("crosschex-sync", "* * * * *", null);
    reportarFalloEnCorrida("crosschex-sync", "no debería quedar");
    expect(estadoDe("crosschex-sync").estado).toBe("PROGRAMADO");
  });

  it("ejecutarRegistrado sobre un job no registrado no falla ni inventa estado", async () => {
    await expect(ejecutarRegistrado("tracking-maritimo", async () => 42)).resolves.toBe(42);
    expect(estadoDe("tracking-maritimo").estado).toBe("NO_CONFIGURADO");
  });

  it("detener el scheduler lo devuelve a NO_CONFIGURADO", () => {
    registrarScheduler("servicios-renovacion", "0 6 * * *", null);
    quitarScheduler("servicios-renovacion");
    expect(estadoDe("servicios-renovacion").estado).toBe("NO_CONFIGURADO");
  });

  it("resumirError toma solo la primera línea y acota la longitud", () => {
    expect(resumirError(new Error("a\nb\nc"))).toBe("a");
    expect(resumirError("x".repeat(500)).length).toBe(200);
    expect(resumirError(new Error(""))).toBe("Error desconocido");
  });
});

describe("vista unificada de jobs para monitoreo", () => {
  it("incluye schedulers reales, la sincronización a demanda y las funciones SIN proceso como No configurado", () => {
    const jobs = componerJobsMonitoreados(
      estadoSincronizacionProveedores({
        ultimo: null,
        ultimoCompletado: null,
        ultimoFallido: null,
      }),
    );
    const porOrigen = (o: string) => jobs.filter((j) => j.origen === o);
    expect(porOrigen("SCHEDULER")).toHaveLength(JOBS_CONOCIDOS.length);
    expect(porOrigen("BAJO_DEMANDA")).toHaveLength(1);
    const inexistentes = porOrigen("NO_EXISTE");
    expect(inexistentes.map((j) => j.id).sort()).toEqual([
      "cola-notificaciones",
      "sincronizacion-catalogos",
    ]);
    for (const j of inexistentes) {
      expect(j.estado).toBe("NO_CONFIGURADO");
      expect(j.ultimaEjecucion).toBeNull();
    }
  });

  it("la sincronización de proveedores refleja su log persistido (último, exitoso, fallido, duración)", () => {
    const t = (iso: string) => new Date(iso);
    const job = estadoSincronizacionProveedores({
      ultimo: {
        estado: "FALLIDO",
        iniciadoEn: t("2026-09-20T10:00:00Z"),
        finalizadoEn: t("2026-09-20T10:00:30Z"),
        mensajeError: "Timeout de conexión con Siesa\n  at conectar",
      },
      ultimoCompletado: {
        estado: "COMPLETADO",
        iniciadoEn: t("2026-09-19T10:00:00Z"),
        finalizadoEn: t("2026-09-19T10:01:00Z"),
        mensajeError: null,
      },
      ultimoFallido: {
        estado: "FALLIDO",
        iniciadoEn: t("2026-09-20T10:00:00Z"),
        finalizadoEn: t("2026-09-20T10:00:30Z"),
        mensajeError: "x",
      },
    });
    expect(job.estado).toBe("FALLIDO");
    expect(job.ultimaEjecucion).toBe("2026-09-20T10:00:00.000Z");
    expect(job.ultimaEjecucionExitosa).toBe("2026-09-19T10:00:00.000Z");
    expect(job.ultimaEjecucionFallida).toBe("2026-09-20T10:00:00.000Z");
    expect(job.duracionUltimaMs).toBe(30_000);
    expect(job.mensajeUltimoError).toBe("Timeout de conexión con Siesa");
  });

  it("estados de la sincronización: en curso, completada y cancelada (no es un fallo)", () => {
    const log = (estado: string) => ({
      ultimo: {
        estado,
        iniciadoEn: new Date("2026-09-20T10:00:00Z"),
        finalizadoEn: null,
        mensajeError: null,
      },
      ultimoCompletado: null,
      ultimoFallido: null,
    });
    expect(estadoSincronizacionProveedores(log("EN_CURSO")).estado).toBe("EN_EJECUCION");
    expect(estadoSincronizacionProveedores(log("EN_COLA")).estado).toBe("EN_EJECUCION");
    expect(estadoSincronizacionProveedores(log("COMPLETADO")).estado).toBe("OK");
    expect(estadoSincronizacionProveedores(log("CANCELADO")).estado).toBe("OK");
    expect(estadoSincronizacionProveedores(log("EN_CURSO")).duracionUltimaMs).toBeNull();
  });

  it("sin ninguna ejecución previa lo dice explícitamente", () => {
    const job = estadoSincronizacionProveedores({
      ultimo: null,
      ultimoCompletado: null,
      ultimoFallido: null,
    });
    expect(job.motivo).toMatch(/Aún no se ha ejecutado/);
    expect(job.ultimaEjecucion).toBeNull();
  });
});
