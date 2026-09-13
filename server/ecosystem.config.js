// Configuración de PM2 para correr el backend en producción sobre Windows
// (sin Docker/systemd — este ERP corre en una PC/laptop de oficina).
// Uso: dentro de server/, ejecutar `pm2 start ecosystem.config.js`.
// Ver server/DEPLOY.md para la guía completa de puesta en marcha.
module.exports = {
  apps: [
    {
      name: "ricosoft-backend",
      script: "dist/index.js",
      cwd: __dirname,
      // El build de "npm run build" (tsc) ya emite JS a dist/, así que no
      // hace falta tsx/ts-node en producción.
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      // Reinicio automático ante crash, con backoff y un tope de reintentos
      // para no quedar en un loop infinito si algo está roto de fondo
      // (p. ej. la base de datos inalcanzable).
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      // Si el proceso no responde en este tiempo tras SIGINT, PM2 lo mata
      // con SIGKILL. El graceful shutdown de index.ts normalmente termina
      // mucho antes (timeout interno de 10s).
      kill_timeout: 15000,
      // Logs a archivo, separados de stdout/stderr y con timestamp.
      out_file: "logs/ricosoft-backend-out.log",
      error_file: "logs/ricosoft-backend-error.log",
      merge_logs: true,
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
