import type { Permiso } from "@/lib/data";

/** Texto visible junto a las acciones cuando no se puede aprobar (D-04). */
export const AVISO_PERMISO_COLABORADOR_NO_VIGENTE =
  "Colaborador liquidado o eliminado: solo se puede rechazar.";

/**
 * D-04: el permiso pendiente de un colaborador liquidado o eliminado no se
 * aprueba (el backend responde 409); solo se puede rechazar. Si el backend no
 * informa el dato (`undefined`), no se bloquea en la UI: el backend sigue siendo
 * quien decide.
 */
export function puedeAprobarPermiso(p: Pick<Permiso, "estado" | "colaboradorVigente">): boolean {
  return p.estado === "Pendiente" && p.colaboradorVigente !== false;
}
