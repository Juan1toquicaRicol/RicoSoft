import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración con BASE DE DATOS REAL para la tercera capa de
 * Módulos: acceso efectivo del usuario (Modulo.permisoClave), independiente
 * del alcance GENERAL/TENANT. Requiere las migraciones
 * 20260831010000_alcance_general_tenant y 20260831020000_modulo_permiso_clave
 * ya aplicadas — a propósito NO se aplicaron en esta sesión (misma
 * instrucción de no tocar saas_dev sin autorización que la fase anterior),
 * así que esta suite no pudo ejecutarse todavía.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Módulos — visibilidad por acceso efectivo (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdminA: string;
  let tokenSinPermiso: string;
  let tokenAdminB: string;
  let moduloGeneralConPermisoId: string;
  let moduloExclusivoAId: string;

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
      data: { nombre: `Modulos Test A ${sufijo}`, subdomain: `test-modulos-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Modulos Test B ${sufijo}`, subdomain: `test-modulos-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const rolSinPermiso = await prisma.rol.create({
      data: { tenantId: tenantAId, nombre: `Sin Permisos ${sufijo}`, permisos: JSON.stringify([]) },
    });

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `modulos-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `modulos-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        rolId: rolSinPermiso.id,
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `modulos-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`modulos-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermiso = await login(`modulos-sinpermiso-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`modulos-admin-b-${sufijo}@test.ricosoft.local`);

    // Módulo GENERAL que exige un permiso que "Sin Permiso" no tiene.
    const general = await prisma.modulo.create({
      data: {
        tenantId: null,
        clave: `restringido-${sufijo}`,
        nombre: `Restringido ${sufijo}`,
        ruta: "/restringido",
        icono: "FileText",
        permisoClave: "facturas.ver",
      },
    });
    moduloGeneralConPermisoId = general.id;

    // Módulo exclusivo de Tenant A, sin restricción de permiso.
    const exclusivo = await prisma.modulo.create({
      data: {
        tenantId: tenantAId,
        clave: `exclusivo-a-${sufijo}`,
        nombre: `Exclusivo A ${sufijo}`,
        ruta: "/exclusivo-a",
        icono: "FileText",
      },
    });
    moduloExclusivoAId = exclusivo.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.modulo.deleteMany({
      where: { id: { in: [moduloGeneralConPermisoId, moduloExclusivoAId] } },
    });
    await prisma.modulo.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("un módulo GENERAL con permisoClave no aparece para un usuario sin ese permiso", async () => {
    const res = await request(app)
      .get("/api/modulos/menu")
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(res.status).toBe(200);
    expect(res.body.some((m: { id: string }) => m.id === moduloGeneralConPermisoId)).toBe(false);
  });

  it("el mismo módulo SÍ aparece para un superadmin (bypass existente, sin cambios de código)", async () => {
    const res = await request(app)
      .get("/api/modulos/menu")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(res.status).toBe(200);
    expect(res.body.some((m: { id: string }) => m.id === moduloGeneralConPermisoId)).toBe(true);
  });

  it("el mismo módulo SÍ aparece para un usuario con el permiso concreto", async () => {
    const rolConPermiso = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Con Facturas ${sufijo}`,
        permisos: JSON.stringify(["facturas.ver"]),
      },
    });
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const conPermiso = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `modulos-conpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Con Permiso",
        rolId: rolConPermiso.id,
        activo: true,
      },
    });
    const token = await login(`modulos-conpermiso-${sufijo}@test.ricosoft.local`);

    const res = await request(app).get("/api/modulos/menu").set("Authorization", `Bearer ${token}`);
    expect(res.body.some((m: { id: string }) => m.id === moduloGeneralConPermisoId)).toBe(true);

    await prisma.auditoria.deleteMany({ where: { usuarioId: conPermiso.id } });
    await prisma.user.delete({ where: { id: conPermiso.id } });
    await prisma.rol.delete({ where: { id: rolConPermiso.id } });
  });

  it("acceso directo al endpoint real de Facturas sigue rechazado aunque el módulo no se muestre (segunda capa intacta)", async () => {
    const res = await request(app)
      .get("/api/facturas")
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(res.status).toBe(403);
  });

  it("IDOR: Tenant B no puede ver ni modificar un módulo exclusivo de Tenant A", async () => {
    // No aparece en el listado administrativo de B.
    const listado = await request(app)
      .get("/api/modulos")
      .set("Authorization", `Bearer ${tokenAdminB}`);
    expect(listado.body.some((m: { id: string }) => m.id === moduloExclusivoAId)).toBe(false);

    // Intentar modificarlo directamente por id -> 404.
    const intento = await request(app)
      .patch(`/api/modulos/${moduloExclusivoAId}`)
      .set("Authorization", `Bearer ${tokenAdminB}`)
      .send({ activo: false });
    expect(intento.status).toBe(404);

    // Intentar "convertirlo" a general desde B -> también 404 (ni siquiera
    // llega a la lógica de conversión, porque no lo puede encontrar).
    const intentoAlcance = await request(app)
      .patch(`/api/modulos/${moduloExclusivoAId}`)
      .set("Authorization", `Bearer ${tokenAdminB}`)
      .send({ alcance: "GENERAL" });
    expect(intentoAlcance.status).toBe(404);
  });

  it("un módulo desactivado no aparece en el menú aunque el usuario tenga el permiso", async () => {
    await prisma.modulo.update({
      where: { id: moduloGeneralConPermisoId },
      data: { activo: false },
    });
    try {
      const res = await request(app)
        .get("/api/modulos/menu")
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(res.body.some((m: { id: string }) => m.id === moduloGeneralConPermisoId)).toBe(false);
    } finally {
      await prisma.modulo.update({
        where: { id: moduloGeneralConPermisoId },
        data: { activo: true },
      });
    }
  });
});
