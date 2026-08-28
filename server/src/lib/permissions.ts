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
  USUARIOS_ELIMINAR: "usuarios.eliminar",
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
  PROVEEDORES_VER: "proveedores.ver",
  PROVEEDORES_CREAR: "proveedores.crear",
  PROVEEDORES_EDITAR: "proveedores.editar",
  PROVEEDORES_ELIMINAR: "proveedores.eliminar",
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
  FACTURAS_ELIMINAR: "facturas.eliminar",
  SOLICITUDES_VER: "solicitudes.ver",
  SOLICITUDES_CREAR: "solicitudes.crear",
  SOLICITUDES_APROBAR: "solicitudes.aprobar",
  SOLICITUDES_RECHAZAR: "solicitudes.rechazar",
  SOLICITUDES_COMPRAR: "solicitudes.comprar",
  SOLICITUDES_ELIMINAR: "solicitudes.eliminar",
  SERVICIOS_VER: "servicios.ver",
  SERVICIOS_CREAR: "servicios.crear",
  SERVICIOS_EDITAR: "servicios.editar",
  SERVICIOS_ELIMINAR: "servicios.eliminar",
  CONTRATOS_VER: "contratos.ver",
  CONTRATOS_CREAR: "contratos.crear",
  CONTRATOS_EDITAR: "contratos.editar",
  CONTRATOS_ELIMINAR: "contratos.eliminar",
  REGLAS_VER: "reglas.ver",
  REGLAS_CREAR: "reglas.crear",
  REGLAS_EDITAR: "reglas.editar",
  REGLAS_ELIMINAR: "reglas.eliminar",
  CREDITOS_VER: "creditos.ver",
  CREDITOS_GESTIONAR: "creditos.gestionar",
  CREDITOS_ELIMINAR: "creditos.eliminar",
  EMPLEADOS_VER: "empleados.ver",
  EMPLEADOS_CREAR: "empleados.crear",
  EMPLEADOS_EDITAR_SALARIO: "empleados.editar_salario",
  EMPLEADOS_LIQUIDAR: "empleados.liquidar",
  EMPLEADOS_ELIMINAR: "empleados.eliminar",
  PERMISOS_LABORALES_VER: "permisos_laborales.ver",
  PERMISOS_LABORALES_CREAR: "permisos_laborales.crear",
  PERMISOS_LABORALES_APROBAR: "permisos_laborales.aprobar",
  FALTAS_VER: "faltas.ver",
  FALTAS_CREAR: "faltas.crear",
  ANALITICA_VER: "analitica.ver",
  PROYECCION_GESTIONAR: "proyeccion.gestionar",
  IMPORTACIONES_VER: "importaciones.ver",
  IMPORTACIONES_CREAR: "importaciones.crear",
  IMPORTACIONES_GESTIONAR_TRANSITO: "importaciones.gestionar_transito",
  IMPORTACIONES_RECIBIR: "importaciones.recibir",
  IMPORTACIONES_LIQUIDAR: "importaciones.liquidar",
  IMPORTACIONES_ELIMINAR: "importaciones.eliminar",
  INTEGRACION_SIESA_SINCRONIZAR: "integracion_siesa.sincronizar",
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
  telefono: string | null;
  rol: string | null;
  isSuperadmin: boolean;
  activo: boolean;
  permisos: string[];
}

interface UsuarioConPermisosCrudos {
  isSuperadmin: boolean;
  activo: boolean;
  departamento: { esSistemas: boolean } | null;
  rolRel: { permisos: string } | null;
  permisosDirectos: { permisoId: string; concedido: boolean }[];
}

export interface TenantAccesible {
  id: string;
  nombre: string;
  subdomain: string;
}

/**
 * Calcula el conjunto de permisos efectivos de un usuario: rol heredado +
 * permisos directos (que pueden agregar o revocar sobre lo que da el rol).
 * Los usuarios de Sistemas o superadmin tienen acceso total. Un usuario
 * inactivo nunca tiene permisos, sin importar rol o permisos directos.
 * Compartida por loadSessionUser (un usuario) y listarUsuariosConPermiso
 * (en bloque, para saber a quién notificar), para no calcular esto dos veces.
 */
