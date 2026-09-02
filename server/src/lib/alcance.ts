/**
 * Departamento, Rol y Modulo pueden tener tenantId = NULL ("GENERAL":
 * visible/usable por todos los tenants, un único registro — no se duplica
 * por empresa) o un tenantId concreto (exclusivo de esa empresa). Este es el
 * filtro que un tenant puede usar: sus propios elementos + los generales.
 * Nunca "generales + cualquier tenant" — eso rompería el aislamiento.
 */
export function whereAlcance(tenantId: string) {
  return { OR: [{ tenantId: null }, { tenantId }] };
}

export type Alcance = "GENERAL" | "TENANT";

/** true si el registro es GENERAL (tenantId null). */
export function esGeneral(tenantId: string | null): boolean {
  return tenantId === null;
}
