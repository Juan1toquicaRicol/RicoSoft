import { defineConfig, configDefaults } from "vitest/config";

// Config explícita y aislada: sin esto, vitest sube de directorio y termina
// resolviendo el vite.config.ts de la raíz del monorepo (el del frontend,
// con el plugin de TanStack Start), que no aplica a este servidor Express.
//
// Excluye *.integration.test.ts a propósito: esos tests requieren una base
// de datos SQL Server real (ver vitest.integration.config.mts) y no deben
// correr con el DATABASE_URL placeholder que usa `npm test`/el job "backend"
// de CI.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
  },
});
