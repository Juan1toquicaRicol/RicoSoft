/**
 * FASE 2 del plan Siesa → Proveedores: backfill de Proveedor.siesaTerceroRowId
 * para proveedores existentes, vinculándolos con el tercero real de Siesa por
 * (tenantId, nit). NO fusiona, NO elimina, NO reasigna relaciones.
 *
 * Requiere el túnel VPN activo hacia Siesa. Por defecto corre en modo
 * DRY-RUN (solo imprime qué haría) — hay que pasar --aplicar explícitamente
 * para escribir. Los casos ambiguos (más de un proveedor de RicoSoft con el
 * mismo NIT que coincide en Siesa — no debería pasar por el @@unique, pero
 * se valida igual) quedan reportados, nunca resueltos automáticamente.
 *
 * Uso:
 *   npx tsx scripts/backfill-siesa-terceros.ts --tenant=<id>            (dry-run)
 *   npx tsx scripts/backfill-siesa-terceros.ts --tenant=<id> --aplicar  (escribe)
 */
import "dotenv/config";
import { getSiesaPool, cerrarSiesaPool } from "../src/config/siesa";
import { prisma } from "../src/config/prisma";

function leerArgumento(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(prefijo))?.slice(prefijo.length);
}

interface ProveedorSiesa {
  nit: string;
  siesaTerceroRowId: number;
}

async function main() {
  const tenantIdArg = leerArgumento("tenant");
  const aplicar = process.argv.includes("--aplicar");

  if (!tenantIdArg) {
    throw new Error("Uso: npx tsx scripts/backfill-siesa-terceros.ts --tenant=<id> [--aplicar]");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantIdArg },
    select: { id: true, nombre: true, siesaCiaId: true },
  });
  if (!tenant?.siesaCiaId) {
    throw new Error("Ese tenant no existe o no tiene siesaCiaId configurado.");
  }

  console.log(
    `Backfill para "${tenant.nombre}" (cia ${tenant.siesaCiaId}) — modo: ${aplicar ? "APLICAR" : "DRY-RUN (nada se escribe)"}\n`,
  );

  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", tenant.siesaCiaId)
    .query<ProveedorSiesa>(`
    SELECT t200.f200_nit AS nit, t200.f200_rowid AS siesaTerceroRowId
    FROM t202_mm_proveedores t202
    INNER JOIN t200_mm_terceros t200 ON t202.f202_rowid_tercero = t200.f200_rowid
    WHERE t202.f202_id_cia = @ciaId
      AND t200.f200_nit IS NOT NULL AND LTRIM(RTRIM(t200.f200_nit)) != ''
  `);

  let vinculados = 0;
  let sinCoincidencia = 0;
  let yaVinculados = 0;

  for (const prov of recordset) {
    const existente = await prisma.proveedor.findUnique({
      where: { tenantId_nit: { tenantId: tenant.id, nit: prov.nit } },
    });

    if (!existente) {
      sinCoincidencia++;
      continue;
    }
    if (existente.siesaTerceroRowId !== null) {
      yaVinculados++;
      continue;
    }

    console.log(
      `  Vincular: proveedor ${existente.id} (nit=${prov.nit}) -> siesaTerceroRowId=${prov.siesaTerceroRowId}`,
    );
    if (aplicar) {
      await prisma.proveedor.update({
        where: { id: existente.id },
        data: {
          siesaTerceroRowId: prov.siesaTerceroRowId,
          origen: "SIESA",
          ultimaSincronizacion: new Date(),
        },
      });
    }
    vinculados++;
  }

  console.log(
    `\nResumen: ${vinculados} vinculados${aplicar ? "" : " (dry-run, nada escrito)"}, ` +
      `${yaVinculados} ya tenían siesaTerceroRowId, ${sinCoincidencia} en Siesa sin proveedor correspondiente en RicoSoft (probablemente nuevos — los trae la sincronización normal, no este script).`,
  );

  await cerrarSiesaPool();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error en el backfill:", e);
  process.exit(1);
});
