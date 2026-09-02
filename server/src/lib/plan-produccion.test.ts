import { describe, it, expect } from "vitest";
import { esTransicionValida, esEstadoTerminal } from "./plan-produccion";

describe("esTransicionValida", () => {
  it("permite la secuencia normal completa: Planificada -> Aprobada -> En producción -> Parcial -> Terminada", () => {
    expect(esTransicionValida("Planificada", "Aprobada")).toBe(true);
    expect(esTransicionValida("Aprobada", "En producción")).toBe(true);
    expect(esTransicionValida("En producción", "Parcial")).toBe(true);
    expect(esTransicionValida("Parcial", "Terminada")).toBe(true);
  });

  it("permite saltar Parcial: En producción -> Terminada directo", () => {
    expect(esTransicionValida("En producción", "Terminada")).toBe(true);
  });

  it("permite Cancelada desde cualquier estado no terminal", () => {
    expect(esTransicionValida("Planificada", "Cancelada")).toBe(true);
    expect(esTransicionValida("Aprobada", "Cancelada")).toBe(true);
    expect(esTransicionValida("En producción", "Cancelada")).toBe(true);
    expect(esTransicionValida("Parcial", "Cancelada")).toBe(true);
  });

  it("rechaza saltarse pasos hacia adelante (Planificada -> En producción)", () => {
    expect(esTransicionValida("Planificada", "En producción")).toBe(false);
  });

  it("rechaza retroceder (Aprobada -> Planificada)", () => {
    expect(esTransicionValida("Aprobada", "Planificada")).toBe(false);
  });

  it("rechaza cualquier transición desde un estado terminal (Terminada, Cancelada)", () => {
    expect(esTransicionValida("Terminada", "Cancelada")).toBe(false);
    expect(esTransicionValida("Cancelada", "Planificada")).toBe(false);
  });
});

describe("esEstadoTerminal", () => {
  it("Terminada y Cancelada son terminales", () => {
    expect(esEstadoTerminal("Terminada")).toBe(true);
    expect(esEstadoTerminal("Cancelada")).toBe(true);
  });

  it("los demás estados no son terminales", () => {
    expect(esEstadoTerminal("Planificada")).toBe(false);
    expect(esEstadoTerminal("Aprobada")).toBe(false);
    expect(esEstadoTerminal("En producción")).toBe(false);
    expect(esEstadoTerminal("Parcial")).toBe(false);
  });
});
