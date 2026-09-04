import { describe, it, expect } from "vitest";
import {
  esTransicionValidaDespacho,
  esEstadoTerminalDespacho,
  estadosSiguientesDespacho,
  camposRequeridosParaTransicion,
  calcularFaltantesPreparacion,
} from "./despachos";

describe("esTransicionValidaDespacho", () => {
  it("permite la secuencia normal completa: RECIBIDO -> ... -> ENTREGADO", () => {
    expect(esTransicionValidaDespacho("RECIBIDO", "PREPARANDO")).toBe(true);
    expect(esTransicionValidaDespacho("PREPARANDO", "PREPARADO")).toBe(true);
    expect(esTransicionValidaDespacho("PREPARADO", "PENDIENTE_CARGUE")).toBe(true);
    expect(esTransicionValidaDespacho("PENDIENTE_CARGUE", "CARGANDO")).toBe(true);
    expect(esTransicionValidaDespacho("CARGANDO", "CARGADO")).toBe(true);
    expect(esTransicionValidaDespacho("CARGADO", "DESPACHADO")).toBe(true);
    expect(esTransicionValidaDespacho("DESPACHADO", "EN_TRANSITO")).toBe(true);
    expect(esTransicionValidaDespacho("EN_TRANSITO", "ENTREGADO")).toBe(true);
  });

  it("rechaza saltarse etapas (RECIBIDO -> ENTREGADO directo)", () => {
    expect(esTransicionValidaDespacho("RECIBIDO", "ENTREGADO")).toBe(false);
  });

  it("rechaza retroceder (CARGADO -> PREPARADO)", () => {
    expect(esTransicionValidaDespacho("CARGADO", "PREPARADO")).toBe(false);
  });

  it("permite CANCELADO desde cualquier estado antes de CARGADO (inclusive)", () => {
    expect(esTransicionValidaDespacho("RECIBIDO", "CANCELADO")).toBe(true);
    expect(esTransicionValidaDespacho("PREPARANDO", "CANCELADO")).toBe(true);
    expect(esTransicionValidaDespacho("CARGADO", "CANCELADO")).toBe(true);
  });

  it("rechaza CANCELADO una vez despachado — ya salió de la bodega", () => {
    expect(esTransicionValidaDespacho("DESPACHADO", "CANCELADO")).toBe(false);
    expect(esTransicionValidaDespacho("EN_TRANSITO", "CANCELADO")).toBe(false);
  });

  it("desde EN_TRANSITO permite ENTREGADO, ENTREGA_PARCIAL o DEVUELTO, nunca de vuelta a DESPACHADO", () => {
    expect(esTransicionValidaDespacho("EN_TRANSITO", "ENTREGA_PARCIAL")).toBe(true);
    expect(esTransicionValidaDespacho("EN_TRANSITO", "DEVUELTO")).toBe(true);
    expect(esTransicionValidaDespacho("EN_TRANSITO", "DESPACHADO")).toBe(false);
  });

  it("ENTREGA_PARCIAL puede terminar en DEVUELTO (el resto no entregado)", () => {
    expect(esTransicionValidaDespacho("ENTREGA_PARCIAL", "DEVUELTO")).toBe(true);
  });

  it("rechaza cualquier transición desde un estado terminal (ENTREGADO, DEVUELTO, CANCELADO)", () => {
    expect(esTransicionValidaDespacho("ENTREGADO", "DEVUELTO")).toBe(false);
    expect(esTransicionValidaDespacho("DEVUELTO", "RECIBIDO")).toBe(false);
    expect(esTransicionValidaDespacho("CANCELADO", "RECIBIDO")).toBe(false);
  });
});

describe("esEstadoTerminalDespacho / estadosSiguientesDespacho", () => {
  it("ENTREGADO, DEVUELTO y CANCELADO son terminales", () => {
    expect(esEstadoTerminalDespacho("ENTREGADO")).toBe(true);
    expect(esEstadoTerminalDespacho("DEVUELTO")).toBe(true);
    expect(esEstadoTerminalDespacho("CANCELADO")).toBe(true);
  });

  it("los estados intermedios no son terminales y exponen sus siguientes válidos", () => {
    expect(esEstadoTerminalDespacho("CARGADO")).toBe(false);
    expect(estadosSiguientesDespacho("CARGADO")).toEqual(["DESPACHADO", "CANCELADO"]);
  });
});

describe("camposRequeridosParaTransicion", () => {
  it("exige vehículo y conductor para iniciar cargue", () => {
    expect(camposRequeridosParaTransicion("CARGANDO")).toEqual([
      "vehiculoPlaca",
      "conductorNombre",
    ]);
  });

  it("exige quién recibió para entregas totales y parciales", () => {
    expect(camposRequeridosParaTransicion("ENTREGADO")).toEqual(["recibidoPor"]);
    expect(camposRequeridosParaTransicion("ENTREGA_PARCIAL")).toEqual(["recibidoPor"]);
  });

  it("no exige nada para transiciones sin requisitos adicionales", () => {
    expect(camposRequeridosParaTransicion("PREPARANDO")).toEqual([]);
  });
});

describe("calcularFaltantesPreparacion", () => {
  it("detecta faltante cuando lo preparado es menor a lo solicitado", () => {
    const [f] = calcularFaltantesPreparacion([
      { itemRowId: 1, cantidadSolicitada: 50, cantidadPreparada: 45 },
    ]);
    expect(f.faltante).toBe(5);
  });

  it("una línea sin conteo aún (null) cuenta el total solicitado como faltante", () => {
    const [f] = calcularFaltantesPreparacion([
      { itemRowId: 1, cantidadSolicitada: 100, cantidadPreparada: null },
    ]);
    expect(f.faltante).toBe(100);
  });

  it("omite líneas completamente preparadas (faltante 0)", () => {
    const faltantes = calcularFaltantesPreparacion([
      { itemRowId: 1, cantidadSolicitada: 100, cantidadPreparada: 100 },
    ]);
    expect(faltantes).toEqual([]);
  });

  it("una preparación mayor a la solicitada no da faltante negativo", () => {
    const faltantes = calcularFaltantesPreparacion([
      { itemRowId: 1, cantidadSolicitada: 100, cantidadPreparada: 120 },
    ]);
    expect(faltantes).toEqual([]);
  });

  it("con un array vacío, devuelve un array vacío sin lanzar", () => {
    expect(calcularFaltantesPreparacion([])).toEqual([]);
  });
});
