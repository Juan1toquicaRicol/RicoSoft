import { prisma } from "../config/prisma";

// Dominios de correo corporativo autorizados por la organización. Se usa
// para el correo de los colaboradores en Gestión Humana y como validación
// rápida de formato en el registro: en ambos casos no se permiten correos
// personales (gmail, hotmail, etc.). NO es la fuente de verdad de a qué
// TENANT pertenece un dominio — eso vive en Tenant.dominioCorporativo (ver
// obtenerTenantPorDominio más abajo); esta lista solo dice "es un dominio
// corporativo reconocido", sin decidir la empresa.
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

export interface TenantPorDominio {
  id: string;
  nombre: string;
  activo: boolean;
}

/**
 * Resuelve a qué tenant pertenece un dominio de correo, consultando
 * Tenant.dominioCorporativo en la base de datos (fuente de verdad
 * administrable, no un array hardcodeado). Devuelve null si ningún tenant
 * tiene ese dominio asignado — el llamador decide qué hacer (rechazar
 * registro, lista vacía de departamentos, etc.), nunca hay un tenant "por
 * defecto".
 */
export async function obtenerTenantPorDominio(dominio: string): Promise<TenantPorDominio | null> {
  const dominioLimpio = dominio.trim().toLowerCase();
  if (!dominioLimpio) return null;

  return prisma.tenant.findUnique({
    where: { dominioCorporativo: dominioLimpio },
    select: { id: true, nombre: true, activo: true },
  });
}

/** Igual que obtenerTenantPorDominio, pero extrayendo el dominio de un correo completo. */
export async function obtenerTenantPorCorreo(correo: string): Promise<TenantPorDominio | null> {
  const dominio = correo.trim().toLowerCase().split("@")[1];
  if (!dominio) return null;
  return obtenerTenantPorDominio(dominio);
}
