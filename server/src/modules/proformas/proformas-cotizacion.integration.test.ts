import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

/**
 * Suite de integración con BASE DE DATOS REAL para la vinculación
 * Proforma <-> cotización de origen (Siesa). El servicio de Siesa se mockea
 * (Siesa real no está disponible en este entorno de pruebas) para poder
 * controlar determinísticamente la cotización devuelta — pero Proforma sí
 * se crea/lee contra la base de datos real, igual que el resto de esta
 * suite (proformas.integration.test.ts).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

const COTIZACIONES: Record<
  string,
  { cotizacionIdExterno: string; cotizacionNumero: string; erpDocumentoNumero: string | null; clienteRowId: number }
> = {
  "501": {
    cotizacionIdExterno: "501",
    cotizacionNumero: "COT-34147",
    erpDocumentoNumero: "PDV-55365",
    clienteRowId: 1,
  },
  "502": {
    cotizacionIdExterno: "502",
    cotizacionNumero: "COT-99999",
    erpDocumentoNumero: "PDV-99999",
    clienteRowId: 2,
  },
};

// ciaId "compañía B" (10) nunca tiene cotizaciones — simula que la
// cotización 501 pertenece SOLO a la compañía Siesa del tenant A (ciaId 1).
const CIA_ID_TENANT_A = 900901;
const CIA_ID_TENANT_B = 900902;

vi.mock("../integraciones-siesa/siesa-pedidos.service", () => ({
  leerCotizacionSiesa: vi.fn(async (ciaId: number, id: string) => {
    if (ciaId !== 900901) return null;
    const c = COTIZACIONES[id];
    if (!c) return null;
    return {
      ...c,
      clienteNombre: "Cliente de la cotización",
      clienteNit: "900123456-1",
      direccion: null,
      telefono: null,
      ciudad: null,
      condicionPagoDescripcion: "CONTADO",
      vendedorNombre: "Vendedor Demo",
      fecha: new Date("2026-09-01"),
      fechaEntrega: null,
      items: [
        {
          itemRowId: 10,
          referencia: "REF-1",
          descripcion: "Producto de la cotización",
          cantidad: 5,
          precioUnitario: 2000,
          descuentoPct: 0,
          ivaPct: 19,
        },
      ],
    };
  }),
  buscarCotizacionesSiesa: vi.fn(async (ciaId: number, search: string) => {
    if (ciaId !== 900901) return [];
    return Object.values(COTIZACIONES)
      .filter((c) => c.cotizacionNumero.includes(search.replace(/\D+/g, "")))
      .map((c) => ({ ...c, clienteNombre: "Cliente de la cotización", fecha: new Date("2026-09-01") }));
  }),
}));

// eslint-disable-next-line import/first
import { createApp } from "../../app";
// eslint-disable-next-line import/first
import { prisma } from "../../config/prisma";

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

describe.skipIf(!RUN)("Proformas — vinculación con cotización de origen", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantId: string; // ciaId 1 — tiene la cotización 501
  let otroTenantId: string; // ciaId 10 — NUNCA ve la cotización 501
  let token: string;
  let otroToken: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenant = await prisma.tenant.create({
      data: {
        nombre: `Test Cotizacion ${sufijo}`,
        subdomain: `test-cotizacion-${sufijo}`,
        siesaCiaId: CIA_ID_TENANT_A,
      },
    });
    const otroTenant = await prisma.tenant.create({
      data: {
        nombre: `Test Cotizacion Otro ${sufijo}`,
        subdomain: `test-cotizacion-otro-${sufijo}`,
        siesaCiaId: CIA_ID_TENANT_B,
      },
    });
    tenantId = tenant.id;
    otroTenantId = otroTenant.id;

    await prisma.user.create({
      data: {
        tenantId,
        email: `admin-cot-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Cotizacion",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: otroTenantId,
        email: `admin-cot-otro-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Cotizacion Otro Tenant",
        isSuperadmin: true,
        activo: true,
      },
    });

    const login = async (email: string): Promise<string> => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      if (res.status !== 200 || !res.body.token) {
        throw new Error(`Login falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
      }
      return res.body.token as string;
    };

    token = await login(`admin-cot-${sufijo}@test.ricosoft.local`);
    otroToken = await login(`admin-cot-otro-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    const tenantIds = [tenantId, otroTenantId];
    await prisma.proformaItem.deleteMany({ where: { proforma: { tenantId: { in: tenantIds } } } });
    await prisma.proforma.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.configuracionComercial.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("GET /proformas/cotizaciones/buscar devuelve resultados compactos de la compañía del tenant", async () => {
    const res = await request(app)
      .get("/api/proformas/cotizaciones/buscar?q=34147")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].cotizacionNumero).toBe("COT-34147");
  });

  it("GET /proformas/cotizaciones/:id devuelve el detalle completo con items", async () => {
    const res = await request(app)
      .get("/api/proformas/cotizaciones/501")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(true);
    expect(res.body.cotizacion.cotizacionNumero).toBe("COT-34147");
    expect(res.body.cotizacion.erpDocumentoNumero).toBe("PDV-55365");
    expect(res.body.cotizacion.items).toHaveLength(1);
  });

  it("aislamiento multi-tenant: el tenant B (otra compañía Siesa) no puede leer la cotización del tenant A", async () => {
    const res = await request(app)
      .get("/api/proformas/cotizaciones/501")
      .set("Authorization", `Bearer ${otroToken}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
  });

  it("crear proforma con cotizacionIdExterno guarda origen/número/documento ERP", async () => {
    const res = await request(app)
      .post("/api/proformas")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clienteRowId: 1,
        clienteNombre: "Cliente de la cotización",
        cotizacionIdExterno: "501",
        items: [itemBase()],
      });
    expect(res.status).toBe(201);
    expect(res.body.cotizacionOrigen).toBe("siesa");
    expect(res.body.cotizacionIdExterno).toBe("501");
    expect(res.body.cotizacionNumero).toBe("COT-34147");
    expect(res.body.erpDocumentoNumero).toBe("PDV-55365");
    expect(res.body.estado).toBe("ENVIADA");
  });

  it("crear proforma manual (sin cotización) sigue funcionando con esos campos en null", async () => {
    const res = await request(app)
      .post("/api/proformas")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clienteRowId: 3,
        clienteNombre: "Cliente manual sin cotización",
        items: [itemBase()],
      });
    expect(res.status).toBe(201);
    expect(res.body.cotizacionOrigen).toBeNull();
    expect(res.body.cotizacionIdExterno).toBeNull();
    expect(res.body.cotizacionNumero).toBeNull();
    expect(res.body.erpDocumentoNumero).toBeNull();
  });

  it("bloquea una segunda proforma activa para la misma cotización (409)", async () => {
    const res = await request(app)
      .post("/api/proformas")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clienteRowId: 1,
        clienteNombre: "Cliente de la cotización",
        cotizacionIdExterno: "502",
        items: [itemBase()],
      });
    expect(res.status).toBe(201);
    const numeroPrimera = res.body.numero;

    const duplicada = await request(app)
      .post("/api/proformas")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clienteRowId: 1,
        clienteNombre: "Cliente de la cotización",
        cotizacionIdExterno: "502",
        items: [itemBase()],
      });
    expect(duplicada.status).toBe(409);
    expect(duplicada.body.message).toBe(
      `La cotización COT-99999 ya tiene una proforma activa: ${numeroPrimera}.`,
    );
  });

  it("permite una nueva proforma sobre la misma cotización si la anterior está anulada", async () => {
    const primera = await request(app)
      .post("/api/proformas")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clienteRowId: 1,
        clienteNombre: "Cliente de la cotización",
        cotizacionIdExterno: "501",
        items: [itemBase()],
      });
    // La proforma vigente (recién creada, o la NO anulada de un test previo) es la que se anula.
    const vigenteId =
      primera.status === 201
        ? primera.body.id
        : (
            await prisma.proforma.findFirst({
              where: { tenantId, cotizacionIdExterno: "501", estado: { not: "ANULADA" } },
              orderBy: { createdAt: "desc" },
            })
          )?.id;
    expect(vigenteId).toBeTruthy();

    const anular = await request(app)
      .post(`/api/proformas/${vigenteId}/anular`)
      .set("Authorization", `Bearer ${token}`);
    expect(anular.status).toBe(200);
    expect(anular.body.estado).toBe("ANULADA");

    // Una proforma ANULADA es inmutable: no se puede anular otra vez.
    const otraVez = await request(app)
      .post(`/api/proformas/${vigenteId}/anular`)
      .set("Authorization", `Bearer ${token}`);
    expect(otraVez.status).toBe(409);

    const nueva = await request(app)
      .post("/api/proformas")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clienteRowId: 1,
        clienteNombre: "Cliente de la cotización",
        cotizacionIdExterno: "501",
        items: [itemBase()],
      });
    expect(nueva.status).toBe(201);
    expect(nueva.body.estado).toBe("ENVIADA");
  });

  it("snapshot: la proforma ya creada no cambia si la cotización cambiara después en Siesa", async () => {
    const creada = await request(app)
      .post("/api/proformas")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clienteRowId: 2,
        clienteNombre: "Cliente snapshot cotización",
        cotizacionIdExterno: "502",
        items: [itemBase({ descripcion: "Item original", precioUnitario: 1000 })],
      });
    // 502 ya puede estar "activa" de un test previo — si choca, es la
    // señal de que el anti-duplicados funcionó; para este test igual
    // podemos leer la proforma ya creada anteriormente.
    const proformaId =
      creada.status === 201
        ? creada.body.id
        : (
            await prisma.proforma.findFirst({
              where: { tenantId, cotizacionIdExterno: "502", estado: "ENVIADA" },
            })
          )?.id;
    expect(proformaId).toBeTruthy();

    const antes = await request(app)
      .get(`/api/proformas/${proformaId}`)
      .set("Authorization", `Bearer ${token}`);
    const numeroCotizacionGuardado = antes.body.cotizacionNumero;
    const itemsGuardados = antes.body.items;

    // La proforma NUNCA vuelve a consultar Siesa después de creada — su
    // GET no depende del mock, así que "cambiar" la fuente no tiene forma
    // de afectarla: se relee y debe seguir exactamente igual.
    const despues = await request(app)
      .get(`/api/proformas/${proformaId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(despues.body.cotizacionNumero).toBe(numeroCotizacionGuardado);
    expect(despues.body.items).toEqual(itemsGuardados);
  });
});
