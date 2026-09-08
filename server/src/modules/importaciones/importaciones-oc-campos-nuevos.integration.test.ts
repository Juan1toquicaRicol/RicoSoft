import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Mejora del modal "Nueva Orden de Compra Internacional": referencia/unidad
 * de medida por ítem, forma de pago de la orden, y el endpoint de TRM
 * oficial (Banco de la República vía datos.gov.co). Todos los campos nuevos
 * son opcionales a nivel de BD (migración
 * 20260908170000_orden_compra_intl_uom_referencia_pago) — la compatibilidad
 * hacia atrás (crear una orden sin ellos) ya la cubre
 * importaciones.integration.test.ts; esta suite solo agrega lo nuevo.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Importaciones — campos nuevos de la OC + TRM oficial (BD real)", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantId: string;
  let token: string;

  const datosBase = {
    incoterm: "FOB",
    proveedorExtranjero: "Proveedor Resinas Ltda",
    paisOrigen: "China",
    moneda: "USD",
    trmPactada: 4000,
  };

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { nombre: `OC Campos Nuevos ${sufijo}`, subdomain: `test-oc-nuevos-${sufijo}` },
    });
    tenantId = tenant.id;
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await prisma.user.create({
      data: {
        tenantId,
        email: `oc-nuevos-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin OC",
        isSuperadmin: true,
        activo: true,
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: `oc-nuevos-${sufijo}@test.ricosoft.local`, password: PASSWORD });
    token = login.body.token;
  });

  afterAll(async () => {
    await prisma.itemOrdenCompraIntl.deleteMany({
      where: { ordenCompra: { tenantId } },
    });
    await prisma.importacionActividad.deleteMany({ where: { tenantId } });
    await prisma.ordenCompraIntl.deleteMany({ where: { tenantId } });
    await prisma.auditoria.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.rol.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("1. crea una orden con referencia, unidadMedida y formaPago — persisten correctamente", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-NUEVOS-1-${sufijo}`,
        formaPago: "Carta de crédito",
        items: [
          {
            descripcion: "Carbonato RICOL PE",
            referencia: "HUNH1024",
            unidadMedida: "KG",
            cantidad: 12000,
            pesoKg: 12000,
            valorUnitarioFob: 2.43,
          },
        ],
      });
    expect(res.status).toBe(201);

    const orden = await prisma.ordenCompraIntl.findUnique({
      where: { id: res.body.id },
      include: { items: true },
    });
    expect(orden?.formaPago).toBe("Carta de crédito");
    expect(orden?.items[0].referencia).toBe("HUNH1024");
    expect(orden?.items[0].unidadMedida).toBe("KG");
    expect(Number(orden?.items[0].pesoKg)).toBe(12000);
  });

  it("2. rechaza una unidad de medida inválida (400), no crea la orden", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-NUEVOS-2-${sufijo}`,
        items: [{ descripcion: "Ítem", unidadMedida: "LIBRAS", cantidad: 10, valorUnitarioFob: 5 }],
      });
    expect(res.status).toBe(400);

    const noCreada = await prisma.ordenCompraIntl.findFirst({
      where: { tenantId, numeroOrden: `OC-NUEVOS-2-${sufijo}` },
    });
    expect(noCreada).toBeNull();
  });

  it("3. rechaza una forma de pago inválida (400), no crea la orden", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-NUEVOS-3-${sufijo}`,
        formaPago: "Trueque",
        items: [{ descripcion: "Ítem", cantidad: 10, valorUnitarioFob: 5 }],
      });
    expect(res.status).toBe(400);

    const noCreada = await prisma.ordenCompraIntl.findFirst({
      where: { tenantId, numeroOrden: `OC-NUEVOS-3-${sufijo}` },
    });
    expect(noCreada).toBeNull();
  });

  it("4. crea una orden SIN los campos nuevos (compatibilidad hacia atrás) — quedan null", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-NUEVOS-4-${sufijo}`,
        items: [{ descripcion: "Ítem sin extras", cantidad: 5, valorUnitarioFob: 10 }],
      });
    expect(res.status).toBe(201);

    const orden = await prisma.ordenCompraIntl.findUnique({
      where: { id: res.body.id },
      include: { items: true },
    });
    expect(orden?.formaPago).toBeNull();
    expect(orden?.items[0].referencia).toBeNull();
    expect(orden?.items[0].unidadMedida).toBeNull();
  });

  it("5. GET /importaciones/trm-oficial devuelve la TRM vigente del Banco de la República (servicio externo real)", async () => {
    const res = await request(app)
      .get("/api/importaciones/trm-oficial")
      .set("Authorization", `Bearer ${token}`);
    // Este endpoint depende de un servicio externo real (datos.gov.co) — si
    // no responde, el controller devuelve 502 (no 500), nunca tumba nada.
    // Se acepta cualquiera de los dos para no volver la suite flaky por una
    // caída puntual de un tercero fuera de nuestro control.
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      expect(typeof res.body.valor).toBe("number");
      expect(res.body.valor).toBeGreaterThan(0);
    }
  });

  it("7. GET /importaciones/items-siesa/buscar — tenant sin siesaCiaId responde disponible:false (nunca rompe el formulario)", async () => {
    const res = await request(app)
      .get("/api/importaciones/items-siesa/buscar")
      .set("Authorization", `Bearer ${token}`)
      .query({ search: "resina" });
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
    expect(res.body.items).toEqual([]);
  });

  it("8. GET /importaciones/items-siesa/buscar — rechaza una búsqueda de menos de 2 caracteres (400)", async () => {
    const res = await request(app)
      .get("/api/importaciones/items-siesa/buscar")
      .set("Authorization", `Bearer ${token}`)
      .query({ search: "a" });
    expect(res.status).toBe(400);
  });

  it("6. un usuario sin permiso IMPORTACIONES_VER recibe 403 en trm-oficial", async () => {
    const rolSinPermiso = await prisma.rol.create({
      data: { tenantId, nombre: `Sin Permiso OC ${sufijo}`, permisos: JSON.stringify([]) },
    });
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await prisma.user.create({
      data: {
        tenantId,
        email: `oc-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        rolId: rolSinPermiso.id,
        isSuperadmin: false,
        activo: true,
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: `oc-sinpermiso-${sufijo}@test.ricosoft.local`, password: PASSWORD });

    const res = await request(app)
      .get("/api/importaciones/trm-oficial")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);

    const busqueda = await request(app)
      .get("/api/importaciones/items-siesa/buscar")
      .set("Authorization", `Bearer ${login.body.token}`)
      .query({ search: "resina" });
    expect(busqueda.status).toBe(403);
  });
});
