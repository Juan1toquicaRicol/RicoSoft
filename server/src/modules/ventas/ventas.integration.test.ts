import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Ventas — Centro Operativo Comercial (GET /api/ventas/disponibilidad,
 * GET /api/ventas/centro). Sin siesaCiaId configurado en los tenants de
 * prueba, valida: nunca 500 (siempre disponible:false con motivo),
 * enforcement del permiso dedicado `ventas.ver`, y validación de query
 * params en /disponibilidad.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Ventas — Centro Operativo Comercial (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantId: string;
  let tokenAdmin: string;
  let tokenSinPermiso: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenant = await prisma.tenant.create({
      data: { nombre: `Ventas Tenant ${sufijo}`, subdomain: `test-ventas-${sufijo}` },
    });
    tenantId = tenant.id;

    await prisma.user.create({
      data: {
        tenantId,
        email: `ventas-admin-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId,
        email: `ventas-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        isSuperadmin: false,
        activo: true,
      },
    });

    tokenAdmin = await login(`ventas-admin-${sufijo}@test.ricosoft.local`);
    tokenSinPermiso = await login(`ventas-sinpermiso-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    await prisma.auditoria.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("GET /ventas/centro responde 200 con disponible:false cuando el tenant no tiene siesaCiaId (nunca 500)", async () => {
    const res = await request(app).get("/api/ventas/centro").set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
    expect(typeof res.body.motivo).toBe("string");
  });

  it("GET /ventas/disponibilidad responde 200 con disponible:false cuando el tenant no tiene siesaCiaId", async () => {
    const res = await request(app)
      .get("/api/ventas/disponibilidad")
      .query({ itemRowId: 1, cantidad: 10 })
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
  });

  it("GET /ventas/disponibilidad rechaza cantidad <= 0 con 400 (nunca calcula con datos inválidos)", async () => {
    const res = await request(app)
      .get("/api/ventas/disponibilidad")
      .query({ itemRowId: 1, cantidad: -5 })
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(400);
  });

  it("GET /ventas/disponibilidad rechaza sin itemRowId con 400", async () => {
    const res = await request(app)
      .get("/api/ventas/disponibilidad")
      .query({ cantidad: 10 })
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(400);
  });

  it("un usuario sin permiso ventas.ver no puede consultar el Centro Comercial ni disponibilidad", async () => {
    const centro = await request(app).get("/api/ventas/centro").set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(centro.status).toBe(403);

    const disp = await request(app)
      .get("/api/ventas/disponibilidad")
      .query({ itemRowId: 1, cantidad: 10 })
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(disp.status).toBe(403);
  });

  it("sin token de autenticación, ambos endpoints responden 401", async () => {
    const centro = await request(app).get("/api/ventas/centro");
    expect(centro.status).toBe(401);
    const disp = await request(app).get("/api/ventas/disponibilidad").query({ itemRowId: 1, cantidad: 10 });
    expect(disp.status).toBe(401);
  });

  it("GET /ventas/productos/buscar rechaza búsquedas de menos de 2 caracteres con 400", async () => {
    const res = await request(app)
      .get("/api/ventas/productos/buscar")
      .query({ search: "a" })
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(400);
  });

  it("GET /ventas/productos/buscar responde 200 con disponible:false cuando el tenant no tiene siesaCiaId", async () => {
    const res = await request(app)
      .get("/api/ventas/productos/buscar")
      .query({ search: "duoplock" })
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
  });

  it("GET /ventas/productos/:itemRowId/contexto responde 200 con disponible:false cuando el tenant no tiene siesaCiaId", async () => {
    const res = await request(app)
      .get("/api/ventas/productos/9317/contexto")
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
  });

  it("un usuario sin permiso ventas.ver no puede buscar productos ni ver su contexto", async () => {
    const buscar = await request(app)
      .get("/api/ventas/productos/buscar")
      .query({ search: "duoplock" })
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(buscar.status).toBe(403);

    const contexto = await request(app)
      .get("/api/ventas/productos/9317/contexto")
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(contexto.status).toBe(403);
  });

  it("GET /ventas/clientes/:clienteRowId/historico responde 200 con disponible:false cuando el tenant no tiene siesaCiaId", async () => {
    const res = await request(app)
      .get("/api/ventas/clientes/12345/historico")
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
  });

  it("GET /ventas/clientes/:clienteRowId/historico responde 403 sin el permiso ventas.ver", async () => {
    const res = await request(app)
      .get("/api/ventas/clientes/12345/historico")
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(res.status).toBe(403);
  });

  it("GET /ventas/clientes/:clienteRowId/historico rechaza un clienteRowId no numérico con 400", async () => {
    const res = await request(app)
      .get("/api/ventas/clientes/no-es-numero/historico")
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(400);
  });
});
