import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * CRUD de PlantillaNotificacion: cubre listado (GENERAL + propias del
 * tenant), permiso requerido para escribir (configuracion.plantillas_notificacion),
 * restricción de escritura de GENERAL a superadmin, y aislamiento de tenant
 * (IDOR) contra registros exclusivos de OTRO tenant.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Plantillas de notificación — BD real", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let tokenConPermiso: string;
  let tokenSinPermiso: string;
  let tokenTenantB: string;
  let tokenSuperadmin: string;
  let plantillaGeneralId: string;
  let plantillaTenantAId: string;
  const tipoEventoTest = `TEST_TIPO_EVENTO_${sufijo}`;

  const login = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Plantillas A ${sufijo}`, subdomain: `test-plantillas-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Plantillas B ${sufijo}`, subdomain: `test-plantillas-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    const rolConPermiso = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Con permiso plantillas ${sufijo}`,
        permisos: JSON.stringify(["configuracion.plantillas_notificacion"]),
      },
    });

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `plantillas-conpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Con Permiso",
        rolId: rolConPermiso.id,
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `plantillas-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `plantillas-tenantb-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Tenant B",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `plantillas-superadmin-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Superadmin",
        isSuperadmin: true,
        activo: true,
      },
    });

    plantillaGeneralId = (
      await prisma.plantillaNotificacion.create({
        data: {
          tipoEvento: tipoEventoTest,
          titulo: `General ${sufijo}`,
          mensaje: `Mensaje general {{nombre}} ${sufijo}`,
          tenantId: null,
        },
      })
    ).id;
    plantillaTenantAId = (
      await prisma.plantillaNotificacion.create({
        data: {
          tipoEvento: `${tipoEventoTest}_TENANT_A`,
          titulo: `Tenant A ${sufijo}`,
          mensaje: `Mensaje tenant A {{nombre}} ${sufijo}`,
          tenantId: tenantAId,
        },
      })
    ).id;

    tokenConPermiso = await login(`plantillas-conpermiso-${sufijo}@test.ricosoft.local`);
    tokenSinPermiso = await login(`plantillas-sinpermiso-${sufijo}@test.ricosoft.local`);
    tokenTenantB = await login(`plantillas-tenantb-${sufijo}@test.ricosoft.local`);
    tokenSuperadmin = await login(`plantillas-superadmin-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    await prisma.plantillaNotificacion.deleteMany({
      where: {
        OR: [
          { tenantId: tenantAId },
          { tenantId: tenantBId },
          { id: plantillaGeneralId },
          { tipoEvento: { startsWith: tipoEventoTest } },
        ],
      },
    });
    await prisma.auditoria.deleteMany({
      where: { OR: [{ tenantId: tenantAId }, { tenantId: tenantBId }] },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ tenantId: tenantAId }, { tenantId: tenantBId }] },
    });
    await prisma.rol.deleteMany({ where: { tenantId: tenantAId } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  it("lista plantillas GENERALES + propias del tenant, filtrando por tipoEvento", async () => {
    const res = await request(app)
      .get(`/api/plantillas-notificacion?tipoEvento=${tipoEventoTest}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].alcance).toBe("GENERAL");
  });

  it("la plantilla GENERAL es visible también para un usuario de OTRO tenant, pero no la propia del tenant A", async () => {
    const res = await request(app)
      .get("/api/plantillas-notificacion")
      .set("Authorization", `Bearer ${tokenTenantB}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(plantillaGeneralId);
    expect(ids).not.toContain(plantillaTenantAId);
  });

  it("cualquier usuario autenticado puede LEER aunque no tenga el permiso de gestión", async () => {
    const res = await request(app)
      .get("/api/plantillas-notificacion")
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(res.status).toBe(200);
  });

  it("un usuario SIN el permiso no puede crear una plantilla (403), no se crea", async () => {
    const tipoNuevo = `${tipoEventoTest}_NOPE`;
    const res = await request(app)
      .post("/api/plantillas-notificacion")
      .set("Authorization", `Bearer ${tokenSinPermiso}`)
      .send({ tipoEvento: tipoNuevo, titulo: "No debería crearse", mensaje: "m" });
    expect(res.status).toBe(403);
    const noCreada = await prisma.plantillaNotificacion.findFirst({
      where: { tipoEvento: tipoNuevo },
    });
    expect(noCreada).toBeNull();
  });

  it("un usuario CON el permiso puede crear una plantilla TENANT propia", async () => {
    const tipoNuevo = `${tipoEventoTest}_NUEVA`;
    const res = await request(app)
      .post("/api/plantillas-notificacion")
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({ tipoEvento: tipoNuevo, titulo: "Nueva", mensaje: "Mensaje nuevo" });
    expect(res.status).toBe(201);
    expect(res.body.alcance).toBe("TENANT");
  });

  it("un usuario CON el permiso no puede crear una plantilla de alcance GENERAL (403) sin ser superadmin", async () => {
    const res = await request(app)
      .post("/api/plantillas-notificacion")
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({
        tipoEvento: `${tipoEventoTest}_GENERAL_INTENTO`,
        titulo: "Intento general",
        mensaje: "m",
        alcance: "GENERAL",
      });
    expect(res.status).toBe(403);
  });

  it("un superadmin SÍ puede crear una plantilla GENERAL", async () => {
    const tipoNuevo = `${tipoEventoTest}_GENERAL_SUPERADMIN`;
    const res = await request(app)
      .post("/api/plantillas-notificacion")
      .set("Authorization", `Bearer ${tokenSuperadmin}`)
      .send({
        tipoEvento: tipoNuevo,
        titulo: "General superadmin",
        mensaje: "m",
        alcance: "GENERAL",
      });
    expect(res.status).toBe(201);
    expect(res.body.alcance).toBe("GENERAL");
    await prisma.plantillaNotificacion.deleteMany({ where: { tipoEvento: tipoNuevo } });
  });

  it("un usuario CON permiso (no superadmin) no puede editar ni eliminar la plantilla GENERAL (403)", async () => {
    const resPatch = await request(app)
      .patch(`/api/plantillas-notificacion/${plantillaGeneralId}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({ titulo: "Hackeado" });
    expect(resPatch.status).toBe(403);

    const resDelete = await request(app)
      .delete(`/api/plantillas-notificacion/${plantillaGeneralId}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(resDelete.status).toBe(403);

    const sigueIgual = await prisma.plantillaNotificacion.findUnique({
      where: { id: plantillaGeneralId },
    });
    expect(sigueIgual?.titulo).not.toBe("Hackeado");
  });

  it("IDOR: un usuario del tenant B no puede editar ni eliminar una plantilla exclusiva del tenant A (404)", async () => {
    const rolB = await prisma.rol.create({
      data: {
        tenantId: tenantBId,
        nombre: `Con permiso B ${sufijo}`,
        permisos: JSON.stringify(["configuracion.plantillas_notificacion"]),
      },
    });
    await prisma.user.update({
      where: { email: `plantillas-tenantb-${sufijo}@test.ricosoft.local` },
      data: { rolId: rolB.id },
    });
    const tokenTenantBConPermiso = await login(`plantillas-tenantb-${sufijo}@test.ricosoft.local`);

    const resPatch = await request(app)
      .patch(`/api/plantillas-notificacion/${plantillaTenantAId}`)
      .set("Authorization", `Bearer ${tokenTenantBConPermiso}`)
      .send({ titulo: "Hackeado" });
    expect(resPatch.status).toBe(404);

    const resDelete = await request(app)
      .delete(`/api/plantillas-notificacion/${plantillaTenantAId}`)
      .set("Authorization", `Bearer ${tokenTenantBConPermiso}`);
    expect(resDelete.status).toBe(404);

    const sigueIgual = await prisma.plantillaNotificacion.findUnique({
      where: { id: plantillaTenantAId },
    });
    expect(sigueIgual?.titulo).not.toBe("Hackeado");

    await prisma.rol.delete({ where: { id: rolB.id } });
  });

  it("un usuario CON el permiso puede editar su propia plantilla TENANT", async () => {
    const res = await request(app)
      .patch(`/api/plantillas-notificacion/${plantillaTenantAId}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({ titulo: "Editado correctamente" });
    expect(res.status).toBe(200);
    expect(res.body.titulo).toBe("Editado correctamente");
  });

  it("un usuario CON el permiso puede eliminar su propia plantilla TENANT", async () => {
    const creada = await prisma.plantillaNotificacion.create({
      data: {
        tipoEvento: `${tipoEventoTest}_A_BORRAR`,
        titulo: "A borrar",
        mensaje: "m",
        tenantId: tenantAId,
      },
    });
    const res = await request(app)
      .delete(`/api/plantillas-notificacion/${creada.id}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(res.status).toBe(204);
    const borrada = await prisma.plantillaNotificacion.findUnique({ where: { id: creada.id } });
    expect(borrada).toBeNull();
  });
});
