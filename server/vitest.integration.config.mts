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
    // Rechaza bases no aprobadas (saas_dev, UnoEE_Ricol_Real, ...) antes de correr.
    globalSetup: ["./vitest.integration.global-setup.mts"],
    testTimeout: 30000,
    // H-02 (2026-09-20): con paralelismo de archivo por defecto (uno por
    // CPU lógico — en la práctica hasta 16+ archivos de integración
    // escribiendo/eliminando en paralelo), 54 archivos golpeando el MISMO
    // SQL Server remoto real produjeron colisiones transitorias de locks
    // (Prisma P2034 "write conflict or deadlock" y P2028 "transaction
    // timeout") — no solo en escrituras de producto (ya endurecidas con
    // reintento/409 en facturas.controller.ts y pagos.controller.ts), sino
    // también en el propio cleanup (`afterAll`) de los tests. No es
    // contaminación de fixtures (los tres casos reales de eso — fechas fijas
    // en objetivos, un solo usuario de tenant B en alcance-general-tenant,
    // una VPN asumida caída en siesa-sync — ya se corrigieron en el código
    // de los tests, y CADA archivo pasa limpio en aislamiento). Es
    // contención de infraestructura: demasiadas conexiones/transacciones
    // simultáneas contra una sola base remota por red. Limitar a 6 procesos
    // concurrentes reduce la probabilidad de colisión sin serializar todo
    // (lo que ocultaría contaminación real en vez de solo aliviar
    // contención) — verificado empíricamente: 3 corridas completas
    // consecutivas con este límite dieron 540/540 sin fallos, contra fallos
    // transitorios intermitentes (distintos cada vez: unas veces en
    // crearFactura, otras en cambiarEstadoFactura, otras en el afterAll de
    // un test) en varias de las corridas previas con paralelismo por
    // defecto. Si vuelve a aparecer un P2034/P2028 esporádico incluso con
    // este límite, el número es ajustable — no es un valor mágico, es un
    // punto medio razonable entre velocidad y contención.
    maxWorkers: 6,
    minWorkers: 1,
  },
});
