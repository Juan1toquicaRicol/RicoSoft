import { Prisma } from "@prisma/client";

/**
 * Consecutivo de órdenes internacionales: IMP-<año>-<n> (n con mínimo 3
 * dígitos), una serie por tenant y por AÑO. ÚNICA fuente: la usan el GET/PUT de
 * Configuración de negocio (informativos) y la creación de la orden, que
 * asigna el número en el servidor DENTRO de la transacción que la crea.
 *
 * Siguiente efectivo = max(ConsecutivoImportacion.siguienteConsecutivo del
 * (tenant, año), MAX(consecutivo de los códigos/números existentes del año) + 1).
 * El MAX cubre las órdenes anteriores al contador y también las ANULADAS y
 * eliminadas (se leen todas las filas): un número ya usado jamás se reutiliza.
 * Los identificadores históricos no se modifican.
 *
 * Concurrencia: ver reservarConsecutivo.
 */

export const PREFIJO_CODIGO_IMPORTACION = "IMP";
const ZONA_HORARIA = "America/Bogota";

type DbConsecutivo = Pick<Prisma.TransactionClient, "ordenCompraIntl" | "consecutivoImportacion">;

/** Año de la serie "actual": el del calendario de Colombia (no UTC, para que
 * el 31-dic por la noche no abra la serie del año siguiente antes de tiempo). */
export function anioActualImportaciones(ahora: Date = new Date()): number {
  const anio = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
  }).format(ahora);
  return Number(anio);
}

export function formatearCodigoImportacion(anio: number, consecutivo: number): string {
  return `${PREFIJO_CODIGO_IMPORTACION}-${anio}-${String(consecutivo).padStart(3, "0")}`;
}

/** Consecutivo de un código IMP-<anio>-<n> del año dado, o null si no encaja. */
export function extraerConsecutivo(codigo: string | null | undefined, anio: number): number | null {
  if (!codigo) return null;
  const m = new RegExp(`^${PREFIJO_CODIGO_IMPORTACION}-${anio}-(\\d+)$`).exec(codigo.trim());
  return m ? Number(m[1]) : null;
}

/** Mayor consecutivo ya usado en el año por el tenant (0 si ninguno), sobre
 * `codigo` y `numeroOrden` de TODAS las órdenes (anuladas y eliminadas
 * incluidas). Acotado a tenantId. */
export async function maxConsecutivoExistente(
  db: Pick<DbConsecutivo, "ordenCompraIntl">,
  tenantId: string,
  anio: number,
): Promise<number> {
  const prefijo = `${PREFIJO_CODIGO_IMPORTACION}-${anio}-`;
  const filas = await db.ordenCompraIntl.findMany({
    where: {
      tenantId,
      OR: [{ codigo: { startsWith: prefijo } }, { numeroOrden: { startsWith: prefijo } }],
    },
    select: { codigo: true, numeroOrden: true },
  });
  let max = 0;
  for (const f of filas) {
    for (const valor of [f.codigo, f.numeroOrden]) {
      const n = extraerConsecutivo(valor, anio);
      if (n !== null && n > max) max = n;
    }
  }
  return max;
}

export interface EstadoConsecutivo {
  anio: number;
  /** Siguiente número efectivo (también el mínimo aceptado al fijarlo). */
  siguiente: number;
  /** Contador crudo de la fila del (tenant, año); null si aún no existe. */
  contador: number | null;
  /** Mayor consecutivo ya usado en el año (0 si ninguno). */
  maxExistente: number;
  filaId: string | null;
}

export function calcularSiguiente(contador: number | null, maxExistente: number): number {
  return Math.max(contador ?? 1, maxExistente + 1);
}

export async function leerEstadoConsecutivo(
  db: DbConsecutivo,
  tenantId: string,
  anio: number,
): Promise<EstadoConsecutivo> {
  const [fila, maxExistente] = await Promise.all([
    db.consecutivoImportacion.findUnique({ where: { tenantId_anio: { tenantId, anio } } }),
    maxConsecutivoExistente(db, tenantId, anio),
  ]);
  const contador = fila?.siguienteConsecutivo ?? null;
  return {
    anio,
    siguiente: calcularSiguiente(contador, maxExistente),
    contador,
    maxExistente,
    filaId: fila?.id ?? null,
  };
}

