import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración con BASE DE DATOS REAL para el módulo Comercial →
 * Gestión Comercial (Cotizacion, PedidoComercial, y su integración con la
 * Proforma ya existente). Cubre los 16 puntos mínimos de la sección 24 del
 * encargo. Se salta si RUN_DB_INTEGRATION_TESTS no está en "true", mismo
 * patrón que proformas.integration.test.ts.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

function itemBase(overrides: Record<string, unknown> = {}) {
  return {
    descripcion: "Producto comercial de prueba",
    cantidad: 10,
    precioUnitario: 1000,
    descuentoPct: 0,
    ivaPct: 19,
    ...overrides,
  };
}

describe.skipIf(!RUN)("Comercial — Cotizaciones, Pedidos, y cadena con Proforma", () => {
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
      data: { nombre: `Test Comercial ${sufijo}`, subdomain: `test-comercial-${sufijo}` },
    });
    const otroTenant = await prisma.tenant.create({
      data: { nombre: `Test Comercial Otro ${sufijo}`, subdomain: `test-comercial-otro-${sufijo}` },
    });
    tenantId = tenant.id;
    otroTenantId = otroTenant.id;

    await prisma.user.create({
      data: {
        tenantId,
        email: `admin-comercial-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Comercial",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: otroTenantId,
        email: `admin-comercial-otro-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Comercial Otro Tenant",
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

    token = await login(`admin-comercial-${sufijo}@test.ricosoft.local`);
    otroToken = await login(`admin-comercial-otro-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    const tenantIds = [tenantId, otroTenantId];
    await prisma.pedidoComercialItem.deleteMany({
      where: { pedido: { tenantId: { in: tenantIds } } },
    });
    await prisma.pedidoComercial.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.proformaItem.deleteMany({ where: { proforma: { tenantId: { in: tenantIds } } } });
    await prisma.proforma.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.cotizacionItem.deleteMany({
      where: { cotizacion: { tenantId: { in: tenantIds } } },
    });
    await prisma.cotizacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.configuracionComercial.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  // 1, 2, 3, 4 — crear cotización, con items, totales correctos, consecutivo único por tenant
  describe("Cotizaciones", () => {
    it("crea una cotización con items y calcula los totales en backend", async () => {
      const res = await request(app)
        .post("/api/comercial/cotizaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({
          clienteRowId: 1001,
          clienteNombre: "Cliente Prueba SAS",
          vendedorNombre: "Vendedor Uno",
          items: [itemBase(), itemBase({ cantidad: 2, precioUnitario: 500, descuentoPct: 10 })],
        });

      expect(res.status).toBe(201);
      expect(res.body.estado).toBe("BORRADOR");
      expect(res.body.items).toHaveLength(2);
      // bruto = 10*1000 + 2*500 = 11000 ; descuento línea2 = 2*500*0.10=100
      // subtotal = 11000-100=10900 ; iva = 10*1000*0.19 + (1000-100)*0.19 = 1900+171=2071
      expect(res.body.subtotal).toBeCloseTo(10900, 2);
      expect(res.body.impuestos).toBeCloseTo(2071, 2);
      expect(res.body.total).toBeCloseTo(10900 + 2071, 2);
      expect(res.body.numeroFormateado).toMatch(/^COT-\d{5}$/);
    });

    it("el consecutivo de cotización es único por tenant (avanza tras crear)", async () => {
      const primera = await request(app)
        .post("/api/comercial/cotizaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({ clienteRowId: 1002, clienteNombre: "Cliente A", items: [itemBase()] });
      const segunda = await request(app)
        .post("/api/comercial/cotizaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({ clienteRowId: 1003, clienteNombre: "Cliente B", items: [itemBase()] });

      expect(segunda.body.numero).toBe(primera.body.numero + 1);

      // Choque explícito de número manual -> 409
      const conflicto = await request(app)
        .post("/api/comercial/cotizaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({
          numero: primera.body.numero,
          clienteRowId: 1004,
          clienteNombre: "Cliente C",
          items: [itemBase()],
        });
      expect(conflicto.status).toBe(409);
    });
  });

  // 11 — cambio de estados (transiciones válidas/ inválidas)
  describe("Estados de Cotización", () => {
    it("valida las transiciones: BORRADOR -> ENVIADA -> APROBADA, y rechaza saltos inválidos", async () => {
      const crear = await request(app)
        .post("/api/comercial/cotizaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({ clienteRowId: 1005, clienteNombre: "Cliente Estados", items: [itemBase()] });
      const id = crear.body.id;

      const saltoInvalido = await request(app)
        .post(`/api/comercial/cotizaciones/${id}/aprobar`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(saltoInvalido.status).toBe(400);

      const enviar = await request(app)
        .post(`/api/comercial/cotizaciones/${id}/enviar`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(enviar.status).toBe(200);
      expect(enviar.body.estado).toBe("ENVIADA");

      const aprobar = await request(app)
        .post(`/api/comercial/cotizaciones/${id}/aprobar`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(aprobar.status).toBe(200);
      expect(aprobar.body.estado).toBe("APROBADA");
    });
  });

  // 5, 6, 8, 12, 14 — Proforma desde Cotización, anti-duplicado, cadena completa, snapshots, detalle con relacionados
  describe("Cadena Cotización → Proforma → Pedido", () => {
    /** Una Proforma nace ENVIADA; solo una ACEPTADA puede originar un Pedido. */
    const aceptar = (id: string) =>
      request(app)
        .post(`/api/proformas/${id}/aceptar`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

    it("crea una Proforma desde una Cotización (reutilizando el endpoint de Proforma), bloquea una segunda activa, y permite Pedido desde la Proforma", async () => {
      const crearCot = await request(app)
        .post("/api/comercial/cotizaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({
          clienteRowId: 2001,
          clienteNombre: "Cliente Cadena SAS",
          vendedorNombre: "Vendedor Cadena",
          items: [itemBase({ cantidad: 5, precioUnitario: 2000 })],
        });
      const cotizacionId = crearCot.body.id;

      // 5: crear Proforma desde Cotización
      const crearProforma = await request(app)
        .post(`/api/comercial/cotizaciones/${cotizacionId}/proforma`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(crearProforma.status).toBe(201);
      expect(crearProforma.body.cotizacionId).toBe(cotizacionId);
      expect(crearProforma.body.cotizacionNumero).toBe(crearCot.body.numeroFormateado);
      const proformaId = crearProforma.body.id;

      // La cotización queda CONVERTIDA
      const cotizacionActualizada = await request(app)
        .get(`/api/comercial/cotizaciones/${cotizacionId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(cotizacionActualizada.body.estado).toBe("CONVERTIDA");
      expect(cotizacionActualizada.body.proformas).toHaveLength(1);

      // 6: anti-duplicado — no permite una segunda Proforma ACTIVA para la misma Cotización
      const segundaProforma = await request(app)
        .post(`/api/comercial/cotizaciones/${cotizacionId}/proforma`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(segundaProforma.status).toBe(409);

      // Una proforma ENVIADA todavía NO puede originar un pedido...
      expect(crearProforma.body.estado).toBe("ENVIADA");
      const prematuro = await request(app)
        .post(`/api/comercial/proformas/${proformaId}/pedido`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(prematuro.status).toBe(409);

      // 7: ...hay que aceptarla primero; luego crear el Pedido
      expect((await aceptar(proformaId)).status).toBe(200);
      const crearPedido = await request(app)
        .post(`/api/comercial/proformas/${proformaId}/pedido`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(crearPedido.status).toBe(201);
      expect(crearPedido.body.proformaId).toBe(proformaId);
      expect(crearPedido.body.cotizacionId).toBe(cotizacionId);
      expect(crearPedido.body.numeroFormateado).toMatch(/^PC-\d{5}$/);
      expect(crearPedido.body.items).toHaveLength(1);
      expect(Number(crearPedido.body.items[0].cantidad)).toBe(5);

      // 8: cadena completa reflejada en el detalle de Proforma (documentos relacionados)
      const detalleProforma = await request(app)
        .get(`/api/proformas/${proformaId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(detalleProforma.body.cotizacion.id).toBe(cotizacionId);
      expect(detalleProforma.body.pedidosComerciales).toHaveLength(1);
      expect(detalleProforma.body.pedidosComerciales[0].id).toBe(crearPedido.body.id);

      // La proforma quedó PEDIDO_CREADO (inmutable): no se puede anular ni
      // volver a aceptar, y el pedido conserva su snapshot.
      expect(detalleProforma.body.estado).toBe("PEDIDO_CREADO");
      const anularInmutable = await request(app)
        .post(`/api/proformas/${proformaId}/anular`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(anularInmutable.status).toBe(409);
      expect((await aceptar(proformaId)).status).toBe(409);
      const pedidoIntacto = await request(app)
        .get(`/api/comercial/pedidos/${crearPedido.body.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(pedidoIntacto.body.estado).toBe("BORRADOR");
      expect(Number(pedidoIntacto.body.items[0].cantidad)).toBe(5);

      // Una proforma PEDIDO_CREADO sigue bloqueando otra proforma sobre la misma cotización
      const otraProforma = await request(app)
        .post(`/api/comercial/cotizaciones/${cotizacionId}/proforma`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(otraProforma.status).toBe(409);
    });

    it("anular una proforma ENVIADA libera la cotización para una nueva proforma", async () => {
      const cot = await request(app)
        .post("/api/comercial/cotizaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({ clienteRowId: 2009, clienteNombre: "Cliente Libera", items: [itemBase()] });
      const prof = await request(app)
        .post(`/api/comercial/cotizaciones/${cot.body.id}/proforma`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(prof.status).toBe(201);
      const anular = await request(app)
        .post(`/api/proformas/${prof.body.id}/anular`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(anular.status).toBe(200);
      expect(anular.body.estado).toBe("ANULADA");

      const nueva = await request(app)
        .post(`/api/comercial/cotizaciones/${cot.body.id}/proforma`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(nueva.status).toBe(201);
    });

    it("no permite crear un Pedido desde una Proforma anulada", async () => {
      const crearCot = await request(app)
        .post("/api/comercial/cotizaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({ clienteRowId: 2002, clienteNombre: "Cliente X", items: [itemBase()] });
      const crearProforma = await request(app)
        .post(`/api/comercial/cotizaciones/${crearCot.body.id}/proforma`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      await request(app)
        .post(`/api/proformas/${crearProforma.body.id}/anular`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      const pedido = await request(app)
        .post(`/api/comercial/proformas/${crearProforma.body.id}/pedido`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(pedido.status).toBe(409);
    });
  });

  // 10, 11 — anular documento / cambio de estados de Pedido
  describe("Estados de Pedido", () => {
    it("valida las transiciones BORRADOR -> CONFIRMADO -> LISTO_PARA_ERP y anular", async () => {
      const crearCot = await request(app)
        .post("/api/comercial/cotizaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({ clienteRowId: 2003, clienteNombre: "Cliente Pedido Estados", items: [itemBase()] });
      const crearProforma = await request(app)
        .post(`/api/comercial/cotizaciones/${crearCot.body.id}/proforma`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      await request(app)
        .post(`/api/proformas/${crearProforma.body.id}/aceptar`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      const crearPedido = await request(app)
        .post(`/api/comercial/proformas/${crearProforma.body.id}/pedido`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      const pedidoId = crearPedido.body.id;

      const listoInvalido = await request(app)
        .post(`/api/comercial/pedidos/${pedidoId}/listo-erp`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(listoInvalido.status).toBe(400);

      const confirmar = await request(app)
        .post(`/api/comercial/pedidos/${pedidoId}/confirmar`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(confirmar.body.estado).toBe("CONFIRMADO");

      const listo = await request(app)
        .post(`/api/comercial/pedidos/${pedidoId}/listo-erp`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(listo.body.estado).toBe("LISTO_PARA_ERP");

      const anular = await request(app)
        .post(`/api/comercial/pedidos/${pedidoId}/anular`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(anular.body.estado).toBe("ANULADO");
    });
  });

  // 9 — aislamiento multi-tenant en relaciones cruzadas
  describe("Multi-tenant", () => {
    it("no permite ver una cotización de otro tenant, ni crear un pedido cruzando tenants", async () => {
      const crearCot = await request(app)
        .post("/api/comercial/cotizaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({ clienteRowId: 3001, clienteNombre: "Cliente Tenant A", items: [itemBase()] });

      const verDesdeOtroTenant = await request(app)
        .get(`/api/comercial/cotizaciones/${crearCot.body.id}`)
        .set("Authorization", `Bearer ${otroToken}`);
      expect(verDesdeOtroTenant.status).toBe(404);

      const proformaCruzada = await request(app)
        .post(`/api/comercial/cotizaciones/${crearCot.body.id}/proforma`)
        .set("Authorization", `Bearer ${otroToken}`)
        .send({});
      expect(proformaCruzada.status).toBe(404);
    });
  });

  // 13 — listados paginados
  describe("Listados paginados", () => {
    it("GET /comercial/cotizaciones y /comercial/pedidos y /comercial/documentos siempre paginan", async () => {
      const cotizaciones = await request(app)
        .get("/api/comercial/cotizaciones?page=1&pageSize=2")
        .set("Authorization", `Bearer ${token}`);
      expect(cotizaciones.status).toBe(200);
      expect(cotizaciones.body.items.length).toBeLessThanOrEqual(2);
      expect(cotizaciones.body).toHaveProperty("total");

      const documentos = await request(app)
        .get("/api/comercial/documentos?page=1&pageSize=5")
        .set("Authorization", `Bearer ${token}`);
      expect(documentos.status).toBe(200);
      expect(documentos.body.items.length).toBeLessThanOrEqual(5);
      expect(documentos.body).toHaveProperty("total");
    });
  });

  // 15 — regresión de Proformas actuales: crear una proforma "clásica" (sin cotización interna) sigue funcionando igual
  describe("Regresión de Proformas existentes", () => {
    it("sigue permitiendo crear una Proforma manual sin cotización interna ni externa", async () => {
      const res = await request(app)
        .post("/api/proformas")
        .set("Authorization", `Bearer ${token}`)
        .send({
          clienteRowId: 4001,
          clienteNombre: "Cliente Manual",
          items: [itemBase()],
        });
      expect(res.status).toBe(201);
      expect(res.body.cotizacionId).toBeNull();
      expect(res.body.estado).toBe("ENVIADA");
    });
  });
});
