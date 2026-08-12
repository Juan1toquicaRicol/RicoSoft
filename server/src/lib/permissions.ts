import { prisma } from "../config/prisma";

// Catálogo de claves de permiso. Debe mantenerse en sincronía con
// PERMISOS_SISTEMA en src/lib/auth-permissions.ts (frontend).
export const PERMISOS_SISTEMA = {
  USUARIOS_VER: "usuarios.ver",
  USUARIOS_CREAR: "usuarios.crear",
  USUARIOS_EDITAR: "usuarios.editar",
  USUARIOS_DESACTIVAR: "usuarios.desactivar",
  USUARIOS_CAMBIAR_ROL: "usuarios.cambiar_rol",
  USUARIOS_CAMBIAR_DEPARTAMENTO: "usuarios.cambiar_departamento",
  USUARIOS_ASIGNAR_PERMISOS: "usuarios.asignar_permisos",
  USUARIOS_RESET_PASSWORD: "usuarios.reset_password",
  ROLES_VER: "roles.ver",
  ROLES_CREAR: "roles.crear",
  ROLES_EDITAR: "roles.editar",
  ROLES_ELIMINAR: "roles.eliminar",
  ROLES_ASIGNAR_PERMISOS: "roles.asignar_permisos",
  PERMISOS_VER: "permisos.ver",
  PERMISOS_GESTIONAR: "permisos.gestionar",
  DEPARTAMENTOS_VER: "departamentos.ver",
  DEPARTAMENTOS_CREAR: "departamentos.crear",
  DEPARTAMENTOS_EDITAR: "departamentos.editar",
  DEPARTAMENTOS_ELIMINAR: "departamentos.eliminar",
  CONFIGURACION_VER: "configuracion.ver",
  CONFIGURACION_EDITAR: "configuracion.editar",
  MODULOS_VER: "modulos.ver",
  MODULOS_GESTIONAR: "modulos.gestionar",
  AUDITORIA_VER: "auditoria.ver",
  AUDITORIA_EXPORTAR: "auditoria.exportar",
  FACTURAS_VER: "facturas.ver",
  FACTURAS_CREAR: "facturas.crear",
  FACTURAS_APROBAR: "facturas.aprobar",
  FACTURAS_RECHAZAR: "facturas.rechazar",
  FACTURAS_PAGAR: "facturas.pagar",
  SOLICITUDES_VER: "solicitudes.ver",
  SOLICITUDES_CREAR: "solicitudes.crear",
  SOLICITUDES_APROBAR: "solicitudes.aprobar",
  SOLICITUDES_RECHAZAR: "solicitudes.rechazar",
  SOLICITUDES_COMPRAR: "solicitudes.comprar",
  SERVICIOS_VER: "servicios.ver",
  SERVICIOS_CREAR: "servicios.crear",
  SERVICIOS_EDITAR: "servicios.editar",
  CONTRATOS_VER: "contratos.ver",
  CONTRATOS_CREAR: "contratos.crear",
  CONTRATOS_EDITAR: "contratos.editar",
  REGLAS_VER: "reglas.ver",
  REGLAS_CREAR: "reglas.crear",
  REGLAS_EDITAR: "reglas.editar",
  REGLAS_ELIMINAR: "reglas.eliminar",
  CREDITOS_VER: "creditos.ver",
  CREDITOS_GESTIONAR: "creditos.gestionar",
  EMPLEADOS_VER: "empleados.ver",
  EMPLEADOS_CREAR: "empleados.crear",
  EMPLEADOS_EDITAR_SALARIO: "empleados.editar_salario",
  EMPLEADOS_LIQUIDAR: "empleados.liquidar",
  PERMISOS_LABORALES_VER: "permisos_laborales.ver",
  PERMISOS_LABORALES_CREAR: "permisos_laborales.crear",
  PERMISOS_LABORALES_APROBAR: "permisos_laborales.aprobar",
  FALTAS_VER: "faltas.ver",
  FALTAS_CREAR: "faltas.crear",
  ANALITICA_VER: "analitica.ver",
  PROYECCION_GESTIONAR: "proyeccion.gestionar",
} as const;

export type PermisoKey = (typeof PERMISOS_SISTEMA)[keyof typeof PERMISOS_SISTEMA];

export function parseRolPermisos(permisos: string | null | undefined): string[] {
  if (!permisos) return [];
  try {
    const parsed = JSON.parse(permisos);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export interface SessionUser {
  id: string;
  tenantId: string;
  nombre: string;
  email: string;
  rol: string | null;
  isSuperadmin: boolean;
  activo: boolean;
  permisos: string[];
}

/**
 * Carga el usuario y calcula sus permisos efectivos directamente desde la
 * base de datos (rol heredado + permisos directos, con revocación explícita).
 * Se recalcula en cada request para reflejar de inmediato desactivaciones,
 * cambios de rol o revocaciones de permisos.
 */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { rolRel: true, permisosDirectos: true },
  });

  if (!user) return null;

  const permisos = new Set<string>();

  if (user.isSuperadmin) {
    Object.values(PERMISOS_SISTEMA).forEach((p) => permisos.add(p));
  } else {
    if (user.rolRel) {
      parseRolPermisos(user.rolRel.permisos).forEach((p) => permisos.add(p));
    }
    for (const directo of user.permisosDirectos) {
      if (directo.concedido) permisos.add(directo.permisoId);
      else permisos.delete(directo.permisoId);
    }
  }

  return {
    id: user.id,
    tenantId: user.tenantId,
    nombre: user.nombre,
    email: user.email,
    rol: user.rolRel?.nombre ?? user.rol,
    isSuperadmin: user.isSuperadmin,
    activo: user.activo,
    permisos: user.activo ? Array.from(permisos) : [],
  };
}
