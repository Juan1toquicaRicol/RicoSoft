/** Contraste WCAG 2.x entre dos colores #rrggbb (para verificar accesibilidad de tokens). */

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminancia(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Color no válido: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/** Razón de contraste 1–21. AA texto normal ≥ 4.5; AAA ≥ 7. */
export function razonContraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)];
  const [claro, oscuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}
