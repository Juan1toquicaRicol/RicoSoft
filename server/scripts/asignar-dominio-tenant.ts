/**
 * Asigna (o quita) el dominio de correo corporativo de un tenant. Ese dominio
 * es lo que determina a qué empresa pertenece alguien que se autoregistra
 * (GET /departamentos/publico y POST /auth/register resuelven el tenant por
 * este campo, nunca por un array hardcodeado ni por orden arbitrario).
 *
 * Uso:
 *   npx tsx scripts/asignar-dominio-tenant.ts --tenant=ricol --dominio=ricol.com.co
 *   npx tsx scripts/asignar-dominio-tenant.ts --tenant=demo --quitar
 *
 * --tenant acepta el subdomain del tenant.
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma";

function leerArgumento(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  const arg = process.argv.find((a) => a.startsWith(prefijo));
  return arg?.slice(prefijo.length);
}

async function main() {
  const subdomain = leerArgumento("tenant")?.trim().toLowerCase();
  const dominio = leerArgumento("dominio")?.trim().toLowerCase();
  const quitar = process.argv.includes("--quitar");

  if (!subdomain || (!dominio && !quitar)) {
    throw new Error(
      "Uso: npx tsx scripts/asignar-dominio-tenant.ts --tenant=<subdomain> --dominio=<dominio.com> (o --quitar)",
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { subdomain } });
  if (!tenant) {
    throw new Error(`No existe ningún tenant con subdomain "${subdomain}".`);
  }

  if (quitar) {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { dominioCorporativo: null } });
    console.log(`✅ ${tenant.nombre} ya no tiene dominio corporativo asignado (autoregistro público desactivado).`);
    return;
  }

  const enUso = await prisma.tenant.findUnique({ where: { dominioCorporativo: dominio } });
  if (enUso && enUso.id !== tenant.id) {
    throw new Error(`El dominio "${dominio}" ya está asignado a otro tenant: ${enUso.nombre}.`);
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data: { dominioCorporativo: dominio } });
  console.log(`✅ ${tenant.nombre} ahora usa el dominio "${dominio}" para autoregistro.`);
}

main()
  .catch((e) => {
    console.error("Error:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
