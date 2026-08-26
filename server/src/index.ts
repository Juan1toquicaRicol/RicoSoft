import "dotenv/config";
import { createApp } from "./app";

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET no está definido. Configúralo en server/.env antes de iniciar el servidor.",
  );
}

const app = createApp();
const PORT = process.env.PORT || 4000;

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

app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});
