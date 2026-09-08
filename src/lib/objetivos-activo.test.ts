import { describe, expect, it } from "vitest";
import { elegirObjetivoActivoGerencial } from "./objetivos-activo";
import type { Objetivo } from "@/hooks/use-objetivos";

function objetivo(overrides: Partial<Objetivo>): Objetivo {
  return {
    id: "obj-1",
    nivel: "EMPRESA",
    vendedorSiesaRowId: null,
    vendedorSiesaNombre: null,
    tipoPeriodo: "MENSUAL",
    fechaInicio: "2026-01-01",
    fechaFin: "2026-01-31",
    anio: 2026,
    metaValor: 1000,
    metaVolumenKg: null,
    metaInventario: null,
    tipoMetaInventario: null,
    descripcion: null,
    estado: "ACTIVO",
    estadoDerivado: "ACTIVO",
    creadoPorNombre: "Test",
    asignadoPorNombre: null,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

const HOY = new Date("2026-09-15T12:00:00Z");

describe("elegirObjetivoActivoGerencial", () => {
  it("devuelve null cuando no hay objetivos", () => {
    expect(elegirObjetivoActivoGerencial([], HOY)).toBeNull();
  });

  it("ignora los CANCELADO", () => {
    const cancelado = objetivo({
      id: "cancelado",
      estado: "CANCELADO",
      fechaInicio: "2026-09-01",
      fechaFin: "2026-09-30",
    });
    expect(elegirObjetivoActivoGerencial([cancelado], HOY)).toBeNull();
  });

  it("prefiere el objetivo cuyo rango contiene hoy, sin importar el orden de entrada", () => {
    const trimestral = objetivo({
      id: "trimestral-en-curso",
      tipoPeriodo: "TRIMESTRAL",
      fechaInicio: "2026-07-01",
      fechaFin: "2026-09-30",
    });
    const cerradoAntes = objetivo({
      id: "mensual-cerrado",
      fechaInicio: "2026-06-01",
      fechaFin: "2026-06-30",
    });
    const futuro = objetivo({
      id: "anual-futuro",
      tipoPeriodo: "ANUAL",
      fechaInicio: "2027-01-01",
      fechaFin: "2027-12-31",
    });
    const elegido = elegirObjetivoActivoGerencial([futuro, cerradoAntes, trimestral], HOY);
    expect(elegido?.id).toBe("trimestral-en-curso");
  });

  it("no se limita al año calendario de 'hoy': un objetivo anual que empezó el año pasado y sigue vigente cuenta como en curso", () => {
    const anualCruzaAnio = objetivo({
      id: "anual-cruza",
      tipoPeriodo: "ANUAL",
      fechaInicio: "2025-10-01",
      fechaFin: "2026-09-30",
      anio: 2025,
    });
    expect(elegirObjetivoActivoGerencial([anualCruzaAnio], HOY)?.id).toBe("anual-cruza");
  });

  it("si ninguno está en curso, elige el cerrado más reciente (fechaFin más alta)", () => {
    const cerradoViejo = objetivo({
      id: "viejo",
      fechaInicio: "2026-01-01",
      fechaFin: "2026-01-31",
    });
    const cerradoReciente = objetivo({
      id: "reciente",
      fechaInicio: "2026-08-01",
      fechaFin: "2026-08-31",
    });
    const elegido = elegirObjetivoActivoGerencial([cerradoViejo, cerradoReciente], HOY);
    expect(elegido?.id).toBe("reciente");
  });

  it("si no hay ninguno en curso ni cerrado, elige el próximo a comenzar", () => {
    const lejano = objetivo({ id: "lejano", fechaInicio: "2027-06-01", fechaFin: "2027-06-30" });
    const proximo = objetivo({ id: "proximo", fechaInicio: "2026-10-01", fechaFin: "2026-10-31" });
    const elegido = elegirObjetivoActivoGerencial([lejano, proximo], HOY);
    expect(elegido?.id).toBe("proximo");
  });

  it("nunca elige un objetivo CANCELADO aunque su rango contenga hoy y sea el único candidato temporal", () => {
    const canceladoEnCurso = objetivo({
      id: "cancelado-en-curso",
      estado: "CANCELADO",
      fechaInicio: "2026-09-01",
      fechaFin: "2026-09-30",
    });
    const cerradoValido = objetivo({
      id: "cerrado-valido",
      fechaInicio: "2026-06-01",
      fechaFin: "2026-06-30",
    });
    const elegido = elegirObjetivoActivoGerencial([canceladoEnCurso, cerradoValido], HOY);
    expect(elegido?.id).toBe("cerrado-valido");
  });
});
