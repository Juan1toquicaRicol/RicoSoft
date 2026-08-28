import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../config/prisma";

/**
 * Regresión para el bug encontrado en la primera corrida real del job
 * backend-integration: la migración original de Tenant.siesaCiaId
 * (20260826203752_tenant_siesa_cia_id) creaba una UNIQUE CONSTRAINT plana,
 * que en SQL Server solo permite UNA fila con NULL en la columna — cualquier
 * segundo tenant sin integración Siesa fallaba al crearse. La migración
 * 20260827200000_fix_tenant_siesacia_id_filtered_unique la reemplaza por un
 * índice único FILTRADO (WHERE siesaCiaId IS NOT NULL, mismo patrón ya usado
 * para Tenant.dominioCorporativo).
 *
 * Este test demuestra las dos propiedades que la corrección debe cumplir a
 * la vez: múltiples tenants sin siesaCiaId conviven sin problema, y la
 * unicidad real se sigue aplicando cuando sí hay un valor asignado. No es un
 * test de Importaciones — es infraestructura de Tenant, deliberadamente en
 * un archivo separado de importaciones.integration.test.ts.
 *
 * Mismo contrato que el resto de la suite de integración: requiere
 * DATABASE_URL/JWT_SECRET reales y corre solo vía `npm run test:integration`
 * con RUN_DB_INTEGRATION_TESTS=true (ver vitest.integration.config.mts).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Tenant.siesaCiaId — índice único filtrado (permite múltiples NULL)", () => {
  const sufijo = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];

  afterEach(async () => {
    if (tenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      tenantIds.length = 0;
    }
  });

  it("permite crear dos tenants con siesaCiaId = NULL (antes del fix, el segundo fallaba)", async () => {
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Sin Siesa A ${sufijo}`, subdomain: `sin-siesa-a-${sufijo}` },
    });
    tenantIds.push(tenantA.id);

    const tenantB = await prisma.tenant.create({
      data: { nombre: `Sin Siesa B ${sufijo}`, subdomain: `sin-siesa-b-${sufijo}` },
    });
    tenantIds.push(tenantB.id);

    expect(tenantA.siesaCiaId).toBeNull();
    expect(tenantB.siesaCiaId).toBeNull();
  });

  it("sigue rechazando dos tenants con el MISMO siesaCiaId (no-NULL) — la unicidad real no se perdió", async () => {
    // Derivado del sufijo aleatorio del test (determinístico dentro de esta
    // corrida), no de Math.random(): evita colisiones espurias sin volver el
    // test flaky.
    const ciaId = parseInt(sufijo, 16) % 1_000_000;

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Con Siesa A ${sufijo}`, subdomain: `con-siesa-a-${sufijo}`, siesaCiaId: ciaId },
    });
    tenantIds.push(tenantA.id);

    let errorCapturado: unknown = null;
    try {
      const tenantB = await prisma.tenant.create({
        data: { nombre: `Con Siesa B ${sufijo}`, subdomain: `con-siesa-b-${sufijo}`, siesaCiaId: ciaId },
      });
      // Si por algún motivo NO lanzó (el fix estaría roto), igual se limpia.
      tenantIds.push(tenantB.id);
    } catch (err) {
      errorCapturado = err;
    }

    expect(errorCapturado).not.toBeNull();
    expect(String(errorCapturado)).toMatch(/Unique constraint failed/i);
  });
});
