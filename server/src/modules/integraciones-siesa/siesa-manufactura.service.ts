import { getSiesaPool } from "../../config/siesa";

/**
 * Lectura de la lista de materiales (BOM/receta) real desde Siesa/UnoEE
 * (t820_mf_lista_material — confirmado en vivo: 13.172 líneas activas en
 * Ricol, 2.284 productos "padre" con receta real, ej. "NARANJA RICOL PE UV
 * 6489" con 12 componentes reales: resina base, colorantes, estabilizantes
 * UV, carga mineral, hasta el saco de empaque). Solo lectura.
 *
 * IMPORTANTE — cant_requerida es relativa a cant_base (el tamaño de lote
 * de la receta, ej. 100), NO una cantidad absoluta por unidad de producto.
 * Verificado en vivo: las 12 líneas de la receta de ejemplo tienen
 * cant_base=100 uniforme, y cant_requerida representa cuánto de ese
 * componente se necesita por cada 100 unidades del producto final. La
 * proporción real por unidad es cant_requerida ÷ cant_base — así se usa en
 * lib/abastecimiento-siesa.ts. Ningún producto NO tiene BOM también es
 * válido (ej. PET JADE CZ-302 no tiene receta: es una resina que se compra
 * directamente, no se fabrica a partir de otros ítems).
 */
export interface ComponenteBomSiesa {
  itemPadreRowId: number;
  componenteRowId: number;
  descripcionComponente: string | null;
  referenciaComponente: string | null;
  cantBase: number;
  cantRequerida: number;
  pctDesperdicio: number;
}

export async function leerListaMaterialesSiesa(ciaId: number): Promise<ComponenteBomSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).query<{
    itemPadreRowId: number;
    componenteRowId: number;
    descripcionComponente: string | null;
    referenciaComponente: string | null;
    cantBase: number;
    cantRequerida: number;
    pctDesperdicio: number;
  }>(`
    SELECT
      b.f820_rowid_item_ext AS itemPadreRowId,
      b.f820_rowid_item_ext_hijo AS componenteRowId,
      MAX(it.f120_descripcion) AS descripcionComponente,
      MAX(it.f120_referencia) AS referenciaComponente,
      MAX(b.f820_cant_base) AS cantBase,
      MAX(b.f820_cant_requerida) AS cantRequerida,
      MAX(ISNULL(b.f820_porcentaje_desperdicio, 0)) AS pctDesperdicio
    FROM t820_mf_lista_material b
    LEFT JOIN t120_mc_items it ON it.f120_rowid = b.f820_rowid_item_ext_hijo
    WHERE b.f820_id_cia = @ciaId
      AND (b.f820_fecha_inactivacion IS NULL OR b.f820_fecha_inactivacion > GETDATE())
    GROUP BY b.f820_rowid_item_ext, b.f820_rowid_item_ext_hijo
  `);
  return recordset.map((r) => ({
    itemPadreRowId: r.itemPadreRowId,
    componenteRowId: r.componenteRowId,
    descripcionComponente: r.descripcionComponente?.trim() || null,
    referenciaComponente: r.referenciaComponente?.trim() || null,
    cantBase: Number(r.cantBase ?? 0),
    cantRequerida: Number(r.cantRequerida ?? 0),
    pctDesperdicio: Number(r.pctDesperdicio ?? 0),
  }));
}
