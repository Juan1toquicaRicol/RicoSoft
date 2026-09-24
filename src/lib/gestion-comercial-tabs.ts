import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

export type TabGestion = "todos" | "cotizacion" | "proforma" | "pedido";

export interface DefinicionTabGestion {
  value: TabGestion;
  label: string;
  /** Se exigen TODOS los permisos listados para ver la pestaña. */
  permisos?: string[];
}

export const TABS_GESTION: DefinicionTabGestion[] = [
  { value: "todos", label: "Todos" },
  { value: "cotizacion", label: "Cotizaciones", permisos: [PERMISOS_SISTEMA.COTIZACIONES_VER] },
  { value: "proforma", label: "Proformas", permisos: [PERMISOS_SISTEMA.PROFORMAS_VER] },
  { value: "pedido", label: "Pedidos", permisos: [PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER] },
];

/** Valor de ?tab= en la URL -> pestaña interna (p. ej. /comercial/gestion?tab=pedidos). */
export function tabDesdeUrl(valor: unknown): TabGestion | undefined {
  switch (valor) {
    case "todos":
      return "todos";
    case "cotizaciones":
      return "cotizacion";
    case "proformas":
      return "proforma";
    case "pedidos":
      return "pedido";
    default:
      return undefined;
  }
}


export function tabsVisibles(tienePermiso: (permiso: string) => boolean): DefinicionTabGestion[] {
  return TABS_GESTION.filter((t) => !t.permisos || t.permisos.every(tienePermiso));
}

/** Pestaña realmente activa: si la pedida no es visible para el usuario, "todos". */
export function tabEfectiva(pedida: TabGestion, visibles: DefinicionTabGestion[]): TabGestion {
  return visibles.some((t) => t.value === pedida) ? pedida : "todos";
}
