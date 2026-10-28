import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

export type TabGestion = "todos" | "cotizacion" | "proforma" | "pedido";

export interface DefinicionTabGestion {
  value: TabGestion;
  label: string;
  /** Se exigen TODOS los permisos listados para ver la pestaña. */
  permisos?: string[];
}

/** Gestión Comercial solo muestra la pestaña de Proformas. */
export const TABS_GESTION: DefinicionTabGestion[] = [
  { value: "proforma", label: "Proformas", permisos: [PERMISOS_SISTEMA.PROFORMAS_VER] },
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

/** Pestaña realmente activa: si la pedida no es visible para el usuario, "proforma". */
export function tabEfectiva(pedida: TabGestion, visibles: DefinicionTabGestion[]): TabGestion {
  return visibles.some((t) => t.value === pedida) ? pedida : "proforma";
}
