import { prisma } from "../../config/prisma";
import { PERMISOS_SISTEMA } from "../../lib/permissions";

function moduloDesdeCodigo(codigo: string): string {
  const [prefijo] = codigo.split(".");
  return prefijo ? prefijo.charAt(0).toUpperCase() + prefijo.slice(1) : "General";
}

function nombreDesdeCodigo(codigo: string): string {
  return codigo
    .split(/[._]/)
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(" ");
}

/**
 * Siembra el catálogo de permisos de un tenant a partir de PERMISOS_SISTEMA
 * la primera vez que se consulta — no hay migración de datos: cada tenant se
 * siembra perezosamente al primer acceso a Administración Global > Permisos,
 * sin tocar tenants que nunca la abran. Nombre/módulo iniciales se derivan
 * del código (p. ej. "solicitudes.aprobar" -> módulo "Solicitudes", nombre
 * "Solicitudes Aprobar"); un administrador puede renombrarlos después.
 */
async function asegurarCatalogoSembrado(tenantId: string): Promise<void> {
  const existe = await prisma.permiso.findFirst({
    where: { tenantId, esSistema: true },
    select: { id: true },
  });
  if (existe) return;

  try {
    // SQL Server no soporta `skipDuplicates` en createMany (a diferencia de
    // Postgres/SQLite); si dos requests concurrentes ven `existe === null` a
    // la vez, la segunda inserción choca contra el índice único
    // [tenantId, codigo] y falla — se ignora ese error puntual: la primera
    // ya sembró el catálogo, que es lo único que importaba.
    await prisma.permiso.createMany({
      data: Object.values(PERMISOS_SISTEMA).map((codigo) => ({
        tenantId,
        codigo,
        nombre: nombreDesdeCodigo(codigo),
        modulo: moduloDesdeCodigo(codigo),
        esSistema: true,
        activo: true,
      })),
    });
  } catch {
    // Ignorado a propósito: ver comentario arriba.
  }
}

export async function listarCatalogoPermisos(tenantId: string) {
  await asegurarCatalogoSembrado(tenantId);
  return prisma.permiso.findMany({
    where: { tenantId },
    orderBy: [{ modulo: "asc" }, { nombre: "asc" }],
  });
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
