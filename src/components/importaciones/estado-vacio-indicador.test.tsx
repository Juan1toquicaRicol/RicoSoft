import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import { clasificarEstadoIndicador } from "./estado-indicador";
import { EstadoVacioIndicador } from "./estado-vacio-indicador";

describe("clasificarEstadoIndicador", () => {
  it("sin operaciones en el periodo => sin-operaciones", () => {
    expect(clasificarEstadoIndicador({ promedio: null, cantidadAnalizada: 0 }, 0)).toBe(
      "sin-operaciones",
    );
  });

  it("hay operaciones pero ninguna calculable => datos-insuficientes", () => {
    expect(clasificarEstadoIndicador({ promedio: null, cantidadAnalizada: 0 }, 3)).toBe(
      "datos-insuficientes",
    );
  });

  it("con promedio => con-datos (aunque algunas operaciones estén excluidas)", () => {
    expect(clasificarEstadoIndicador({ promedio: 12.5, cantidadAnalizada: 2 }, 5)).toBe(
      "con-datos",
    );
  });
});

describe("EstadoVacioIndicador", () => {
  it("renderiza 'Sin operaciones' sin enlaces de ayuda", () => {
    const html = renderToStaticMarkup(
      <EstadoVacioIndicador
        estado="sin-operaciones"
        estadosIncluidos={["Confirmada", "Cerrada"]}
      />,
    );
    expect(html).toContain("Sin operaciones");
    expect(html).toContain("con estado Confirmada o Cerrada");
    expect(html).not.toContain("<a ");
  });

  it("renderiza 'Datos insuficientes' con motivos y ayuda hacia destinos existentes", () => {
    const html = renderToStaticMarkup(
      <EstadoVacioIndicador
        estado="datos-insuficientes"
        detalleExclusiones="2 sin levante aduanero"
      />,
    );
    expect(html).toContain("Datos insuficientes");
    expect(html).toContain("2 sin levante aduanero");
    expect(html).toContain('href="/importaciones"');
    expect(html).toContain('href="#definiciones-analitica"');
  });
});
