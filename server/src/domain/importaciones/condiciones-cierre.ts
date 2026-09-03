/**
 * Condiciones de cierre de una Orden de Compra Internacional — función
 * pura. Deliberadamente CONFIGURABLE, no un candado fijo: la regla de
 * negocio real de "cuándo se puede cerrar una importación" está pendiente
 * de validación con Comercio Exterior (ver PENDIENTES_CONSOLIDADO.md #1 y
 * #13). El default implementado es el conjunto más conservador y
 * defendible con lo que el modelo de datos ya puede verificar; el
 * controller puede pasar `overrides` para relajar una condición puntual
 * sin tocar esta función.
 */

export interface LoteParaCierre {
  id: string;
  estado: string;
}

export interface ItemConCosteo {
  itemId: string;
  tieneCosteoDefinitivo: boolean;
}

export interface NovedadParaCierre {
  id: string;
  prioridad: string;
  estado: string;
}

export interface CondicionesCierre {
  todosLotesNacionalizados: boolean;
  todosItemsConCosteoDefinitivo: boolean;
  sinNovedadesCriticasAbiertas: boolean;
}

export interface ResultadoCondicionesCierre {
  puedeCerrarse: boolean;
  condiciones: CondicionesCierre;
  faltantes: string[];
}

export interface OverridesCierre {
  ignorarLotesNacionalizados?: boolean;
  ignorarCosteoDefinitivo?: boolean;
  ignorarNovedadesCriticas?: boolean;
}

export function evaluarCondicionesCierre(
  lotes: LoteParaCierre[],
  items: ItemConCosteo[],
  novedades: NovedadParaCierre[],
  overrides: OverridesCierre = {},
): ResultadoCondicionesCierre {
  const todosLotesNacionalizados =
    overrides.ignorarLotesNacionalizados ||
    (lotes.length > 0 && lotes.every((l) => l.estado === "Nacionalizado"));

  const todosItemsConCosteoDefinitivo =
    overrides.ignorarCosteoDefinitivo ||
    (items.length > 0 && items.every((i) => i.tieneCosteoDefinitivo));

  const sinNovedadesCriticasAbiertas =
    overrides.ignorarNovedadesCriticas ||
    !novedades.some((n) => n.estado !== "Resuelta" && n.prioridad === "Alta");

  const faltantes: string[] = [];
  if (!todosLotesNacionalizados) {
    faltantes.push(
      lotes.length === 0
        ? "No hay lotes/embarques registrados."
        : "Todavía hay lotes que no están Nacionalizados.",
    );
  }
  if (!todosItemsConCosteoDefinitivo) {
    faltantes.push(
      items.length === 0
        ? "La orden no tiene ítems."
        : "Todavía hay ítems sin costeo definitivo liquidado.",
    );
  }
  if (!sinNovedadesCriticasAbiertas) {
    faltantes.push("Hay novedades de prioridad Alta todavía sin resolver.");
  }

  return {
    puedeCerrarse: faltantes.length === 0,
    condiciones: {
      todosLotesNacionalizados,
      todosItemsConCosteoDefinitivo,
      sinNovedadesCriticasAbiertas,
    },
    faltantes,
  };
}
