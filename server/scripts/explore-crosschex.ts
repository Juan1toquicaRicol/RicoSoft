/**
 * Prueba de conectividad real Node -> ODBC -> Microsoft Access Driver ->
 * CrossChex.mdb. Ejecutar en el servidor Windows donde está instalado
 * CrossChex Standard (con CROSSCHEX_MDB_PATH configurado en .env).
 *
 * No modifica el MDB: solo hace SELECT de las columnas necesarias, nunca
 * SELECT * contra Userinfo, y nunca incluye Pwd.
 *
 * Exige el propietario explícito del .mdb (CROSSCHEX_TENANT_PROPIETARIO_ID,
 * decisión D-01 / SEG-01) y que corresponda a una empresa registrada: sin él no
 * se abre el archivo, igual que la sincronización y la importación.
 *
 * Uso:
 *   npx tsx scripts/explore-crosschex.ts
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma";
import {
  obtenerUltimasMarcaciones,
  obtenerUsuarios,
  verificarConexion,
} from "../src/integrations/crosschex";
import { exigirPropietarioCrossChexConfigurado } from "../src/modules/gestion-humana/biometrico-import.service";

async function main() {
  await exigirPropietarioCrossChexConfigurado();

  console.log("Verificando conexión a CrossChex.mdb...");
  await verificarConexion();
  console.log("Conexión OK.\n");

  console.log("Últimas 10 marcaciones (Checkinout):");
  const marcaciones = await obtenerUltimasMarcaciones(10);
  console.table(marcaciones);

  console.log("\nUsuarios registrados en el biométrico (Userinfo, sin Pwd):");
  const usuarios = await obtenerUsuarios(10);
  console.table(usuarios);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Error verificando CrossChex:", error);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
