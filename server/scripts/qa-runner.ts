import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { validarDestinoQa } from "../src/lib/integration-db-guard";

/**
 * Ejecuta migraciones, sincronización de catálogos o la suite de integración
 * SOLO contra saas_dev_qa. Lee server/.env.integration.qa explícitamente,
 * IGNORA cualquier DATABASE_URL ya presente en el entorno, valida el destino
 * con el guard y entrega ese valor al proceso hijo.
 * Uso: tsx scripts/qa-runner.ts <deploy|status|test|catalogos>
 */
const modo = process.argv[2];
const raiz = resolve(__dirname, "..");
const archivo = resolve(raiz, ".env.integration.qa");

let valores: Record<string, string>;
try {
  valores = parse(readFileSync(archivo));
} catch {
  console.error("Falta server/.env.integration.qa (copia .env.integration.qa.example).");
  process.exit(1);
}

// Migraciones -> login migrador (DDL); pruebas y catálogo -> login runner (DML).
const rol = modo === "test" || modo === "catalogos" ? "runner" : "migrador";
const urlRol = valores[rol === "runner" ? "DATABASE_URL_RUNNER" : "DATABASE_URL_MIGRADOR"];
const destino = validarDestinoQa(urlRol, rol);
console.log(`[qa] destino verificado: ${destino.database} @ ${destino.host}:${destino.port} (login ${destino.user})`);

const env = { ...process.env, ...valores, DATABASE_URL: urlRol };
const prisma = resolve(raiz, "node_modules/prisma/build/index.js");
const vitest = resolve(raiz, "node_modules/vitest/vitest.mjs");
const comandos: Record<string, string[]> = {
  deploy: [prisma, "migrate", "deploy"],
  status: [prisma, "migrate", "status"],
  test: [vitest, "run", "--config", "vitest.integration.config.mts", "--maxWorkers=1", "--no-file-parallelism"],
  catalogos: [resolve(raiz, "node_modules/tsx/dist/cli.mjs"), "scripts/sincronizar-catalogos-generales.ts"],
};
const args = comandos[modo];
if (!args) {
  console.error("Modo inválido. Usa: deploy | status | test | catalogos");
  process.exit(1);
}
const r = spawnSync(process.execPath, args, { cwd: raiz, env, stdio: "inherit" });
process.exit(r.status ?? 1);
