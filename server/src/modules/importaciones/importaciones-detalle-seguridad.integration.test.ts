import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Auditoría/implementación del módulo de Importaciones — el detalle de una
 * orden de compra internacional (GET /importaciones/:id) ya estaba
 * correctamente tenant-scoped y permission-gated en el backend; el problema
 * reportado ("no permite ver el detalle") era 100% de ruteo en frontend
 * (importaciones.tsx sin <Outlet/> parentando implícitamente a
 * importaciones.$id.tsx en TanStack Router — mismo patrón ya corregido para
 * Servicios). Esta suite confirma el contrato real del endpoint.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("GET /importaciones/:id — detalle (BD real)", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let tokenAConPermiso: string;
  let tokenASinPermiso: string;
  let ordenAId: string;

  const login = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Detalle Imp A ${sufijo}`, subdomain: `test-detimp-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Detalle Imp B ${sufijo}`, subdomain: `test-detimp-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `detimp-admin-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    const rolSinPermiso = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Sin Permiso Imp ${sufijo}`,
        permisos: JSON.stringify([]),
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `detimp-sinpermiso-${sufijo}@test.ricosoft.local`,
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
        email: `detimp-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAConPermiso = await login(`detimp-admin-${sufijo}@test.ricosoft.local`);
    tokenASinPermiso = await login(`detimp-sinpermiso-${sufijo}@test.ricosoft.local`);

    const ordenRes = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${tokenAConPermiso}`)
      .send({
        numeroOrden: `DET-${sufijo}`,
        incoterm: "FOB",
        proveedorExtranjero: "Proveedor Detalle Test",
        paisOrigen: "China",
        moneda: "USD",
        trmPactada: 4000,
        items: [{ descripcion: "Ítem detalle", cantidad: 10, valorUnitarioFob: 5 }],
      });
    ordenAId = ordenRes.body.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.itemOrdenCompraIntl.deleteMany({
      where: { ordenCompra: { tenantId: { in: tenantIds } } },
    });
    await prisma.importacionActividad.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("1. un usuario autorizado (mismo tenant, con permiso) puede consultar el detalle completo", async () => {
    const res = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenAConPermiso}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ordenAId);
    expect(res.body.numeroOrden).toBe(`DET-${sufijo}`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.proveedorExtranjero).toBe("Proveedor Detalle Test");
    expect(res.body.paisOrigen).toBe("China");
  });

  it("2. un usuario del mismo tenant SIN el permiso importaciones.ver recibe 403", async () => {
    const res = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`);
    expect(res.status).toBe(403);
  });

  it("3. un id inexistente devuelve 404", async () => {
    const res = await request(app)
      .get(`/api/importaciones/${randomUUID()}`)
      .set("Authorization", `Bearer ${tokenAConPermiso}`);
    expect(res.status).toBe(404);
  });

  it("4. un usuario de OTRO tenant no puede acceder al detalle (404, no revela que existe)", async () => {
    const tokenB = await login(`detimp-admin-b-${sufijo}@test.ricosoft.local`);
    const res = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });
});
