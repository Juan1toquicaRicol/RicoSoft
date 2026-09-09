import "dotenv/config";
import { createApp } from "./app";
import { prisma } from "./config/prisma";
import { recuperarSincronizacionesBiometricoInterrumpidas } from "./jobs/crosschex-recovery";
import { iniciarSchedulerCrossChex } from "./jobs/crosschex-sync.job";
import { iniciarSchedulerServiciosRenovacion } from "./jobs/servicios-renovacion.job";
import { iniciarSchedulerIngestaCorreos } from "./modules/importaciones/importaciones-bandeja-ingesta.job";
import { iniciarSchedulerProcesamientoCorreos } from "./modules/importaciones/importaciones-bandeja-procesamiento.job";
import { iniciarSchedulerTrackingEmbarques } from "./modules/importaciones/embarques-tracking.job";

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET no está definido. Configúralo en server/.env antes de iniciar el servidor.",
  );
}

const app = createApp();
const PORT = process.env.PORT || 4000;

/**
 * Recuperación de sincronizaciones de Siesa interrumpidas (Fase 8 del plan):
 * un proceso recién iniciado nunca puede tener un job "en curso" real — si
 * hay algún SincronizacionSiesaLog en EN_CURSO al arrancar, es porque el
 * proceso anterior murió a mitad de camino. Se marca FALLIDO explícitamente
 * en vez de dejarlo "en curso" para siempre (lo que bloquearía cualquier
 * sincronización nueva del mismo tenant por el control de concurrencia).
 * No se intenta reanudar automáticamente.
 */
async function recuperarSincronizacionesInterrumpidas() {
  const { count } = await prisma.sincronizacionSiesaLog.updateMany({
    where: { estado: "EN_CURSO" },
    data: {
      estado: "FALLIDO",
      finalizadoEn: new Date(),
      mensajeError: "Interrumpido por reinicio del servidor",
    },
  });
  if (count > 0) {
    console.log(
      `⚠️  ${count} sincronización(es) de Siesa interrumpida(s) marcada(s) como FALLIDO al arrancar.`,
    );
  }
}

// Red de seguridad a nivel de proceso: registra y sale de forma controlada
// en vez de dejar el proceso en un estado indefinido. Un orquestador
// (Docker/PM2/systemd) debe estar configurado para reiniciarlo automáticamente.
process.on("unhandledRejection", (reason) => {
  console.error("Promesa rechazada sin manejar:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Excepción no capturada, cerrando el proceso:", err);
  process.exit(1);
});

Promise.all([
  recuperarSincronizacionesInterrumpidas().catch((err) =>
    console.error("Error recuperando sincronizaciones de Siesa interrumpidas:", err),
  ),
  recuperarSincronizacionesBiometricoInterrumpidas()
    .then((count) => {
      if (count > 0) {
        console.log(
          `⚠️  ${count} sincronización(es) biométrica(s) interrumpida(s) marcada(s) como FALLIDO al arrancar.`,
        );
      }
    })
    .catch((err) =>
      console.error("Error recuperando sincronizaciones biométricas interrumpidas:", err),
    ),
]).finally(() => {
  // El scheduler se registra DESPUÉS de que la recuperación de corridas
  // huérfanas terminó — así, si el proceso anterior dejó un lock
  // EN_CURSO stale, ya está limpio antes de que el primer tick del cron
  // intente adquirirlo. No dispara ninguna sincronización de inmediato,
  // solo programa (ver iniciarSchedulerCrossChex): la primera corrida real
  // ocurre en el siguiente tick del cron, no hay ejecución duplicada.
  iniciarSchedulerCrossChex();
  iniciarSchedulerServiciosRenovacion();
  iniciarSchedulerIngestaCorreos();
  iniciarSchedulerProcesamientoCorreos();
  iniciarSchedulerTrackingEmbarques();
  app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
  });
});
