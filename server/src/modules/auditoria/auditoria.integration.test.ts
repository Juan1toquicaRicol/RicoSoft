import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Auditoría QA: la pantalla de Auditoría no tenía filtros reales contra el
 * backend (solo reordenaba visualmente lo ya cargado) — se agregó filtro de
 * rango de fechas (`desde`/`hasta`) sobre `createdAt`, además de la
 * paginación que ya existía. Este test cubre el filtro nuevo y el
 * aislamiento de tenant (ya existente, no tocado).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Auditoría — filtro de fechas y aislamiento (BD real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantId: string;
  let otroTenantId: string;
  let token: string;
  let eventoAntiguoId: string;
  let eventoRecienteId: string;

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
    const tenant = await prisma.tenant.create({
      data: { nombre: `Auditoria Test ${sufijo}`, subdomain: `test-auditoria-${sufijo}` },
    });
    tenantId = tenant.id;
    const otroTenant = await prisma.tenant.create({
      data: { nombre: `Auditoria Otro ${sufijo}`, subdomain: `test-auditoria-otro-${sufijo}` },
    });
    otroTenantId = otroTenant.id;

    const usuario = await prisma.user.create({
      data: {
        tenantId,
        email: `aud-admin-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Auditoria",
        isSuperadmin: true,
        activo: true,
      },
    });
    token = await login(`aud-admin-${sufijo}@test.ricosoft.local`);

    const antiguo = await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: usuario.id,
        accion: "TEST_EVENTO_ANTIGUO",
        detalle: "Evento de hace 60 días",
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
    });
    eventoAntiguoId = antiguo.id;

    const reciente = await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: usuario.id,
        accion: "TEST_EVENTO_RECIENTE",
        detalle: "Evento de hoy",
      },
    });
    eventoRecienteId = reciente.id;

    await prisma.auditoria.create({
      data: {
        tenantId: otroTenantId,
        usuarioId: usuario.id,
        accion: "TEST_EVENTO_OTRO_TENANT",
        detalle: "No debe verse desde el tenant de prueba",
      },
    });
  });

  afterAll(async () => {
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: [tenantId, otroTenantId] } } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otroTenantId] } } });
    await prisma.$disconnect();
  });

  it("sin filtro devuelve ambos eventos del tenant, nunca el de otro tenant", async () => {
    const res = await request(app).get("/api/auditoria").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((e: { id: string }) => e.id);
    expect(ids).toContain(eventoAntiguoId);
    expect(ids).toContain(eventoRecienteId);
    expect(
      res.body.data.every((e: { accion: string }) => e.accion !== "TEST_EVENTO_OTRO_TENANT"),
    ).toBe(true);
  });

  it("filtro `desde` excluye el evento antiguo y conserva el reciente", async () => {
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const res = await request(app)
      .get(`/api/auditoria?desde=${desde}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((e: { id: string }) => e.id);
    expect(ids).not.toContain(eventoAntiguoId);
    expect(ids).toContain(eventoRecienteId);
  });

  it("filtro `hasta` en el pasado excluye el evento reciente y conserva el antiguo", async () => {
    const hasta = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const res = await request(app)
      .get(`/api/auditoria?hasta=${hasta}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((e: { id: string }) => e.id);
    expect(ids).toContain(eventoAntiguoId);
    expect(ids).not.toContain(eventoRecienteId);
  });
});
