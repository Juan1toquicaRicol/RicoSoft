/**
 * Tipos que reflejan EXACTAMENTE las columnas de CrossChex.mdb (Checkinout,
 * Userinfo), tal como las devuelve el driver ODBC. No son los tipos de
 * dominio de RicoSoft — esos se construyen a partir de estos en capas
 * superiores (fuera de este paquete).
 */

/** Fila cruda de Checkinout. Nunca se descarta ni se reinterpretan estos
 * campos aquí: eso es responsabilidad de capas posteriores (mapper de
 * dominio, no este adaptador). */
export interface CrossChexCheckinoutRow {
  Logid: number;
  userid: string;
  /** Viene del driver como Date o string ISO-like, según el binding ODBC. */
  CheckTime: Date | string;
  CheckType: number;
  Sensorid: number | null;
  WorkType: number | null;
  AttFlag: number | null;
  /** BIT de Access: el driver puede devolverlo como boolean o como "0"/"1". */
  Checked: boolean | string | null;
  Exported: boolean | string | null;
  OpenDoorFlag: boolean | string | null;
  temperature: number | null;
  whynoopen: number | null;
  mask: number | null;
}

/**
 * Fila cruda de Userinfo. Deliberadamente NO incluye `Pwd`: ninguna consulta
 * de este adaptador debe seleccionarlo (ver crosschex.queries.ts). Si en el
 * futuro se necesita otro campo de Userinfo, agregarlo aquí explícitamente
 * uno por uno — nunca usar SELECT * contra esta tabla.
 */
export interface CrossChexUserinfoRow {
  userid: string;
  UserCode: string | null;
  Name: string | null;
  Deptid: number | null;
  IsAtt: boolean | string | null;
}

/** CheckType confirmados manualmente contra CrossChex (ver auditoría previa).
 * 1 se conserva como "desconocido/especial": no se le inventa significado. */
export const CROSSCHEX_CHECK_TYPE = {
  ENTRADA: 0,
  OTRO: 1,
  BREAK: 2,
  FUERA_TIEMPO: 3,
} as const;

export type TipoMarcacionCrossChex = "ENTRADA" | "BREAK" | "FUERATIEMPO" | "OTRO";
