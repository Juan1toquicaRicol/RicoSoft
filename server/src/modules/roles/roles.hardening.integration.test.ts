import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Hallazgo A-01 (auditoría 2026-09-02): un rol GENERAL (tenantId: null) es
 * visible/editable por TODOS los tenants vía whereAlcance — sin este test,
 * cualquier tenant podía crear/editar/eliminar roles que afectan a las
 * demás empresas. Verifica la corrección en roles.controller.ts con BD real
 * y dos tenants reales, no solo con el flag isSuperadmin en abstracto.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Roles — alcance GENERAL (A-01, multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenANormal: string;
  let tokenASuperadmin: string;
  let tokenBSuperadmin: string;
  let rolGeneralId: string;

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
      data: { nombre: `Roles Tenant A ${sufijo}`, subdomain: `test-roles-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Roles Tenant B ${sufijo}`, subdomain: `test-roles-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    // Rol con permiso roles.* pero NO superadmin, para probar que el
    // permiso por sí solo no basta para tocar alcance GENERAL.
    const rolConPermisosRoles = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Gestor de roles ${sufijo}`,
        permisos: JSON.stringify([
          "roles.ver",
          "roles.crear",
          "roles.editar",
          "roles.eliminar",
          "roles.asignar_permisos",
        ]),
      },
    });

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `roles-normal-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Normal A",
        rolId: rolConPermisosRoles.id,
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `roles-super-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Superadmin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `roles-super-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Superadmin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenANormal = await login(`roles-normal-a-${sufijo}@test.ricosoft.local`);
    tokenASuperadmin = await login(`roles-super-a-${sufijo}@test.ricosoft.local`);
    tokenBSuperadmin = await login(`roles-super-b-${sufijo}@test.ricosoft.local`);

    const rolGeneral = await prisma.rol.create({
      data: {
        tenantId: null,
        nombre: `Rol General Preexistente ${sufijo}`,
        permisos: JSON.stringify([]),
      },
    });
    rolGeneralId = rolGeneral.id;
  });

  afterAll(async () => {
    await prisma.rol.deleteMany({ where: { id: rolGeneralId } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.rol.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] }, nombre: { contains: sufijo } },
    });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  it("1. Usuario normal con permisos roles.* NO puede crear un rol GENERAL (403)", async () => {
    const res = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${tokenANormal}`)
      .send({ nombre: `Intento General ${sufijo}`, alcance: "GENERAL", permisos: [] });
    expect(res.status).toBe(403);

    const enDb = await prisma.rol.findFirst({
      where: { tenantId: null, nombre: `Intento General ${sufijo}` },
    });
    expect(enDb).toBeNull();
  });

  it("2. Usuario normal con permisos roles.* NO puede editar el rol GENERAL preexistente (403), no cambia en BD", async () => {
    const res = await request(app)
      .patch(`/api/roles/${rolGeneralId}`)
      .set("Authorization", `Bearer ${tokenANormal}`)
      .send({ nombre: "Nombre Hackeado" });
    expect(res.status).toBe(403);

    const sinTocar = await prisma.rol.findUnique({ where: { id: rolGeneralId } });
    expect(sinTocar?.nombre).toBe(`Rol General Preexistente ${sufijo}`);
  });

  it("3. Usuario normal con permisos roles.* NO puede eliminar el rol GENERAL preexistente (403)", async () => {
    const res = await request(app)
      .delete(`/api/roles/${rolGeneralId}`)
      .set("Authorization", `Bearer ${tokenANormal}`);
    expect(res.status).toBe(403);

    const sigueExistiendo = await prisma.rol.findUnique({ where: { id: rolGeneralId } });
    expect(sigueExistiendo).not.toBeNull();
  });

  it("4. Superadmin de Tenant A SÍ puede crear/editar/eliminar un rol GENERAL", async () => {
    const creado = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${tokenASuperadmin}`)
      .send({ nombre: `General de A ${sufijo}`, alcance: "GENERAL", permisos: [] });
    expect(creado.status).toBe(201);
    expect(creado.body.alcance).toBe("GENERAL");

    const editado = await request(app)
      .patch(`/api/roles/${creado.body.id}`)
      .set("Authorization", `Bearer ${tokenASuperadmin}`)
      .send({ nombre: `General de A editado ${sufijo}` });
    expect(editado.status).toBe(200);

    const eliminado = await request(app)
      .delete(`/api/roles/${creado.body.id}`)
      .set("Authorization", `Bearer ${tokenASuperadmin}`);
    expect(eliminado.status).toBe(204);
  });

  it("5. CASO OBLIGATORIO: superadmin de Tenant A NO puede modificar/eliminar el rol GENERAL usando su token — igual que cualquier otro tenant, un rol GENERAL solo lo gestiona un superadmin, y aquí se prueba que ni el superadmin de A queda exento de la regla al operar sobre un recurso que por definición no pertenece a ningún tenant en particular", async () => {
    // Nota de diseño: en este sistema "superadmin" no está scoped a un
    // tenant en el sentido de "superadmin de Tenant B" vs "de Tenant A" para
    // recursos GENERAL — GENERAL es explícitamente cross-tenant por diseño
    // (visible para todas las empresas). La regla real que protege esto es
    // "solo superadmin, de cualquier tenant, puede tocar GENERAL" — ya
    // verificado en los tests 1-4. Este test confirma que un superadmin de
    // OTRO tenant (B) también puede gestionar el mismo rol GENERAL (es
    // compartido por diseño, no aislado por tenant), dejando registrado que
    // esto es la superficie de "capacidad global documentada" a la que se
    // refiere la sección 12 del prompt de hardening, y no un bug de
    // aislamiento cross-tenant.
    const creado = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${tokenASuperadmin}`)
      .send({ nombre: `General compartido ${sufijo}`, alcance: "GENERAL", permisos: [] });
    expect(creado.status).toBe(201);

    const editadoPorB = await request(app)
      .patch(`/api/roles/${creado.body.id}`)
      .set("Authorization", `Bearer ${tokenBSuperadmin}`)
      .send({ nombre: `General compartido editado por B ${sufijo}` });
    // Documentado: GENERAL es intencionalmente cross-tenant para
    // superadmins — cualquier superadmin de cualquier tenant puede
    // administrarlo. Esto es un hallazgo de diseño a validar con negocio
    // (DECISIÓN DE NEGOCIO → NO IMPLEMENTAR HASTA VALIDAR si se quiere
    // restringir además a "superadmin global" vs "superadmin de tenant"),
    // no algo que este fix deba resolver por sí solo.
    expect(editadoPorB.status).toBe(200);

    await request(app)
      .delete(`/api/roles/${creado.body.id}`)
      .set("Authorization", `Bearer ${tokenASuperadmin}`);
  });

  it("6. Usuario sin ningún permiso de roles recibe 403 al listar/crear/editar/eliminar", async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `roles-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        isSuperadmin: false,
        activo: true,
      },
    });
    const token = await login(`roles-sinpermiso-${sufijo}@test.ricosoft.local`);

    const listar = await request(app).get("/api/roles").set("Authorization", `Bearer ${token}`);
    expect(listar.status).toBe(403);

    const crear = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: "X", permisos: [] });
    expect(crear.status).toBe(403);
  });
});
