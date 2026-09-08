/**
 * Importación histórica de marcaciones CrossChex hacia MarcacionBiometrica
 * (Fase 4). Procesa por lotes desde FuenteBiometrica.lastProcessedLogId en
 * adelante — nunca carga todo en memoria, nunca escribe en CrossChex.mdb.
 *
 * Requiere que la FuenteBiometrica ya exista (créala con Prisma Studio o un
 * script de setup: tenantId, proveedor, nombre) y, opcionalmente, que ya
 * existan asociaciones EmpleadoBiometrico — las marcaciones sin asociación
 * se importan igual, con empleadoId = null.
 *
 * Uso:
 *   npx tsx scripts/importar-historico-crosschex.ts --fuente=crosschex-flexipack --dry-run
 *   npx tsx scripts/importar-historico-crosschex.ts --fuente=crosschex-flexipack
 *   npx tsx scripts/importar-historico-crosschex.ts --fuente=crosschex-flexipack --lote=2000
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma";
import {
  dryRunImportacionHistorica,
  ejecutarImportacionHistorica,
} from "../src/modules/gestion-humana/biometrico-import.service";

function leerArgumento(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  const arg = process.argv.find((a) => a.startsWith(prefijo));
  return arg?.slice(prefijo.length);
}

async function main() {
  const fuenteNombre = leerArgumento("fuente");
  if (!fuenteNombre) {
    throw new Error(
      "Falta --fuente=<nombre>. Ejemplo: npx tsx scripts/importar-historico-crosschex.ts --fuente=crosschex-flexipack --dry-run",
    );
  }
  const esDryRun = process.argv.includes("--dry-run");
  const loteArg = leerArgumento("lote");
  const tamanoLote = loteArg ? Number(loteArg) : undefined;

  if (esDryRun) {
    console.log(`Dry-run de importación histórica para la fuente "${fuenteNombre}"...\n`);
    const reporte = await dryRunImportacionHistorica(fuenteNombre, tamanoLote);
    console.log("--- Reporte (sin escribir nada) ---");
    console.log(`Total marcaciones encontradas: ${reporte.totalMarcacionesEncontradas}`);
    console.log(`  Con usuario conocido: ${reporte.marcacionesConUsuarioConocido}`);
    console.log(`  Sin usuario conocido: ${reporte.marcacionesSinUsuarioConocido}`);
    console.log(`Usuarios únicos conocidos: ${reporte.usuariosUnicosConocidos}`);
    console.log(
      `Usuarios únicos SIN asociar (${reporte.usuariosUnicosDesconocidos.length}): ${reporte.usuariosUnicosDesconocidos.join(", ") || "(ninguno)"}`,
    );
    console.log("Por tipo:", reporte.porTipo);
    console.log(`Rango de Logid: ${reporte.primerLogid} — ${reporte.ultimoLogid}`);
    return;
  }

  console.log(`Importando histórico para la fuente "${fuenteNombre}"...\n`);
  const reporte = await ejecutarImportacionHistorica(fuenteNombre, {
    tamanoLote,
    onProgreso: ({ procesados }) => {
      process.stdout.write(`\rProcesados: ${procesados}`);
    },
  });
  console.log("\n\n--- Resultado ---");
  console.log(JSON.stringify(reporte, null, 2));

  if (reporte.estado === "FALLIDO") {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("\nError en la importación histórica de CrossChex:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
