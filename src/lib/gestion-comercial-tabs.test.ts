import { describe, expect, it } from "vitest";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { tabDesdeUrl, tabEfectiva, tabsVisibles } from "./gestion-comercial-tabs";

const con =
  (...permisos: string[]) =>
  (p: string) =>
    permisos.includes(p);
const valores = (visibles: ReturnType<typeof tabsVisibles>) => visibles.map((t) => t.value);

describe("pestañas de Gestión Comercial", () => {
  it("solo existe la pestaña Proformas y exige proformas.ver", () => {
    const conProformas = tabsVisibles(con(PERMISOS_SISTEMA.PROFORMAS_VER));
    expect(valores(conProformas)).toEqual(["proforma"]);
    expect(conProformas.map((t) => t.label)).toEqual(["Proformas"]);

    const sinProformas = tabsVisibles(
      con(PERMISOS_SISTEMA.COTIZACIONES_VER, PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER),
    );
    expect(valores(sinProformas)).toEqual([]);
  });

  it("?tab= (URL) se interpreta; valores desconocidos se ignoran", () => {
    expect(tabDesdeUrl("proformas")).toBe("proforma");
    expect(tabDesdeUrl("pedidos")).toBe("pedido");
    expect(tabDesdeUrl("comprometido")).toBeUndefined();
    expect(tabDesdeUrl(undefined)).toBeUndefined();
  });

  it("un enlace a una pestaña que ya no existe (?tab=pedidos, cotizaciones, todos) cae a 'proforma'", () => {
    const visibles = tabsVisibles(con(PERMISOS_SISTEMA.PROFORMAS_VER));
    expect(tabEfectiva("pedido", visibles)).toBe("proforma");
    expect(tabEfectiva("cotizacion", visibles)).toBe("proforma");
    expect(tabEfectiva("todos", visibles)).toBe("proforma");
    expect(tabEfectiva("proforma", visibles)).toBe("proforma");
  });
});
