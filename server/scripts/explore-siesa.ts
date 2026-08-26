/**
 * Explora las tablas de UnoEE_Ricol_Real para encontrar terceros/proveedores.
 * Conecta a Siesa y lista las tablas, columnas, y un sample de datos.
 *
 * Uso:
 *   npx tsx scripts/explore-siesa.ts --table=mm00_terceros
 *   npx tsx scripts/explore-siesa.ts (lista todas las tablas con "tercero", "provider", "vendor", etc.)
 */
import "dotenv/config";
import { getSiesaPool, cerrarSiesaPool, sql } from "../src/config/siesa";

async function main() {
  const tableFilter = process.argv.find((a) => a.startsWith("--table="))?.split("=")[1];

  const pool = await getSiesaPool();

  // Listar todas las tablas del schema
  console.log("\n📋 Tablas en UnoEE_Ricol_Real:\n");
  const { recordset: tablas } = await pool
    .request()
    .query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' ORDER BY TABLE_NAME`,
    );

  const tablasFiltradasPalabrasClave = tablas.filter((t: any) =>
    /tercero|provider|vendor|proveedor|supplier|cliente|customer/.test(t.TABLE_NAME.toLowerCase()),
  );

  if (tablasFiltradasPalabrasClave.length > 0) {
    console.log("Tablas que coinciden con 'tercero/proveedor/cliente/vendor':");
    tablasFiltradasPalabrasClave.forEach((t: any) => console.log(`  - ${t.TABLE_NAME}`));
  } else {
    console.log("Sin coincidencias obvias. Mostrando primeras 50 tablas:");
    tablas.slice(0, 50).forEach((t: any) => console.log(`  - ${t.TABLE_NAME}`));
  }

  // Si pasaste --table=XX, inspecciona esa tabla
  if (tableFilter) {
    console.log(`\n🔍 Inspección de tabla: ${tableFilter}\n`);

    // Columnas
    const { recordset: columnas } = await pool
      .request()
      .query(
        `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${tableFilter}' ORDER BY ORDINAL_POSITION`,
      );

    console.log(`Columnas (${columnas.length}):`);
    columnas.forEach((c: any) => console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE})`));

    // Sample
    console.log(`\nSample de 5 filas:`);
    const { recordset: sample } = await pool.request().query(`SELECT TOP 5 * FROM ${tableFilter}`);
    console.log(JSON.stringify(sample, null, 2));
  }

  await cerrarSiesaPool();
}

main().catch((e) => {
  console.error("Error explorando Siesa:", e.message);
  process.exit(1);
});
