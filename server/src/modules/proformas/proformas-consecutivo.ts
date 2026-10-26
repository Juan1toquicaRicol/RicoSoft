import type { Prisma } from "@prisma/client";

/** Valor histórico inicial del consecutivo de Proforma: la última proforma
 * en Excel fue la 3889, así que la primera creada en RicoSoft es la 3890.
 * Es también el default de ConfiguracionComercial.siguienteConsecutivoProforma. */
export const PRIMER_NUMERO_PROFORMA = 3890;

type DbConsecutivo = Pick<Prisma.TransactionClient, "proforma" | "configuracionComercial">;

/**
 * Siguiente número EFECTIVO de Proforma:
 *   max(contador del tenant, MAX(Proforma.numero) + 1)
 * El contador (ConfiguracionComercial.siguienteConsecutivoProforma, default
 * 3890 si el tenant no tiene fila) es monotónico y nunca retrocede; el MAX
 * cubre números manuales altos y proformas creadas antes del contador, de
 * modo que un número ya usado jamás se vuelve a sugerir.
 */
export function calcularSiguienteNumero(contador: number | null, maxNumero: number | null): number {
  return Math.max(contador ?? PRIMER_NUMERO_PROFORMA, (maxNumero ?? 0) + 1);
}

/**
 * ÚNICA fuente del consecutivo de Proforma: la usan GET
 * /proformas/siguiente-numero y GET/PUT configuracion-comercial
 * (informativos) y la creación automática (dentro de su $transaction).
 * Acepta el cliente base o un `tx`. Ambas consultas están estrictamente
 * acotadas a `where: { tenantId }`.
 *
 * El valor NO se reserva: la autoridad real es la creación en backend, con
 * @@unique([tenantId, numero]) como garantía definitiva contra duplicados.
 */
export async function siguienteNumeroProforma(
  db: DbConsecutivo,
  tenantId: string,
): Promise<number> {
  const [config, ultima] = await Promise.all([
    db.configuracionComercial.findFirst({
      where: { tenantId },
      select: { siguienteConsecutivoProforma: true },
    }),
    db.proforma.findFirst({
      where: { tenantId },
      orderBy: { numero: "desc" },
      select: { numero: true },
    }),
  ]);
  return calcularSiguienteNumero(
    config?.siguienteConsecutivoProforma ?? null,
    ultima?.numero ?? null,
  );
}

/**
 * Sube el contador a `numeroConsumido + 1` SOLO si es mayor que el actual
 * (max(contadorActual, numeroConsumido + 1)), de forma atómica: el UPDATE es
 * condicional (`contador < nuevo`), así que jamás retrocede aunque otra
 * transacción lo haya subido entre tanto, y un número manual menor al
 * vigente no lo toca. Si el tenant no tiene fila, la crea (una creación
 * concurrente de la misma fila lanza P2002 sobre ConfiguracionComercial; el
 * llamador debe reintentar la transacción — ver esViolacionContadorConsecutivo).
 */
export async function avanzarContadorProforma(
  tx: Pick<Prisma.TransactionClient, "configuracionComercial">,
  tenantId: string,
  numeroConsumido: number,
): Promise<void> {
  const nuevo = numeroConsumido + 1;
  const { count } = await tx.configuracionComercial.updateMany({
    where: { tenantId, siguienteConsecutivoProforma: { lt: nuevo } },
    data: { siguienteConsecutivoProforma: nuevo },
  });
  if (count > 0) return;

  const existente = await tx.configuracionComercial.findFirst({
    where: { tenantId },
    select: { id: true },
  });
  if (existente) return; // el contador ya es >= nuevo: no se reduce.

  await tx.configuracionComercial.create({
    data: { tenantId, siguienteConsecutivoProforma: Math.max(PRIMER_NUMERO_PROFORMA, nuevo) },
  });
}
