import type { Prisma } from "@prisma/client";

/** Numeración de proformas: continúa la secuencia manual anterior (la
 * última proforma en Excel fue la 3889) — la primera creada en RicoSoft
 * debe ser la 3890, aunque el tenant todavía no tenga ninguna. Este piso
 * SOLO aplica cuando el tenant no tiene ninguna Proforma: si ya existe
 * alguna, el siguiente es siempre MAX(numero) + 1, aunque ese máximo sea
 * menor que el piso (p. ej. una primera proforma manual con número 5 → 6). */
export const PRIMER_NUMERO_PROFORMA = 3890;

export function calcularSiguienteNumero(ultimoNumero: number | null): number {
  return ultimoNumero === null ? PRIMER_NUMERO_PROFORMA : ultimoNumero + 1;
}

/**
 * ÚNICA fuente del consecutivo de Proforma: la usan tanto
 * GET /proformas/siguiente-numero (informativo) como la creación automática
 * (dentro de su $transaction). Acepta el cliente base o un `tx`. La consulta
 * está estrictamente acotada a `where: { tenantId }`.
 *
 * El valor NO se reserva: la autoridad real es la creación en backend, con
 * @@unique([tenantId, numero]) como garantía definitiva contra duplicados.
 */
export async function siguienteNumeroProforma(
  db: Pick<Prisma.TransactionClient, "proforma">,
  tenantId: string,
): Promise<number> {
  const ultima = await db.proforma.findFirst({
    where: { tenantId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return calcularSiguienteNumero(ultima?.numero ?? null);
}
