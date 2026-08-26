import { defineConfig } from "vitest/config";

// Config explícita y aislada: sin esto, vitest sube de directorio y termina
// resolviendo el vite.config.ts de la raíz del monorepo (el del frontend,
// con el plugin de TanStack Start), que no aplica a este servidor Express.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
