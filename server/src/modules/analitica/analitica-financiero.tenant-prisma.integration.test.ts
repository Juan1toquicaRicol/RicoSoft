import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración contra SQL Server real para el Bloque 3
 * (Contabilidad/relaciones financieras): cuentas por pagar
 * (analitica.controller.ts) y el resumen financiero de un proveedor
 * (proveedores.controller.ts). Ambos endpoints son nuevos; esta suite
 * prueba tanto su cálculo como su aislamiento por tenant, de punta a punta
 * (JWT -> tenantPrisma -> controller -> SQL Server).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

interface SaldoProveedorDto {
  proveedorId: string;
}

describe.skipIf(!RUN)(
  "Bloque 3 — Cuentas por pagar y resumen financiero (multi-tenant real)",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantAId: string;
    let tenantBId: string;
    let tokenA: string;
    let tokenB: string;
    let proveedorAId: string;
    let proveedorBId: string;
    let facturaVencidaId: string;
    let facturaProximaId: string;

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
        data: { nombre: `AF TenantPrisma A ${sufijo}`, subdomain: `test-af-tp-a-${sufijo}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { nombre: `AF TenantPrisma B ${sufijo}`, subdomain: `test-af-tp-b-${sufijo}` },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      const adminA = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `af-tp-admin-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin A",
          isSuperadmin: true,
          activo: true,
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `af-tp-admin-b-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin B",
          isSuperadmin: true,
          activo: true,
        },
      });
      tokenA = await login(`af-tp-admin-a-${sufijo}@test.ricosoft.local`);
      tokenB = await login(`af-tp-admin-b-${sufijo}@test.ricosoft.local`);

      const proveedorA = await prisma.proveedor.create({
        data: { tenantId: tenantAId, nombre: "Proveedor Financiero A", nit: `NIT-AF-A-${sufijo}` },
      });
      proveedorAId = proveedorA.id;
      const proveedorB = await prisma.proveedor.create({
        data: { tenantId: tenantBId, nombre: "Proveedor Financiero B", nit: `NIT-AF-B-${sufijo}` },
      });
      proveedorBId = proveedorB.id;

      // Factura A vencida hace 5 días, Pendiente, sin pagos -> cuenta como
      // vencida en cuentas-por-pagar.
      const facturaVencida = await prisma.factura.create({
        data: {
          tenantId: tenantAId,
          empresaId: "001",
          numero: `FAC-VENC-${sufijo}`,
          proveedorId: proveedorAId,
          proveedor: "Proveedor Financiero A",
          nit: `NIT-AF-A-${sufijo}`,
          area: "Administración",
          responsable: "Responsable A",
          vence: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          subtotal: 100000,
          iva: 0,
          total: 100000,
          estado: "Pendiente",
        },
      });
      facturaVencidaId = facturaVencida.id;

      // Factura A que vence en 10 días, Aprobada, con un pago parcial de
      // 40.000 -> saldo pendiente 60.000, cuenta como "próxima a vencer".
      const facturaProxima = await prisma.factura.create({
        data: {
          tenantId: tenantAId,
          empresaId: "001",
          numero: `FAC-PROX-${sufijo}`,
          proveedorId: proveedorAId,
          proveedor: "Proveedor Financiero A",
          nit: `NIT-AF-A-${sufijo}`,
          area: "Administración",
          responsable: "Responsable A",
          vence: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          subtotal: 100000,
          iva: 0,
          total: 100000,
          estado: "Aprobada",
        },
      });
      facturaProximaId = facturaProxima.id;
      await prisma.pago.create({
        data: {
          tenantId: tenantAId,
          facturaId: facturaProximaId,
          valor: 40000,
          metodoPago: "Transferencia",
          registradoPorId: adminA.id,
          registradoPorNombre: "Admin A",
          estado: "Confirmado",
        },
      });

      // Factura A ya Pagada: no debe contar en cuentas por pagar.
      const facturaPagada = await prisma.factura.create({
        data: {
          tenantId: tenantAId,
          empresaId: "001",
          numero: `FAC-PAGADA-${sufijo}`,
          proveedorId: proveedorAId,
          proveedor: "Proveedor Financiero A",
          nit: `NIT-AF-A-${sufijo}`,
          area: "Administración",
          responsable: "Responsable A",
          vence: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          subtotal: 30000,
          iva: 0,
          total: 30000,
          estado: "Pagada",
        },
      });
      await prisma.pago.create({
        data: {
          tenantId: tenantAId,
          facturaId: facturaPagada.id,
          valor: 30000,
          metodoPago: "Transferencia",
          registradoPorId: adminA.id,
          registradoPorNombre: "Admin A",
          estado: "Confirmado",
        },
      });

      // Factura de Tenant B, para probar que A nunca la ve en su cálculo.
      await prisma.factura.create({
        data: {
          tenantId: tenantBId,
          empresaId: "001",
          numero: `FAC-B-${sufijo}`,
          proveedorId: proveedorBId,
          proveedor: "Proveedor Financiero B",
          nit: `NIT-AF-B-${sufijo}`,
          area: "Administración",
          responsable: "Responsable B",
          vence: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          subtotal: 999999,
          iva: 0,
          total: 999999,
          estado: "Pendiente",
        },
      });
    });

    afterAll(async () => {
      const tenantIds = [tenantAId, tenantBId];
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.pago.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.factura.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.servicioSuscripcion.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    it("cuentas-por-pagar: calcula vencidas, próximas a vencer y saldo por proveedor solo del tenant activo", async () => {
      const res = await request(app)
        .get("/api/analitica/cuentas-por-pagar")
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);

      // 2 facturas abiertas: la vencida (100.000) y la próxima con saldo 60.000
      // (100.000 - 40.000 pagados). La Pagada no cuenta.
      expect(res.body.totalFacturas).toBe(2);
      expect(res.body.vencidas).toBe(1);
      expect(res.body.valorVencido).toBe(100000);
      expect(res.body.proximasAVencer).toBe(1);
      expect(res.body.valorProximoAVencer).toBe(60000);
      expect(res.body.totalPendiente).toBe(160000);

      const proveedorA = res.body.saldoPorProveedor.find(
        (p: SaldoProveedorDto) => p.proveedorId === proveedorAId,
      );
      expect(proveedorA?.saldo).toBe(160000);
      expect(proveedorA?.facturas).toBe(2);

      // Nunca debe aparecer nada del proveedor/factura de Tenant B.
      expect(
        res.body.saldoPorProveedor.some((p: SaldoProveedorDto) => p.proveedorId === proveedorBId),
      ).toBe(false);
    });

    it("cuentas-por-pagar: Tenant B ve únicamente su propia obligación vencida", async () => {
      const res = await request(app)
        .get("/api/analitica/cuentas-por-pagar")
        .set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(200);
      expect(res.body.totalFacturas).toBe(1);
      expect(res.body.valorVencido).toBe(999999);
      expect(
        res.body.saldoPorProveedor.some((p: SaldoProveedorDto) => p.proveedorId === proveedorAId),
      ).toBe(false);
    });

    it("resumen-financiero de proveedor: agrega facturas y pagos correctamente para el proveedor propio", async () => {
      const res = await request(app)
        .get(`/api/proveedores/${proveedorAId}/resumen-financiero`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.proveedor.id).toBe(proveedorAId);
      // 3 facturas del proveedor A: vencida (100k), próxima (100k), pagada (30k).
      expect(res.body.facturas.total).toBe(3);
      expect(res.body.facturas.totalFacturado).toBe(230000);
      // Pagos confirmados: 40k (parcial) + 30k (total) = 70k.
      expect(res.body.facturas.totalPagado).toBe(70000);
      expect(res.body.facturas.saldoPendiente).toBe(160000);
    });

    it("resumen-financiero de proveedor: Tenant A no puede consultar el resumen de un proveedor de Tenant B (404)", async () => {
      const res = await request(app)
        .get(`/api/proveedores/${proveedorBId}/resumen-financiero`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);
    });

    it("cuentas-por-pagar y resumen-financiero exigen el permiso correspondiente", async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);
      const rolSinPermiso = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: `Sin Permisos AF ${sufijo}`,
          permisos: JSON.stringify([]),
        },
      });
      const usuarioSinPermiso = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `af-tp-sinpermiso-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Sin Permiso",
          rolId: rolSinPermiso.id,
          isSuperadmin: false,
          activo: true,
        },
      });
      const tokenSinPermiso = await login(`af-tp-sinpermiso-${sufijo}@test.ricosoft.local`);

      const res1 = await request(app)
        .get("/api/analitica/cuentas-por-pagar")
        .set("Authorization", `Bearer ${tokenSinPermiso}`);
      expect(res1.status).toBe(403);

      const res2 = await request(app)
        .get(`/api/proveedores/${proveedorAId}/resumen-financiero`)
        .set("Authorization", `Bearer ${tokenSinPermiso}`);
      expect(res2.status).toBe(403);

      await prisma.auditoria.deleteMany({ where: { usuarioId: usuarioSinPermiso.id } });
      await prisma.user.delete({ where: { id: usuarioSinPermiso.id } });
      await prisma.rol.delete({ where: { id: rolSinPermiso.id } });
    });
  },
);
