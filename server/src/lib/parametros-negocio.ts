import { z } from "zod";

/**
 * Parámetros de negocio por tenant — fuente central de umbrales comerciales.
 * Se guardan en ConfiguracionInventario (el modelo ya existente de umbrales
 * por tenant; no hay una segunda tabla) y, por ahora, SOLO se almacenan:
 * ninguna regla de Ventas, Crédito, Compras o Logística los consume todavía.
 * Cuando una regla los adopte, debe leerlos con este módulo, no del modelo
 * directamente, para heredar los defaults y la conversión de Decimal.
 */

export const PARAMETROS_NEGOCIO_DEFECTO = {
  /** Sin margen mínimo definido: no bloquea nada al activarse una regla futura. */
  margenMinimoVentaPct: 0,
  diasMaximosMora: 30,
  porcentajeMaximoUsoCupo: 100,
  toleranciaMermaPesajePct: 0.5,
  diasValidezOferta: 15,
  /** 0 = sin monto mínimo definido. */
  montoMinimoCotizaciones: 0,
} as const;

export type ParametrosNegocio = {
  -readonly [K in keyof typeof PARAMETROS_NEGOCIO_DEFECTO]: number;
};

export const CAMPOS_PARAMETROS_NEGOCIO = Object.keys(
  PARAMETROS_NEGOCIO_DEFECTO,
) as (keyof ParametrosNegocio)[];

/** Máximo 2 decimales: las columnas son DECIMAL(_, 2) y no se redondea en silencio. */
const dosDecimales = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

const porcentaje = (campo: string, min: number, max: number) =>
  z
    .number({ invalid_type_error: `${campo} debe ser un número.` })
    .min(min, `${campo} debe estar entre ${min} y ${max}.`)
    .max(max, `${campo} debe estar entre ${min} y ${max}.`)
    .refine(dosDecimales, `${campo} admite máximo 2 decimales.`);

const dias = (campo: string, min: number, max: number) =>
  z
    .number({ invalid_type_error: `${campo} debe ser un número entero.` })
    .int(`${campo} debe ser un número entero.`)
    .min(min, `${campo} debe estar entre ${min} y ${max}.`)
    .max(max, `${campo} debe estar entre ${min} y ${max}.`);

/**
 * Forma (opcional campo a campo) para mezclar en el esquema de PUT
 * /inventario/configuracion. Opcional para que un llamador que solo manda los
 * umbrales de inventario no tenga que conocerlos: si se omiten, se conserva el
 * valor guardado (o el default de la columna en la primera creación).
 */
export const parametrosNegocioShape = {
  margenMinimoVentaPct: porcentaje("margenMinimoVentaPct", 0, 100).optional(),
  diasMaximosMora: dias("diasMaximosMora", 0, 3650).optional(),
  porcentajeMaximoUsoCupo: porcentaje("porcentajeMaximoUsoCupo", 1, 100).optional(),
  toleranciaMermaPesajePct: porcentaje("toleranciaMermaPesajePct", 0, 20).optional(),
  diasValidezOferta: dias("diasValidezOferta", 1, 365).optional(),
  montoMinimoCotizaciones: z
    .number({ invalid_type_error: "montoMinimoCotizaciones debe ser un número." })
    .min(0, "montoMinimoCotizaciones no puede ser negativo.")
    .max(1_000_000_000_000, "montoMinimoCotizaciones excede el máximo permitido.")
    .refine(dosDecimales, "montoMinimoCotizaciones admite máximo 2 decimales.")
    .optional(),
};

type ConNumericoOTexto = number | { toString(): string };

/**
 * Prisma devuelve las columnas DECIMAL como Decimal (se serializan a JSON como
 * texto: "0.50"). El API los expone como number — todos caben sin pérdida en
 * un double (máx. 12 enteros + 2 decimales por la validación de rango).
 */
export function extraerParametrosNegocio(
  fila: Partial<Record<keyof ParametrosNegocio, ConNumericoOTexto>> | null | undefined,
): ParametrosNegocio {
  const resultado = { ...PARAMETROS_NEGOCIO_DEFECTO } as ParametrosNegocio;
  if (!fila) return resultado;
  for (const campo of CAMPOS_PARAMETROS_NEGOCIO) {
    const valor = fila[campo];
    if (valor !== undefined && valor !== null) resultado[campo] = Number(valor.toString());
  }
  return resultado;
}
