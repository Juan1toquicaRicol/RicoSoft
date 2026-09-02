import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración contra SQL Server real para el Centro Gerencial
 * Financiero (GET /api/analitica/resumen-gerencial): cartera (CreditoCliente),
 * cuentas por pagar (Factura/Pago), buckets de antigüedad, concentración,
 * flujo proyectado y alertas — con datos controlados para verificar montos
 * exactos, no solo status codes. También confirma que GET
 * /api/analitica/cuentas-por-pagar conserva su contrato exacto tras el
 * refactor que ahora comparte lógica con el endpoint nuevo.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Centro Gerencial Financiero — resumen-gerencial (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenA: string;
  let tokenB: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.token as string;
  };

  const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `AG TenantPrisma A ${sufijo}`, subdomain: `test-ag-tp-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `AG TenantPrisma B ${sufijo}`, subdomain: `test-ag-tp-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `ag-tp-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `ag-tp-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });
    tokenA = await login(`ag-tp-admin-a-${sufijo}@test.ricosoft.local`);
    tokenB = await login(`ag-tp-admin-b-${sufijo}@test.ricosoft.local`);

    const proveedorA = await prisma.proveedor.create({
      data: { tenantId: tenantAId, nombre: "Proveedor Concentrado A", nit: `NIT-AG-A-${sufijo}` },
    });

    // CxP de A: F1 vencida (100.000) + F2 vence en 10 días (200.000), ambas
    // del mismo proveedor -> concentración 100%.
    await prisma.factura.create({
      data: {
        tenantId: tenantAId,
        empresaId: "001",
        numero: `FAC-AG-VENC-${sufijo}`,
        proveedorId: proveedorA.id,
        proveedor: proveedorA.nombre,
        nit: proveedorA.nit,
        area: "Administración",
        responsable: "Responsable A",
        vence: dias(-5),
        subtotal: 100000,
        iva: 0,
        total: 100000,
        estado: "Pendiente",
      },
    });
    await prisma.factura.create({
      data: {
        tenantId: tenantAId,
        empresaId: "001",
        numero: `FAC-AG-30D-${sufijo}`,
        proveedorId: proveedorA.id,
        proveedor: proveedorA.nombre,
        nit: proveedorA.nit,
        area: "Administración",
        responsable: "Responsable A",
        vence: dias(10),
        subtotal: 200000,
        iva: 0,
        total: 200000,
        estado: "Aprobada",
      },
    });

    // Cartera de A: mismo cliente en dos registros -> se agrupan (200.000
    // vencido 40%: 80.000 vencidos + 120.000 a 15 días).
    await prisma.creditoCliente.create({
      data: {
        tenantId: tenantAId,
        cliente: "Cliente Grande",
        cupo: 500000,
        saldo: 80000,
        vence: dias(-2),
      },
    });
    await prisma.creditoCliente.create({
      data: {
        tenantId: tenantAId,
        cliente: "Cliente Grande",
        cupo: 500000,
        saldo: 120000,
        vence: dias(15),
      },
    });

    // Ruido de Tenant B: nunca debe aparecer en el resumen de A.
    const proveedorB = await prisma.proveedor.create({
      data: { tenantId: tenantBId, nombre: "Proveedor de B", nit: `NIT-AG-B-${sufijo}` },
    });
    await prisma.factura.create({
      data: {
        tenantId: tenantBId,
        empresaId: "001",
        numero: `FAC-AG-B-${sufijo}`,
        proveedorId: proveedorB.id,
        proveedor: proveedorB.nombre,
        nit: proveedorB.nit,
        area: "Administración",
        responsable: "Responsable B",
        vence: dias(-1),
        subtotal: 999999,
        iva: 0,
        total: 999999,
        estado: "Pendiente",
      },
    });
    await prisma.creditoCliente.create({
      data: {
        tenantId: tenantBId,
        cliente: "Cliente de B",
        cupo: 999999,
        saldo: 999999,
        vence: dias(-1),
      },
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.pago.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.factura.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.creditoCliente.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("reporta ventas como explícitamente no disponible, sin inventar cifras", async () => {
    const res = await request(app)
      .get("/api/analitica/resumen-gerencial")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.ventas.disponible).toBe(false);
    expect(typeof res.body.ventas.motivo).toBe("string");
    expect(res.body.ventas.motivo.length).toBeGreaterThan(0);
  });

  it("calcula cuentas por pagar (total, buckets, concentración) con montos exactos y aislados por tenant", async () => {
    const res = await request(app)
      .get("/api/analitica/resumen-gerencial")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);

    expect(res.body.cuentasPorPagar.total).toBe(300000);
    expect(res.body.cuentasPorPagar.buckets.vencido).toBe(100000);
    expect(res.body.cuentasPorPagar.buckets.dias0a30).toBe(200000);
    expect(res.body.cuentasPorPagar.buckets.dias31a60).toBe(0);
    expect(res.body.cuentasPorPagar.concentracionTopProveedor).toBe(100);
    expect(res.body.cuentasPorPagar.topProveedores[0].saldo).toBe(300000);
  });

  it("calcula cartera (total, buckets, concentración) con montos exactos, agrupando por cliente", async () => {
    const res = await request(app)
      .get("/api/analitica/resumen-gerencial")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);

    expect(res.body.cartera.total).toBe(200000);
    expect(res.body.cartera.buckets.vencido).toBe(80000);
    expect(res.body.cartera.buckets.dias0a30).toBe(120000);
    expect(res.body.cartera.concentracionTopCliente).toBe(100);
    expect(res.body.cartera.topClientes[0].cliente).toBe("Cliente Grande");
    expect(res.body.cartera.topClientes[0].saldo).toBe(200000);
  });

  it("calcula el flujo proyectado a 30 días como ingresos (cartera) menos egresos (CxP), excluyendo lo ya vencido", async () => {
    const res = await request(app)
      .get("/api/analitica/resumen-gerencial")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);

    // d30: ingresos = 120.000 (cartera a 15 días); egresos = 200.000 (CxP a 10 días).
    // La factura/crédito ya vencidos NO cuentan en el flujo proyectado.
    expect(res.body.flujo.d30.ingresosEsperados).toBe(120000);
    expect(res.body.flujo.d30.egresosEsperados).toBe(200000);
    expect(res.body.flujo.d30.neto).toBe(-80000);

    // d7: nada vence dentro de 7 días (ni la cartera a 15 días ni la CxP a 10 días).
    expect(res.body.flujo.d7.ingresosEsperados).toBe(0);
    expect(res.body.flujo.d7.egresosEsperados).toBe(0);
  });

  it("genera las alertas accionables esperadas para este escenario", async () => {
    const res = await request(app)
      .get("/api/analitica/resumen-gerencial")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);

    const tipos = res.body.alertas.map((a: any) => a.tipo);
    expect(tipos).toContain("cxp_vencida");
    expect(tipos).toContain("cartera_vencida_alta");
    expect(tipos).toContain("concentracion_cliente");
    expect(tipos).toContain("concentracion_proveedor");
    expect(tipos).toContain("flujo_negativo_30d");
  });

  it("Tenant B nunca ve los montos de A: su resumen es completamente independiente", async () => {
    const res = await request(app)
      .get("/api/analitica/resumen-gerencial")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(200);

    expect(res.body.cuentasPorPagar.total).toBe(999999);
    expect(res.body.cartera.total).toBe(999999);
    // Nunca debe verse ningún monto ni nombre de A.
    expect(res.body.cartera.topClientes.some((c: any) => c.cliente === "Cliente Grande")).toBe(
      false,
    );
    expect(
      res.body.cuentasPorPagar.topProveedores.some(
        (p: any) => p.nombre === "Proveedor Concentrado A",
      ),
    ).toBe(false);
  });

  it("GET /cuentas-por-pagar conserva exactamente su contrato previo tras el refactor compartido", async () => {
    const res = await request(app)
      .get("/api/analitica/cuentas-por-pagar")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalFacturas");
    expect(res.body).toHaveProperty("totalPendiente", 300000);
    expect(res.body).toHaveProperty("vencidas", 1);
    expect(res.body).toHaveProperty("valorVencido", 100000);
    expect(res.body).toHaveProperty("proximasAVencer", 1);
    expect(res.body).toHaveProperty("valorProximoAVencer", 200000);
    expect(Array.isArray(res.body.saldoPorProveedor)).toBe(true);
  });
});
