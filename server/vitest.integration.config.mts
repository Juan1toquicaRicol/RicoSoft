import { defineConfig } from "vitest/config";

// Suite de integración con base de datos real (ver
// src/modules/importaciones/importaciones.integration.test.ts). Aislada de
// vitest.config.mts a propósito, para que `npm test` (usado por el job
// "backend" existente en CI, con un DATABASE_URL placeholder que nunca se
// conecta de verdad) jamás la ejecute por accidente.
//
// Pensada para un job de CI separado con SQL Server efímero (ver ci.yml), o
// para correrla localmente apuntando DATABASE_URL/JWT_SECRET a una base de
// datos desechable propia — nunca contra una base de desarrollo real.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 30000,
  },
});
