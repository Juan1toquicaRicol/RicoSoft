import { describe, expect, it } from "vitest";

import {
  cumplePasoCentavos,
  digitosFraccionarios,
  idCampoItem,
  ID_CAMPO_TRM,
  validarPrecisionDecimales,
  valoresValidosCercanos,
} from "./validacion-precision-orden";

const item = (
  over: Partial<{ cantidad: number; pesoKg: number | null; valorUnitarioFob: number }>,
) => ({
  cantidad: 1,
  pesoKg: undefined as number | null | undefined,
  valorUnitarioFob: 1,
  ...over,
});

describe("cumplePasoCentavos (step 0.01)", () => {
  it("rechaza 1.005 y acepta 1.01", () => {
    expect(cumplePasoCentavos(1.005)).toBe(false);
    expect(cumplePasoCentavos(1.01)).toBe(true);
  });

  it("sin tolerancia proporcional: rechaza residuos que crecen con la magnitud", () => {
    expect(cumplePasoCentavos(1.0000000008)).toBe(false);
    expect(cumplePasoCentavos(1000000000.0000005)).toBe(false);
    expect(cumplePasoCentavos(Number("12345678901234.567"))).toBe(false);
  });

  it("acepta valores que el usuario puede escribir con hasta 2 decimales", () => {
    for (const v of [1.5, 0.07, 4020.5, 12500, 1.01, 99999999.99, 0, 1234567.89]) {
      expect(cumplePasoCentavos(v)).toBe(true);
    }
  });

  it("0.1 + 0.2 (0.30000000000000004) se rechaza: el usuario no puede escribir ese double", () => {
    expect(cumplePasoCentavos(0.1 + 0.2)).toBe(false);
    expect(cumplePasoCentavos(0.3)).toBe(true);
  });

  it("maneja notación exponencial", () => {
    expect(cumplePasoCentavos(1e-7)).toBe(false);
    expect(cumplePasoCentavos(1.5e21)).toBe(true);
    expect(cumplePasoCentavos(1e-2)).toBe(true);
  });

  it("rechaza fracciones menores a un centavo, también en negativos", () => {
    expect(cumplePasoCentavos(0.001)).toBe(false);
    expect(cumplePasoCentavos(10.999)).toBe(false);
    expect(cumplePasoCentavos(-1.005)).toBe(false);
  });

  it("no opina sobre valores no finitos (los cubren las reglas existentes)", () => {
    expect(cumplePasoCentavos(Number.NaN)).toBe(true);
  });
});

describe("digitosFraccionarios", () => {
  it("cuenta dígitos fraccionarios de la representación decimal", () => {
    expect(digitosFraccionarios(12)).toBe(0);
    expect(digitosFraccionarios(1.25)).toBe(2);
    expect(digitosFraccionarios(1e-7)).toBe(7);
    expect(digitosFraccionarios(-1.005)).toBe(3);
  });
});

describe("valoresValidosCercanos", () => {
  it("devuelve los dos múltiplos de 0.01 más cercanos", () => {
    expect(valoresValidosCercanos(1.005)).toEqual([1, 1.01]);
    expect(valoresValidosCercanos(10.999)).toEqual([10.99, 11]);
  });
});

describe("validarPrecisionDecimales", () => {
  it("sin problemas devuelve lista vacía", () => {
    expect(
      validarPrecisionDecimales({
        trmPactada: 4020.5,
        items: [item({ cantidad: 2, pesoKg: 12.5, valorUnitarioFob: 3.99 })],
      }),
    ).toEqual([]);
  });

  it("revisa TODOS los ítems, no solo el visible, e indica ítem, campo y etapa", () => {
    const errores = validarPrecisionDecimales({
      trmPactada: 4000,
      items: [
        item({}),
        item({ cantidad: 1.005 }),
        item({ pesoKg: 2.001, valorUnitarioFob: 0.333 }),
      ],
    });
    expect(errores.map((e) => [e.etapa, e.campoId])).toEqual([
      [2, idCampoItem(1, "cantidad")],
      [2, idCampoItem(2, "peso")],
      [2, idCampoItem(2, "fob")],
    ]);
    expect(errores[0].texto).toContain("Ítem 2: Cantidad");
    expect(errores[0].texto).toContain("1 y 1,01");
  });

  it("formatea los valores del mensaje en es-CO", () => {
    const [e] = validarPrecisionDecimales({
      trmPactada: 1,
      items: [item({ cantidad: 1234.005 })],
    });
    expect(e.texto).toContain("1.234 y 1.234,01");
  });

  it("la TRM con precisión inválida se reporta en la etapa 1", () => {
    const errores = validarPrecisionDecimales({ trmPactada: 4000.005, items: [item({})] });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatchObject({ etapa: 1, campoId: ID_CAMPO_TRM });
  });

  it("peso vacío (undefined/null) no cuenta como error", () => {
    expect(
      validarPrecisionDecimales({
        trmPactada: 1,
        items: [item({ pesoKg: undefined }), item({ pesoKg: null })],
      }),
    ).toEqual([]);
  });
});
