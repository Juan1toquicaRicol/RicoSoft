import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../config/prisma";
import { resolverCiaSiesa } from "./siesa-tenant";

/**
 * H-07: helper compartido resolverCiaSiesa — reemplaza ~10 copias
 * idénticas de esta misma consulta repartidas por el backend (Despachos,
 * Toma Física, Importaciones y variantes inline). Verifica los 3 casos que
 * todo caller depende de que se manejen bien: tenant CON siesaCiaId, tenant
 * SIN siesaCiaId configurado, y un tenantId que no existe — en los tres
 * casos nunca debe lanzar, solo devolver el número o null.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("resolverCiaSiesa (lib/siesa-tenant)", () => {
  const sufijo = randomUUID().slice(0, 8);
  let tenantConCiaId: string;
  let tenantSinCiaId: string;

  beforeAll(async () => {
    // Tenant.siesaCiaId tiene @unique — 1/2/3 ya están tomados por los
    // tenants reales (Ricol/Flexipack/Green), así que la fixture usa un
    // número claramente ficticio y sin colisión, no un valor real.
    const tenantA = await prisma.tenant.create({
      data: {
        nombre: `Siesa Helper Con Cia ${sufijo}`,
        subdomain: `test-siesa-helper-con-${sufijo}`,
        siesaCiaId: 90001,
      },
    });
    tenantConCiaId = tenantA.id;

    const tenantB = await prisma.tenant.create({
      data: {
        nombre: `Siesa Helper Sin Cia ${sufijo}`,
        subdomain: `test-siesa-helper-sin-${sufijo}`,
      },
    });
    tenantSinCiaId = tenantB.id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantConCiaId, tenantSinCiaId] } } });
    await prisma.$disconnect();
  });

  it("devuelve el siesaCiaId configurado del tenant", async () => {
    const ciaId = await resolverCiaSiesa(tenantConCiaId);
    expect(ciaId).toBe(90001);
  });

  it("devuelve null (no lanza) cuando el tenant no tiene siesaCiaId configurado", async () => {
    const ciaId = await resolverCiaSiesa(tenantSinCiaId);
    expect(ciaId).toBeNull();
  });

  it("devuelve null (no lanza) para un tenantId que no existe", async () => {
    const ciaId = await resolverCiaSiesa(randomUUID());
    expect(ciaId).toBeNull();
  });

  it("nunca adivina/usa un ciaId de otro tenant: dos tenants distintos resuelven independientemente", async () => {
    const [ciaA, ciaB] = await Promise.all([
      resolverCiaSiesa(tenantConCiaId),
      resolverCiaSiesa(tenantSinCiaId),
    ]);
    expect(ciaA).toBe(90001);
    expect(ciaB).toBeNull();
  });
});
