/**
 * Cálculo de totales para Cotizacion y PedidoComercial (módulo Comercial →
 * Gestión Comercial) — ÚNICA fuente de verdad en backend, igual criterio que
 * domain/ventas/proforma-calculo.ts para Proforma. El frontend solo hace
 * preview; lo persistido/mostrado siempre viene de aquí.
 *
 * - bruto      = Σ(cantidad × precioUnitario), ANTES de descuentos.
 * - descuentos = Σ(cantidad × precioUnitario × descuentoPct/100).
 * - subtotal   = bruto - descuentos.
 * - impuestos  = Σ(subtotalLínea × ivaPct/100).
 * - total      = subtotal + impuestos.
 */
export interface ItemComercialCalculo {
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  ivaPct: number;
}

export interface TotalesComercial {
  subtotal: number;
  descuentos: number;
  impuestos: number;
  total: number;
}

const redondear = (n: number): number => Math.round(n * 100) / 100;

export function calcularTotalesComercial(items: ItemComercialCalculo[]): TotalesComercial {
  const bruto = items.reduce((acc, it) => acc + it.cantidad * it.precioUnitario, 0);
  const descuentos = items.reduce(
    (acc, it) => acc + it.cantidad * it.precioUnitario * (it.descuentoPct / 100),
    0,
  );
  const subtotal = bruto - descuentos;
  const impuestos = items.reduce((acc, it) => {
    const subtotalLinea = it.cantidad * it.precioUnitario * (1 - it.descuentoPct / 100);
    return acc + subtotalLinea * (it.ivaPct / 100);
  }, 0);
  const total = subtotal + impuestos;

  return {
    subtotal: redondear(subtotal),
    descuentos: redondear(descuentos),
    impuestos: redondear(impuestos),
    total: redondear(total),
  };
}
