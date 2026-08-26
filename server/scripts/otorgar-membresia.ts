/**
 * Da acceso a un usuario existente a una empresa (tenant) adicional a la
 * suya, para el caso de personas que trabajan en más de una empresa del
 * grupo (Ricol, Flexipack, Green Solutions). El usuario debe existir ya
 * (crear la cuenta primero desde la UI de Usuarios en su empresa "hogar").
 *
 * Uso:
 *   npx tsx scripts/otorgar-membresia.ts --email=persona@ricol.com.co --tenant=flexipack
 *   npx tsx scripts/otorgar-membresia.ts --email=persona@ricol.com.co --tenant=flexipack --rol="Aprobador Compras"
 *   npx tsx scripts/otorgar-membresia.ts --email=persona@ricol.com.co --tenant=flexipack --superadmin
 *
 * --tenant acepta el subdomain del tenant (ricol, flexipack, green-solutions).
 * --rol es opcional: el nombre exacto de un Rol ya creado en ese tenant.
 * --superadmin da acceso total en ese tenant, sin necesidad de --rol.
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma";

function leerArgumento(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  const arg = process.argv.find((a) => a.startsWith(prefijo));
  return arg?.slice(prefijo.length);
}

async function main() {
  const email = leerArgumento("email")?.trim().toLowerCase();
  const subdomain = leerArgumento("tenant")?.trim().toLowerCase();
  const rolNombre = leerArgumento("rol");
  const superadmin = process.argv.includes("--superadmin");

  if (!email || !subdomain) {
    throw new Error(
      "Uso: npx tsx scripts/otorgar-membresia.ts --email=<correo> --tenant=<subdomain> [--rol=<nombre>] [--superadmin]",
    );
  }

  const usuario = await prisma.user.findUnique({ where: { email } });
  if (!usuario) {
    throw new Error(`No existe ningún usuario con el correo ${email}.`);
  }

  const tenant = await prisma.tenant.findUnique({ where: { subdomain } });
  if (!tenant) {
    throw new Error(`No existe ningún tenant con subdomain "${subdomain}".`);
  }

  if (usuario.tenantId === tenant.id) {
    throw new Error(`${email} ya pertenece a ${tenant.nombre} como su empresa "hogar" — no necesita membresía.`);
  }

  let rolId: string | undefined;
  if (rolNombre) {
    const rol = await prisma.rol.findFirst({ where: { tenantId: tenant.id, nombre: rolNombre, activo: true } });
    if (!rol) {
      throw new Error(`No existe un rol activo llamado "${rolNombre}" en ${tenant.nombre}.`);
    }
    rolId = rol.id;
  } else if (!superadmin) {
    console.log(
      "⚠️  No pasaste --rol ni --superadmin: la membresía quedará sin permisos hasta que le asignes un rol.",
    );
  }

  const membresia = await prisma.membresia.upsert({
    where: { userId_tenantId: { userId: usuario.id, tenantId: tenant.id } },
    create: { userId: usuario.id, tenantId: tenant.id, rolId, isSuperadmin: superadmin, activo: true },
    update: { rolId, isSuperadmin: superadmin, activo: true },
  });

  console.log(`\n✅ ${usuario.nombre} (${email}) ahora tiene acceso a ${tenant.nombre}.`);
  console.log(`   Membresía: ${membresia.id}`);
  console.log(`   Rol: ${rolNombre ?? (superadmin ? "Superadmin (acceso total)" : "(sin rol asignado)")}`);
  console.log("\nLa próxima vez que inicie sesión, se le pedirá elegir entre sus empresas.");
}

main()
  .catch((e) => {
    console.error("Error:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
