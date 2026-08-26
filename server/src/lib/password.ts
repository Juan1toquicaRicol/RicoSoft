// Política de contraseñas del sistema. Se usa en registro, cambio propio,
// reset administrativo y creación de usuario, para que la regla viva en un
// solo lugar en vez de repetirse (y poder divergir) en cada controlador.
const MIN_LARGO = 8;

/**
 * Valida la fortaleza de una contraseña. Devuelve un mensaje de error listo
 * para mostrar al usuario, o null si la contraseña es válida.
 */
export function validarPasswordSegura(password: unknown): string | null {
  if (typeof password !== "string") {
    return "La contraseña es obligatoria.";
  }
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
