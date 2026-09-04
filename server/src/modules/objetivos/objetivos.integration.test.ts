import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Objetivos comerciales — multi-tenant real, permisos, validación de reglas
 * de negocio y auditoría. Los endpoints que dependen de Siesa en vivo
 * (resumen, vendedores, catálogo) solo se prueban en el camino
 * "disponible:false sin siesaCiaId" — sin datos reales de Siesa no se puede
 * ejercitar el cálculo de cumplimiento end-to-end (igual que Despachos con
 * crearDespacho).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Objetivos — multi-tenant real", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdminA: string;
  let tokenSinPermisoA: string;
  let tokenAdminB: string;
  let objetivoBId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.token as string;
  };

  const rangoFuturo = () => ({
    fechaInicio: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    fechaFin: new Date(Date.now() + 430 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Objetivos Tenant A ${sufijo}`, subdomain: `test-obj-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Objetivos Tenant B ${sufijo}`, subdomain: `test-obj-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `obj-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `obj-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    const adminB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `obj-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`obj-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`obj-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`obj-admin-b-${sufijo}@test.ricosoft.local`);

    const objetivoB = await prisma.objetivo.create({
      data: {
        tenantId: tenantBId,
        nivel: "EMPRESA",
        tipoPeriodo: "MENSUAL",
        fechaInicio: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000),
        fechaFin: new Date(Date.now() + 430 * 24 * 60 * 60 * 1000),
        anio: new Date().getFullYear() + 2,
        metaValor: 1_000_000,
        estado: "ACTIVO",
        creadoPorId: adminB.id,
        creadoPorNombre: "Admin B",
      },
    });
    objetivoBId = objetivoB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.objetivo.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("Tenant A crea un objetivo de empresa y lo lista; no ve el de Tenant B", async () => {
    const { fechaInicio, fechaFin } = rangoFuturo();
    const creado = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        nivel: "EMPRESA",
        tipoPeriodo: "MENSUAL",
        fechaInicio,
        fechaFin,
        metaValor: 5_000_000_000,
      });
    expect(creado.status).toBe(201);
    expect(creado.body.metaValor).toBe(5_000_000_000);

    const res = await request(app)
      .get("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(res.status).toBe(200);
    expect(res.body.some((o: any) => o.id === objetivoBId)).toBe(false);
    expect(res.body.some((o: any) => o.id === creado.body.id)).toBe(true);
  });

  it("Tenant A no puede leer, editar ni eliminar el objetivo de Tenant B (404)", async () => {
    const get = await request(app)
      .get(`/api/objetivos/${objetivoBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(get.status).toBe(404);

    const patch = await request(app)
      .patch(`/api/objetivos/${objetivoBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ metaValor: 1 });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/api/objetivos/${objetivoBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(del.status).toBe(404);

    const sinTocar = await prisma.objetivo.findUnique({ where: { id: objetivoBId } });
    expect(Number(sinTocar?.metaValor)).toBe(1_000_000);
    expect(sinTocar?.eliminado).toBe(false);
  });

  it("Un usuario sin permiso objetivos.crear recibe 403 al intentar crear", async () => {
    const { fechaInicio, fechaFin } = rangoFuturo();
    const res = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`)
      .send({ nivel: "EMPRESA", tipoPeriodo: "MENSUAL", fechaInicio, fechaFin, metaValor: 100 });
    expect(res.status).toBe(403);
  });

  it("Un usuario sin permiso objetivos.ver recibe 403 al listar", async () => {
    const res = await request(app)
      .get("/api/objetivos")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`);
    expect(res.status).toBe(403);
  });

  it("Rechaza crear un objetivo sin metaValor ni metaVolumenKg", async () => {
    const { fechaInicio, fechaFin } = rangoFuturo();
    const res = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ nivel: "EMPRESA", tipoPeriodo: "MENSUAL", fechaInicio, fechaFin });
    expect(res.status).toBe(400);
  });

  it("Rechaza crear un objetivo con fechaFin anterior a fechaInicio", async () => {
    const res = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        nivel: "EMPRESA",
        tipoPeriodo: "MENSUAL",
        fechaInicio: "2027-02-01",
        fechaFin: "2027-01-01",
        metaValor: 100,
      });
    expect(res.status).toBe(400);
  });

  it("Rechaza nivel VENDEDOR sin vendedorSiesaRowId, y nivel EMPRESA con vendedorSiesaRowId", async () => {
    const { fechaInicio, fechaFin } = rangoFuturo();
    const sinVendedor = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ nivel: "VENDEDOR", tipoPeriodo: "MENSUAL", fechaInicio, fechaFin, metaValor: 100 });
    expect(sinVendedor.status).toBe(400);

    const conVendedorDeMas = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        nivel: "EMPRESA",
        tipoPeriodo: "MENSUAL",
        fechaInicio,
        fechaFin,
        metaValor: 100,
        vendedorSiesaRowId: 1,
      });
    expect(conVendedorDeMas.status).toBe(400);
  });

  it("Rechaza un objetivo que se traslapa en fechas con otro activo del mismo nivel", async () => {
    const base = {
      fechaInicio: new Date(Date.now() + 500 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      fechaFin: new Date(Date.now() + 530 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    };
    const primero = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ nivel: "EMPRESA", tipoPeriodo: "MENSUAL", ...base, metaValor: 100 });
    expect(primero.status).toBe(201);

    const traslapado = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        nivel: "EMPRESA",
        tipoPeriodo: "MENSUAL",
        fechaInicio: new Date(Date.now() + 515 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        fechaFin: new Date(Date.now() + 545 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        metaValor: 200,
      });
    expect(traslapado.status).toBe(409);
  });

  it("Editar un objetivo genera un registro de Auditoria con datosAnteriores/datosNuevos", async () => {
    const { fechaInicio, fechaFin } = rangoFuturo();
    const creado = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        nivel: "EMPRESA",
        tipoPeriodo: "MENSUAL",
        fechaInicio,
        fechaFin: new Date(Date.now() + 600 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        metaValor: 300,
      });
    expect(creado.status).toBe(201);

    const editado = await request(app)
      .patch(`/api/objetivos/${creado.body.id}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ metaValor: 999 });
    expect(editado.status).toBe(200);
    expect(editado.body.metaValor).toBe(999);

    const auditoria = await prisma.auditoria.findFirst({
      where: { tenantId: tenantAId, entidadId: creado.body.id, accion: "OBJETIVO_EDITADO" },
    });
    expect(auditoria).not.toBeNull();
    expect(JSON.parse(auditoria!.datosNuevos!).metaValor).toBe(999);
  });

  it("Eliminar (soft-delete) un objetivo genera Auditoria y deja de aparecer en el listado", async () => {
    const { fechaInicio, fechaFin } = rangoFuturo();
    const creado = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        nivel: "EMPRESA",
        tipoPeriodo: "MENSUAL",
        fechaInicio,
        fechaFin: new Date(Date.now() + 700 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        metaValor: 400,
      });
    expect(creado.status).toBe(201);

    const eliminado = await request(app)
      .delete(`/api/objetivos/${creado.body.id}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(eliminado.status).toBe(204);

    const listado = await request(app)
      .get("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(listado.body.some((o: any) => o.id === creado.body.id)).toBe(false);

    const auditoria = await prisma.auditoria.findFirst({
      where: { tenantId: tenantAId, entidadId: creado.body.id, accion: "OBJETIVO_ELIMINADO" },
    });
    expect(auditoria).not.toBeNull();
  });

  it("Sin siesaCiaId configurado, el resumen y el catálogo de vendedores responden disponible:false", async () => {
    const { fechaInicio, fechaFin } = rangoFuturo();
    const creado = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        nivel: "EMPRESA",
        tipoPeriodo: "MENSUAL",
        fechaInicio,
        fechaFin: new Date(Date.now() + 800 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        metaValor: 500,
      });
    expect(creado.status).toBe(201);

    const resumen = await request(app)
      .get(`/api/objetivos/${creado.body.id}/resumen`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(resumen.status).toBe(200);
    expect(resumen.body.disponible).toBe(false);

    const catalogo = await request(app)
      .get("/api/objetivos/vendedores/catalogo")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(catalogo.status).toBe(200);
    expect(catalogo.body.disponible).toBe(false);
  });

  it("El desglose por vendedor rechaza (400) un objetivo de nivel VENDEDOR", async () => {
    const { fechaInicio, fechaFin } = rangoFuturo();
    const creado = await request(app)
      .post("/api/objetivos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        nivel: "VENDEDOR",
        vendedorSiesaRowId: 42,
        vendedorSiesaNombre: "Vendedor de prueba",
        tipoPeriodo: "MENSUAL",
        fechaInicio,
        fechaFin: new Date(Date.now() + 900 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        metaValor: 600,
      });
    expect(creado.status).toBe(201);

    const vendedores = await request(app)
      .get(`/api/objetivos/${creado.body.id}/vendedores`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(vendedores.status).toBe(400);
  });

  it("Tenant B sigue viendo y operando correctamente sobre su propio objetivo", async () => {
    const res = await request(app)
      .get(`/api/objetivos/${objetivoBId}`)
      .set("Authorization", `Bearer ${tokenAdminB}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(objetivoBId);
  });
});
