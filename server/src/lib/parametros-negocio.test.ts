import { describe, it, expect } from "vitest";
import { actualizarConfiguracionInventarioSchema } from "../modules/inventario/inventario.schemas";
import {
  CAMPOS_PARAMETROS_NEGOCIO,
  PARAMETROS_NEGOCIO_DEFECTO,
  extraerParametrosNegocio,
} from "./parametros-negocio";

/** Cuerpo mínimo válido de PUT /inventario/configuracion (lo que ya mandaba la UI). */
const BASE = {
  diasVendible: 30,
  diasExceso: 90,
  diasRupturaCobertura: 5,
  diasSobreCobertura: 60,
  coberturaObjetivoDias: 30,
  factorSeguridad: 1,
};

const validar = (extra: Record<string, unknown>) =>
  actualizarConfiguracionInventarioSchema.safeParse({ ...BASE, ...extra });

const mensaje = (extra: Record<string, unknown>) => {
  const r = validar(extra);
  return r.success ? null : r.error.errors[0].message;
};

describe("PUT /inventario/configuracion — parámetros de negocio", () => {
  it("un llamador que solo manda los umbrales de inventario sigue siendo válido (compatibilidad)", () => {
    const r = validar({});
    expect(r.success).toBe(true);
  });

  it("acepta los seis parámetros con valores razonables", () => {
    const r = validar({
      margenMinimoVentaPct: 12.5,
      diasMaximosMora: 45,
      porcentajeMaximoUsoCupo: 85,
      toleranciaMermaPesajePct: 0.75,
      diasValidezOferta: 20,
      montoMinimoCotizaciones: 5_000_000,
    });
    expect(r.success).toBe(true);
  });

  it("rechaza negativos donde no tienen sentido", () => {
    expect(mensaje({ margenMinimoVentaPct: -1 })).toMatch(/margenMinimoVentaPct/);
    expect(mensaje({ diasMaximosMora: -5 })).toMatch(/diasMaximosMora/);
    expect(mensaje({ toleranciaMermaPesajePct: -0.1 })).toMatch(/toleranciaMermaPesajePct/);
    expect(mensaje({ montoMinimoCotizaciones: -1 })).toMatch(/montoMinimoCotizaciones/);
    expect(mensaje({ diasValidezOferta: 0 })).toMatch(/diasValidezOferta/);
    expect(mensaje({ porcentajeMaximoUsoCupo: 0 })).toMatch(/porcentajeMaximoUsoCupo/);
  });

  it("rechaza porcentajes y días fuera de rango razonable", () => {
    expect(mensaje({ margenMinimoVentaPct: 101 })).toMatch(/entre 0 y 100/);
    expect(mensaje({ porcentajeMaximoUsoCupo: 101 })).toMatch(/entre 1 y 100/);
    expect(mensaje({ toleranciaMermaPesajePct: 21 })).toMatch(/entre 0 y 20/);
    expect(mensaje({ diasMaximosMora: 3651 })).toMatch(/entre 0 y 3650/);
    expect(mensaje({ diasValidezOferta: 366 })).toMatch(/entre 1 y 365/);
    expect(mensaje({ montoMinimoCotizaciones: 2_000_000_000_000 })).toMatch(/máximo permitido/);
  });

  it("los días son enteros y los valores monetarios/porcentuales admiten máximo 2 decimales", () => {
    expect(mensaje({ diasMaximosMora: 10.5 })).toMatch(/entero/);
    expect(mensaje({ diasValidezOferta: 7.2 })).toMatch(/entero/);
    expect(mensaje({ margenMinimoVentaPct: 10.123 })).toMatch(/2 decimales/);
    expect(mensaje({ montoMinimoCotizaciones: 100.001 })).toMatch(/2 decimales/);
    // Los decimales binarios "feos" (0.07) no se rechazan por error de punto flotante.
    expect(validar({ margenMinimoVentaPct: 0.07, toleranciaMermaPesajePct: 1.15 }).success).toBe(
      true,
    );
  });

  it("rechaza tipos no numéricos", () => {
    expect(validar({ diasMaximosMora: "30" }).success).toBe(false);
    expect(validar({ margenMinimoVentaPct: "abc" }).success).toBe(false);
  });

  it("no rompe la validación existente de umbrales", () => {
    expect(mensaje({ diasVendible: 100, diasExceso: 50 })).toMatch(/menor que diasExceso/);
  });
});

describe("valores por defecto", () => {
  it("son neutros/compatibles: no activan restricciones por sí solos", () => {
    expect(PARAMETROS_NEGOCIO_DEFECTO).toEqual({
      margenMinimoVentaPct: 0, // sin margen mínimo
      diasMaximosMora: 30,
      porcentajeMaximoUsoCupo: 100, // uso pleno del cupo permitido
      toleranciaMermaPesajePct: 0.5,
      diasValidezOferta: 15,
      montoMinimoCotizaciones: 0, // sin monto mínimo
    });
  });

  it("los defaults pasan su propia validación", () => {
    expect(validar({ ...PARAMETROS_NEGOCIO_DEFECTO }).success).toBe(true);
  });

  it("extraerParametrosNegocio devuelve defaults si no hay fila (tenant que nunca configuró)", () => {
    expect(extraerParametrosNegocio(null)).toEqual(PARAMETROS_NEGOCIO_DEFECTO);
    expect(extraerParametrosNegocio(undefined)).toEqual(PARAMETROS_NEGOCIO_DEFECTO);
  });

  it("convierte Decimal (que Prisma entrega como objeto con toString) a number", () => {
    const decimal = (v: string) => ({ toString: () => v });
    const r = extraerParametrosNegocio({
      margenMinimoVentaPct: decimal("12.50"),
      porcentajeMaximoUsoCupo: decimal("85.00"),
      toleranciaMermaPesajePct: decimal("0.75"),
      montoMinimoCotizaciones: decimal("5000000.00"),
      diasMaximosMora: 45,
      diasValidezOferta: 20,
    });
    expect(r).toEqual({
      margenMinimoVentaPct: 12.5,
      diasMaximosMora: 45,
      porcentajeMaximoUsoCupo: 85,
      toleranciaMermaPesajePct: 0.75,
      diasValidezOferta: 20,
      montoMinimoCotizaciones: 5_000_000,
    });
    expect(CAMPOS_PARAMETROS_NEGOCIO).toHaveLength(6);
  });

  it("completa con defaults los campos ausentes de una fila parcial", () => {
    const r = extraerParametrosNegocio({ diasMaximosMora: 60 });
    expect(r.diasMaximosMora).toBe(60);
    expect(r.diasValidezOferta).toBe(15);
  });
});
