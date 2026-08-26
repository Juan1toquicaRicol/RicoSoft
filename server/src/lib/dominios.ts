// Dominios de correo corporativo autorizados por la organización. Se usa
// tanto para el registro de usuarios (auth.service.ts) como para el correo
// de los colaboradores en Gestión Humana: en ambos casos no se permiten
// correos personales (gmail, hotmail, etc.).
export const DOMINIOS_PERMITIDOS = ["ricol.com.co", "flexipackdecolombia.com", "greesolutions.com.co"];

export function esDominioCorporativoValido(correo: string): boolean {
  const dominio = correo.trim().toLowerCase().split("@")[1];
  return !!dominio && DOMINIOS_PERMITIDOS.includes(dominio);
}
