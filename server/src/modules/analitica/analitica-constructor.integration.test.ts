import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Constructor de análisis — /api/analitica/analisis/* (P0). Sin siesaCiaId
 * configurado (no hay túnel VPN a Siesa en CI), valida lo que sí se puede
 * probar sin conexión real: catálogo, validación contra el catálogo (400),
 * permiso analitica.ver (403/401) reutilizado para ejecutar/guardar, y el
 * aislamiento de "análisis guardados" por tenant Y por usuario (IDOR).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Constructor de análisis — /analitica/analisis/*", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantId: string;
  let tenantId2: string;
  let tokenAdmin: string;
  let tokenSinPermiso: string;
  let tokenOtroUsuario: string;
  let tokenOtroTenant: string;

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
      data: {
        nombre: `Constructor Analisis Tenant ${sufijo}`,
        subdomain: `test-constructor-${sufijo}`,
      },
    });
    tenantId = tenant.id;
    const tenant2 = await prisma.tenant.create({
      data: {
        nombre: `Constructor Analisis Tenant2 ${sufijo}`,
        subdomain: `test-constructor2-${sufijo}`,
      },
    });
    tenantId2 = tenant2.id;

    await prisma.user.create({
      data: {
        tenantId,
        email: `constructor-admin-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId,
        email: `constructor-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId,
        email: `constructor-otro-usuario-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Otro Usuario",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantId2,
        email: `constructor-otro-tenant-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Otro Tenant",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdmin = await login(`constructor-admin-${sufijo}@test.ricosoft.local`);
    tokenSinPermiso = await login(`constructor-sinpermiso-${sufijo}@test.ricosoft.local`);
    tokenOtroUsuario = await login(`constructor-otro-usuario-${sufijo}@test.ricosoft.local`);
    tokenOtroTenant = await login(`constructor-otro-tenant-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    await prisma.analisisGuardado.deleteMany({ where: { tenantId: { in: [tenantId, tenantId2] } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: [tenantId, tenantId2] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, tenantId2] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, tenantId2] } } });
    await prisma.$disconnect();
  });

  const configuracionValida = {
    metrica: "margen",
    dimensionPrincipal: "cliente",
    fechaInicio: "2026-01-01",
    fechaFin: "2026-02-01",
  };

  it("GET /analisis/catalogo devuelve exactamente margen/ventas/clientes", async () => {
    const res = await request(app)
      .get("/api/analitica/analisis/catalogo")
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.metricas.map((m: { key: string }) => m.key).sort()).toEqual([
      "clientes",
      "margen",
      "ventas",
    ]);
  });

  it("GET /analisis/catalogo responde 403 sin el permiso analitica.ver", async () => {
    const res = await request(app)
      .get("/api/analitica/analisis/catalogo")
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(res.status).toBe(403);
  });

  it("GET /analisis/catalogo responde 401 sin token", async () => {
    const res = await request(app).get("/api/analitica/analisis/catalogo");
    expect(res.status).toBe(401);
  });

  it("POST /analisis/ejecutar responde 200 con disponible:false sin siesaCiaId (nunca 500)", async () => {
    const res = await request(app)
      .post("/api/analitica/analisis/ejecutar")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send(configuracionValida);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
    expect(typeof res.body.motivo).toBe("string");
  });

  it("POST /analisis/ejecutar responde 403 sin el permiso analitica.ver", async () => {
    const res = await request(app)
      .post("/api/analitica/analisis/ejecutar")
      .set("Authorization", `Bearer ${tokenSinPermiso}`)
      .send(configuracionValida);
    expect(res.status).toBe(403);
  });

  it("POST /analisis/ejecutar rechaza una combinación métrica/dimensión no permitida (400)", async () => {
    const res = await request(app)
      .post("/api/analitica/analisis/ejecutar")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ ...configuracionValida, metrica: "clientes", dimensionPrincipal: "vendedor" });
    expect(res.status).toBe(400);
  });

  it("POST /analisis/ejecutar rechaza una métrica que no existe en el catálogo (400)", async () => {
    const res = await request(app)
      .post("/api/analitica/analisis/ejecutar")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ ...configuracionValida, metrica: "prediccion-ia" });
    expect(res.status).toBe(400);
  });

  it("POST /analisis/ejecutar rechaza un body incompleto (400)", async () => {
    const res = await request(app)
      .post("/api/analitica/analisis/ejecutar")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ metrica: "margen" });
    expect(res.status).toBe(400);
  });

  it("POST /analisis/guardados crea un análisis y GET /analisis/guardados lo lista para su dueño", async () => {
    const crear = await request(app)
      .post("/api/analitica/analisis/guardados")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ nombre: `Mi análisis ${sufijo}`, configuracion: configuracionValida });
    expect(crear.status).toBe(201);
    expect(crear.body.nombre).toBe(`Mi análisis ${sufijo}`);

    const listar = await request(app)
      .get("/api/analitica/analisis/guardados")
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(listar.status).toBe(200);
    expect(listar.body.some((a: { id: string }) => a.id === crear.body.id)).toBe(true);
  });

  it("rechaza guardar un análisis con configuración inválida (400)", async () => {
    const res = await request(app)
      .post("/api/analitica/analisis/guardados")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({
        nombre: "Inválido",
        configuracion: { ...configuracionValida, metrica: "clientes", dimensionPrincipal: "vendedor" },
      });
    expect(res.status).toBe(400);
  });

  it("rechaza guardar un análisis sin nombre (400)", async () => {
    const res = await request(app)
      .post("/api/analitica/analisis/guardados")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ configuracion: configuracionValida });
    expect(res.status).toBe(400);
  });

  it("un usuario nunca ve ni puede abrir el análisis guardado de otro usuario del mismo tenant (IDOR)", async () => {
    const crear = await request(app)
      .post("/api/analitica/analisis/guardados")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ nombre: `Privado de admin ${sufijo}`, configuracion: configuracionValida });
    expect(crear.status).toBe(201);
    const id = crear.body.id;

    const listarOtroUsuario = await request(app)
      .get("/api/analitica/analisis/guardados")
      .set("Authorization", `Bearer ${tokenOtroUsuario}`);
    expect(listarOtroUsuario.body.some((a: { id: string }) => a.id === id)).toBe(false);

    const obtenerOtroUsuario = await request(app)
      .get(`/api/analitica/analisis/guardados/${id}`)
      .set("Authorization", `Bearer ${tokenOtroUsuario}`);
    expect(obtenerOtroUsuario.status).toBe(404);

    const eliminarOtroUsuario = await request(app)
      .delete(`/api/analitica/analisis/guardados/${id}`)
      .set("Authorization", `Bearer ${tokenOtroUsuario}`);
    expect(eliminarOtroUsuario.status).toBe(404);

    // El dueño sigue pudiendo verlo y borrarlo normalmente.
    const obtenerDueno = await request(app)
      .get(`/api/analitica/analisis/guardados/${id}`)
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(obtenerDueno.status).toBe(200);
  });

  it("un tenant nunca ve los análisis guardados de otro tenant (aislamiento multi-tenant)", async () => {
    const crear = await request(app)
      .post("/api/analitica/analisis/guardados")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ nombre: `Solo de este tenant ${sufijo}`, configuracion: configuracionValida });
    const id = crear.body.id;

    const listarOtroTenant = await request(app)
      .get("/api/analitica/analisis/guardados")
      .set("Authorization", `Bearer ${tokenOtroTenant}`);
    expect(listarOtroTenant.body.some((a: { id: string }) => a.id === id)).toBe(false);

    const obtenerOtroTenant = await request(app)
      .get(`/api/analitica/analisis/guardados/${id}`)
      .set("Authorization", `Bearer ${tokenOtroTenant}`);
    expect(obtenerOtroTenant.status).toBe(404);
  });

  it("DELETE /analisis/guardados/:id responde 404 para un id inexistente", async () => {
    const res = await request(app)
      .delete(`/api/analitica/analisis/guardados/${randomUUID()}`)
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
  });
});