function calcularPermisosEfectivos(user: UsuarioConPermisosCrudos): Set<string> {
  const permisos = new Set<string>();
  if (!user.activo) return permisos;

  if (user.isSuperadmin || user.departamento?.esSistemas) {
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
  return permisos;
}

/**
 * Variante de calcularPermisosEfectivos para una Membresia (acceso a un
 * tenant adicional al "hogar" del usuario). A diferencia del tenant hogar,
 * una membresía NO tiene permisos directos propios (PermisoUsuario está
 * ligado al usuario, no a la membresía) — sus permisos vienen solo de su rol
 * o de isSuperadmin/departamento.esSistemas dentro de ese tenant.
 */
function calcularPermisosEfectivosMembresia(membresia: {
  activo: boolean;
  isSuperadmin: boolean;
  departamento: { esSistemas: boolean } | null;
  rolRel: { permisos: string } | null;
}): Set<string> {
  const permisos = new Set<string>();
  if (!membresia.activo) return permisos;

  if (membresia.isSuperadmin || membresia.departamento?.esSistemas) {
    Object.values(PERMISOS_SISTEMA).forEach((p) => permisos.add(p));
  } else if (membresia.rolRel) {
    parseRolPermisos(membresia.rolRel.permisos).forEach((p) => permisos.add(p));
  }
  return permisos;
}

/**
 * Carga el usuario y calcula sus permisos efectivos directamente desde la
 * base de datos (rol heredado + permisos directos, con revocación explícita).
 * Se recalcula en cada request para reflejar de inmediato desactivaciones,
 * cambios de rol o revocaciones de permisos.
 *
 * Si se pasa `tenantId` y es distinto al tenant "hogar" del usuario
 * (user.tenantId), se resuelve la sesión a través de su Membresia en ese
 * tenant en vez de los datos del usuario — así una persona con acceso a
 * varias empresas del grupo tiene rol/permisos independientes en cada una.
 */
export async function loadSessionUser(userId: string, tenantId?: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { rolRel: true, permisosDirectos: true, departamento: true, tenant: { select: { activo: true } } },
  });

  if (!user) return null;

  if (tenantId && tenantId !== user.tenantId) {
    const membresia = await prisma.membresia.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: { rolRel: true, departamento: true, tenant: { select: { activo: true } } },
    });
    // Sin membresía, o la empresa a la que apunta el token está desactivada:
    // se trata como sesión inválida en ambos casos, aunque el JWT en sí
    // siga siendo válido (firma y expiración correctas).
    if (!membresia || !membresia.tenant.activo) return null;

    const permisos = calcularPermisosEfectivosMembresia(membresia);

    return {
      id: user.id,
      tenantId,
      nombre: user.nombre,
      email: user.email,
      telefono: user.telefono,
      rol: membresia.rolRel?.nombre ?? null,
      isSuperadmin: membresia.isSuperadmin,
      activo: user.activo && membresia.activo,
      permisos: Array.from(permisos),
    };
  }

  // El tenant hogar también puede haber sido desactivado después de que se
  // emitió el JWT — se revalida en cada request, no solo al loguearse.
  if (!user.tenant.activo) return null;

  const permisos = calcularPermisosEfectivos(user);

  return {
    id: user.id,
    tenantId: user.tenantId,
    nombre: user.nombre,
    email: user.email,
    telefono: user.telefono,
    rol: user.rolRel?.nombre ?? user.rol,
    isSuperadmin: user.isSuperadmin,
    activo: user.activo,
    permisos: Array.from(permisos),
  };
}

/**
 * Todos los tenants a los que un usuario puede entrar: su tenant "hogar"
 * (User.tenantId, siempre) más cualquier tenant donde tenga una Membresia
 * activa. Se usa en el login para decidir si hay que pedirle que elija con
 * cuál empresa entrar (más de un tenant accesible) o si se puede entrar
 * directo (uno solo).
 */
export async function listarTenantsAccesibles(userId: string): Promise<TenantAccesible[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenant: { select: { id: true, nombre: true, subdomain: true, activo: true } } },
  });
  if (!user) return [];

  const membresias = await prisma.membresia.findMany({
    where: { userId, activo: true },
    select: { tenant: { select: { id: true, nombre: true, subdomain: true, activo: true } } },
  });

  // Un tenant desactivado nunca es "accesible", ni como hogar ni por
  // membresía: no aparece para elegir en el login, y select-tenant lo
  // rechaza igual porque revalida contra esta misma función.
  const vistos = new Set<string>();
  const tenants: TenantAccesible[] = [];
  for (const t of [user.tenant, ...membresias.map((m) => m.tenant)]) {
    if (!t.activo || vistos.has(t.id)) continue;
    vistos.add(t.id);
    tenants.push({ id: t.id, nombre: t.nombre, subdomain: t.subdomain });
  }
  return tenants;
}

/**
 * Ids de todos los usuarios activos del tenant que tienen un permiso
 * concreto (por rol, por acceso total de Sistemas/superadmin, o por permiso
 * directo), usado para saber a quién avisarle de un evento (p. ej. "nueva
 * solicitud de compra pendiente de aprobar"). Carga los usuarios activos del
 * tenant una sola vez y calcula en memoria: en un ERP interno el volumen de
 * usuarios por tenant es lo bastante chico para que esto sea más simple y
 * más fácil de mantener en sincronía con loadSessionUser que replicar la
 * lógica en SQL.
 */
export async function listarUsuariosConPermiso(tenantId: string, permiso: string): Promise<string[]> {
  const usuarios = await prisma.user.findMany({
    where: { tenantId, activo: true },
    include: { rolRel: true, permisosDirectos: true, departamento: true },
  });

  return usuarios.filter((u) => calcularPermisosEfectivos(u).has(permiso)).map((u) => u.id);
}

/**
 * Compara la versión de sesión (`tv`) que trae el JWT contra la almacenada en
 * la base de datos. Cambiar la contraseña incrementa `tokenVersion`, así que
 * cualquier token emitido antes deja de ser válido de inmediato, sin esperar
 * a que expire por tiempo (8h). Un `tv` ausente (tokens emitidos antes de
 * este cambio) también se rechaza, porque nunca coincide con un entero real.
 */
export async function verificarTokenVersion(userId: string, tv: unknown): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
  return !!user && user.tokenVersion === tv;
}
