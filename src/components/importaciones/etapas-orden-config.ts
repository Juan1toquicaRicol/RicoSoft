/**
 * Etapas puramente visuales del formulario de "Nueva orden internacional".
 * Son solo navegación en el frontend: la orden se crea con UNA sola llamada al
 * final (etapa "Revisar"); no existen guardados parciales ni borradores.
 */
export const ETAPAS_ORDEN = [
  { numero: 1, etiqueta: "Datos comerciales" },
  { numero: 2, etiqueta: "Ítems" },
  { numero: 3, etiqueta: "Logística" },
  { numero: 4, etiqueta: "Revisar" },
] as const;

export type NumeroEtapa = (typeof ETAPAS_ORDEN)[number]["numero"];

export const ULTIMA_ETAPA: NumeroEtapa = 4;

/** Etapa a la que se puede navegar con el indicador: cualquiera ya alcanzada. */
export function puedeIrAEtapa(destino: number, maxAlcanzada: number): boolean {
  return destino >= 1 && destino <= ULTIMA_ETAPA && destino <= maxAlcanzada;
}

/** id de la alerta de errores de la etapa; los campos inválidos la referencian. */
export const ID_ALERTA_ERRORES_ETAPA = "errores-etapa";

/**
 * Etapas cuyos errores ya se le mostraron al usuario. Una etapa entra al
 * conjunto cuando intenta avanzar desde ella con errores, es dirigido a ella
 * por un error ("Ir a la etapa", guarda del envío final) o hace un intento de
 * envío final (se marcan todas las etapas con errores, porque "Revisar" las
 * lista todas). Volver con Atrás o el indicador no la agrega ni la quita: si ya
 * estaba, sus errores se muestran de inmediato; si no, una etapa abierta por
 * primera vez con "Siguiente" no muestra errores hasta que se intente avanzar.
 */
export type EtapasMostradas = ReadonlySet<number>;

export function marcarEtapasMostradas(
  mostradas: EtapasMostradas,
  etapas: Iterable<number>,
): EtapasMostradas {
  return new Set([...mostradas, ...etapas]);
}

/**
 * Condición única para mostrar los errores de la etapa actual. Controla a la
 * vez la alerta, aria-invalid, aria-describedby y el borde rojo, para que nunca
 * haya borde sin alerta ni aria-describedby a un id no renderizado.
 */
export function debeMostrarErroresEtapa(
  etapa: number,
  mostradas: EtapasMostradas,
  cantidadErroresEtapa: number,
): boolean {
  return mostradas.has(etapa) && cantidadErroresEtapa > 0;
}

/** Atributos ARIA de un campo con error, derivados de la misma condición. */
export function atributosErrorCampo(
  mostrarErroresEtapa: boolean,
  campoConError: boolean,
): { "aria-invalid"?: true; "aria-describedby"?: string } {
  return mostrarErroresEtapa && campoConError
    ? { "aria-invalid": true, "aria-describedby": ID_ALERTA_ERRORES_ETAPA }
    : {};
}

/**
 * Entrada desde el indicador: si la etapa destino muestra "Con campos
 * pendientes" (está en etapasConErrores) se marca como mostrada, para ver de
 * inmediato alerta, aria-invalid, aria-describedby y borde. Una etapa sin esa
 * señal no se marca. "Siguiente" y "Atrás" no usan esta función.
 */
export function marcarAlNavegarPorIndicador(
  destino: number,
  etapasConErrores: ReadonlySet<number>,
  mostradas: EtapasMostradas,
): EtapasMostradas {
  return etapasConErrores.has(destino) ? marcarEtapasMostradas(mostradas, [destino]) : mostradas;
}

/**
 * Primer error con destino de foco (precisión o fecha). Los errores sin
 * `focoId` no cuentan: conservan su comportamiento (se listan y, en el envío
 * final, abren el diálogo de verificación).
 */
export function primerErrorConFoco<T extends { focoId?: string }>(errores: T[]): T | undefined {
  return errores.find((e) => e.focoId);
}
