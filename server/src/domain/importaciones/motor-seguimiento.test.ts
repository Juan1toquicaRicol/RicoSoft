import { describe, it, expect } from "vitest";
import {
  calcularActividadesVencidas,
  calcularActividadesBloqueadas,
  generarNovedadesSugeridas,
  calcularSituacionActual,
  type ActividadSeguimiento,
} from "./motor-seguimiento";

const ahora = new Date("2026-09-10T00:00:00Z");

const actividad = (overrides: Partial<ActividadSeguimiento> = {}): ActividadSeguimiento => ({
  id: "a1",
  ordenCompraId: "orden1",
  nombre: "Enviar documentos",
  etapa: "Documentación",
  responsableTipo: "Proveedor",
  responsableNombre: null,
  fechaLimite: new Date("2026-09-01T00:00:00Z"),
  fechaReal: null,
  estado: "Pendiente",
  dependeDeId: null,
  ...overrides,
});

describe("calcularActividadesVencidas", () => {
  it("marca vencida una actividad Pendiente con fechaLimite en el pasado", () => {
    const r = calcularActividadesVencidas([actividad()], ahora);
    expect(r).toHaveLength(1);
  });

  it("no marca vencida una actividad ya Completada, aunque la fecha límite haya pasado", () => {
    const r = calcularActividadesVencidas([actividad({ estado: "Completada" })], ahora);
    expect(r).toHaveLength(0);
  });

  it("no marca vencida una actividad sin fechaLimite", () => {
    const r = calcularActividadesVencidas([actividad({ fechaLimite: null })], ahora);
    expect(r).toHaveLength(0);
  });

  it("no marca vencida una actividad cuya fechaLimite todavía no llega", () => {
    const r = calcularActividadesVencidas(
      [actividad({ fechaLimite: new Date("2026-12-01T00:00:00Z") })],
      ahora,
    );
    expect(r).toHaveLength(0);
  });
});

describe("calcularActividadesBloqueadas", () => {
  it("detecta una actividad bloqueada por una dependencia no completada", () => {
    const a = actividad({ id: "a", nombre: "A", estado: "Pendiente" });
    const b = actividad({ id: "b", nombre: "B", estado: "Pendiente", dependeDeId: "a" });
    const r = calcularActividadesBloqueadas([a, b]);
    expect(r).toHaveLength(1);
    expect(r[0].actividad.id).toBe("b");
    expect(r[0].bloqueadaPor.id).toBe("a");
  });

  it("no bloquea si la dependencia ya está Completada", () => {
    const a = actividad({ id: "a", estado: "Completada" });
    const b = actividad({ id: "b", dependeDeId: "a" });
    const r = calcularActividadesBloqueadas([a, b]);
    expect(r).toHaveLength(0);
  });

  it("no reporta bloqueo si la actividad dependiente ya está Completada (no hay nada que bloquear)", () => {
    const a = actividad({ id: "a", estado: "Pendiente" });
    const b = actividad({ id: "b", dependeDeId: "a", estado: "Completada" });
    const r = calcularActividadesBloqueadas([a, b]);
    expect(r).toHaveLength(0);
  });
});

describe("generarNovedadesSugeridas", () => {
  it("genera novedad de tipo Retraso para una actividad vencida, con origen PorDeterminar aunque el responsable sea externo", () => {
    const r = generarNovedadesSugeridas([actividad({ responsableTipo: "Proveedor" })], ahora);
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe("Retraso");
    expect(r[0].origen).toBe("PorDeterminar");
    expect(r[0].reglaOrigen).toBe("actividad-vencida:a1");
    // El responsable de la actividad se conserva solo como contexto operativo.
    expect(r[0].responsable).toBe("Proveedor");
  });

  it("origen PorDeterminar también cuando el responsable es Interno (no se atribuye causa a Ricol)", () => {
    const r = generarNovedadesSugeridas([actividad({ responsableTipo: "Interno" })], ahora);
    expect(r[0].origen).toBe("PorDeterminar");
  });

  it("origen PorDeterminar sin responsableTipo asignado", () => {
    const r = generarNovedadesSugeridas([actividad({ responsableTipo: "" })], ahora);
    expect(r[0].origen).toBe("PorDeterminar");
  });

  it("una novedad por dependencia bloqueada tampoco atribuye causa a quien tiene la actividad previa", () => {
    const a = actividad({
      id: "a",
      estado: "Pendiente",
      responsableTipo: "Naviera",
      fechaLimite: null,
    });
    const b = actividad({ id: "b", dependeDeId: "a", estado: "Pendiente", fechaLimite: null });
    const r = generarNovedadesSugeridas([a, b], ahora);
    const bloqueo = r.find((n) => n.reglaOrigen === "dependencia-bloqueada:b");
    expect(bloqueo?.origen).toBe("PorDeterminar");
    expect(bloqueo?.responsable).toBe("Naviera");
  });

  it("marca prioridad Alta cuando el retraso es de 5 días o más", () => {
    const r = generarNovedadesSugeridas(
      [actividad({ fechaLimite: new Date("2026-09-01T00:00:00Z") })], // 9 días de retraso vs. `ahora`
      ahora,
    );
    expect(r[0].prioridad).toBe("Alta");
  });

  it("marca prioridad Media cuando el retraso es menor a 5 días", () => {
    const r = generarNovedadesSugeridas(
      [actividad({ fechaLimite: new Date("2026-09-08T00:00:00Z") })], // 2 días de retraso
      ahora,
    );
    expect(r[0].prioridad).toBe("Media");
  });

  it("genera novedad de tipo Bloqueo para una dependencia incumplida", () => {
    const a = actividad({ id: "a", estado: "Pendiente", fechaLimite: null });
    const b = actividad({ id: "b", dependeDeId: "a", fechaLimite: null });
    const r = generarNovedadesSugeridas([a, b], ahora);
    expect(r.some((n) => n.tipo === "Bloqueo" && n.reglaOrigen === "dependencia-bloqueada:b")).toBe(
      true,
    );
  });

  it("con una lista vacía, no genera ninguna novedad", () => {
    expect(generarNovedadesSugeridas([], ahora)).toEqual([]);
  });
});

describe("calcularSituacionActual", () => {
  it("prioriza la actividad vencida más antigua sobre las demás pendientes", () => {
    const vieja = actividad({
      id: "vieja",
      nombre: "Vieja",
      fechaLimite: new Date("2026-08-01T00:00:00Z"),
    });
    const reciente = actividad({
      id: "reciente",
      nombre: "Reciente",
      fechaLimite: new Date("2026-09-05T00:00:00Z"),
    });
    const r = calcularSituacionActual([reciente, vieja], ahora);
    expect(r.atencion).toBe("Vieja");
    expect(r.diasRetraso).toBeGreaterThan(30);
  });

  it("sin vencidas, muestra la próxima actividad pendiente por fecha límite", () => {
    const r = calcularSituacionActual(
      [actividad({ fechaLimite: new Date("2026-12-01T00:00:00Z"), nombre: "Futura" })],
      ahora,
    );
    expect(r.atencion).toBeNull();
    expect(r.proximaAccion).toBe("Futura");
  });

  it("sin ninguna actividad pendiente, reporta 'Sin actividades registradas'", () => {
    const r = calcularSituacionActual([actividad({ estado: "Completada" })], ahora);
    expect(r.etapaActual).toBe("Sin actividades registradas");
    expect(r.proximaAccion).toBeNull();
  });

  it("con una lista vacía, no lanza y reporta estado neutro", () => {
    const r = calcularSituacionActual([], ahora);
    expect(r.etapaActual).toBe("Sin actividades registradas");
  });
});
