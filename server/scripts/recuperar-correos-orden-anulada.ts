/**
 * Recuperación de correos históricos de la Bandeja de Importaciones que siguen
 * apuntando a una orden anulada o eliminada (anuladas antes de que la anulación
 * desvinculara sus correos). Aplica, empresa por empresa, la misma
 * desvinculación que la anulación: el correo vuelve a Requiere revisión con una
 * excepción de orden, y el vínculo anterior queda en Auditoria.
 *
 * Por defecto SOLO REPORTA. Para aplicar los cambios: --aplicar
 * Uso: npx tsx scripts/recuperar-correos-orden-anulada.ts [--aplicar]
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma";
import { recuperarCorreosConOrdenAnulada } from "../src/modules/importaciones/importaciones-bandeja-vinculo";

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const tenants = await prisma.ordenCompraIntl.findMany({
    where: {
      OR: [{ eliminado: true }, { estado: "Anulada" }],
      correosBandeja: { some: {} },
    },
    select: { tenantId: true },
    distinct: ["tenantId"],
  });
  if (!tenants.length) {
    console.log("No hay correos de la Bandeja vinculados a órdenes anuladas o eliminadas.");
    return;
  }
  for (const { tenantId } of tenants) {
    const resultado = await recuperarCorreosConOrdenAnulada(prisma, tenantId, { aplicar });
    for (const r of resultado) {
      console.log(
        `${aplicar ? "Desvinculados" : "Por desvincular"} en la empresa ${tenantId}, orden ${r.numeroOrden}: ${r.correoIds.length} correo(s).`,
      );
    }
  }
  if (!aplicar) console.log("Solo reporte. Ejecuta con --aplicar para desvincularlos.");
}

main()
  .catch((error) => {
    console.error("Error en la recuperación de correos:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