/** Otra transacción avanzó el contador entre nuestra lectura y nuestra
 * escritura: el llamador reintenta la transacción COMPLETA. */
export class ConsecutivoConcurrenteError extends Error {
  constructor() {
    super("El consecutivo cambió durante la reserva.");
    this.name = "ConsecutivoConcurrenteError";
  }
}

/** Errores que se resuelven reintentando la transacción de creación:
 * carrera sobre el contador (compare-and-set perdido), P2002 de la primera
 * creación de la fila (tenantId, anio) y conflicto/deadlock transitorio P2034. */
export function esConflictoReintentableConsecutivo(error: unknown): boolean {
  if (error instanceof ConsecutivoConcurrenteError) return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  return error.code === "P2002" && error.meta?.modelName === "ConsecutivoImportacion";
}

/**
 * Reserva el siguiente número del año DENTRO de la transacción `tx` que luego
 * crea la orden (si esa creación falla, la reserva se revierte con ella).
 *
 * Serialización: el avance es un compare-and-set sobre la fila del contador
 * (`UPDATE … WHERE siguienteConsecutivo = <leído>`). Dos transacciones que
 * leyeron el mismo valor compiten por el bloqueo de la fila: la segunda
 * espera, y al liberarse el predicado ya no se cumple (count 0) → lanza
 * ConsecutivoConcurrenteError y se reintenta releyendo el estado confirmado.
 * Si la fila aún no existe, el CREATE concurrente choca con
 * @@unique(tenantId, anio) (P2002) y también se reintenta.
 */
export async function reservarConsecutivo(
  tx: DbConsecutivo,
  tenantId: string,
  anio: number,
): Promise<{ consecutivo: number; codigo: string }> {
  const estado = await leerEstadoConsecutivo(tx, tenantId, anio);
  const consecutivo = estado.siguiente;

  if (estado.filaId) {
    const { count } = await tx.consecutivoImportacion.updateMany({
      where: { id: estado.filaId, tenantId, siguienteConsecutivo: estado.contador! },
      data: { siguienteConsecutivo: consecutivo + 1 },
    });
    if (count === 0) throw new ConsecutivoConcurrenteError();
  } else {
    await tx.consecutivoImportacion.create({
      data: { tenantId, anio, siguienteConsecutivo: consecutivo + 1 },
    });
  }
  return { consecutivo, codigo: formatearCodigoImportacion(anio, consecutivo) };
}

/** El valor pedido es inferior al siguiente efectivo vigente. */
export class ConsecutivoInferiorError extends Error {
  constructor(public readonly minimo: number) {
    super(`El siguiente consecutivo debe ser igual o superior al vigente (${minimo}).`);
    this.name = "ConsecutivoInferiorError";
  }
}

/**
 * Fija el siguiente consecutivo del año (solo hacia ARRIBA). Rechaza cualquier
 * valor inferior al efectivo vigente — que ya incluye los números de órdenes
 * anuladas y los códigos existentes —. Compare-and-set: si una creación
 * concurrente avanzó el contador, el valor pedido se revalida contra el
 * nuevo mínimo en vez de pisarlo.
 */
export async function fijarConsecutivo(
  tx: DbConsecutivo,
  tenantId: string,
  anio: number,
  solicitado: number,
): Promise<{ antes: EstadoConsecutivo; despues: EstadoConsecutivo }> {
  const antes = await leerEstadoConsecutivo(tx, tenantId, anio);
  if (solicitado < antes.siguiente) throw new ConsecutivoInferiorError(antes.siguiente);

  if (antes.filaId) {
    if (antes.contador !== solicitado) {
      const { count } = await tx.consecutivoImportacion.updateMany({
        where: { id: antes.filaId, tenantId, siguienteConsecutivo: antes.contador! },
        data: { siguienteConsecutivo: solicitado },
      });
      if (count === 0) throw new ConsecutivoConcurrenteError();
    }
  } else {
    await tx.consecutivoImportacion.create({
      data: { tenantId, anio, siguienteConsecutivo: solicitado },
    });
  }
  const despues = await leerEstadoConsecutivo(tx, tenantId, anio);
  return { antes, despues };
}
