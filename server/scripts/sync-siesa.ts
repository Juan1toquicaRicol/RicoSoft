/**
 * Sincroniza datos maestros desde Siesa/UnoEE hacia la base interna, para
 * cada tenant que tenga configurado un siesaCiaId (compañía de Siesa).
 * Pensado para correr periódicamente vía Programador de tareas de Windows
 * (o cron, si corre en Linux) desde una máquina con el túnel OpenVPN activo
 * hacia db06.siesacloud.local — no hay VPN embebida en este proceso.
 *
 * Uso:
 *   npx tsx scripts/sync-siesa.ts                  (todos los tenants con siesaCiaId)
 *   npx tsx scripts/sync-siesa.ts --tenant=<id>     (solo un tenant)
 */
import "dotenv/config";
import { sincronizarProveedoresDesdeSiesa } from "../src/modules/integraciones-siesa/siesa-sync.service";
import { cerrarSiesaPool } from "../src/config/siesa";
import { prisma } from "../src/config/prisma";

function leerArgumento(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  const arg = process.argv.find((a) => a.startsWith(prefijo));
  return arg?.slice(prefijo.length);
}

async function main() {
  const tenantIdArg = leerArgumento("tenant");

  const tenants = await prisma.tenant.findMany({
    where: {
      siesaCiaId: { not: null },
      ...(tenantIdArg ? { id: tenantIdArg } : {}),
    },
    select: { id: true, nombre: true, siesaCiaId: true },
  });

  if (tenants.length === 0) {
    throw new Error(
      tenantIdArg
        ? `El tenant ${tenantIdArg} no existe o no tiene siesaCiaId configurado.`
        : "No hay ningún tenant con siesaCiaId configurado. Configura al menos uno antes de sincronizar.",
    );
  }

  let huboErrores = false;

  for (const tenant of tenants) {
    console.log(
      `\n[${new Date().toISOString()}] Sincronizando "${tenant.nombre}" (cia ${tenant.siesaCiaId})...`,
    );
    const resultado = await sincronizarProveedoresDesdeSiesa(tenant.id, tenant.siesaCiaId!);
    console.log(
      `[${new Date().toISOString()}] Listo. Leídos: ${resultado.leidos}, creados: ${resultado.creados}, ` +
        `actualizados: ${resultado.actualizados}, errores: ${resultado.errores.length}.`,
    );

    if (resultado.errores.length > 0) {
      console.error("Detalle de errores:", resultado.errores);
      huboErrores = true;
    }
  }

  if (huboErrores) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("Error sincronizando con Siesa:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cerrarSiesaPool();
    await prisma.$disconnect();
  });
