/**
 * Nombre de la cuenta de usuario (User): `nombres` y `apellidos` son columnas
 * independientes y opcionales; `nombre` sigue siendo el nombre completo
 * (compatibilidad con auditoría, notificaciones y las copias históricas
 * "creadoPorNombre", "registradoPorNombre", etc.).
 *
 * Reglas:
 *  - Con `nombres` Y `apellidos`, `nombre` se DERIVA de ellos (única fuente).
 *  - Solo con `nombre` (clientes antiguos, cuentas ya existentes) se guarda tal
 *    cual y NUNCA se separa automáticamente: `nombres`/`apellidos` quedan en
 *    null, pendientes de que alguien los complete.
 */

export interface EntradaNombre {
  nombre?: string | null;
  nombres?: string | null;
  apellidos?: string | null;
}

export interface DatosNombreUsuario {
  nombre: string;
  nombres: string | null;
  apellidos: string | null;
}

const limpiar = (valor: unknown): string =>
  typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";

export function componerNombre(nombres: string, apellidos: string): string {
  return `${limpiar(nombres)} ${limpiar(apellidos)}`.trim();
}

/** Lo que se guarda en User para un alta; null si no hay un nombre utilizable. */
export function resolverNombreUsuario(entrada: EntradaNombre): DatosNombreUsuario | null {
  const nombres = limpiar(entrada.nombres);
  const apellidos = limpiar(entrada.apellidos);
  if (nombres && apellidos) {
    return { nombre: componerNombre(nombres, apellidos), nombres, apellidos };
  }
  const nombre = limpiar(entrada.nombre);
  if (!nombre) return null;
  return { nombre, nombres: null, apellidos: null };
}

/**
 * Lo que se actualiza en User al editar el nombre. Si solo llega `nombre` y es
 * igual al actual no se toca nada (así un cliente antiguo no borra el nombre
 * separado ya capturado); si es distinto, `nombres`/`apellidos` se vacían
 * porque dejarían de coincidir con `nombre`. null si no hay nombre utilizable.
 */
export function datosActualizacionNombre(
  entrada: EntradaNombre,
  actual: { nombre: string },
): Partial<DatosNombreUsuario> | null {
  const resuelto = resolverNombreUsuario(entrada);
  if (!resuelto) return null;
  if (resuelto.nombres !== null) return resuelto;
  if (resuelto.nombre === limpiar(actual.nombre)) return {};
  return resuelto;
}
