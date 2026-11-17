import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  atributosErrorCampo,
  debeMostrarErroresEtapa,
  ETAPAS_ORDEN,
  ID_ALERTA_ERRORES_ETAPA,
  marcarAlNavegarPorIndicador,
  marcarEtapasMostradas,
  primerErrorConFoco,
  puedeIrAEtapa,
} from "./etapas-orden-config";
import { ID_CAMPO_FECHA_REQUERIDA } from "./validacion-fechas-orden";
import { ID_CAMPO_TRM, validarPrecisionDecimales } from "./validacion-precision-orden";
import { EtapasOrdenNav } from "./etapas-orden";

describe("puedeIrAEtapa", () => {
  it("permite etapas ya alcanzadas y bloquea las posteriores o fuera de rango", () => {
    expect(puedeIrAEtapa(1, 2)).toBe(true);
    expect(puedeIrAEtapa(2, 2)).toBe(true);
    expect(puedeIrAEtapa(3, 2)).toBe(false);
    expect(puedeIrAEtapa(0, 4)).toBe(false);
    expect(puedeIrAEtapa(5, 4)).toBe(false);
  });
});

describe("EtapasOrdenNav", () => {
  it("expone las 4 etapas y marca solo la actual con aria-current=step", () => {
    const html = renderToStaticMarkup(
      <EtapasOrdenNav etapaActual={2} maxAlcanzada={2} onIr={vi.fn()} />,
    );
    for (const { numero, etiqueta } of ETAPAS_ORDEN) {
      expect(html).toContain(`${numero}. ${etiqueta}`);
    }
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Etapas de la orden"');
  });

  it("deshabilita las etapas que todavía no se alcanzaron", () => {
    const html = renderToStaticMarkup(
      <EtapasOrdenNav etapaActual={1} maxAlcanzada={1} onIr={vi.fn()} />,
    );
    // Etapas 2, 3 y 4 deshabilitadas; la 1 habilitada.
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });

  it("indica por texto accesible las etapas con campos pendientes", () => {
    const html = renderToStaticMarkup(
      <EtapasOrdenNav
        etapaActual={4}
        maxAlcanzada={4}
        etapasConErrores={new Set([2])}
        onIr={vi.fn()}
      />,
    );
    // Texto VISIBLE (no solo sr-only) e icono además del color destructive.
    expect(html).toContain("Con campos pendientes");
    expect(html).not.toContain('sr-only"> (con campos pendientes)');
    expect(html).toContain("text-destructive");
    expect(html).toContain("lucide-triangle-alert");
    expect(html).toContain("(completada)");
  });
});

