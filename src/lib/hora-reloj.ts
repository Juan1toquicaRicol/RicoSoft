/**
 * La hora de una marcación se guarda tal como la marcó el reloj (sin zona horaria,
 * como componentes UTC literales). Se muestra con getUTC* para que el navegador no
 * la desplace, en formato de 12 horas con a. m. / p. m.
 * (12:00 a. m. = medianoche, 12:00 p. m. = mediodía).
 */
export function formatoHoraReloj(iso: string): string {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, "0");
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const sufijo = h24 < 12 ? "a. m." : "p. m.";
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dos(h12)}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())} ${sufijo}`;
}

/** Fecha de hoy del navegador como YYYY-MM-DD (día local, no UTC). */
export function hoyLocal(ahora: Date = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}
