/**
 * Prueba de conectividad real Node -> ODBC -> Microsoft Access Driver ->
 * CrossChex.mdb. Ejecutar en el servidor Windows donde está instalado
 * CrossChex Standard (con CROSSCHEX_MDB_PATH configurado en .env).
 *
 * No modifica el MDB: solo hace SELECT de las columnas necesarias, nunca
 * SELECT * contra Userinfo, y nunca incluye Pwd.
 *
 * Uso:
 *   npx tsx scripts/explore-crosschex.ts
 */
import "dotenv/config";
import {
  obtenerUltimasMarcaciones,
  obtenerUsuarios,
  verificarConexion,
} from "../src/integrations/crosschex";

async function main() {
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
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error verificando CrossChex:", error);
    process.exit(1);
  });
