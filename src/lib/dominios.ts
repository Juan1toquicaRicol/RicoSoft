// Dominios de correo corporativo autorizados por la organización. Se usa en
// el registro de usuarios (login.tsx) y en el correo de colaboradores en
// Gestión Humana: en ambos casos no se permiten correos personales.
export const DOMINIOS_PERMITIDOS = [
  "ricol.com.co",
  "flexipackdecolombia.com",
  "greesolutions.com.co",
];

export function esDominioCorporativoValido(correo: string): boolean {
  const dominio = correo.trim().toLowerCase().split("@")[1];
  return !!dominio && DOMINIOS_PERMITIDOS.includes(dominio);
}
