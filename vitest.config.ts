import { defineConfig } from "vitest/config";
import path from "node:path";

// Config explícita y aislada del vite.config.ts principal: ese archivo trae
// el plugin de TanStack Start (gestionado por Lovable, no tocar a mano) que
// espera una estructura de rutas y rompe la resolución al correr bajo
// vitest. Aquí solo se necesita resolver el alias "@" para las pruebas.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
