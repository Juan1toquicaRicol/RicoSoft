import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración con BASE DE DATOS REAL para la Fase 2 (piloto de
 * migración): Proveedores es el único módulo que hoy consume
 * req.tenantPrisma end-to-end (ver proveedores.routes.ts). Esta suite prueba
 * el comportamiento observable vía HTTP, no la extensión en sí (eso ya lo
 * cubre lib/tenant-prisma.integration.test.ts) — el objetivo es demostrar
 * que el contrato HTTP no cambió y que el aislamiento por tenant es real de
 * punta a punta: JWT -> tenantPrisma -> controller -> SQL Server.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Proveedores — piloto tenant-prisma (Fase 2, multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenA: string;
  let tokenB: string;
  let proveedorBId: string;

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
      data: { nombre: `Prov TenantPrisma A ${sufijo}`, subdomain: `test-prov-tp-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Prov TenantPrisma B ${sufijo}`, subdomain: `test-prov-tp-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `prov-tp-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `prov-tp-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenA = await login(`prov-tp-admin-a-${sufijo}@test.ricosoft.local`);
    tokenB = await login(`prov-tp-admin-b-${sufijo}@test.ricosoft.local`);

    const proveedorB = await prisma.proveedor.create({
      data: { tenantId: tenantBId, nombre: "Proveedor de B", nit: `NIT-B-${sufijo}` },
    });
    proveedorBId = proveedorB.id;

    await prisma.proveedor.create({
      data: { tenantId: tenantAId, nombre: "Proveedor de A", nit: `NIT-A-${sufijo}` },
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("Test 1 — lectura aislada: el listado de A nunca incluye proveedores de B", async () => {
    const res = await request(app).get("/api/proveedores").set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((p: { id: string; nombre: string }) => p.id === proveedorBId)).toBe(
      false,
    );
    expect(
      res.body.items.some((p: { id: string; nombre: string }) => p.nombre === "Proveedor de A"),
    ).toBe(true);
  });

  it("Test 3/4 (vía update propio de contrato) — actualizar un proveedor de otro tenant se comporta como inexistente (404), y no lo modifica", async () => {
    const res = await request(app)
      .patch(`/api/proveedores/${proveedorBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nombre: "Hackeado desde A" });
    expect(res.status).toBe(404);

    const sinTocar = await prisma.proveedor.findUnique({ where: { id: proveedorBId } });
    expect(sinTocar?.nombre).toBe("Proveedor de B");
  });

  it("Test 4 — eliminar un proveedor de otro tenant se comporta como inexistente (404), y no lo elimina", async () => {
    const res = await request(app)
      .delete(`/api/proveedores/${proveedorBId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);

    const sigueExistiendo = await prisma.proveedor.findUnique({ where: { id: proveedorBId } });
    expect(sigueExistiendo).not.toBeNull();
  });

  it("Test 5 — CREATE: el proveedor queda en el tenant del JWT aunque el body no envíe tenantId (el endpoint no lo acepta)", async () => {
    const res = await request(app)
      .post("/api/proveedores")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nombre: "Creado por A", nit: `NIT-CREADO-A-${sufijo}` });
    expect(res.status).toBe(201);

    const enDb = await prisma.proveedor.findUnique({ where: { id: res.body.id } });
    expect(enDb?.tenantId).toBe(tenantAId);
  });

  it("Test 6/7 — Tenant A puede actualizar y eliminar correctamente su propio proveedor", async () => {
    const creado = await request(app)
      .post("/api/proveedores")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nombre: "Editable por A", nit: `NIT-EDITABLE-A-${sufijo}` });
    expect(creado.status).toBe(201);
    const id = creado.body.id;

    const editado = await request(app)
      .patch(`/api/proveedores/${id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nombre: "Editado por A" });
    expect(editado.status).toBe(200);
    expect(editado.body.nombre).toBe("Editado por A");

    const eliminado = await request(app)
      .delete(`/api/proveedores/${id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(eliminado.status).toBe(204);

    const yaNoExiste = await prisma.proveedor.findUnique({ where: { id } });
    expect(yaNoExiste).toBeNull();
  });

  it("Test 8 — listado/count aislado también desde Tenant B (no ve proveedores de A)", async () => {
    const res = await request(app).get("/api/proveedores").set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(
      res.body.items.some((p: { id: string; nombre: string }) => p.nombre === "Proveedor de A"),
    ).toBe(false);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it("búsqueda por NIT duplicado (409) sigue funcionando igual que antes de la migración", async () => {
    const nit = `NIT-DUP-A-${sufijo}`;
    const primero = await request(app)
      .post("/api/proveedores")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nombre: "Original", nit });
    expect(primero.status).toBe(201);

    const duplicado = await request(app)
      .post("/api/proveedores")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nombre: "Duplicado", nit });
    expect(duplicado.status).toBe(409);
  });
});
