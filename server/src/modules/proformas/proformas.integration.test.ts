import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración con BASE DE DATOS REAL para Proformas: consecutivo
 * (sugerido/editable/único por tenant), configuración comercial
 * (retenciones parametrizables, aislada por tenant, nunca afecta proformas
 * ya creadas), y validación de bodega contra la cia Siesa del tenant.
 *
 * A propósito, los ítems de estos tests NUNCA incluyen bodegaRowId salvo en
 * el bloque "bodegas" — así la mayoría de los casos no depende de la
 * conexión real a Siesa (crearProforma/actualizarProforma solo llaman a
 * leerBodegasSiesa cuando algún ítem trae bodegaRowId).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

function itemBase(overrides: Record<string, unknown> = {}) {
  return {
    descripcion: "Producto de prueba",
    cantidad: 10,
    precioUnitario: 1000,
    descuentoPct: 0,
    ivaPct: 19,
    ...overrides,
  };
}

describe.skipIf(!RUN)("Proformas — consecutivo, configuración comercial y bodegas", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantId: string;
  let otroTenantId: string;
  let token: string;
  let otroToken: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenant = await prisma.tenant.create({
      data: { nombre: `Test Proformas ${sufijo}`, subdomain: `test-proformas-${sufijo}` },
    });
    const otroTenant = await prisma.tenant.create({
      data: {
        nombre: `Test Proformas Otro ${sufijo}`,
        subdomain: `test-proformas-otro-${sufijo}`,
      },
    });
    tenantId = tenant.id;
    otroTenantId = otroTenant.id;

    await prisma.user.create({
      data: {
        tenantId,
        email: `admin-proformas-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Proformas",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: otroTenantId,
        email: `admin-proformas-otro-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Proformas Otro Tenant",
        isSuperadmin: true,
        activo: true,
      },
    });

    const login = async (email: string): Promise<string> => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      if (res.status !== 200 || !res.body.token) {
        throw new Error(
          `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
        );
      }
      return res.body.token as string;
    };

    token = await login(`admin-proformas-${sufijo}@test.ricosoft.local`);
    otroToken = await login(`admin-proformas-otro-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    const tenantIds = [tenantId, otroTenantId];
    await prisma.proformaItem.deleteMany({ where: { proforma: { tenantId: { in: tenantIds } } } });
    await prisma.proforma.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.configuracionComercial.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  describe("Consecutivo", () => {
    it("GET /proformas/siguiente-numero devuelve un sugerido sin reservarlo (no cambia entre llamadas si no se crea nada)", async () => {
      const primera = await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${token}`);
      expect(primera.status).toBe(200);
      expect(primera.body.numero).toBeGreaterThanOrEqual(3890);

      const segunda = await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${token}`);
      expect(segunda.body.numero).toBe(primera.body.numero);
    });

    it("permite crear con un número manual (botón 'Editar' del diálogo), y el siguiente sugerido avanza después de crear", async () => {
      const sugerido = await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${token}`);
      const numeroManual = sugerido.body.numero;

      const creada = await request(app)
        .post("/api/proformas")
        .set("Authorization", `Bearer ${token}`)
        .send({
          numero: numeroManual,
          clienteRowId: 1,
          clienteNombre: "Cliente de prueba",
          moneda: "PESOS",
          items: [itemBase()],
        });
      expect(creada.status).toBe(201);
      expect(creada.body.numero).toBe(numeroManual);
      // Totales calculados por el backend, no enviados por el cliente.
      expect(creada.body.totalBruto).toBe(10000);
      expect(creada.body.subtotal).toBe(10000);
      expect(creada.body.iva).toBe(1900);
      expect(creada.body.total).toBe(11900);

      const siguiente = await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${token}`);
      expect(siguiente.body.numero).toBe(numeroManual + 1);
    });

    it("número duplicado (mismo tenant) devuelve 409 con mensaje claro", async () => {
      const sugerido = await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${token}`);
      const numero = sugerido.body.numero;

      const primera = await request(app)
        .post("/api/proformas")
        .set("Authorization", `Bearer ${token}`)
        .send({
          numero,
          clienteRowId: 1,
          clienteNombre: "Cliente A",
          items: [itemBase()],
        });
      expect(primera.status).toBe(201);

      const duplicada = await request(app)
        .post("/api/proformas")
        .set("Authorization", `Bearer ${token}`)
        .send({
          numero,
          clienteRowId: 2,
          clienteNombre: "Cliente B",
          items: [itemBase()],
        });
      expect(duplicada.status).toBe(409);
      expect(duplicada.body.message).toMatch(new RegExp(String(numero)));
    });

    it("el mismo número no colisiona entre tenants distintos (aislamiento por tenantId)", async () => {
      const sugeridoA = await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${token}`);
      const sugeridoB = await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${otroToken}`);

      // Fuerza que ambos tenants intenten el MISMO número explícito.
      const numeroComun = Math.max(sugeridoA.body.numero, sugeridoB.body.numero);

      const creadaA = await request(app)
        .post("/api/proformas")
        .set("Authorization", `Bearer ${token}`)
        .send({
          numero: numeroComun,
          clienteRowId: 1,
          clienteNombre: "Cliente tenant A",
          items: [itemBase()],
        });
      const creadaB = await request(app)
        .post("/api/proformas")
        .set("Authorization", `Bearer ${otroToken}`)
        .send({
          numero: numeroComun,
          clienteRowId: 1,
          clienteNombre: "Cliente tenant B",
          items: [itemBase()],
        });

      expect(creadaA.status).toBe(201);
      expect(creadaB.status).toBe(201);
      expect(creadaA.body.numero).toBe(creadaB.body.numero);
      expect(creadaA.body.tenantId).toBe(tenantId);
      expect(creadaB.body.tenantId).toBe(otroTenantId);
    });

    it("dos creaciones simultáneas SIN número manual nunca terminan con el mismo número (condición de carrera real del cálculo automático, sin findFirst previo)", async () => {
      const [a, b] = await Promise.all([
        request(app)
          .post("/api/proformas")
          .set("Authorization", `Bearer ${token}`)
          .send({ clienteRowId: 1, clienteNombre: "Carrera A", items: [itemBase()] }),
        request(app)
          .post("/api/proformas")
          .set("Authorization", `Bearer ${token}`)
          .send({ clienteRowId: 1, clienteNombre: "Carrera B", items: [itemBase()] }),
      ]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.numero).not.toBe(b.body.numero);
    });

    it("sin número explícito conserva el comportamiento automático anterior", async () => {
      const sugerido = await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${token}`);

      const creada = await request(app)
        .post("/api/proformas")
        .set("Authorization", `Bearer ${token}`)
        .send({
          clienteRowId: 1,
          clienteNombre: "Cliente sin número manual",
          items: [itemBase()],
        });
      expect(creada.status).toBe(201);
      expect(creada.body.numero).toBe(sugerido.body.numero);
    });
  });

  describe("Configuración comercial", () => {
    it("sin configurar, devuelve los defaults documentados (2.5 / 15 / 0.7)", async () => {
      const res = await request(app)
        .get("/api/proformas/configuracion-comercial")
        .set("Authorization", `Bearer ${otroToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        retencionFuentePct: 2.5,
        retencionIvaPct: 15,
        retencionIcaPct: 0.7,
      });
    });

    it("PUT actualiza la configuración del tenant, y GET la refleja de inmediato", async () => {
      const put = await request(app)
        .put("/api/proformas/configuracion-comercial")
        .set("Authorization", `Bearer ${token}`)
        .send({ retencionFuentePct: 3, retencionIvaPct: 20, retencionIcaPct: 1 });
      expect(put.status).toBe(200);
      expect(put.body).toMatchObject({ retencionFuentePct: 3, retencionIvaPct: 20, retencionIcaPct: 1 });

      const get = await request(app)
        .get("/api/proformas/configuracion-comercial")
        .set("Authorization", `Bearer ${token}`);
      expect(get.body).toMatchObject({ retencionFuentePct: 3, retencionIvaPct: 20, retencionIcaPct: 1 });
    });

    it("cambiar la configuración NO afecta proformas ya creadas (snapshot conservado)", async () => {
      const sugerido = await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${token}`);

      const creada = await request(app)
        .post("/api/proformas")
        .set("Authorization", `Bearer ${token}`)
        .send({
          numero: sugerido.body.numero,
          clienteRowId: 1,
          clienteNombre: "Cliente snapshot",
          aplicaRetencion: true,
          retencionPct: 2.5,
          items: [itemBase()],
        });
      expect(creada.status).toBe(201);
      expect(creada.body.retencionPct).toBe(2.5);

      await request(app)
        .put("/api/proformas/configuracion-comercial")
        .set("Authorization", `Bearer ${token}`)
        .send({ retencionFuentePct: 9, retencionIvaPct: 9, retencionIcaPct: 9 });

      const releida = await request(app)
        .get(`/api/proformas/${creada.body.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(releida.body.retencionPct).toBe(2.5); // NO 9 — snapshot, no lectura en vivo.
    });

    it("la configuración comercial está aislada por tenant", async () => {
      const configA = await request(app)
        .get("/api/proformas/configuracion-comercial")
        .set("Authorization", `Bearer ${token}`);
      const configB = await request(app)
        .get("/api/proformas/configuracion-comercial")
        .set("Authorization", `Bearer ${otroToken}`);
      // El tenant A ya modificó la suya en el test anterior; el tenant B sigue en default.
      expect(configA.body.retencionFuentePct).not.toBe(configB.body.retencionFuentePct);
      expect(configB.body).toMatchObject({
        retencionFuentePct: 2.5,
        retencionIvaPct: 15,
        retencionIcaPct: 0.7,
      });
    });
  });

  describe("Bodegas", () => {
    it("GET /proformas/bodegas responde 'no disponible' para un tenant sin Siesa configurado", async () => {
      const res = await request(app)
        .get("/api/proformas/bodegas")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(false);
      expect(res.body.bodegas).toEqual([]);
    });

    it("un ítem con bodegaRowId en un tenant sin Siesa configurado se rechaza con 400 (nunca se guarda sin validar)", async () => {
      const sugerido = await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .post("/api/proformas")
        .set("Authorization", `Bearer ${token}`)
        .send({
          numero: sugerido.body.numero,
          clienteRowId: 1,
          clienteNombre: "Cliente con bodega inventada",
          items: [itemBase({ bodegaRowId: 999999 })],
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Siesa/i);
    });
  });
});
