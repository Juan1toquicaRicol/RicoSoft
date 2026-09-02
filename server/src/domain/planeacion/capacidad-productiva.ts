import type { ComponenteBomSiesa } from "../../modules/integraciones-siesa/siesa-manufactura.service";
import type { RecomendacionProduccionSiesa } from "../../lib/produccion-siesa";
import type { ExistenciaItemSiesa } from "../../modules/integraciones-siesa/siesa-inventario.service";

/**
 * Capacidad productiva real según materiales — Fase B del Centro de
 * Planeación. Responde: "de la producción recomendada (lib/produccion-siesa.ts),
 * ¿cuánto realmente PODEMOS producir hoy con la materia prima disponible?"
 *
 * Reutiliza la MISMA receta real (BOM, t820_mf_lista_material) y la MISMA
 * fuente de existencias ya usadas en lib/abastecimiento-siesa.ts — no
 * duplica esas consultas ni sus fórmulas de proporción/desperdicio.
 *
 * Por cada producto con producción recomendada, para cada componente de su
 * receta se calcula cuántas unidades del producto final permite fabricar
 * ese componente con la existencia actual:
 *
 *   unidadesPosiblesPorComponente = existenciaComponente ÷ (proporciónPorUnidad × (1 + %desperdicio/100))
 *
 * La capacidad real del producto es el MÍNIMO entre todos sus componentes
 * (el material más escaso limita todo lo demás) — igual que en el ejemplo
 * de negocio: Materia X permite 400 unidades, Materia Y permite 250, la
 * capacidad real es 250 (Y es el material limitante).
 *
 * Productos sin receta en Siesa (se compran ya terminados, no se fabrican)
 * no tienen restricción de materiales conocida — se reportan con capacidad
 * ilimitada (null) en vez de asumir 0, que sería falso.
 */
export interface CapacidadProductivaSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  produccionRecomendada: number;
  /** Null = el producto no tiene receta en Siesa, no hay restricción de materiales conocida. */
  capacidadMaxima: number | null;
  materialLimitante: { componenteRowId: number; descripcion: string | null } | null;
  /** max(0, produccionRecomendada - capacidadMaxima). 0 si capacidadMaxima es null (sin restricción). */
  deficitProductivo: number;
}

export function calcularCapacidadProductivaSiesa(
  produccionRecomendada: RecomendacionProduccionSiesa[],
  bom: ComponenteBomSiesa[],
  existencias: ExistenciaItemSiesa[],
): CapacidadProductivaSiesa[] {
  const existenciaPorItem = new Map(existencias.map((e) => [e.itemRowId, e]));

  const bomPorPadre = new Map<number, ComponenteBomSiesa[]>();
  for (const b of bom) {
    const arr = bomPorPadre.get(b.itemPadreRowId) ?? [];
    arr.push(b);
    bomPorPadre.set(b.itemPadreRowId, arr);
  }

  return produccionRecomendada.map((p) => {
    const componentes = bomPorPadre.get(p.itemRowId);

    if (!componentes || componentes.length === 0) {
      return {
        itemRowId: p.itemRowId,
        descripcion: p.descripcion,
        referencia: p.referencia,
        unidadMedida: p.unidadMedida,
        produccionRecomendada: p.produccionRecomendada,
        capacidadMaxima: null,
        materialLimitante: null,
        deficitProductivo: 0,
      };
    }

    let capacidadMaxima = Infinity;
    let materialLimitante: { componenteRowId: number; descripcion: string | null } | null = null;

    for (const c of componentes) {
      if (c.cantBase <= 0) continue;
      const proporcion = c.cantRequerida / c.cantBase;
      if (proporcion <= 0) continue;
      const factorDesperdicio = 1 + c.pctDesperdicio / 100;
      const disponible = existenciaPorItem.get(c.componenteRowId)?.cantidadExistente ?? 0;
      const unidadesPosibles = disponible / (proporcion * factorDesperdicio);

      if (unidadesPosibles < capacidadMaxima) {
        capacidadMaxima = unidadesPosibles;
        materialLimitante = { componenteRowId: c.componenteRowId, descripcion: c.descripcionComponente };
      }
    }

    const capacidadFinal = Number.isFinite(capacidadMaxima) ? Math.max(0, capacidadMaxima) : null;
    const deficitProductivo =
      capacidadFinal !== null ? Math.max(0, p.produccionRecomendada - capacidadFinal) : 0;

    return {
      itemRowId: p.itemRowId,
      descripcion: p.descripcion,
      referencia: p.referencia,
      unidadMedida: p.unidadMedida,
      produccionRecomendada: p.produccionRecomendada,
      capacidadMaxima: capacidadFinal,
      materialLimitante: capacidadFinal !== null ? materialLimitante : null,
      deficitProductivo,
    };
  });
}
