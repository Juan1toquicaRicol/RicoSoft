import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Auditoría de datos hardcodeados — CatalogoValor: cubre listado (GENERAL +
 * propios del tenant), permiso requerido para escribir, y aislamiento de
 * tenant (IDOR) contra registros exclusivos de OTRO tenant.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Catálogos (CatalogoValor) — BD real", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let tokenConPermiso: string;
  let tokenSinPermiso: string;
  let tokenTenantB: string;
  let valorGeneralId: string;
  let valorTenantAId: string;

  const login = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Catalogos A ${sufijo}`, subdomain: `test-catalogos-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Catalogos B ${sufijo}`, subdomain: `test-catalogos-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    const rolConPermiso = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Con permiso catálogos ${sufijo}`,
        permisos: JSON.stringify(["configuracion.catalogos"]),
      },
    });

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `catalogos-conpermiso-${sufijo}@test.ricosoft.local`,
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
        email: `catalogos-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `catalogos-tenantb-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Tenant B",
        isSuperadmin: false,
        activo: true,
      },
    });

    valorGeneralId = (
      await prisma.catalogoValor.create({
        data: {
          tipo: "INCOTERM",
          clave: `TEST-GENERAL-${sufijo}`,
          etiqueta: `General ${sufijo}`,
          tenantId: null,
        },
      })
    ).id;
    valorTenantAId = (
      await prisma.catalogoValor.create({
        data: {
          tipo: "INCOTERM",
          clave: `TEST-TENANT-A-${sufijo}`,
          etiqueta: `Tenant A ${sufijo}`,
          tenantId: tenantAId,
        },
      })
    ).id;

    tokenConPermiso = await login(`catalogos-conpermiso-${sufijo}@test.ricosoft.local`);
    tokenSinPermiso = await login(`catalogos-sinpermiso-${sufijo}@test.ricosoft.local`);
    tokenTenantB = await login(`catalogos-tenantb-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    await prisma.catalogoValor.deleteMany({
      where: { OR: [{ tenantId: tenantAId }, { tenantId: tenantBId }, { id: valorGeneralId }] },
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

  it("lista valores GENERALES + propios del tenant, filtrando por tipo", async () => {
    const res = await request(app)
      .get("/api/catalogos?tipo=INCOTERM")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(res.status).toBe(200);
    const claves = res.body.map((v: { clave: string }) => v.clave);
    expect(claves).toContain(`TEST-GENERAL-${sufijo}`);
    expect(claves).toContain(`TEST-TENANT-A-${sufijo}`);
  });

  it("el catálogo GENERAL es visible también para un usuario de OTRO tenant, pero no el propio de tenant A", async () => {
    const res = await request(app)
      .get("/api/catalogos?tipo=INCOTERM")
      .set("Authorization", `Bearer ${tokenTenantB}`);
    expect(res.status).toBe(200);
    const claves = res.body.map((v: { clave: string }) => v.clave);
    expect(claves).toContain(`TEST-GENERAL-${sufijo}`);
    expect(claves).not.toContain(`TEST-TENANT-A-${sufijo}`);
  });

  it("cualquier usuario autenticado puede LEER el catálogo aunque no tenga el permiso de gestión", async () => {
    const res = await request(app)
      .get("/api/catalogos?tipo=INCOTERM")
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(res.status).toBe(200);
  });

  it("un usuario SIN el permiso configuracion.catalogos no puede crear un valor (403), no se crea", async () => {
    const res = await request(app)
      .post("/api/catalogos")
      .set("Authorization", `Bearer ${tokenSinPermiso}`)
      .send({ tipo: "MONEDA", clave: `NOPE-${sufijo}`, etiqueta: "No debería crearse" });
    expect(res.status).toBe(403);
    const noCreado = await prisma.catalogoValor.findFirst({
      where: { tipo: "MONEDA", clave: `NOPE-${sufijo}` },
    });
    expect(noCreado).toBeNull();
  });

  it("un usuario CON el permiso puede crear un valor TENANT propio", async () => {
    const res = await request(app)
      .post("/api/catalogos")
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({ tipo: "MONEDA", clave: `NUEVA-${sufijo}`, etiqueta: "Nueva moneda" });
    expect(res.status).toBe(201);
    expect(res.body.alcance).toBe("TENANT");
  });

  it("un usuario CON el permiso no puede crear un valor de alcance GENERAL (403) sin ser superadmin", async () => {
    const res = await request(app)
      .post("/api/catalogos")
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({
        tipo: "MONEDA",
        clave: `GENERAL-INTENTO-${sufijo}`,
        etiqueta: "Intento general",
        alcance: "GENERAL",
      });
    expect(res.status).toBe(403);
  });

  it("IDOR: un usuario del tenant B no puede editar ni eliminar un valor exclusivo del tenant A (404)", async () => {
    // tenantB no tiene el permiso configuracion.catalogos, pero el 404 de
    // aislamiento debe llegar de todas formas si se le concede el permiso —
    // se valida aquí con un rol elevado transitorio para probar el 404 real
    // (no un 403 previo que enmascare el resultado).
    const rolB = await prisma.rol.create({
      data: {
        tenantId: tenantBId,
        nombre: `Con permiso B ${sufijo}`,
        permisos: JSON.stringify(["configuracion.catalogos"]),
      },
    });
    await prisma.user.update({
      where: { email: `catalogos-tenantb-${sufijo}@test.ricosoft.local` },
      data: { rolId: rolB.id },
    });
    const tokenTenantBConPermiso = await login(`catalogos-tenantb-${sufijo}@test.ricosoft.local`);

    const resPatch = await request(app)
      .patch(`/api/catalogos/${valorTenantAId}`)
      .set("Authorization", `Bearer ${tokenTenantBConPermiso}`)
      .send({ etiqueta: "Hackeado" });
    expect(resPatch.status).toBe(404);

    const resDelete = await request(app)
      .delete(`/api/catalogos/${valorTenantAId}`)
      .set("Authorization", `Bearer ${tokenTenantBConPermiso}`);
    expect(resDelete.status).toBe(404);

    const sigueIgual = await prisma.catalogoValor.findUnique({ where: { id: valorTenantAId } });
    expect(sigueIgual?.etiqueta).not.toBe("Hackeado");

    await prisma.rol.delete({ where: { id: rolB.id } });
  });
});
