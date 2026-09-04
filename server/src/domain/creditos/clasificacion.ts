const DIA_MS = 24 * 60 * 60 * 1000;

/** Ventana de alerta temprana: una obligación entra en "Por vencer" cuando
 * le faltan estos días o menos para su fecha de vencimiento. Única fuente
 * de verdad — antes vivía duplicado como constante local en el controller. */
export const DIAS_ALERTA_POR_VENCER = 7;

export type EstadoCredito = "Al día" | "Por vencer" | "Vencido" | "Paz y Salvo";

export interface ClasificacionMonto {
  estado: EstadoCredito;
  /** Monto cuya fecha de vencimiento ya pasó. 0 si no aplica. */
  vencido: number;
  /** Monto pendiente, no vencido, dentro de la ventana de alerta. 0 si no aplica. */
  porVencer: number;
  /** Monto pendiente, no vencido, fuera de la ventana de alerta. 0 si no aplica. */
  alDia: number;
  /** Días de mora (entero, >= 0). 0 cuando no hay nada vencido. */
  diasMora: number;
}

/**
 * Clasifica un monto pendiente único (un crédito manual, o un documento
 * abierto de Siesa) en vencido/porVencer/alDia — SIEMPRE recalculado a
 * partir de saldo+vence en el momento de la lectura, nunca confiando en una
 * etiqueta de estado guardada con anterioridad (esa es la causa raíz del
 * bug de "estado obsoleto": una fila creada como 'Al día' que nadie vuelve
 * a tocar queda así para siempre aunque su fecha ya haya pasado).
 *
 * "Paz y Salvo" es la ÚNICA excepción: es un cierre formal explícito (ver
 * marcarPazYSalvoCredito), nunca se deriva de fechas — si el estado
 * guardado es "Paz y Salvo", se respeta tal cual sin impor tar saldo/vence.
 */
export function clasificarMonto(
  saldo: number,
  vence: Date,
  estadoGuardado: string | null,
  ahora: Date = new Date(),
): ClasificacionMonto {
  if (estadoGuardado === "Paz y Salvo") {
    return { estado: "Paz y Salvo", vencido: 0, porVencer: 0, alDia: 0, diasMora: 0 };
  }
  if (saldo <= 0) {
    return { estado: "Al día", vencido: 0, porVencer: 0, alDia: 0, diasMora: 0 };
  }

  const diasParaVencer = (vence.getTime() - ahora.getTime()) / DIA_MS;
  if (diasParaVencer < 0) {
    const diasMora = Math.max(1, Math.ceil(-diasParaVencer));
    return { estado: "Vencido", vencido: saldo, porVencer: 0, alDia: 0, diasMora };
  }
  if (diasParaVencer <= DIAS_ALERTA_POR_VENCER) {
    return { estado: "Por vencer", vencido: 0, porVencer: saldo, alDia: 0, diasMora: 0 };
  }
  return { estado: "Al día", vencido: 0, porVencer: 0, alDia: saldo, diasMora: 0 };
}

export interface ResumenCartera {
  porRecaudar: number;
  vencido: number;
  porVencer: number;
  alDia: number;
  /** Clientes distintos (por clave de agrupación) con vencido > 0. */
  clientesEnMora: number;
}

export interface ObligacionParaResumen {
  clave: string;
  saldo: number;
  vence: Date;
  estadoGuardado?: string | null;
}

/**
 * Agrega un resumen de cartera (KPIs) a partir de una lista de obligaciones
 * ya clasificables (una fila manual, o un documento abierto de Siesa) —
 * función pura, reutilizable tanto para el crédito manual como para la
 * cartera Siesa, para no duplicar la lógica de sumas en dos sitios.
 */
export function calcularResumenCartera(
  obligaciones: ObligacionParaResumen[],
  ahora: Date = new Date(),
): ResumenCartera {
  let porRecaudar = 0;
  let vencido = 0;
  let porVencer = 0;
  let alDia = 0;
  const clientesConMora = new Set<string>();

  for (const o of obligaciones) {
    const c = clasificarMonto(o.saldo, o.vence, o.estadoGuardado ?? null, ahora);
    if (c.estado === "Paz y Salvo") continue;
    porRecaudar += Math.max(o.saldo, 0);
    vencido += c.vencido;
    porVencer += c.porVencer;
    alDia += c.alDia;
    if (c.vencido > 0) clientesConMora.add(o.clave);
  }

  return { porRecaudar, vencido, porVencer, alDia, clientesEnMora: clientesConMora.size };
}
