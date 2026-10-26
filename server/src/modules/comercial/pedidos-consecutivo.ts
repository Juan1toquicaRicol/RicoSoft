import type { Prisma } from "@prisma/client";

/** Primer consecutivo de PedidoComercial de un tenant (default de
 * ConfiguracionComercial.siguienteConsecutivoPedidoComercial). */
export const PRIMER_NUMERO_PEDIDO = 1;

type DbConsecutivoPedido = Pick<
  Prisma.TransactionClient,
  "pedidoComercial" | "configuracionComercial"
>;

/**
 * Siguiente número EFECTIVO de PedidoComercial:
 *   max(contador del tenant, MAX(PedidoComercial.numero) + 1)
 * El contador es monotónico y nunca retrocede; el MAX cubre pedidos anteriores
 * al contador, de modo que un número ya usado jamás se reutiliza.
 */
export function calcularSiguienteNumeroPedido(
  contador: number | null,
  maxNumero: number | null,
): number {
  return Math.max(contador ?? PRIMER_NUMERO_PEDIDO, (maxNumero ?? 0) + 1);
}

/** Consulta contador y MAX, ambos acotados a `where: { tenantId }`. */
export async function siguienteNumeroPedidoComercial(
  db: DbConsecutivoPedido,
  tenantId: string,
): Promise<number> {
  const [config, ultimo] = await Promise.all([
    db.configuracionComercial.findFirst({
      where: { tenantId },
      select: { siguienteConsecutivoPedidoComercial: true },
    }),
    db.pedidoComercial.findFirst({
      where: { tenantId },
      orderBy: { numero: "desc" },
      select: { numero: true },
    }),
  ]);
  return calcularSiguienteNumeroPedido(
    config?.siguienteConsecutivoPedidoComercial ?? null,
    ultimo?.numero ?? null,
  );
}

/**
 * Sube el contador a `numeroConsumido + 1` SOLO si es mayor que el actual,
 * con un UPDATE condicional atómico (jamás retrocede). Si el tenant no tiene
 * fila de ConfiguracionComercial, la crea (una creación concurrente lanza
 * P2002 sobre ConfiguracionComercial: el llamador reintenta la transacción).
 */
export async function avanzarContadorPedidoComercial(
  tx: Pick<Prisma.TransactionClient, "configuracionComercial">,
  tenantId: string,
  numeroConsumido: number,
): Promise<void> {
  const nuevo = numeroConsumido + 1;
  const { count } = await tx.configuracionComercial.updateMany({
    where: { tenantId, siguienteConsecutivoPedidoComercial: { lt: nuevo } },
    data: { siguienteConsecutivoPedidoComercial: nuevo },
  });
  if (count > 0) return;

  const existente = await tx.configuracionComercial.findFirst({
    where: { tenantId },
    select: { id: true },
  });
  if (existente) return; // el contador ya es >= nuevo: no se reduce.

  await tx.configuracionComercial.create({
    data: {
      tenantId,
      siguienteConsecutivoPedidoComercial: Math.max(PRIMER_NUMERO_PEDIDO, nuevo),
    },
  });
}
