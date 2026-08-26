// Debe mantenerse en sincronía con server/src/lib/password.ts (backend). El
// backend es siempre la autoridad final; esta copia solo da feedback
// inmediato en el formulario antes de enviar la petición.
const MIN_LARGO = 8;

/** Devuelve un mensaje de error, o null si la contraseña es válida. */
export function validarPasswordSegura(password: string): string | null {
  if (password.length < MIN_LARGO) {
    return `La contraseña debe tener al menos ${MIN_LARGO} caracteres.`;
  }
  if (!/[a-z]/.test(password)) {
    return "La contraseña debe incluir al menos una letra minúscula.";
  }
  if (!/[A-Z]/.test(password)) {
    return "La contraseña debe incluir al menos una letra mayúscula.";
  }
  if (!/[0-9]/.test(password)) {
    return "La contraseña debe incluir al menos un número.";
  }
  return null;
}
