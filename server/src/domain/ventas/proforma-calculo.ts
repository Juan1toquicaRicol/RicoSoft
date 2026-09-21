/**
 * Cálculo de totales de una Proforma — ÚNICA fuente de verdad (el frontend
 * puede recalcular para preview optimista, pero lo que persiste/se imprime
 * siempre viene de aquí, vía serializarProforma en proformas.controller.ts).
 *
 * Reglas de negocio (RICOL), tasas parametrizables por tenant vía
 * ConfiguracionComercial, snapshot en cada Proforma:
 * - totalBruto = Σ(cantidad × precioUnitario), ANTES de descuentos.
 * - subtotal   = Σ(cantidad × precioUnitario × (1 - descuentoPct/100)), DESPUÉS de descuentos.
 * - iva        = Σ(subtotalLínea × ivaPct/100).
 * - retencionFuente = aplicaRetencion   ? totalBruto × retencionPct/100    : 0  (sobre BRUTO, no subtotal).
 * - retencionIva    = aplicaRetencionIva ? iva × retencionIvaPct/100       : 0  (sobre el IVA, no el bruto).
 * - retencionIca    = aplicaIca         ? totalBruto × icaPct/100         : 0  (sobre BRUTO, no subtotal).
 * - total = subtotal + iva - retencionFuente - retencionIva - retencionIca.
 */
export interface ItemProformaCalculo {
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  ivaPct: number;
}

export interface EncabezadoRetencionProforma {
  aplicaRetencion: boolean;
  retencionPct: number;
  aplicaRetencionIva: boolean;
  retencionIvaPct: number;
  aplicaIca: boolean;
  icaPct: number;
}

export interface TotalesProforma {
  totalBruto: number;
  subtotal: number;
  iva: number;
  retencionFuente: number;
  retencionIva: number;
  retencionIca: number;
  total: number;
}

const redondear = (n: number): number => Math.round(n * 100) / 100;

export function calcularTotalesProforma(
  items: ItemProformaCalculo[],
  encabezado: EncabezadoRetencionProforma,
): TotalesProforma {
  const totalBruto = items.reduce((acc, it) => acc + it.cantidad * it.precioUnitario, 0);

  const subtotal = items.reduce(
    (acc, it) => acc + it.cantidad * it.precioUnitario * (1 - it.descuentoPct / 100),
    0,
  );

  const iva = items.reduce((acc, it) => {
    const subtotalLinea = it.cantidad * it.precioUnitario * (1 - it.descuentoPct / 100);
    return acc + subtotalLinea * (it.ivaPct / 100);
  }, 0);

  const retencionFuente = encabezado.aplicaRetencion
    ? totalBruto * (encabezado.retencionPct / 100)
    : 0;
  const retencionIva = encabezado.aplicaRetencionIva ? iva * (encabezado.retencionIvaPct / 100) : 0;
  const retencionIca = encabezado.aplicaIca ? totalBruto * (encabezado.icaPct / 100) : 0;

  const total = subtotal + iva - retencionFuente - retencionIva - retencionIca;

  return {
    totalBruto: redondear(totalBruto),
    subtotal: redondear(subtotal),
    iva: redondear(iva),
    retencionFuente: redondear(retencionFuente),
    retencionIva: redondear(retencionIva),
    retencionIca: redondear(retencionIca),
    total: redondear(total),
  };
}
