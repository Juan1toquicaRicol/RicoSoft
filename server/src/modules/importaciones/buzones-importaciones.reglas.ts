/**
 * Reglas puras de los buzones de la Bandeja de Importaciones (sin base de
 * datos ni Gmail). Cada transición exige el estado previo indicado aquí; el
 * servicio solo las aplica. Ver MEMORY.md (2026-11-25).
 *
 * Orden obligatorio: REGISTRADO → APROBADO (Sistemas) → con etiqueta → ACTIVO.
 * Un buzón REGISTRADO o APROBADO nunca se consulta en el job de ingesta, y
 * sin aprobación no se consulta Gmail ni para probar la conexión.
 */

export const ESTADOS_BUZON = ["REGISTRADO", "APROBADO", "ACTIVO", "PAUSADO"] as const;
export type EstadoBuzon = (typeof ESTADOS_BUZON)[number];

/** Dominio al que deben pertenecer las direcciones de buzón. */
export const DOMINIO_BUZONES = "ricol.com.co";

export const LIMITES_BUZON = {
  correosPorCiclo: { min: 1, max: 100, defecto: 25 },
  adjuntosPorCiclo: { min: 1, max: 200, defecto: 50 },
  timeoutSegundos: { min: 10, max: 600, defecto: 120 },
} as const;

export interface ResultadoValidacion {
  ok: boolean;
  mensaje?: string;
}

const PATRON_DIRECCION = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Normaliza y valida que la dirección sea un buzón del dominio permitido. */
export function validarDireccionBuzon(direccion: string): ResultadoValidacion & {
  direccion?: string;
} {
  const normalizada = direccion.trim().toLowerCase();
  if (!PATRON_DIRECCION.test(normalizada)) {
    return { ok: false, mensaje: "La dirección del buzón no tiene un formato válido." };
  }
  if (!normalizada.endsWith(`@${DOMINIO_BUZONES}`)) {
    return {
      ok: false,
      mensaje: `Solo se pueden registrar buzones del dominio ${DOMINIO_BUZONES}.`,
    };
  }
  return { ok: true, direccion: normalizada };
}

export function validarLimitesBuzon(valores: {
  correosPorCiclo: number;
  adjuntosPorCiclo: number;
  timeoutSegundos: number;
}): ResultadoValidacion {
  const campos = [
    ["correosPorCiclo", "correos por ciclo"],
    ["adjuntosPorCiclo", "adjuntos por ciclo"],
    ["timeoutSegundos", "tiempo de espera"],
  ] as const;
  for (const [clave, etiqueta] of campos) {
    const { min, max } = LIMITES_BUZON[clave];
    const valor = valores[clave];
    if (!Number.isInteger(valor) || valor < min || valor > max) {
      return { ok: false, mensaje: `El valor de ${etiqueta} debe estar entre ${min} y ${max}.` };
    }
  }
  return { ok: true };
}

/** Probar conexión y listar etiquetas: solo con buzón aprobado. */
export function puedeConsultarGmail(estado: EstadoBuzon): boolean {
  return estado === "APROBADO" || estado === "ACTIVO" || estado === "PAUSADO";
}

export function puedeAprobar(estado: EstadoBuzon): boolean {
  return estado === "REGISTRADO";
}

export function puedeElegirEtiqueta(estado: EstadoBuzon): boolean {
  return puedeConsultarGmail(estado);
}

export function puedeActivar(estado: EstadoBuzon, etiquetaId: string | null): boolean {
  return (estado === "APROBADO" || estado === "PAUSADO") && Boolean(etiquetaId);
}

export function puedePausar(estado: EstadoBuzon): boolean {
  return estado === "ACTIVO";
}

/** Solo un buzón activo, con etiqueta elegida, entra en el ciclo de ingesta. */
export function puedeIngerir(estado: EstadoBuzon, etiquetaId: string | null): boolean {
  return estado === "ACTIVO" && Boolean(etiquetaId);
}
