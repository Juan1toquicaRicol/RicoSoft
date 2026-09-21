import { prisma } from "../../config/prisma";
import { PERMISOS_SISTEMA, PERMISOS_LEGACY } from "../../lib/permissions";
import { moduloPermiso, nombrePermiso } from "../../lib/catalogo-permisos";

// Nombre y módulo salen de la jerarquía Módulo → Sección (lib/catalogo-permisos.ts),
// no del prefijo del código: así "pedidos_comerciales.ver" se siembra como
// módulo "Comercial" y nombre "Pedidos comerciales · Ver", en vez del
// "Pedidos_comerciales" con guion bajo que producía derivarlo del código.

/**
 * Reconcilia el catálogo de permisos de un tenant contra PERMISOS_SISTEMA en
 * cada consulta — antes solo sembraba una vez ("si ya existe algún permiso
 * de sistema, no hacer nada"), así que un código agregado a PERMISOS_SISTEMA
 * después del primer seed de un tenant quedaba invisible para siempre en su
 * catálogo (ver auditoría: los 4 permisos de biométrico no aparecían en
 * Roles/Permisos aunque el backend ya los exigía). Ahora solo inserta los
 * códigos de sistema que falten; los que ya existen —de sistema o
 * personalizados— nunca se tocan, y si no falta ninguno no se crea nada.
 * Nombre/módulo iniciales se derivan del código (p. ej. "solicitudes.aprobar"
 * -> módulo "Solicitudes", nombre "Solicitudes Aprobar"); un administrador
 * puede renombrarlos después.
 */
async function asegurarCatalogoSembrado(tenantId: string): Promise<void> {
  const existentes = await prisma.permiso.findMany({
    where: { tenantId, esSistema: true },
    select: { codigo: true },
  });
  const codigosExistentes = new Set(existentes.map((p) => p.codigo));
  const faltantes = Object.values(PERMISOS_SISTEMA).filter(
    (codigo) => !codigosExistentes.has(codigo),
  );
  if (faltantes.length === 0) return;

  try {
    // SQL Server no soporta `skipDuplicates` en createMany (a diferencia de
    // Postgres/SQLite); si dos requests concurrentes calculan el mismo
    // conjunto de faltantes a la vez, la segunda inserción choca contra el
    // índice único [tenantId, codigo] y falla — se ignora ese error puntual:
    // la primera ya insertó lo que hacía falta, que es lo único que importaba.
    await prisma.permiso.createMany({
      data: faltantes.map((codigo) => ({
        tenantId,
        codigo,
        nombre: nombrePermiso(codigo),
        modulo: moduloPermiso(codigo),
        esSistema: true,
        activo: true,
      })),
    });
  } catch {
    // Ignorado a propósito: ver comentario arriba.
  }
}

/**
 * Catálogo visible/asignable del tenant. Las filas de códigos LEGACY se
 * conservan en base (nunca se borran: un rol guardado puede seguir
 * teniéndolas y se siguen honrando vía expandirLegacy) pero se ocultan aquí,
 * para que un administrador no pueda seguir asignando códigos muertos ni vea
 * duplicados del tipo "Cotizaciones Manipular" junto a "Cotizaciones
 * Gestionar".
 */
export async function listarCatalogoPermisos(tenantId: string) {
  await asegurarCatalogoSembrado(tenantId);
  const permisos = await prisma.permiso.findMany({
    where: { tenantId },
    orderBy: [{ modulo: "asc" }, { nombre: "asc" }],
  });
  return permisos.filter((p) => !(p.codigo in PERMISOS_LEGACY));
}

/**
 * Códigos de permiso asignables a un Rol de este tenant: los del sistema
 * (siempre, aunque el catálogo de este tenant todavía no se haya sembrado —
 * son la fuente de verdad de requirePermission() en el código, nunca deben
 * dejar de poder asignarse) más los personalizados activos del tenant.
 */
export async function obtenerCodigosPermisosAsignables(tenantId: string): Promise<Set<string>> {
  const codigos = new Set<string>(Object.values(PERMISOS_SISTEMA));
  const personalizados = await prisma.permiso.findMany({
    where: { tenantId, esSistema: false, activo: true },
    select: { codigo: true },
  });
  personalizados.forEach((p) => codigos.add(p.codigo));
  return codigos;
}
