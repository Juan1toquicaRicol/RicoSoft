import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Oportunidades — capa ligera de seguimiento comercial (OportunidadSeguimiento).
 * Multi-tenant real: valida que el timeline de un cliente nunca se filtre
 * entre tenants, la validación de "próxima acción obligatoria" del schema,
 * y el enforcement del permiso reutilizado (analitica.ver).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Oportunidades — seguimiento comercial (multi-tenant real)", () => {
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
      data: { nombre: `Oportunidades Tenant A ${sufijo}`, subdomain: `test-oport-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Oportunidades Tenant B ${sufijo}`, subdomain: `test-oport-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `oport-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `oport-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `oport-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`oport-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`oport-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`oport-admin-b-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.oportunidadSeguimiento.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("rechaza un seguimiento con resultado activo sin próxima acción ni fecha (400)", async () => {
    const res = await request(app)
      .post("/api/oportunidades/12345/seguimientos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ clienteNombre: "Cliente Test", accion: "Llamada", resultado: "Contactado" });
    expect(res.status).toBe(400);
  });

  it("crea un seguimiento activo con próxima acción + fecha (201)", async () => {
    const res = await request(app)
      .post("/api/oportunidades/12345/seguimientos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        clienteNombre: "Cliente Test",
        accion: "Llamada",
        resultado: "Interesado",
        proximaAccion: "Enviar cotización",
        proximoSeguimientoFecha: "2026-09-10T00:00:00.000Z",
      });
    expect(res.status).toBe(201);
    expect(res.body.resultado).toBe("Interesado");
    expect(res.body.proximaAccion).toBe("Enviar cotización");
  });

  it("un resultado terminal (VentaRealizada) NO requiere próxima acción (201)", async () => {
    const res = await request(app)
      .post("/api/oportunidades/12345/seguimientos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ clienteNombre: "Cliente Test", accion: "Cotizacion", resultado: "VentaRealizada" });
    expect(res.status).toBe(201);
    expect(res.body.proximaAccion).toBeNull();
  });

  it("GET del timeline devuelve los eventos ordenados por más reciente, con estadoActual", async () => {
    const res = await request(app)
      .get("/api/oportunidades/12345/seguimientos")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(res.status).toBe(200);
    expect(res.body.seguimientos.length).toBeGreaterThanOrEqual(2);
    expect(res.body.estadoActual).toBe("VentaRealizada"); // el más reciente
    expect(res.body.proximoSeguimiento).toBeNull(); // terminal, sin próximo paso
  });

  it("Tenant B nunca ve el timeline de un cliente registrado por Tenant A (aislamiento)", async () => {
    const res = await request(app)
      .get("/api/oportunidades/12345/seguimientos")
      .set("Authorization", `Bearer ${tokenAdminB}`);
    expect(res.status).toBe(200);
    expect(res.body.seguimientos).toEqual([]);
    expect(res.body.estadoActual).toBeNull();
  });

  it("responde 403 sin el permiso analitica.ver", async () => {
    const get = await request(app)
      .get("/api/oportunidades/12345/seguimientos")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`);
    expect(get.status).toBe(403);

    const post = await request(app)
      .post("/api/oportunidades/12345/seguimientos")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`)
      .send({ clienteNombre: "X", accion: "Llamada", resultado: "Contactado" });
    expect(post.status).toBe(403);
  });

  it("responde 401 sin token de autenticación", async () => {
    const res = await request(app).get("/api/oportunidades/12345/seguimientos");
    expect(res.status).toBe(401);
  });
});
