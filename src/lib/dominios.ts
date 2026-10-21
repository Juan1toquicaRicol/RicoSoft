// Dominios de correo corporativo autorizados por la organización. Se usa en
// el registro de usuarios (login.tsx) y en el correo de colaboradores en
// Gestión Humana: en ambos casos no se permiten correos personales.
export const DOMINIOS_PERMITIDOS = [
  "ricol.com.co",
  "flexipackdecolombia.com",
  "greensolutions.com.co",
];

/**
 * Dominio de correo corporativo de cada empresa del grupo (empresaId del
 * colaborador). Un colaborador de una empresa solo puede tener correo de SU
 * dominio.
 */
export const DOMINIO_POR_EMPRESA: Record<string, string> = {
  RC: "ricol.com.co",
  FL: "flexipackdecolombia.com",
  GR: "greensolutions.com.co",
};

export function esDominioCorporativoValido(correo: string): boolean {
  const dominio = correo.trim().toLowerCase().split("@")[1];
  return !!dominio && DOMINIOS_PERMITIDOS.includes(dominio);
}
