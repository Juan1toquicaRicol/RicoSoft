import type { Objetivo } from "@/hooks/use-objetivos";

/**
 * Elige, entre los objetivos EMPRESA de un tenant, cuál mostrar en el Centro
 * Gerencial — sin inventar una prioridad cuando hay varios candidatos (ver
 * spec Fase 4, sección 19). Reglas, en orden:
 *
 * 1. Se descartan los CANCELADO (nunca representan la meta vigente).
 * 2. Se prefiere el objetivo cuyo rango [fechaInicio, fechaFin] contiene
 *    "hoy" — normalmente hay como máximo uno, porque el backend ya impide
 *    crear dos objetivos EMPRESA con rangos traslapados (existeTraslape en
 *    objetivos.controller.ts); si por algún motivo hubiera más de uno, se
 *    toma el de fechaInicio más reciente en vez de adivinar.
 * 3. Si ninguno cubre "hoy", se muestra el más recientemente CERRADO
 *    (fechaFin más reciente entre los que ya terminaron) — el mismo
 *    criterio que ya usa el resto del sistema para un objetivo vencido:
 *    mostrar el resultado final del último período, no ocultarlo.
 * 4. Si tampoco hay ninguno pasado, se muestra el próximo a comenzar
 *    (fechaInicio más próxima entre los que aún no inician).
 * 5. Si no hay ningún objetivo EMPRESA, se devuelve null — el llamador debe
 *    mostrar el estado "sin objetivo configurado", nunca inventar cifras.
 */
export function elegirObjetivoActivoGerencial(
  objetivos: Objetivo[],
  hoy: Date = new Date(),
): Objetivo | null {
  const candidatos = objetivos.filter((o) => o.estado !== "CANCELADO");
  if (candidatos.length === 0) return null;

  const hoyMs = hoy.getTime();
  const enCurso = candidatos.filter(
    (o) => new Date(o.fechaInicio).getTime() <= hoyMs && new Date(o.fechaFin).getTime() >= hoyMs,
  );
  if (enCurso.length > 0) {
    return enCurso.sort(
      (a, b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime(),
    )[0];
  }

  const cerrados = candidatos.filter((o) => new Date(o.fechaFin).getTime() < hoyMs);
  if (cerrados.length > 0) {
    return cerrados.sort(
      (a, b) => new Date(b.fechaFin).getTime() - new Date(a.fechaFin).getTime(),
    )[0];
  }

  const futuros = candidatos.filter((o) => new Date(o.fechaInicio).getTime() > hoyMs);
  if (futuros.length > 0) {
    return futuros.sort(
      (a, b) => new Date(a.fechaInicio).getTime() - new Date(b.fechaInicio).getTime(),
    )[0];
  }

  return null;
}
