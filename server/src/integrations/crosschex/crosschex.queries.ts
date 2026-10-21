import { ejecutarConsulta } from "./crosschex.client";
import type { CrossChexCheckinoutRow, CrossChexUserinfoRow } from "./crosschex.types";

/**
 * Único lugar del proyecto que puede mencionar "Checkinout"/"Userinfo" en
 * SQL. El resto de RicoSoft llama estas funciones, no SQL de Access.
 *
 * Fase 3: solo las consultas de verificación/lectura puntual pedidas en la
 * auditoría (TOP 10). La paginación por Logid para importación masiva e
 * incremental es de la Fase 4/5, no de aquí.
 */

/** Últimas N marcaciones crudas, más recientes primero. Conserva Logid,
 * userid y CheckType originales sin reinterpretar. */
export async function obtenerUltimasMarcaciones(top = 10): Promise<CrossChexCheckinoutRow[]> {
  const limite = Math.min(Math.max(Math.trunc(top) || 10, 1), 1000);
  return ejecutarConsulta<CrossChexCheckinoutRow>(
    `SELECT TOP ${limite} Logid, userid, CheckTime, CheckType, Sensorid, WorkType, AttFlag, Checked, Exported, OpenDoorFlag, temperature, whynoopen, mask FROM Checkinout ORDER BY Logid DESC`,
  );
}

/**
 * Página de marcaciones con Logid estrictamente mayor al cursor dado,
 * ordenadas ascendentemente. Es la consulta base de la importación
 * histórica (Fase 4) y de la sincronización incremental (Fase 5): nunca se
 * usa `Exported` como cursor (rule explícita de la auditoría), siempre
 * `Logid`. El driver ODBC de Access instalado en producción falla al
 * inspeccionar parámetros (`Error getting information about parameters`).
 * El cursor se normaliza a entero finito antes de interpolarlo; nunca
 * contiene texto libre.
 */
export async function obtenerMarcacionesDesde(
  logIdDesde: number,
  limite: number,
): Promise<CrossChexCheckinoutRow[]> {
  const tope = Math.min(Math.max(Math.trunc(limite) || 500, 1), 2000);
  const cursor = Number.isFinite(logIdDesde) ? Math.trunc(logIdDesde) : 0;
  return ejecutarConsulta<CrossChexCheckinoutRow>(
    `SELECT TOP ${tope} Logid, userid, CheckTime, CheckType, Sensorid, WorkType, AttFlag, Checked, Exported, OpenDoorFlag, temperature, whynoopen, mask FROM Checkinout WHERE Logid > ${cursor} ORDER BY Logid ASC`,
  );
}

/**
 * Usuarios registrados en el biométrico. Nunca selecciona `Pwd` — la
 * consulta enumera columnas explícitamente, nunca `SELECT *`, precisamente
 * para que sea imposible arrastrar `Pwd` por accidente en un refactor.
 */
export async function obtenerUsuarios(top = 10): Promise<CrossChexUserinfoRow[]> {
  const limite = Math.min(Math.max(Math.trunc(top) || 10, 1), 1000);
  return ejecutarConsulta<CrossChexUserinfoRow>(
    `SELECT TOP ${limite} userid, UserCode, Name, Deptid, IsAtt FROM Userinfo ORDER BY userid`,
  );
}
