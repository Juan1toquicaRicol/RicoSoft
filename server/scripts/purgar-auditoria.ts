/**
 * Purga registros de Auditoria más antiguos que N días (ISO 27001 A.12.4).
 * Script SOLO de línea de comandos: no lo importa ni lo invoca ningún
 * controlador/ruta HTTP del servidor.
 *
 * Flujo obligatorio en dos pasos:
 *   1) npx tsx scripts/purgar-auditoria.ts --dias=730 --dry-run
 *      Cuenta e informa; no borra. Deja una "simulación previa" vigente
 *      (24 h) para ese mismo --dias y el mismo conteo.
 *   2) npx tsx scripts/purgar-auditoria.ts --dias=730 --confirm
 *      Borra solo si existe la simulación previa vigente y el conteo actual
 *      coincide con el simulado.
 *
 * Toda ejecución (simulación, rechazo o purga) se agrega a
 * logs/purga-auditoria.log: archivo de solo-anexado con cadena de hashes
 * SHA-256 (cada línea incluye el hash de la anterior), de modo que cualquier
 * alteración o borrado de líneas es detectable.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import path from "node:path";

const prisma = new PrismaClient();

const DIR_LOGS = path.resolve(__dirname, "..", "logs");
const LOG_PURGA = path.join(DIR_LOGS, "purga-auditoria.log");
const MARCADOR_SIMULACION = path.join(DIR_LOGS, ".purga-auditoria-simulacion.json");
const VIGENCIA_SIMULACION_MS = 24 * 60 * 60 * 1000;

/** Anexa una línea al log de purga encadenada por hash a la línea anterior. */
function registrarEnLogInmutable(evento: Record<string, unknown>) {
  mkdirSync(DIR_LOGS, { recursive: true });
  let hashPrevio = "GENESIS";
  if (existsSync(LOG_PURGA)) {
    const lineas = readFileSync(LOG_PURGA, "utf8").trim().split("\n");
    const ultima = lineas[lineas.length - 1];
    if (ultima) hashPrevio = JSON.parse(ultima).hash;
  }
  const cuerpo = {
    fecha: new Date().toISOString(),
    operador: `${userInfo().username}@${hostname()}`,
    ...evento,
    hashPrevio,
  };
  const hash = createHash("sha256").update(JSON.stringify(cuerpo)).digest("hex");
  appendFileSync(LOG_PURGA, JSON.stringify({ ...cuerpo, hash }) + "\n", { flag: "a" });
}

function leerArgumento(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  const arg = process.argv.find((a) => a.startsWith(prefijo));
  return arg?.slice(prefijo.length);
}

async function main() {
  const dias = Number(leerArgumento("dias") ?? 730);
  const dryRun = process.argv.includes("--dry-run");
  const confirmar = process.argv.includes("--confirm");

  if (!Number.isFinite(dias) || dias <= 0) {
    throw new Error("--dias debe ser un número positivo.");
  }
  if (dryRun === confirmar) {
    throw new Error("Indica exactamente una opción: --dry-run (simular) o --confirm (purgar).");
  }

  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const total = await prisma.auditoria.count({ where: { createdAt: { lt: limite } } });

  if (dryRun) {
    mkdirSync(DIR_LOGS, { recursive: true });
    writeFileSync(
      MARCADOR_SIMULACION,
      JSON.stringify({ dias, total, simuladoEn: Date.now() }),
      "utf8",
    );
    registrarEnLogInmutable({ accion: "SIMULACION", dias, limite: limite.toISOString(), total });
    console.log(
      `[Simulación] ${total} registro(s) de auditoría anteriores a ${limite.toISOString()} (más de ${dias} días) serían eliminados.`,
    );
    console.log("Corre de nuevo con --confirm (mismo --dias) dentro de 24 h para purgar.");
    return;
  }

  let simulacion: { dias: number; total: number; simuladoEn: number } | null = null;
  try {
    simulacion = JSON.parse(readFileSync(MARCADOR_SIMULACION, "utf8"));
  } catch {
    simulacion = null;
  }
  const vigente =
    simulacion !== null &&
    simulacion.dias === dias &&
    simulacion.total === total &&
    Date.now() - simulacion.simuladoEn <= VIGENCIA_SIMULACION_MS;
  if (!vigente) {
    registrarEnLogInmutable({ accion: "PURGA_RECHAZADA", dias, total, motivo: "sin simulación previa vigente" });
    throw new Error(
      "Purga rechazada: ejecuta primero --dry-run con el mismo --dias (vigencia 24 h y conteo sin cambios).",
    );
  }

  registrarEnLogInmutable({ accion: "PURGA_INICIADA", dias, limite: limite.toISOString(), total });
  const resultado = await prisma.auditoria.deleteMany({ where: { createdAt: { lt: limite } } });
  registrarEnLogInmutable({ accion: "PURGA_COMPLETADA", dias, eliminados: resultado.count });
  // La simulación es de un solo uso.
  writeFileSync(MARCADOR_SIMULACION, "{}", "utf8");
  console.log(
    `Eliminados ${resultado.count} registro(s) de auditoría anteriores a ${limite.toISOString()}.`,
  );
}

main()
  .catch((e) => {
    console.error("Error al purgar auditoría:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
