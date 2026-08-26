export interface GrupoFilas<T> {
  clave: string;
  filas: T[];
}

/**
 * Agrupa filas por la clave que devuelva `claveDe` (p. ej. área, proveedor,
 * estado). `claveDe = null` significa "sin agrupar": devuelve un solo grupo
 * con clave "" para que el llamador pueda tratar ambos casos con el mismo
 * código de render. Los grupos se ordenan alfabéticamente (locale es) para
 * que el orden no cambie entre renders.
 */
export function agruparFilas<T>(filas: T[], claveDe: ((fila: T) => string) | null): GrupoFilas<T>[] {
  if (!claveDe) return [{ clave: "", filas }];

  const grupos = new Map<string, T[]>();
  for (const fila of filas) {
    const clave = claveDe(fila) || "Sin dato";
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(fila);
  }

  return Array.from(grupos.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .map(([clave, filas]) => ({ clave, filas }));
}
