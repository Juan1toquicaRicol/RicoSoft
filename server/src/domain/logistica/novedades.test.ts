import { describe, it, expect } from "vitest";
import { calcularAgregacionNovedades, type NovedadParaAgregacion } from "./novedades";

describe("calcularAgregacionNovedades", () => {
  const ahora = new Date("2026-09-10T00:00:00Z");

  const novedad = (overrides: Partial<NovedadParaAgregacion> = {}): NovedadParaAgregacion => ({
    id: "n1",
    despachoId: "d1",
    tipo: "PRODUCTO_FALTANTE",
    descripcion: "Faltó una caja",
    createdAt: new Date("2026-09-08T00:00:00Z"), // 2 días antes de `ahora`
    clienteNombre: "Cliente A",
    ...overrides,
  });

  it("calcula diasAbierta como la diferencia entera de días contra `ahora`", () => {
    const r = calcularAgregacionNovedades([novedad()], ahora);
    expect(r.novedades[0].diasAbierta).toBe(2);
  });

  it("nunca devuelve diasAbierta negativo (createdAt en el futuro, dato inconsistente)", () => {
    const r = calcularAgregacionNovedades(
      [novedad({ createdAt: new Date("2026-09-12T00:00:00Z") })],
      ahora,
    );
    expect(r.novedades[0].diasAbierta).toBe(0);
  });

  it("ordena las novedades por antigüedad descendente (la más vieja primero)", () => {
    const r = calcularAgregacionNovedades(
      [
        novedad({ id: "reciente", createdAt: new Date("2026-09-09T00:00:00Z") }),
        novedad({ id: "vieja", createdAt: new Date("2026-09-01T00:00:00Z") }),
        novedad({ id: "media", createdAt: new Date("2026-09-05T00:00:00Z") }),
      ],
      ahora,
    );
    expect(r.novedades.map((n) => n.id)).toEqual(["vieja", "media", "reciente"]);
  });

  it("agrupa por tipo y ordena de mayor a menor cantidad", () => {
    const r = calcularAgregacionNovedades(
      [
        novedad({ tipo: "PRODUCTO_FALTANTE" }),
        novedad({ tipo: "PRODUCTO_FALTANTE" }),
        novedad({ tipo: "CLIENTE_AUSENTE" }),
      ],
      ahora,
    );
    expect(r.porTipo).toEqual([
      { clave: "PRODUCTO_FALTANTE", cantidad: 2 },
      { clave: "CLIENTE_AUSENTE", cantidad: 1 },
    ]);
  });

  it("agrupa por cliente y ordena de mayor a menor cantidad (recurrencia)", () => {
    const r = calcularAgregacionNovedades(
      [
        novedad({ clienteNombre: "Cliente Recurrente" }),
        novedad({ clienteNombre: "Cliente Recurrente" }),
        novedad({ clienteNombre: "Cliente Recurrente" }),
        novedad({ clienteNombre: "Cliente Ocasional" }),
      ],
      ahora,
    );
    expect(r.porCliente[0]).toEqual({ clave: "Cliente Recurrente", cantidad: 3 });
    expect(r.porCliente[1]).toEqual({ clave: "Cliente Ocasional", cantidad: 1 });
  });

  it("con una lista vacía, devuelve estructura vacía sin lanzar", () => {
    const r = calcularAgregacionNovedades([], ahora);
    expect(r).toEqual({ novedades: [], porTipo: [], porCliente: [] });
  });
});
