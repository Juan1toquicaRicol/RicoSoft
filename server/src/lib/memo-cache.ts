/**
 * Caché genérica en memoria, de muy corta duración (segundos), para
 * proteger el pool de conexiones a Siesa (max: 5, ver config/siesa.ts) de
 * cargas repetidas del mismo dashboard en una ventana corta — NO para datos
 * que deban ser siempre en vivo al segundo. Cada clave es responsabilidad de
 * quien la arma: para aislar por tenant, la clave debe incluir el tenantId
 * (o el siesaCiaId) explícitamente, igual que ya hace cada query a Siesa con
 * `ciaId` — este módulo no impone esa disciplina, solo guarda lo que le dan.
 *
 * Deliberadamente NO es Redis ni ninguna caché distribuida: un TTL de
 * 30-60s en memoria de proceso es suficiente para el problema real (varios
 * usuarios recargando /analitica en la misma ventana corta), y evita
 * introducir una dependencia nueva para esto.
 */

interface EntradaCache<T> {
  valor: T;
  expiraEn: number;
}

const almacen = new Map<string, EntradaCache<unknown>>();

/**
 * Devuelve el valor cacheado para `clave` si todavía no expiró; si no,
 * ejecuta `productor`, guarda el resultado con el TTL dado y lo devuelve.
 * Los errores de `productor` NUNCA se cachean (para no atascar el dashboard
 * con un error de conexión a Siesa hasta que expire el TTL).
 */
export async function getOrSetCache<T>(
  clave: string,
  ttlMs: number,
  productor: () => Promise<T>,
): Promise<T> {
  const ahora = Date.now();
  const existente = almacen.get(clave) as EntradaCache<T> | undefined;
  if (existente && existente.expiraEn > ahora) {
    return existente.valor;
  }
  const valor = await productor();
  almacen.set(clave, { valor, expiraEn: ahora + ttlMs });
  return valor;
}

/** Solo para tests: limpia todas las entradas cacheadas. */
export function limpiarCache(): void {
  almacen.clear();
}
