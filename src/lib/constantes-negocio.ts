/**
 * Constantes de negocio de uso transversal en varias pantallas — evita que
 * el mismo número "mágico" (ej. el plazo de crédito/vencimiento por
 * defecto) quede repetido y pueda divergir silenciosamente entre módulos.
 */

/** Plazo por defecto (en días) usado para sugerir una fecha de vencimiento
 * o renovación al crear un crédito de cliente, una factura o un servicio,
 * cuando el usuario todavía no ha elegido una fecha propia. */
export const PLAZO_CREDITO_DIAS_DEFECTO = 30;
