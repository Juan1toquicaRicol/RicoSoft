/**
 * Espejo en frontend, SOLO para preview optimista antes de guardar, de
 * domain/ventas/proforma-calculo.ts (backend) — misma fórmula, una única
 * implementación en cada lado (nunca duplicada dos veces en frontend). Lo
 * que persiste y se imprime SIEMPRE viene del backend
 * (Proforma.totalBruto/subtotal/iva/retencionFuente/retencionIva/
 * retencionIca/total en la respuesta de la API), nunca de este cálculo.
 */
export interface ItemProformaCalculoPreview {
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  ivaPct: number;
}

export interface EncabezadoRetencionPreview {
  aplicaRetencion: boolean;
  retencionPct: number;
  aplicaRetencionIva: boolean;
  retencionIvaPct: number;
  aplicaIca: boolean;
  icaPct: number;
}

export interface TotalesProformaPreview {
  totalBruto: number;
  subtotal: number;
  iva: number;
  retencionFuente: number;
  retencionIva: number;
  retencionIca: number;
  total: number;
}

export function calcularTotalesProformaPreview(
  items: ItemProformaCalculoPreview[],
  encabezado: EncabezadoRetencionPreview,
): TotalesProformaPreview {
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

  return { totalBruto, subtotal, iva, retencionFuente, retencionIva, retencionIca, total };
}
