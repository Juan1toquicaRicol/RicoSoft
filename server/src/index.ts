import "dotenv/config";
import { actualizarProgramacionBandeja } from "./modules/importaciones/bandeja-operacion";
import { createApp } from "./app";
import { prisma } from "./config/prisma";
import { cerrarSiesaPool } from "./config/siesa";
import { recuperarSincronizacionesBiometricoInterrumpidas } from "./jobs/crosschex-recovery";
import { iniciarSchedulerCrossChex } from "./jobs/crosschex-sync.job";
import { iniciarSchedulerServiciosRenovacion } from "./jobs/servicios-renovacion.job";
import { iniciarSchedulerTrackingEmbarques } from "./modules/importaciones/embarques-tracking.job";
import { configurarProveedorCorreoSaliente } from "./lib/correo-saliente";
import { crearProveedorCorreoSalienteDesdeEntorno } from "./integrations/email/google-workspace-correo-saliente";

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET no está definido. Configúralo en server/.env antes de iniciar el servidor.",
  );
}

// Proveedor de envío de correo (código de verificación del registro). Sin
// CORREO_SALIENTE_* completo no hay proveedor y la verificación de correo, si se
// activara, rechazaría el registro en vez de simular un envío.
const proveedorCorreoSaliente = crearProveedorCorreoSalienteDesdeEntorno();
configurarProveedorCorreoSaliente(proveedorCorreoSaliente);
if (process.env.REGISTRO_VERIFICACION_CORREO_ENABLED === "true" && !proveedorCorreoSaliente) {
  console.warn(
    "⚠️  REGISTRO_VERIFICACION_CORREO_ENABLED=true pero falta CORREO_SALIENTE_*: los registros se rechazarán hasta configurarlo.",
  );
}

const app = createApp();
const PORT = process.env.PORT || 4000;

// Referencia al servidor HTTP, necesaria para poder cerrarlo ordenadamente
// (server.close()) desde los handlers de señales definidos más abajo.
let server: ReturnType<typeof app.listen> | undefined;

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

/**
 * Cierre ordenado ante SIGTERM/SIGINT (PM2 restart/stop, Ctrl+C, etc.):
 * deja de aceptar conexiones HTTP nuevas, cierra las conexiones a las bases
 * de datos (Prisma y el pool de Siesa) y solo entonces termina el proceso.
 * Un timeout de seguridad evita que el proceso quede colgado para siempre
 * si algún cierre no resuelve (p. ej. una conexión de Siesa a medio abrir).
 */
let cerrandoOrdenadamente = false;
async function cerrarOrdenadamente(señal: string) {
  if (cerrandoOrdenadamente) return;
  cerrandoOrdenadamente = true;

  console.log(`🛑 Señal ${señal} recibida, cerrando el servidor ordenadamente...`);

  const timeoutSeguridad = setTimeout(() => {
    console.error("⏱️  El cierre ordenado no terminó a tiempo, forzando salida del proceso.");
    process.exit(1);
  }, 10_000);
  // No debe mantener el proceso vivo solo por este timer.
  timeoutSeguridad.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      console.log("✅ Servidor HTTP cerrado, no acepta más conexiones.");
    }

    await prisma.$disconnect();
    console.log("✅ Conexión a la base de datos (Prisma) cerrada.");

    await cerrarSiesaPool();
    console.log("✅ Pool de conexión a Siesa cerrado.");

    clearTimeout(timeoutSeguridad);
    console.log("👋 Cierre ordenado completo.");
    process.exit(0);
  } catch (err) {
    console.error("Error durante el cierre ordenado:", err);
    clearTimeout(timeoutSeguridad);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  cerrarOrdenadamente("SIGTERM").catch((err) => {
    console.error("Error inesperado cerrando ordenadamente:", err);
    process.exit(1);
  });
});
process.on("SIGINT", () => {
  cerrarOrdenadamente("SIGINT").catch((err) => {
    console.error("Error inesperado cerrando ordenadamente:", err);
    process.exit(1);
  });
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
  const actualizarBandeja = () =>
    actualizarProgramacionBandeja().catch(() =>
      console.error("No se pudo cargar la programación de la Bandeja."),
    );
  void actualizarBandeja();
  setInterval(actualizarBandeja, 30000).unref();
  iniciarSchedulerTrackingEmbarques();
  server = app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
  });
});
