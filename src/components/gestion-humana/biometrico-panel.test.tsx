import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BiometricoPanel } from "./biometrico-panel";

describe("BiometricoPanel", () => {
  it("muestra las tres vistas (administración y seguimiento) y abre en Fuentes y asociaciones", () => {
    const html = renderToStaticMarkup(
      <BiometricoPanel
        puedeSincronizar
        puedeConfigurar={false}
        puedeAsociar={false}
        empleados={[]}
      />,
    );
    expect(html).toContain("Fuentes y asociaciones");
    expect(html).toContain("Sincronizaciones");
    expect(html).toContain("Marcaciones");
    // La vista inicial es la de fuentes; las de seguimiento solo se montan al elegirlas.
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Fuentes biométricas");
    expect(html).not.toContain("Historial de cada corrida");
  });
});
