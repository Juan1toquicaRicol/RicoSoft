import { CROSSCHEX_CHECK_TYPE, type TipoMarcacionCrossChex } from "./crosschex.types";

/**
 * Interpretación textual PROVISIONAL de CheckType. Deliberadamente no forma
 * parte del dato guardado: quien persista una marcación debe guardar el
 * checkType original SIEMPRE, y puede guardar este texto como ayuda de
 * lectura, pero la interpretación puede cambiar sin alterar el dato fuente.
 * CheckType = 1 se conserva como "OTRO": no se inventa significado.
 */
export function mapearTipoMarcacion(checkType: number): TipoMarcacionCrossChex {
  switch (checkType) {
    case CROSSCHEX_CHECK_TYPE.ENTRADA:
      return "ENTRADA";
    case CROSSCHEX_CHECK_TYPE.BREAK:
      return "BREAK";
    case CROSSCHEX_CHECK_TYPE.FUERA_TIEMPO:
      return "FUERATIEMPO";
    default:
      return "OTRO";
  }
}

const PATRON_CHECKTIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/**
 * CheckTime de Access no lleva zona horaria: es la hora de pared que marcó
 * el reloj del dispositivo. Convertirlo "como si fuera UTC" con
 * `new Date(checkTime)` y luego reformatearlo con Intl introduciría un
 * desplazamiento que no corresponde a ningún dato real. En su lugar, se
 * extraen los componentes literales (año, mes, día, hora...) tal cual
 * vinieron, y se construyen con `Date.UTC(...)`: esto garantiza que el
 * mssql/Prisma driver escriba esos mismos números en DATETIME2 sin que la
 * zona horaria del proceso Node (o del servidor) los altere en el camino.
 * La normalización a America/Bogota u otra zona de negocio, si algún día
 * hace falta, es una decisión explícita de una capa superior — no de este
 * adaptador, que solo preserva el dato tal como llegó.
 */
export function parsearCheckTime(checkTime: Date | string): Date {
  if (checkTime instanceof Date) {
    return new Date(
      Date.UTC(
        checkTime.getFullYear(),
        checkTime.getMonth(),
        checkTime.getDate(),
        checkTime.getHours(),
        checkTime.getMinutes(),
        checkTime.getSeconds(),
      ),
    );
  }
  const m = PATRON_CHECKTIME.exec(checkTime);
  if (!m) {
    throw new Error(`CheckTime con formato inesperado, no se pudo parsear: "${checkTime}"`);
  }
  const [, anio, mes, dia, hora, minuto, segundo] = m;
  return new Date(
    Date.UTC(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(minuto), Number(segundo)),
  );
}

/** Fecha (solo día, medianoche UTC) derivada del mismo CheckTime literal,
 * para poblar MarcacionBiometrica.fecha sin un segundo parseo. */
export function soloFecha(checkTime: Date | string): Date {
  const parseado = parsearCheckTime(checkTime);
  return new Date(Date.UTC(parseado.getUTCFullYear(), parseado.getUTCMonth(), parseado.getUTCDate()));
}

/** Normaliza un BIT de Access: el driver ODBC puede devolverlo como
 * boolean, como "0"/"1", o como null si la columna es nullable y no vino
 * poblada. No se asume un único formato. */
export function normalizarBit(valor: boolean | string | number | null | undefined): boolean | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor !== 0;
  return valor === "1" || valor.toLowerCase() === "true";
}
