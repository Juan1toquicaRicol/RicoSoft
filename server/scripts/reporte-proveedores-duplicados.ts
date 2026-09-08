/**
 * FASE 15 del plan Siesa → Proveedores: reporte de solo lectura de
 * proveedores candidatos a duplicado dentro del mismo tenant (mismo nombre,
 * NITs distintos — típicamente un dígito de diferencia por transcripción).
 * NO modifica NADA — solo imprime un reporte para revisión manual.
 *
 * Uso: npx tsx scripts/reporte-proveedores-duplicados.ts
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma";

async function main() {
  const duplicadosPorNombre = await prisma.$queryRawUnsafe<
    { tenantId: string; nombre: string; cantidad: number }[]
  >(`
    SELECT tenantId, nombre, COUNT(*) as cantidad
    FROM Proveedor
    GROUP BY tenantId, nombre
    HAVING COUNT(*) > 1
  `);

  if (duplicadosPorNombre.length === 0) {
    console.log("No se encontraron proveedores con el mismo nombre repetido en el mismo tenant.");
    await prisma.$disconnect();
    return;
  }

  console.log(`${duplicadosPorNombre.length} nombre(s) repetido(s) encontrados. Detalle:\n`);

  for (const d of duplicadosPorNombre) {
    const filas = await prisma.proveedor.findMany({
      where: { tenantId: d.tenantId, nombre: d.nombre },
      select: {
        id: true,
        nit: true,
        activo: true,
        origen: true,
        createdAt: true,
        _count: {
          select: {
            facturas: true,
            servicios: true,
            solicitudesCompra: true,
            cotizaciones: true,
          },
        },
      },
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: d.tenantId },
      select: { nombre: true },
    });

    console.log(`— "${d.nombre}" (${tenant?.nombre ?? d.tenantId}):`);
    for (const f of filas) {
      const relaciones =
        f._count.facturas +
        f._count.servicios +
        f._count.solicitudesCompra +
        f._count.cotizaciones;
      console.log(
        `   id=${f.id} nit="${f.nit}" activo=${f.activo} origen=${f.origen} relaciones=${relaciones} creado=${f.createdAt.toISOString()}`,
      );
    }
    console.log("");
  }

  console.log(
    "Este reporte es informativo. NINGÚN dato fue modificado. La resolución (cuál NIT es el correcto, si " +
      "fusionar o no) requiere revisión manual — ver Fase 15 del plan de implementación.",
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error generando el reporte:", e);
  process.exit(1);
});