describe("EtapasOrdenNav: estados visuales", () => {
  it("distingue actual (aria-current), completada y con errores", () => {
    const html = renderToStaticMarkup(
      <EtapasOrdenNav
        etapaActual={3}
        maxAlcanzada={3}
        etapasConErrores={new Set([2])}
        onIr={vi.fn()}
      />,
    );
    const items = html.split("<li").slice(1);
    // 1: completada (sr-only + icono check), sin texto de pendientes.
    expect(items[0]).toContain("(completada)");
    expect(items[0]).not.toContain("Con campos pendientes");
    // 2: con errores: no completada, texto visible y estilo destructive.
    expect(items[1]).toContain("Con campos pendientes");
    expect(items[1]).not.toContain("(completada)");
    expect(items[1]).toContain("border-destructive");
    // 3: actual con aria-current y sin señal de error.
    expect(items[2]).toContain('aria-current="step"');
    expect(items[2]).not.toContain("destructive");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("la etapa actual con errores conserva el estilo de actual (sus errores van en la alerta)", () => {
    const html = renderToStaticMarkup(
      <EtapasOrdenNav
        etapaActual={2}
        maxAlcanzada={2}
        etapasConErrores={new Set([2])}
        onIr={vi.fn()}
      />,
    );
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain("Con campos pendientes");
  });
});

describe("alineación del indicador", () => {
  it("la grilla estira las celdas y el botón ocupa toda la altura con el borde inferior en el botón", () => {
    const html = renderToStaticMarkup(
      <EtapasOrdenNav
        etapaActual={3}
        maxAlcanzada={3}
        etapasConErrores={new Set([2])}
        onIr={vi.fn()}
      />,
    );
    expect(html).toContain("items-stretch");
    // Título centrado verticalmente con el círculo; etiqueta de error debajo.
    expect(html).toContain('<span class="flex items-center gap-2">');
    expect(html).toContain("flex-col");
    expect(html).toContain("pl-8 text-[10px]");
    expect(html.match(/<li class="flex"/g)).toHaveLength(4);
    expect(html.match(/h-full w-full/g)).toHaveLength(4);
    expect(html.match(/border-b-2/g)).toHaveLength(4);
    // Icono y texto visibles de la etapa con errores se conservan.
    expect(html).toContain("lucide-triangle-alert");
    expect(html).toContain("Con campos pendientes");
  });
});

describe("errores visibles de la etapa (estado por etapa + condición única)", () => {
  const ninguna = new Set<number>();

  it("etapa nueva abierta con Siguiente tras un fallo previo en OTRA etapa: no muestra", () => {
    const mostradas = marcarEtapasMostradas(ninguna, [1]); // falló al avanzar desde la 1
    expect(debeMostrarErroresEtapa(2, mostradas, 3)).toBe(false);
    expect(atributosErrorCampo(debeMostrarErroresEtapa(2, mostradas, 3), true)).toEqual({});
  });

  it("intento de avanzar desde la etapa con errores: muestra alerta y ARIA juntos", () => {
    const mostradas = marcarEtapasMostradas(ninguna, [2]);
    const mostrar = debeMostrarErroresEtapa(2, mostradas, 1);
    expect(mostrar).toBe(true);
    expect(atributosErrorCampo(mostrar, true)).toEqual({
      "aria-invalid": true,
      "aria-describedby": ID_ALERTA_ERRORES_ETAPA,
    });
    expect(atributosErrorCampo(mostrar, false)).toEqual({});
  });

  it("volver con Atrás o el indicador a una etapa ya mostrada: muestra de inmediato", () => {
    const mostradas = marcarEtapasMostradas(ninguna, [1]);
    // Ir a la 2 y volver a la 1 no altera el conjunto (irAEtapa sin mostrarErrores).
    expect(debeMostrarErroresEtapa(1, mostradas, 2)).toBe(true);
  });

  it("'Ir a la etapa' o redirección por el envío final: muestra de inmediato", () => {
    const mostradas = marcarEtapasMostradas(ninguna, [2]);
    expect(debeMostrarErroresEtapa(2, mostradas, 1)).toBe(true);
  });

  it("envío final: se marcan todas las etapas con errores", () => {
    const mostradas = marcarEtapasMostradas(ninguna, [1, 2, 2, 3]);
    expect([...mostradas].sort()).toEqual([1, 2, 3]);
    for (const e of [1, 2, 3]) expect(debeMostrarErroresEtapa(e, mostradas, 1)).toBe(true);
  });

  it("etapa sin errores: nada, aunque esté marcada", () => {
    const mostradas = marcarEtapasMostradas(ninguna, [1]);
    const mostrar = debeMostrarErroresEtapa(1, mostradas, 0);
    expect(mostrar).toBe(false);
    expect(atributosErrorCampo(mostrar, true)).toEqual({});
  });

  it("marcarEtapasMostradas no muta el conjunto original", () => {
    const original = new Set<number>([1]);
    const nuevo = marcarEtapasMostradas(original, [2]);
    expect([...original]).toEqual([1]);
    expect([...nuevo]).toEqual([1, 2]);
  });

  it("aria-describedby solo existe cuando la alerta se muestra", () => {
    for (const marcada of [true, false]) {
      for (const n of [0, 3]) {
        const mostradas = marcada ? new Set([2]) : ninguna;
        const mostrar = debeMostrarErroresEtapa(2, mostradas, n);
        expect("aria-describedby" in atributosErrorCampo(mostrar, true)).toBe(mostrar);
      }
    }
  });
});

describe("entrada desde el indicador (marcarAlNavegarPorIndicador)", () => {
  const ninguna = new Set<number>();

  it("etapa con pendientes: se marca como mostrada", () => {
    const r = marcarAlNavegarPorIndicador(2, new Set([2]), ninguna);
    expect(debeMostrarErroresEtapa(2, r, 1)).toBe(true);
  });

  it("etapa sin pendientes: no marca nada", () => {
    const r = marcarAlNavegarPorIndicador(3, new Set([2]), ninguna);
    expect(r).toBe(ninguna);
    expect(debeMostrarErroresEtapa(3, r, 1)).toBe(false);
  });

  it("Siguiente a una etapa nueva no usa esta ruta: el conjunto queda igual", () => {
    // irAEtapa sin mostrarErrores no modifica etapasMostradas.
    expect(debeMostrarErroresEtapa(2, ninguna, 2)).toBe(false);
  });
});

describe("error de fecha requerida (misma condición que los demás errores)", () => {
  it("sin etapa mostrada: sin mensaje ni atributos", () => {
    const mostrar = debeMostrarErroresEtapa(3, new Set<number>(), 1);
    expect(mostrar).toBe(false);
    expect(atributosErrorCampo(mostrar, true)).toEqual({});
  });

  it("con la etapa mostrada: atributos con describedby hacia la alerta existente", () => {
    const mostrar = debeMostrarErroresEtapa(3, new Set([3]), 1);
    expect(atributosErrorCampo(mostrar, true)).toEqual({
      "aria-invalid": true,
      "aria-describedby": ID_ALERTA_ERRORES_ETAPA,
    });
    expect(atributosErrorCampo(mostrar, false)).toEqual({});
  });
});

describe("metadatos de foco de los errores", () => {
  it("los errores de precisión siguen identificándose por campoId", () => {
    const [e] = validarPrecisionDecimales({ trmPactada: 4000.005, items: [] });
    expect(e.campoId).toBe(ID_CAMPO_TRM);
  });

  it("primerErrorConFoco ignora errores sin foco (conservan su comportamiento)", () => {
    const sinFoco: { texto: string; etapa: number; focoId?: string } = {
      texto: "Falta la fecha de la orden.",
      etapa: 1,
    };
    const fecha = { texto: "f", etapa: 3, focoId: ID_CAMPO_FECHA_REQUERIDA };
    expect(primerErrorConFoco([sinFoco])).toBeUndefined();
    expect(primerErrorConFoco([sinFoco, fecha])).toBe(fecha);
  });
});
