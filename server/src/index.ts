import "dotenv/config";
import { createApp } from "./app";
import { prisma } from "./config/prisma";

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

recuperarSincronizacionesInterrumpidas()
  .catch((err) => console.error("Error recuperando sincronizaciones de Siesa interrumpidas:", err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
    });
  });
