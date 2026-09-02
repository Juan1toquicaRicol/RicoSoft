import type { ComponenteBomSiesa } from "../modules/integraciones-siesa/siesa-manufactura.service";
import type { RecomendacionProduccionSiesa } from "./produccion-siesa";
import type { ExistenciaItemSiesa } from "../modules/integraciones-siesa/siesa-inventario.service";

/**
 * Necesidades de abastecimiento — Etapa K del módulo Producción &
 * Planeación: "para producir lo recomendado (Bloque 4), ¿qué materias
 * primas/insumos nos faltan?"
 *
 * Por cada producto con producción recomendada, se explota su receta real
 * (BOM, t820_mf_lista_material) para calcular cuánto se necesita de cada
 * componente:
 *
 *   necesidadComponente = Σ produccionRecomendada(padre) × (cantRequerida ÷ cantBase) × (1 + %desperdicio/100)
 *
 * y se compara contra la existencia real de ese componente
 * (t400_cm_existencia, la MISMA fuente ya usada en Bloque 1 — un insumo es
 * justamente un ítem con esVendible=false, así que se busca en el mismo
 * mapa de existencias sin filtrar por esVendible).
 *
 *   déficit = max(0, necesidad − disponible)
 *
 * Solo se reportan componentes con déficit real (> 0) — si ya hay
 * suficiente, no hace falta comprar nada de ese insumo.
 *
 * Productos sin receta en Siesa (ej. resinas que se compran directamente,
 * no se fabrican) simplemente no aportan necesidades — es un caso real y
 * válido, no un error.
 */
export interface NecesidadAbastecimientoSiesa {
  componenteRowId: number;
  descripcion: string | null;
  referencia: string | null;
  cantidadNecesaria: number;
  cantidadDisponible: number;
  deficit: number;
}

export function calcularNecesidadesAbastecimientoSiesa(
  produccionRecomendada: RecomendacionProduccionSiesa[],
  bom: ComponenteBomSiesa[],
  existencias: ExistenciaItemSiesa[],
): NecesidadAbastecimientoSiesa[] {
  const existenciaPorItem = new Map(existencias.map((e) => [e.itemRowId, e]));

  const bomPorPadre = new Map<number, ComponenteBomSiesa[]>();
  for (const b of bom) {
    const arr = bomPorPadre.get(b.itemPadreRowId) ?? [];
    arr.push(b);
    bomPorPadre.set(b.itemPadreRowId, arr);
  }

  const necesidadPorComponente = new Map<
    number,
    { descripcion: string | null; referencia: string | null; cantidad: number }
  >();

  for (const p of produccionRecomendada) {
    const componentes = bomPorPadre.get(p.itemRowId);
    if (!componentes) continue;
    for (const c of componentes) {
      if (c.cantBase <= 0) continue;
      const proporcion = c.cantRequerida / c.cantBase;
      const factorDesperdicio = 1 + c.pctDesperdicio / 100;
      const cantidadNecesaria = p.produccionRecomendada * proporcion * factorDesperdicio;

      const actual = necesidadPorComponente.get(c.componenteRowId) ?? {
        descripcion: c.descripcionComponente,
        referencia: c.referenciaComponente,
        cantidad: 0,
      };
      actual.cantidad += cantidadNecesaria;
      necesidadPorComponente.set(c.componenteRowId, actual);
    }
  }

  const resultados: NecesidadAbastecimientoSiesa[] = [];
  for (const [componenteRowId, n] of necesidadPorComponente) {
    const disponible = existenciaPorItem.get(componenteRowId)?.cantidadExistente ?? 0;
    const deficit = Math.max(0, n.cantidad - disponible);
    if (deficit <= 0) continue;
    resultados.push({
      componenteRowId,
      descripcion: n.descripcion,
      referencia: n.referencia,
      cantidadNecesaria: n.cantidad,
      cantidadDisponible: disponible,
      deficit,
    });
  }

  return resultados.sort((a, b) => b.deficit - a.deficit).slice(0, 20);
}
