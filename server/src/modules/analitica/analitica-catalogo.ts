/**
 * Catálogo CERRADO de métricas y dimensiones para el "constructor de
 * análisis" de Analítica (P0). El usuario NUNCA envía una métrica o
 * dimensión arbitraria: solo elige una combinación de este catálogo, y el
 * backend valida cada combinación contra allowedDimensions antes de
 * ejecutar nada — nunca se construye SQL a partir de la entrada del
 * usuario, y ninguna fórmula de margen/ventas se recalcula aquí (ver
 * analitica-analisis.service.ts, que reutiliza las mismas funciones ya
 * verificadas de siesa-ventas.service.ts / ventas-siesa.ts).
 */

export type MetricaKey = "margen" | "ventas" | "clientes";
export type DimensionKey = "cliente" | "vendedor" | "fecha";
export type OrdenDireccion = "asc" | "desc";
export type VisualizacionKey = "tabla" | "barras" | "linea" | "area" | "dona";

export interface DimensionDefinition {
  key: DimensionKey;
  label: string;
}

export interface MetricDefinition {
  key: MetricaKey;
  label: string;
  descripcion: string;
  allowedDimensions: DimensionKey[];
  /** Campos numéricos que devuelve esta métrica, para "ordenar por" y para los indicadores del resultado. */
  camposOrdenables: { key: string; label: string }[];
}

export const DIMENSIONES: DimensionDefinition[] = [
  { key: "cliente", label: "Cliente" },
  { key: "vendedor", label: "Vendedor" },
  { key: "fecha", label: "Fecha" },
];

export const METRICAS: MetricDefinition[] = [
  {
    key: "margen",
    label: "Margen",
    descripcion: "Margen/utilidad real (venta - costo), agrupado por cliente o por vendedor.",
    allowedDimensions: ["cliente", "vendedor"],
    camposOrdenables: [
      { key: "neto", label: "Venta neta" },
      { key: "costo", label: "Costo" },
      { key: "margen", label: "Margen/utilidad" },
    ],
  },
  {
    key: "ventas",
    label: "Ventas",
    descripcion: "Venta neta (sin IVA), agrupada por fecha, vendedor o cliente.",
    allowedDimensions: ["fecha", "vendedor", "cliente"],
    camposOrdenables: [
      { key: "neto", label: "Venta neta" },
      { key: "documentos", label: "Documentos" },
    ],
  },
  {
    key: "clientes",
    label: "Análisis de clientes",
    descripcion:
      "Vista consolidada por cliente: venta, margen, kilos y cantidad de operaciones (documentos).",
    allowedDimensions: ["cliente"],
    camposOrdenables: [
      { key: "neto", label: "Venta neta" },
      { key: "margen", label: "Margen/utilidad" },
      { key: "kilos", label: "Kilos" },
      { key: "documentos", label: "Cantidad de operaciones" },
    ],
  },
];

/** Visualizaciones válidas por combinación métrica+dimensión — oculta lo que no tiene sentido (p. ej. línea/área sin dimensión de fecha). */
export function visualizacionesPermitidas(dimensionPrincipal: DimensionKey): VisualizacionKey[] {
  if (dimensionPrincipal === "fecha") return ["tabla", "barras", "linea", "area"];
  return ["tabla", "barras", "dona"];
}

export function obtenerMetrica(key: string): MetricDefinition | undefined {
  return METRICAS.find((m) => m.key === key);
}

export function obtenerDimension(key: string): DimensionDefinition | undefined {
  return DIMENSIONES.find((d) => d.key === key);
}

export interface ConfiguracionAnalisis {
  metrica: MetricaKey;
  dimensionPrincipal: DimensionKey;
  dimensionSecundaria?: DimensionKey;
  fechaInicio: string;
  fechaFin: string;
  filtros?: { vendedorId?: number; clienteId?: number };
  orden?: OrdenDireccion;
  ordenarPor?: string;
  limite?: number;
  visualizacion?: VisualizacionKey;
}

export interface ValidacionResultado {
  ok: boolean;
  error?: string;
}

/**
 * Valida una configuración de análisis contra el catálogo cerrado. Rechaza:
 * métrica desconocida, dimensión desconocida, dimensión no permitida para
 * esa métrica (allowedDimensions), rango de fechas inválido, y visualización
 * que no tenga sentido para la dimensión elegida.
 */
export function validarConfiguracionAnalisis(config: ConfiguracionAnalisis): ValidacionResultado {
  const metrica = obtenerMetrica(config.metrica);
  if (!metrica) {
    return { ok: false, error: `Métrica desconocida: "${config.metrica}".` };
  }

  const dimension = obtenerDimension(config.dimensionPrincipal);
  if (!dimension) {
    return { ok: false, error: `Dimensión desconocida: "${config.dimensionPrincipal}".` };
  }

  if (!metrica.allowedDimensions.includes(config.dimensionPrincipal)) {
    return {
      ok: false,
      error: `La métrica "${metrica.label}" no admite agrupar por "${dimension.label}".`,
    };
  }

  if (config.dimensionSecundaria) {
    const secundaria = obtenerDimension(config.dimensionSecundaria);
    if (!secundaria) {
      return {
        ok: false,
        error: `Dimensión secundaria desconocida: "${config.dimensionSecundaria}".`,
      };
    }
    if (!metrica.allowedDimensions.includes(config.dimensionSecundaria)) {
      return {
        ok: false,
        error: `La métrica "${metrica.label}" no admite agrupar por "${secundaria.label}" (secundaria).`,
      };
    }
    if (config.dimensionSecundaria === config.dimensionPrincipal) {
      return { ok: false, error: "La dimensión secundaria no puede ser igual a la principal." };
    }
  }

  const desde = new Date(config.fechaInicio);
  const hasta = new Date(config.fechaFin);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return { ok: false, error: "fechaInicio/fechaFin inválidas." };
  }
  if (desde >= hasta) {
    return { ok: false, error: "fechaInicio debe ser anterior a fechaFin." };
  }

  if (config.visualizacion) {
    const permitidas = visualizacionesPermitidas(config.dimensionPrincipal);
    if (!permitidas.includes(config.visualizacion)) {
      return {
        ok: false,
        error: `La visualización "${config.visualizacion}" no aplica para la dimensión "${dimension.label}".`,
      };
    }
  }

  if (config.ordenarPor && !metrica.camposOrdenables.some((c) => c.key === config.ordenarPor)) {
    return {
      ok: false,
      error: `"${config.ordenarPor}" no es un campo ordenable de la métrica "${metrica.label}".`,
    };
  }

  if (config.orden && config.orden !== "asc" && config.orden !== "desc") {
    return { ok: false, error: 'orden debe ser "asc" o "desc".' };
  }

  if (config.limite !== undefined && (!Number.isFinite(config.limite) || config.limite <= 0)) {
    return { ok: false, error: "limite debe ser un número positivo." };
  }

  return { ok: true };
}
