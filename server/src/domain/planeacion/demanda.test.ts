import { describe, it, expect } from "vitest";
import { calcularVentanasDemanda, clasificarCalidadDatos } from "./demanda";

describe("clasificarCalidadDatos", () => {
  it("ALTA con 9 o más meses con venta", () => {
    expect(clasificarCalidadDatos(9)).toBe("ALTA");
    expect(clasificarCalidadDatos(12)).toBe("ALTA");
  });
  it("MEDIA entre 3 y 8 meses", () => {
    expect(clasificarCalidadDatos(3)).toBe("MEDIA");
    expect(clasificarCalidadDatos(8)).toBe("MEDIA");
  });
  it("BAJA con menos de 3 meses", () => {
    expect(clasificarCalidadDatos(0)).toBe("BAJA");
    expect(clasificarCalidadDatos(2)).toBe("BAJA");
  });
});

describe("calcularVentanasDemanda", () => {
  const pronostico = (itemRowId: number, mesesConVenta: number) => ({
    itemRowId,
    descripcion: null,
    referencia: null,
    unidadMedida: null,
    ventaPromedioMensual: 0,
    tendenciaPct: null,
    coeficienteVariacion: null,
    demandaIrregular: false,
    perdiendoRotacion: false,
    mesesConVenta,
  });

  it("calcula promedios diario/semanal/mensual a partir de la ventana de 30 días", () => {
    const [r] = calcularVentanasDemanda(
      [{ itemRowId: 1, cantidad: 300, neto: 0 }],
      [{ itemRowId: 1, cantidad: 900, neto: 0 }],
      [{ itemRowId: 1, cantidad: 1800, neto: 0 }],
      [pronostico(1, 12)],
    );
    expect(r.promedioDiario30d).toBe(10);
    expect(r.promedioSemanal30d).toBe(70);
    expect(r.promedioMensual30d).toBe(300);
    expect(r.calidadDatos).toBe("ALTA");
  });

  it("incluye productos que vendieron en 90d/180d pero no en los últimos 30 días (perdiendo rotación)", () => {
    const [r] = calcularVentanasDemanda(
      [],
      [{ itemRowId: 2, cantidad: 100, neto: 0 }],
      [{ itemRowId: 2, cantidad: 500, neto: 0 }],
      [pronostico(2, 4)],
    );
    expect(r.ventas30d).toBe(0);
    expect(r.ventas90d).toBe(100);
    expect(r.calidadDatos).toBe("MEDIA");
  });

  it("un producto sin entrada en el pronóstico se trata como calidad BAJA (0 meses con venta), no se omite", () => {
    const [r] = calcularVentanasDemanda(
      [{ itemRowId: 3, cantidad: 50, neto: 0 }],
      [{ itemRowId: 3, cantidad: 50, neto: 0 }],
      [{ itemRowId: 3, cantidad: 50, neto: 0 }],
      [],
    );
    expect(r.mesesConVenta).toBe(0);
    expect(r.calidadDatos).toBe("BAJA");
  });

  it("con las tres ventanas vacías, devuelve un array vacío sin lanzar", () => {
    expect(calcularVentanasDemanda([], [], [], [])).toEqual([]);
  });
});
