import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Centro Gerencial (GET /api/gerencial/resumen) — sin siesaCiaId configurado
 * en los tenants de prueba, así que valida la mitad RicoSoft-nativa
 * (finanzas vía Factura/Pago, conteo de SolicitudCompra/PlanProduccion) y
 * confirma que `disponibleSiesa:false` nunca se confunde con un error 500.
 * El aislamiento se verifica contra el cliente Prisma BASE (no
 * tenantPrisma) para no validar el mecanismo con el mismo mecanismo que se
 * prueba.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Centro Gerencial — /api/gerencial/resumen (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdminA: string;
  let tokenSinPermisoA: string;
  let tokenAdminB: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Gerencial Tenant A ${sufijo}`, subdomain: `test-gerencial-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Gerencial Tenant B ${sufijo}`, subdomain: `test-gerencial-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `gerencial-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `gerencial-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    const adminB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `gerencial-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`gerencial-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`gerencial-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`gerencial-admin-b-${sufijo}@test.ricosoft.local`);

    // Solo Tenant B tiene una solicitud de compra pendiente y una factura
    // vencida — si el endpoint de A las contara, sería una fuga cross-tenant.
    await prisma.solicitudCompra.create({
      data: {
        tenantId: tenantBId,
        empresaId: "001",
        area: "Administración",
        solicitanteId: adminB.id,
        solicitante: "Admin B",
        item: `Item de B ${sufijo}`,
        cantidad: 1,
        valorEstimado: 100000,
        estado: "Pendiente",
      },
    });
    await prisma.factura.create({
      data: {
        tenantId: tenantBId,
        numero: `FE-GER-${sufijo}`,
        proveedor: `Proveedor de B ${sufijo}`,
        nit: `NIT-GER-${sufijo}`,
        empresaId: "001",
        area: "Administración",
        responsable: "Admin B",
        total: 1_000_000,
        subtotal: 1_000_000,
        iva: 0,
        vence: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        estado: "Pendiente",
      },
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.pago.deleteMany({ where: { factura: { tenantId: { in: tenantIds } } } });
    await prisma.factura.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.solicitudCompra.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("responde 200 con disponibleSiesa:false cuando el tenant no tiene siesaCiaId (nunca 500)", async () => {
    const res = await request(app).get("/api/gerencial/resumen").set("Authorization", `Bearer ${tokenAdminA}`);
    expect(res.status).toBe(200);
    expect(res.body.disponibleSiesa).toBe(false);
    expect(Array.isArray(res.body.indicadores)).toBe(true);
  });

  it("un usuario sin permiso analitica.ver no puede consultar el Centro Gerencial", async () => {
    const res = await request(app).get("/api/gerencial/resumen").set("Authorization", `Bearer ${tokenSinPermisoA}`);
    expect(res.status).toBe(403);
  });

  it("Tenant A NUNCA ve las cuentas por pagar ni las solicitudes pendientes de Tenant B (aislamiento)", async () => {
    const res = await request(app).get("/api/gerencial/resumen").set("Authorization", `Bearer ${tokenAdminA}`);
    expect(res.status).toBe(200);

    const finanzas = res.body.indicadores.find((i: any) => i.id === "finanzas.cxp_total");
    expect(finanzas.valor).toBe(0);
    const vencidas = res.body.indicadores.find((i: any) => i.id === "finanzas.cxp_vencida");
    expect(vencidas).toBeUndefined(); // Tenant A no tiene facturas vencidas propias

    const compras = res.body.indicadores.find((i: any) => i.id === "compras.solicitudes_pendientes");
    expect(compras.valor).toBe(0);
  });

  it("Tenant B sí ve su propia factura vencida y solicitud pendiente (verificado también contra Prisma base)", async () => {
    const res = await request(app).get("/api/gerencial/resumen").set("Authorization", `Bearer ${tokenAdminB}`);
    expect(res.status).toBe(200);

    const vencidas = res.body.indicadores.find((i: any) => i.id === "finanzas.cxp_vencida");
    expect(vencidas?.valor).toBe(1_000_000);
    const compras = res.body.indicadores.find((i: any) => i.id === "compras.solicitudes_pendientes");
    expect(compras.valor).toBe(1);

    // Confirmación independiente contra el cliente Prisma base — no se
    // valida el aislamiento usando el mismo tenantPrisma que se prueba.
    const facturaEnDb = await prisma.factura.findFirst({ where: { tenantId: tenantBId, numero: `FE-GER-${sufijo}` } });
    expect(facturaEnDb).not.toBeNull();
    const facturaEnTenantA = await prisma.factura.findFirst({ where: { tenantId: tenantAId, numero: `FE-GER-${sufijo}` } });
    expect(facturaEnTenantA).toBeNull();
  });
});
