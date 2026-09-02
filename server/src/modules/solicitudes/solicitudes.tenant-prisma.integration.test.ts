import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de aislamiento multi-tenant contra SQL Server real para
 * SolicitudCompra + CotizacionProveedor, migrados a req.tenantPrisma
 * (mismo patrón que Proveedores/Facturas). El flujo funcional completo (3
 * cotizaciones -> ganadora -> aprobación -> factura vinculada) ya está
 * cubierto por compras-cotizaciones.integration.test.ts; esta suite se
 * concentra exclusivamente en que un tenant nunca pueda leer, modificar o
 * eliminar recursos de otro.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)(
  "Solicitudes de compra + Cotizaciones — piloto tenant-prisma (multi-tenant real)",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantAId: string;
    let tenantBId: string;
    let tokenA: string;
    let tokenB: string;
    let tokenAAprobador: string;
    let solicitanteAId: string;
    let solicitudBId: string;
    let cotizacionBId: string;

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
        data: { nombre: `Sol TenantPrisma A ${sufijo}`, subdomain: `test-sol-tp-a-${sufijo}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { nombre: `Sol TenantPrisma B ${sufijo}`, subdomain: `test-sol-tp-b-${sufijo}` },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      const adminA = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `sol-tp-admin-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin A",
          isSuperadmin: true,
          activo: true,
        },
      });
      solicitanteAId = adminA.id;
      await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `sol-tp-admin-b-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin B",
          isSuperadmin: true,
          activo: true,
        },
      });

      // Aprobador distinto del solicitante: desde el fix de A-03 (auditoría
      // 2026-09-02), el backend impide que quien creó la solicitud sea
      // quien la apruebe/rechace.
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `sol-tp-aprobador-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Aprobador A",
          isSuperadmin: true,
          activo: true,
        },
      });

      tokenA = await login(`sol-tp-admin-a-${sufijo}@test.ricosoft.local`);
      tokenB = await login(`sol-tp-admin-b-${sufijo}@test.ricosoft.local`);
      tokenAAprobador = await login(`sol-tp-aprobador-a-${sufijo}@test.ricosoft.local`);

      const usuarioB = await prisma.user.findFirstOrThrow({ where: { tenantId: tenantBId } });
      const solicitudB = await prisma.solicitudCompra.create({
        data: {
          tenantId: tenantBId,
          empresaId: "001",
          area: "Administración",
          solicitanteId: usuarioB.id,
          solicitante: "Admin B",
          item: `Item de B ${sufijo}`,
          cantidad: 1,
          valorEstimado: 100000,
          estado: "Pendiente",
        },
      });
      solicitudBId = solicitudB.id;

      const cotizacionB = await prisma.cotizacionProveedor.create({
        data: {
          tenantId: tenantBId,
          solicitudCompraId: solicitudBId,
          proveedorNombre: "Proveedor de B",
          proveedorNit: `NIT-COT-B-${sufijo}`,
          valorTotalCOP: 100000,
          tiempoEntregaDias: 5,
          archivoNombre: "cotizacion.pdf",
          archivoRuta: "no-existe/cotizacion.pdf",
          archivoMime: "application/pdf",
          archivoTamano: 100,
          subidoPorId: usuarioB.id,
          subidoPorNombre: "Admin B",
        },
      });
      cotizacionBId = cotizacionB.id;
    });

    afterAll(async () => {
      const tenantIds = [tenantAId, tenantBId];
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.factura.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.cotizacionProveedor.deleteMany({
        where: { solicitudCompra: { tenantId: { in: tenantIds } } },
      });
      await prisma.solicitudCompra.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.notificacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    it("Tenant A lista únicamente sus propias solicitudes activas", async () => {
      const creada = await request(app)
        .post("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          empresaId: "001",
          area: "Administración",
          solicitanteId: solicitanteAId,
          item: `Item de A ${sufijo}`,
          cantidad: 1,
          valorEstimado: 50000,
        });
      expect(creada.status).toBe(201);

      const res = await request(app)
        .get("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.some((s: any) => s.id === solicitudBId)).toBe(false);
      expect(res.body.some((s: any) => s.id === creada.body.id)).toBe(true);
    });

    it("Tenant A no puede cambiar el estado de una solicitud de Tenant B; la fila no cambia", async () => {
      const res = await request(app)
        .patch(`/api/solicitudes-compra/${solicitudBId}/estado`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ estado: "Rechazada" });
      expect(res.status).toBe(404);

      const sinTocar = await prisma.solicitudCompra.findUnique({ where: { id: solicitudBId } });
      expect(sinTocar?.estado).toBe("Pendiente");
    });

    it("Tenant A no puede eliminar (soft-delete) una solicitud de Tenant B", async () => {
      const res = await request(app)
        .delete(`/api/solicitudes-compra/${solicitudBId}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);

      const sinTocar = await prisma.solicitudCompra.findUnique({ where: { id: solicitudBId } });
      expect(sinTocar?.eliminado).toBe(false);
    });

    it("Crear una solicitud queda en el tenant del JWT aunque el payload envíe otro tenantId", async () => {
      const res = await request(app)
        .post("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          empresaId: "001",
          area: "Administración",
          solicitanteId: solicitanteAId,
          item: `Item falsificado ${sufijo}`,
          cantidad: 1,
          valorEstimado: 50000,
          tenantId: tenantBId,
        });
      expect(res.status).toBe(201);

      const enDb = await prisma.solicitudCompra.findUnique({ where: { id: res.body.id } });
      expect(enDb?.tenantId).toBe(tenantAId);
    });

    it("Tenant A no puede listar/ver el cuadro comparativo de cotizaciones de una solicitud de Tenant B", async () => {
      const res = await request(app)
        .get(`/api/solicitudes-compra/${solicitudBId}/cotizaciones`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);
    });

    it("Tenant A no puede eliminar una cotización de proveedor de Tenant B; sigue existiendo", async () => {
      const res = await request(app)
        .delete(`/api/solicitudes-compra/${solicitudBId}/cotizaciones/${cotizacionBId}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);

      const sigueExistiendo = await prisma.cotizacionProveedor.findUnique({
        where: { id: cotizacionBId },
      });
      expect(sigueExistiendo).not.toBeNull();
    });

    it("Tenant A no puede seleccionar como ganadora una cotización de Tenant B", async () => {
      const res = await request(app)
        .post(`/api/solicitudes-compra/${solicitudBId}/cotizaciones/${cotizacionBId}/seleccionar`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);

      const sinTocar = await prisma.cotizacionProveedor.findUnique({
        where: { id: cotizacionBId },
      });
      expect(sinTocar?.esGanadora).toBe(false);
    });

    it("Tenant A no puede descargar el archivo de cotización de una solicitud de Tenant B", async () => {
      const res = await request(app)
        .get(`/api/solicitudes-compra/${solicitudBId}/archivo`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);
    });

    it("Tenant A no puede descargar el archivo de una cotización de proveedor de Tenant B", async () => {
      const res = await request(app)
        .get(`/api/solicitudes-compra/${solicitudBId}/cotizaciones/${cotizacionBId}/archivo`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);
    });

    it("Tenant B sigue viendo y operando correctamente sobre sus propios recursos", async () => {
      const res = await request(app)
        .get(`/api/solicitudes-compra/${solicitudBId}/cotizaciones`)
        .set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(200);
      expect(res.body.some((c: any) => c.id === cotizacionBId)).toBe(true);
    });

    it("paginación del historial de compras: envelope paginado con ?page, array plano sin él, aislado por tenant", async () => {
      const prefijo = `HIST-PAG-${sufijo}`;
      for (let i = 0; i < 3; i++) {
        const creada = await request(app)
          .post("/api/solicitudes-compra")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({
            empresaId: "001",
            area: "Administración",
            solicitanteId: solicitanteAId,
            item: `${prefijo}-${i}`,
            cantidad: 1,
            valorEstimado: 10000,
          });
        expect(creada.status).toBe(201);
        const rechazada = await request(app)
          .patch(`/api/solicitudes-compra/${creada.body.id}/estado`)
          .set("Authorization", `Bearer ${tokenAAprobador}`)
          .send({ estado: "Rechazada" });
        expect(rechazada.status).toBe(200);
      }

      const pagina1PorEstado = await request(app)
        .get("/api/solicitudes-compra/historial")
        .query({ page: 1, pageSize: 2, estado: "Rechazada" })
        .set("Authorization", `Bearer ${tokenA}`);
      expect(pagina1PorEstado.status).toBe(200);
      expect(pagina1PorEstado.body.items).toHaveLength(2);
      expect(pagina1PorEstado.body.page).toBe(1);
      expect(pagina1PorEstado.body.pageSize).toBe(2);
      expect(pagina1PorEstado.body.total).toBeGreaterThanOrEqual(3);
      expect(pagina1PorEstado.body.items.every((s: any) => s.id !== solicitudBId)).toBe(true);

      // Sin `page`, sigue devolviendo el array plano de siempre.
      const sinPage = await request(app)
        .get("/api/solicitudes-compra/historial")
        .query({ estado: "Rechazada" })
        .set("Authorization", `Bearer ${tokenA}`);
      expect(Array.isArray(sinPage.body)).toBe(true);
    });
  },
);
