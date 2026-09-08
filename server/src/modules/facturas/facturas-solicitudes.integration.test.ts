import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Relación Factura <-> Solicitud de Compra: selector "Solicitud de compra
 * relacionada" en Recepcionar Factura (GET /solicitudes-compra/disponibles-
 * -para-factura), facturación parcial (una SC con varias facturas, saldo
 * pendiente calculado), visibilidad inversa (GET /facturas?solicitudCompraId)
 * y aislamiento multi-tenant. No se creó ningún modelo/migración nueva: la
 * relación N facturas -> 1 solicitud ya existía (Factura.solicitudCompraId,
 * sin unicidad) — esta suite prueba el uso nuevo de esa relación existente.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Factura <-> Solicitud de Compra (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenA: string;
  let tokenSinPermisoA: string;
  let tokenB: string;
  let proveedorA1Id: string;
  let proveedorA2Id: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.token as string;
  };

  const datosFacturaBase = (overrides: Record<string, unknown> = {}) => ({
    empresaId: "001",
    numero: `FAC-${randomUUID().slice(0, 8)}`,
    proveedor: "Proveedor Manual",
    nit: "900000000-1",
    area: "Administración",
    responsable: "Responsable Manual",
    vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    subtotal: 100000,
    iva: 0,
    ...overrides,
  });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `FacSC Tenant A ${sufijo}`, subdomain: `test-facsc-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `FacSC Tenant B ${sufijo}`, subdomain: `test-facsc-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const rolSinPermiso = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Sin Permisos FacSC ${sufijo}`,
        permisos: JSON.stringify([]),
      },
    });

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `facsc-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `facsc-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        rolId: rolSinPermiso.id,
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `facsc-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenA = await login(`facsc-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`facsc-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenB = await login(`facsc-admin-b-${sufijo}@test.ricosoft.local`);

    const proveedorA1 = await prisma.proveedor.create({
      data: { tenantId: tenantAId, nombre: `Proveedor A1 ${sufijo}`, nit: `NIT-A1-${sufijo}` },
    });
    proveedorA1Id = proveedorA1.id;
    const proveedorA2 = await prisma.proveedor.create({
      data: { tenantId: tenantAId, nombre: `Proveedor A2 ${sufijo}`, nit: `NIT-A2-${sufijo}` },
    });
    proveedorA2Id = proveedorA2.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.facturaHistorial.deleteMany({
      where: { factura: { tenantId: { in: tenantIds } } },
    });
    await prisma.factura.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.solicitudCompra.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  const crearSolicitudAprobada = (tenantId: string, overrides: Record<string, unknown> = {}) =>
    prisma.solicitudCompra.create({
      data: {
        tenantId,
        empresaId: "001",
        area: "Administración",
        solicitante: "Solicitante",
        item: `Compra de materia prima ${randomUUID().slice(0, 6)}`,
        cantidad: 1,
        valorEstimado: 1000000,
        estado: "Aprobada",
        ...overrides,
      },
    });

  it("2/7. Consultar solicitudes disponibles: una solicitud recién aprobada, sin facturas, aparece con saldo = valor estimado", async () => {
    const sc = await crearSolicitudAprobada(tenantAId, { proveedorId: proveedorA1Id });

    const res = await request(app)
      .get("/api/solicitudes-compra/disponibles-para-factura")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const fila = res.body.find(
      (s: { id: string; facturado?: number; saldoPendiente?: number }) => s.id === sc.id,
    );
    expect(fila).toBeDefined();
    expect(fila.facturado).toBe(0);
    expect(fila.saldoPendiente).toBe(1000000);
  });

  it("3. Filtrar por proveedor: solo aparecen las solicitudes de ese proveedor, no las de otro", async () => {
    const scA1 = await crearSolicitudAprobada(tenantAId, { proveedorId: proveedorA1Id });
    const scA2 = await crearSolicitudAprobada(tenantAId, { proveedorId: proveedorA2Id });

    const res = await request(app)
      .get("/api/solicitudes-compra/disponibles-para-factura")
      .query({ proveedorId: proveedorA1Id })
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(
      res.body.some(
        (s: { id: string; facturado?: number; saldoPendiente?: number }) => s.id === scA1.id,
      ),
    ).toBe(true);
    expect(
      res.body.some(
        (s: { id: string; facturado?: number; saldoPendiente?: number }) => s.id === scA2.id,
      ),
    ).toBe(false);
  });

  it("1/4. Crear factura relacionada con solicitud: la solicitud pasa a Facturada y la factura queda Aprobada automáticamente", async () => {
    const sc = await crearSolicitudAprobada(tenantAId, { proveedorId: proveedorA1Id });

    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ solicitudCompraId: sc.id, subtotal: 400000, iva: 0 }));
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("Aprobada");
    expect(res.body.solicitudCompraId).toBe(sc.id);

    const solicitudDb = await prisma.solicitudCompra.findUnique({ where: { id: sc.id } });
    expect(solicitudDb?.estado).toBe("Facturada");
  });

  it("5/6. Varias facturas para una solicitud: la segunda factura sí se puede vincular (SC ya 'Facturada') y el saldo pendiente baja", async () => {
    const sc = await crearSolicitudAprobada(tenantAId, { proveedorId: proveedorA1Id });

    const f1 = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ solicitudCompraId: sc.id, subtotal: 400000, iva: 0 }));
    expect(f1.status).toBe(201);

    // Tras la primera factura, la SC quedó "Facturada" — antes del cambio de
    // este ajuste eso la hubiera excluido de ESTADOS_SC_VINCULABLES_A_FACTURA.
    const f2 = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ solicitudCompraId: sc.id, subtotal: 300000, iva: 0 }));
    expect(f2.status).toBe(201);
    expect(f2.body.estado).toBe("Aprobada");

    const disponibles = await request(app)
      .get("/api/solicitudes-compra/disponibles-para-factura")
      .set("Authorization", `Bearer ${tokenA}`);
    const fila = disponibles.body.find(
      (s: { id: string; facturado?: number; saldoPendiente?: number }) => s.id === sc.id,
    );
    expect(fila.facturado).toBe(700000);
    expect(fila.saldoPendiente).toBe(300000);
  });

  it("9. Una solicitud totalmente facturada (saldo = 0) deja de aparecer en 'disponibles' — evita seguir facturando sobre ella desde el selector", async () => {
    const sc = await crearSolicitudAprobada(tenantAId, {
      proveedorId: proveedorA1Id,
      valorEstimado: 500000,
    });

    const f1 = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ solicitudCompraId: sc.id, subtotal: 500000, iva: 0 }));
    expect(f1.status).toBe(201);

    const disponibles = await request(app)
      .get("/api/solicitudes-compra/disponibles-para-factura")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(
      disponibles.body.some(
        (s: { id: string; facturado?: number; saldoPendiente?: number }) => s.id === sc.id,
      ),
    ).toBe(false);
  });

  it("8. Factura sin solicitud: se crea normalmente, sin vincular nada", async () => {
    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase());
    expect(res.status).toBe(201);
    expect(res.body.solicitudCompraId).toBeNull();
    expect(res.body.estado).toBe("Pendiente");
  });

  it("10. Diferencia de valor: una factura que supera el saldo pendiente de la solicitud NO se bloquea automáticamente", async () => {
    const sc = await crearSolicitudAprobada(tenantAId, {
      proveedorId: proveedorA1Id,
      valorEstimado: 200000,
    });

    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ solicitudCompraId: sc.id, subtotal: 700000, iva: 0 }));
    // Se permite continuar: no hay una regla de bloqueo definida por el negocio.
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(700000);
  });

  it("13. Visualización desde Solicitud de Compra: GET /facturas?solicitudCompraId lista todas las facturas relacionadas", async () => {
    const sc = await crearSolicitudAprobada(tenantAId, { proveedorId: proveedorA1Id });
    const f1 = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ solicitudCompraId: sc.id, subtotal: 300000, iva: 0 }));
    const f2 = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ solicitudCompraId: sc.id, subtotal: 200000, iva: 0 }));

    const res = await request(app)
      .get("/api/facturas")
      .query({ solicitudCompraId: sc.id })
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((f: { id: string }) => f.id);
    expect(ids).toContain(f1.body.id);
    expect(ids).toContain(f2.body.id);
    expect(res.body).toHaveLength(2);
  });

  it("11. Aislamiento multi-tenant: Tenant B no ve las solicitudes de Tenant A en 'disponibles', ni puede vincular una factura a ellas", async () => {
    const scA = await crearSolicitudAprobada(tenantAId, { proveedorId: proveedorA1Id });

    const disponiblesB = await request(app)
      .get("/api/solicitudes-compra/disponibles-para-factura")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(
      disponiblesB.body.some(
        (s: { id: string; facturado?: number; saldoPendiente?: number }) => s.id === scA.id,
      ),
    ).toBe(false);

    const intentoCruzado = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenB}`)
      .send(datosFacturaBase({ solicitudCompraId: scA.id }));
    expect(intentoCruzado.status).toBe(404);

    const solicitudSinTocar = await prisma.solicitudCompra.findUnique({ where: { id: scA.id } });
    expect(solicitudSinTocar?.estado).toBe("Aprobada");
  });

  it("12. Usuario sin permiso de solicitudes.ver recibe 403 al consultar solicitudes disponibles", async () => {
    const res = await request(app)
      .get("/api/solicitudes-compra/disponibles-para-factura")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`);
    expect(res.status).toBe(403);
  });
});
