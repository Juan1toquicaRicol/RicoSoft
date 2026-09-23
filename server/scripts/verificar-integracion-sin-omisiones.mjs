// Gate anti-omisión de la suite de integración en CI: describe.skipIf(!RUN)
// hace que, sin RUN_DB_INTEGRATION_TESTS=true, TODOS los tests se "salten" y
// vitest termine en verde con 0 pruebas ejecutadas. Este script lee el
// reporte JSON de vitest y falla si hubo cero tests, algún fallo o CUALQUIER
// test omitido (ningún *.integration.test.ts usa .skip/.todo a propósito).
import { readFileSync } from "node:fs";

const ruta = process.argv[2] ?? "integration-report.json";
const r = JSON.parse(readFileSync(ruta, "utf8"));
const { numTotalTests, numPassedTests, numFailedTests, numPendingTests, numTodoTests } = r;

console.log(
  `Integración: total=${numTotalTests} pasaron=${numPassedTests} fallaron=${numFailedTests} omitidos=${numPendingTests} todo=${numTodoTests}`,
);

const problemas = [];
if (!numTotalTests) problemas.push("no se ejecutó ningún test");
if (numFailedTests) problemas.push(`${numFailedTests} tests fallaron`);
if (numPendingTests || numTodoTests) {
  problemas.push(`${numPendingTests + numTodoTests} tests omitidos (skip/todo) — omisión silenciosa`);
}
if (numPassedTests !== numTotalTests) problemas.push("pasaron != total");

if (problemas.length > 0) {
  console.error("GATE DE INTEGRACIÓN FALLIDO: " + problemas.join("; "));
  process.exit(1);
}
