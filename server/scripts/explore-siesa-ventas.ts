/**
 * Exploración puntual de tablas de VENTAS en UnoEE_Ricol_Real (Bloque
 * Gerencial Financiero). Solo lectura, no modifica nada. Uso:
 *   npx tsx scripts/explore-siesa-ventas.ts
 *   npx tsx scripts/explore-siesa-ventas.ts --table=t500_fe_facturas
 */
import "dotenv/config";
import { getSiesaPool, cerrarSiesaPool } from "../src/config/siesa";

async function main() {
  const tableFilter = process.argv.find((a) => a.startsWith("--table="))?.split("=")[1];
  const pool = await getSiesaPool();

  const { recordset: tablas } = await pool
    .request()
    .query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' ORDER BY TABLE_NAME`,
    );

  const patron =
    /venta|factura|invoice|pedido|order|remis|kardex|movim|nota_?credito|nota_?debito|linea|detalle|item|vendedor|seller/i;
  const candidatas = tablas.filter((t: any) => patron.test(t.TABLE_NAME));

  console.log(
    `\n📋 ${candidatas.length} tablas candidatas a ventas de ${tablas.length} totales:\n`,
  );
  candidatas.forEach((t: any) => console.log(`  - ${t.TABLE_NAME}`));

  if (tableFilter) {
    console.log(`\n🔍 Columnas de ${tableFilter}:\n`);
    const { recordset: columnas } = await pool
      .request()
      .query(
        `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${tableFilter}' ORDER BY ORDINAL_POSITION`,
      );
    columnas.forEach((c: any) => console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE})`));

    console.log(`\nConteo de filas:`);
    const { recordset: cnt } = await pool
      .request()
      .query(`SELECT COUNT(*) AS n FROM ${tableFilter}`);
    console.log(`  ${cnt[0].n}`);

    console.log(`\nSample de 3 filas:`);
    const { recordset: sample } = await pool.request().query(`SELECT TOP 3 * FROM ${tableFilter}`);
    console.log(JSON.stringify(sample, null, 2));
  }

  await cerrarSiesaPool();
}

main().catch((e) => {
  console.error("Error explorando ventas en Siesa:", e.message);
  process.exit(1);
});
