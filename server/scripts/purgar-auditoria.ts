/**
 * Purga registros de Auditoria más antiguos que N días. Por defecto corre en
 * modo simulación (solo cuenta e informa, no borra nada) — hay que pasar
 * --confirm explícitamente para borrar de verdad.
 *
 * Uso:
 *   npx tsx scripts/purgar-auditoria.ts --dias=730            (simulación)
 *   npx tsx scripts/purgar-auditoria.ts --dias=730 --confirm  (borra)
 *
 * Pensado para correr periódicamente (cron / tarea programada) una vez
 * decidida la política de retención real de la organización.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function leerArgumento(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  const arg = process.argv.find((a) => a.startsWith(prefijo));
  return arg?.slice(prefijo.length);
}

async function main() {
  const dias = Number(leerArgumento("dias") ?? 730);
  const confirmar = process.argv.includes("--confirm");

  if (!Number.isFinite(dias) || dias <= 0) {
    throw new Error("--dias debe ser un número positivo.");
  }

  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const total = await prisma.auditoria.count({ where: { createdAt: { lt: limite } } });

  if (!confirmar) {
    console.log(
      `[Simulación] ${total} registro(s) de auditoría anteriores a ${limite.toISOString()} (más de ${dias} días) serían eliminados.`,
    );
    console.log("Corre de nuevo con --confirm para borrarlos de verdad.");
    return;
  }

  const resultado = await prisma.auditoria.deleteMany({ where: { createdAt: { lt: limite } } });
  console.log(`Eliminados ${resultado.count} registro(s) de auditoría anteriores a ${limite.toISOString()}.`);
}

main()
  .catch((e) => {
    console.error("Error al purgar auditoría:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
