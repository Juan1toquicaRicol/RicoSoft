import { describe, expect, it } from "vitest";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { tabDesdeUrl, tabEfectiva, tabsVisibles } from "./gestion-comercial-tabs";

const con =
  (...permisos: string[]) =>
  (p: string) =>
    permisos.includes(p);
const valores = (visibles: ReturnType<typeof tabsVisibles>) => visibles.map((t) => t.value);

describe("pestañas de Gestión Comercial", () => {
  it("cada pestaña exige su propio VER; no existe una pestaña 'Comprometido en Siesa' aparte", () => {
    const soloPedidos = tabsVisibles(con(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER));
    expect(valores(soloPedidos)).toEqual(["todos", "pedido"]);

    const docs = tabsVisibles(
      con(PERMISOS_SISTEMA.COTIZACIONES_VER, PERMISOS_SISTEMA.PROFORMAS_VER),
    );
    expect(valores(docs)).toEqual(["todos", "cotizacion", "proforma"]);

    const todo = tabsVisibles(
      con(
        PERMISOS_SISTEMA.COTIZACIONES_VER,
        PERMISOS_SISTEMA.PROFORMAS_VER,
        PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER,
      ),
    );
    expect(valores(todo)).toEqual(["todos", "cotizacion", "proforma", "pedido"]);
    expect(todo.map((t) => t.label)).not.toContain("Comprometido en Siesa");
  });

  it("?tab=pedidos (URL) abre la pestaña Pedidos; valores desconocidos se ignoran", () => {
    expect(tabDesdeUrl("pedidos")).toBe("pedido");
    expect(tabDesdeUrl("cotizaciones")).toBe("cotizacion");
    expect(tabDesdeUrl("proformas")).toBe("proforma");
    expect(tabDesdeUrl("comprometido")).toBeUndefined();
    expect(tabDesdeUrl(undefined)).toBeUndefined();
  });

  it("un enlace ?tab=pedidos sin pedidos_comerciales.ver cae a 'todos'", () => {
    const sinPedidos = tabsVisibles(con(PERMISOS_SISTEMA.COTIZACIONES_VER));
    expect(tabEfectiva("pedido", sinPedidos)).toBe("todos");
    const conPedidos = tabsVisibles(con(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER));
    expect(tabEfectiva("pedido", conPedidos)).toBe("pedido");
  });
});
