import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Mejora del módulo de Importaciones: proveedor real (con trazabilidad
 * Siesa vía Proveedor.siesaTerceroRowId, reutilizando el catálogo/búsqueda
 * ya existente de GET /proveedores — no se duplicó esa integración) y país
 * de origen normalizado (catálogo cerrado PAISES_VALIDOS, mismo patrón que
 * incoterm/moneda).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Importaciones — proveedor real + país normalizado (BD real)", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let tokenA: string;
  let proveedorAId: string;
  let proveedorBId: string;

  const datosBase = {
    incoterm: "FOB",
    moneda: "USD",
    trmPactada: 4000,
    items: [{ descripcion: "Ítem", cantidad: 5, valorUnitarioFob: 10 }],
  };

  const login = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Prov Pais A ${sufijo}`, subdomain: `test-provpais-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Prov Pais B ${sufijo}`, subdomain: `test-provpais-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `provpais-admin-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    tokenA = await login(`provpais-admin-${sufijo}@test.ricosoft.local`);

    const proveedorA = await prisma.proveedor.create({
      data: { tenantId: tenantAId, nombre: `Shenzhen ABC ${sufijo}`, nit: `900${sufijo}1` },
    });
    proveedorAId = proveedorA.id;
    const proveedorB = await prisma.proveedor.create({
      data: { tenantId: tenantBId, nombre: `Proveedor Ajeno ${sufijo}`, nit: `900${sufijo}2` },
    });
    proveedorBId = proveedorB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.itemOrdenCompraIntl.deleteMany({
      where: { ordenCompra: { tenantId: { in: tenantIds } } },
    });
    await prisma.importacionActividad.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("5. GET /proveedores?search= encuentra el proveedor real por nombre (búsqueda ya existente, reutilizada)", async () => {
    const res = await request(app)
      .get(`/api/proveedores?search=${encodeURIComponent(`Shenzhen ABC ${sufijo}`)}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((p: { id: string }) => p.id === proveedorAId)).toBe(true);
  });

  it("6. crear una orden con proveedorId guarda la FK real y autocompleta proveedorExtranjero con el nombre del catálogo", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        ...datosBase,
        numeroOrden: `PROV-6-${sufijo}`,
        proveedorId: proveedorAId,
        proveedorExtranjero: "Este texto se debe ignorar",
        paisOrigen: "China",
      });
    expect(res.status).toBe(201);

    const orden = await prisma.ordenCompraIntl.findUnique({ where: { id: res.body.id } });
    expect(orden?.proveedorId).toBe(proveedorAId);
    expect(orden?.proveedorExtranjero).toBe(`Shenzhen ABC ${sufijo}`);
  });

  it("7. un proveedor de OTRO tenant no puede asociarse a una orden (404, no se crea)", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        ...datosBase,
        numeroOrden: `PROV-7-${sufijo}`,
        proveedorId: proveedorBId,
        proveedorExtranjero: "No debería importar",
        paisOrigen: "China",
      });
    expect(res.status).toBe(404);

    const noCreada = await prisma.ordenCompraIntl.findFirst({
      where: { tenantId: tenantAId, numeroOrden: `PROV-7-${sufijo}` },
    });
    expect(noCreada).toBeNull();
  });

  it("8. seleccionar un país válido del catálogo funciona", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        ...datosBase,
        numeroOrden: `PAIS-8-${sufijo}`,
        proveedorExtranjero: "Proveedor Cualquiera",
        paisOrigen: "Alemania",
      });
    expect(res.status).toBe(201);
    expect(res.body.paisOrigen).toBe("Alemania");
  });

  it("9. un país fuera del catálogo es rechazado (400), incluyendo variantes de capitalización", async () => {
    for (const paisInvalido of ["china", "CHINA", "Republica Popular China", "Wakanda"]) {
      const res = await request(app)
        .post("/api/importaciones")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          ...datosBase,
          numeroOrden: `PAIS-9-${paisInvalido}-${sufijo}`,
          proveedorExtranjero: "Proveedor Cualquiera",
          paisOrigen: paisInvalido,
        });
      expect(res.status).toBe(400);
    }
  });
});
