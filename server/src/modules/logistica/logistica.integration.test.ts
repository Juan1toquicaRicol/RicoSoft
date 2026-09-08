import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Motor de Decisiones — Fase 2.1, P0 Logística: GET /api/logistica/cumplimiento
 * (OTIF) y GET /api/logistica/novedades-abiertas. Mismo patrón que
 * despachos.integration.test.ts: los despachos/novedades de prueba se
 * insertan directo vía Prisma (no dependen de un documento de venta real de
 * Siesa ni del túnel VPN), y se ejercitan los endpoints reales contra un
 * tenant A/B para verificar aislamiento.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Logística — Motor de Decisiones (multi-tenant real)", () => {
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
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Logistica Tenant A ${sufijo}`, subdomain: `test-logistica-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Logistica Tenant B ${sufijo}`, subdomain: `test-logistica-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const adminA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `log-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `log-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    const adminB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `log-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`log-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`log-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`log-admin-b-${sufijo}@test.ricosoft.local`);

    // Tenant A: 2 despachos ENTREGADO (uno a tiempo, uno tarde) + 1 en tránsito (no evaluable).
    const despachoATiempo = await prisma.despacho.create({
      data: {
        tenantId: tenantAId,
        siesaDocRowId: 910001,
        clienteNombre: "Cliente A Puntual",
        valorPedido: 1_000_000,
        responsableId: adminA.id,
        responsable: "Admin A",
        estado: "ENTREGADO",
        fechaEntregaEstimada: new Date("2026-09-01T00:00:00Z"),
        fechaEntregaReal: new Date("2026-09-01T00:00:00Z"),
      },
    });
    await prisma.despacho.create({
      data: {
        tenantId: tenantAId,
        siesaDocRowId: 910002,
        clienteNombre: "Cliente A Tarde",
        valorPedido: 500_000,
        responsableId: adminA.id,
        responsable: "Admin A",
        estado: "ENTREGADO",
        fechaEntregaEstimada: new Date("2026-09-01T00:00:00Z"),
        fechaEntregaReal: new Date("2026-09-03T00:00:00Z"),
      },
    });
    await prisma.despacho.create({
      data: {
        tenantId: tenantAId,
        siesaDocRowId: 910003,
        clienteNombre: "Cliente A En Tránsito",
        valorPedido: 300_000,
        responsableId: adminA.id,
        responsable: "Admin A",
        estado: "EN_TRANSITO",
      },
    });
    await prisma.despachoNovedad.create({
      data: {
        despachoId: despachoATiempo.id,
        tipo: "PRODUCTO_FALTANTE",
        descripcion: "Novedad de prueba tenant A",
        estado: "ABIERTA",
        usuarioId: adminA.id,
        usuario: "Admin A",
      },
    });

    // Tenant B: 1 despacho ENTREGADO a tiempo + 1 novedad — para verificar
    // que A nunca ve datos de B.
    const despachoB = await prisma.despacho.create({
      data: {
        tenantId: tenantBId,
        siesaDocRowId: 910004,
        clienteNombre: "Cliente B",
        valorPedido: 200_000,
        responsableId: adminB.id,
        responsable: "Admin B",
        estado: "ENTREGADO",
        fechaEntregaEstimada: new Date("2026-09-01T00:00:00Z"),
        fechaEntregaReal: new Date("2026-09-01T00:00:00Z"),
      },
    });
    await prisma.despachoNovedad.create({
      data: {
        despachoId: despachoB.id,
        tipo: "CLIENTE_AUSENTE",
        descripcion: "Novedad de prueba tenant B",
        estado: "ABIERTA",
        usuarioId: adminB.id,
        usuario: "Admin B",
      },
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.despachoNovedad.deleteMany({
      where: { despacho: { tenantId: { in: tenantIds } } },
    });
    await prisma.despachoLinea.deleteMany({ where: { despacho: { tenantId: { in: tenantIds } } } });
    await prisma.despacho.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("GET /logistica/cumplimiento calcula OTIF real sobre los despachos del tenant (1 de 2 evaluables a tiempo = 50%)", async () => {
    const res = await request(app)
      .get("/api/logistica/cumplimiento")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(res.status).toBe(200);
    expect(res.body.totalEvaluable).toBe(2); // el EN_TRANSITO no cuenta
    expect(res.body.aTiempo).toBe(1);
    expect(res.body.otifPct).toBe(50);
  });

  it("GET /logistica/cumplimiento nunca mezcla datos de otro tenant (Tenant B ve su propio 100%)", async () => {
    const res = await request(app)
      .get("/api/logistica/cumplimiento")
      .set("Authorization", `Bearer ${tokenAdminB}`);
    expect(res.status).toBe(200);
    expect(res.body.totalEvaluable).toBe(1);
    expect(res.body.otifPct).toBe(100);
  });

  it("GET /logistica/novedades-abiertas devuelve solo las novedades del tenant autenticado, con antigüedad y recurrencia", async () => {
    const res = await request(app)
      .get("/api/logistica/novedades-abiertas")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(res.status).toBe(200);
    expect(res.body.novedades).toHaveLength(1);
    expect(res.body.novedades[0].clienteNombre).toBe("Cliente A Puntual");
    expect(typeof res.body.novedades[0].diasAbierta).toBe("number");
    expect(res.body.porTipo).toEqual([{ clave: "PRODUCTO_FALTANTE", cantidad: 1 }]);
    // Nunca debe aparecer la novedad de Tenant B.
    expect(
      res.body.novedades.some((n: { clienteNombre: string }) => n.clienteNombre === "Cliente B"),
    ).toBe(false);
  });

  it("ambos endpoints responden 403 sin el permiso despachos.ver", async () => {
    const cumplimiento = await request(app)
      .get("/api/logistica/cumplimiento")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`);
    expect(cumplimiento.status).toBe(403);

    const novedades = await request(app)
      .get("/api/logistica/novedades-abiertas")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`);
    expect(novedades.status).toBe(403);
  });

  it("ambos endpoints responden 401 sin token de autenticación", async () => {
    const cumplimiento = await request(app).get("/api/logistica/cumplimiento");
    expect(cumplimiento.status).toBe(401);
    const novedades = await request(app).get("/api/logistica/novedades-abiertas");
    expect(novedades.status).toBe(401);
  });
});
