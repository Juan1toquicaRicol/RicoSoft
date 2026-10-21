/**
 * Fechas "solo día" (fecha de contratación, permisos): el input type="date"
 * entrega "YYYY-MM-DD", el servidor la guarda como medianoche UTC. Mostrarla
 * con la zona horaria local (UTC-5 en Colombia) la retrocedía un día
 * (06/10 -> 05/10), por eso se formatea siempre en UTC.
 */
export function formatearFechaDia(valor: string | Date): string {
  return new Date(valor).toLocaleDateString("es-CO", { timeZone: "UTC" });
}

/**
 * "Hoy" como YYYY-MM-DD en la zona horaria LOCAL. `toISOString()` devuelve la
 * fecha UTC, que de noche en Colombia ya es el día siguiente.
 */
export function hoyLocalISO(ahora: Date = new Date()): string {
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, "0");
  const d = String(ahora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
