import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { sincronizarCatalogosGenerales } from "../src/lib/catalogos-generales";

/**
 * Deja al día los catálogos GENERALES (CatalogoValor con tenantId = null)
 * sin correr el seed completo. Idempotente y no destructivo: solo crea lo que
 * falta y agrega descripción/metadata a lo existente (ver
 * src/lib/catalogos-generales.ts). Uso: npm run catalogos:sincronizar
 */
const prisma = new PrismaClient();

sincronizarCatalogosGenerales(prisma)
  .then((r) => {
    console.log(
      `Catálogos GENERALES: ${r.creados} creados, ${r.enriquecidos} enriquecidos, ${r.desactivados} duplicados heredados desactivados.`,
    );
  })
  .catch((error) => {
    console.error("Error sincronizando catálogos generales:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
