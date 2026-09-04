import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de aislamiento multi-tenant contra SQL Server real para Contratos y
 * ServicioSuscripcion, migrados a req.tenantPrisma (mismo patrón que
 * Proveedores/Facturas/Solicitudes). Ambos módulos comparten proveedor real
 * y su relación cruzada (Servicio -> Contrato) también se prueba.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

interface ConIdDto {
  id: string;
}

describe.skipIf(!RUN)(
  "Contratos + Servicios/Suscripciones — piloto tenant-prisma (multi-tenant real)",
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
    let contratoBId: string;
    let servicioBId: string;

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
        data: { nombre: `CS TenantPrisma A ${sufijo}`, subdomain: `test-cs-tp-a-${sufijo}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { nombre: `CS TenantPrisma B ${sufijo}`, subdomain: `test-cs-tp-b-${sufijo}` },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `cs-tp-admin-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin A",
          isSuperadmin: true,
          activo: true,
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `cs-tp-admin-b-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin B",
          isSuperadmin: true,
          activo: true,
        },
      });
      tokenA = await login(`cs-tp-admin-a-${sufijo}@test.ricosoft.local`);
      tokenB = await login(`cs-tp-admin-b-${sufijo}@test.ricosoft.local`);

      const proveedorA = await prisma.proveedor.create({
        data: { tenantId: tenantAId, nombre: "Proveedor de A", nit: `NIT-CS-A-${sufijo}` },
      });
      proveedorAId = proveedorA.id;
      const proveedorB = await prisma.proveedor.create({
        data: { tenantId: tenantBId, nombre: "Proveedor de B", nit: `NIT-CS-B-${sufijo}` },
      });
      proveedorBId = proveedorB.id;

      const contratoB = await prisma.contrato.create({
        data: {
          tenantId: tenantBId,
          empresaId: "001",
          proveedor: "Proveedor de B",
          responsable: "Responsable B",
          area: "Administración",
          valorContratado: 1000000,
          fechaInicio: new Date(),
          fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          estado: "Activo",
        },
      });
      contratoBId = contratoB.id;

      const servicioB = await prisma.servicioSuscripcion.create({
        data: {
          tenantId: tenantBId,
          empresaId: "001",
          area: "Administración",
          nombreServicio: `Servicio de B ${sufijo}`,
          proveedor: "Proveedor de B",
          periodicidad: "Mensual",
          costo: 50000,
          fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          responsableArea: "Administración",
        },
      });
      servicioBId = servicioB.id;
    });

    afterAll(async () => {
      const tenantIds = [tenantAId, tenantBId];
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.servicioSuscripcion.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.contrato.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    // ---- Contratos ----

    it("Contratos: Tenant A lista únicamente sus propios contratos", async () => {
      const creado = await request(app)
        .post("/api/contratos")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          empresaId: "001",
          proveedorId: proveedorAId,
          responsable: "Responsable A",
          area: "Administración",
          valorContratado: 500000,
          fechaInicio: new Date().toISOString(),
          fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(creado.status).toBe(201);

      const res = await request(app).get("/api/contratos").set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.some((c: ConIdDto) => c.id === contratoBId)).toBe(false);
      expect(res.body.some((c: ConIdDto) => c.id === creado.body.id)).toBe(true);
    });

    it("Contratos: Tenant A no puede actualizar un contrato de Tenant B; la fila no cambia", async () => {
      const res = await request(app)
        .patch(`/api/contratos/${contratoBId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ estado: "Terminado" });
      expect(res.status).toBe(404);

      const sinTocar = await prisma.contrato.findUnique({ where: { id: contratoBId } });
      expect(sinTocar?.estado).toBe("Activo");
    });

    it("Contratos: Tenant A no puede eliminar (soft-delete) un contrato de Tenant B", async () => {
      const res = await request(app)
        .delete(`/api/contratos/${contratoBId}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);

      const sinTocar = await prisma.contrato.findUnique({ where: { id: contratoBId } });
      expect(sinTocar?.eliminado).toBe(false);
    });

    it("Contratos: crear referenciando un Proveedor de otro tenant falla (404) y no crea el contrato", async () => {
      const antes = await prisma.contrato.count({ where: { tenantId: tenantAId } });
      const res = await request(app)
        .post("/api/contratos")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          empresaId: "001",
          proveedorId: proveedorBId,
          responsable: "Responsable A",
          area: "Administración",
          valorContratado: 500000,
          fechaInicio: new Date().toISOString(),
          fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(res.status).toBe(404);
      const despues = await prisma.contrato.count({ where: { tenantId: tenantAId } });
      expect(despues).toBe(antes);
    });

    it("Contratos: crear un contrato con tenantId falsificado en el payload queda en el tenant del JWT", async () => {
      const res = await request(app)
        .post("/api/contratos")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          empresaId: "001",
          proveedorId: proveedorAId,
          responsable: "Responsable A",
          area: "Administración",
          valorContratado: 500000,
          fechaInicio: new Date().toISOString(),
          fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          tenantId: tenantBId,
        });
      expect(res.status).toBe(201);

      const enDb = await prisma.contrato.findUnique({ where: { id: res.body.id } });
      expect(enDb?.tenantId).toBe(tenantAId);
    });

    it("Contratos: superadmin de Tenant A sigue sin poder tocar contratos de Tenant B", async () => {
      const listado = await request(app)
        .get("/api/contratos")
        .set("Authorization", `Bearer ${tokenA}`);
      expect(listado.body.some((c: ConIdDto) => c.id === contratoBId)).toBe(false);
    });

    // ---- Servicios ----

    it("Servicios: Tenant A lista únicamente sus propios servicios", async () => {
      const creado = await request(app)
        .post("/api/servicios")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          empresaId: "001",
          area: "Administración",
          nombreServicio: `Servicio de A ${sufijo}`,
          proveedorId: proveedorAId,
          periodicidad: "Mensual",
          costo: 20000,
          fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(creado.status).toBe(201);

      const res = await request(app).get("/api/servicios").set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.some((s: ConIdDto) => s.id === servicioBId)).toBe(false);
      expect(res.body.some((s: ConIdDto) => s.id === creado.body.id)).toBe(true);
    });

    it("Servicios: Tenant A no puede obtener el detalle de un servicio de Tenant B (404)", async () => {
      const res = await request(app)
        .get(`/api/servicios/${servicioBId}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);
    });

    it("Servicios: Tenant A no puede cambiar el estado de un servicio de Tenant B; sigue Activo", async () => {
      const res = await request(app)
        .patch(`/api/servicios/${servicioBId}/estado`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);

      const sinTocar = await prisma.servicioSuscripcion.findUnique({ where: { id: servicioBId } });
      expect(sinTocar?.estado).toBe("Activo");
    });

    it("Servicios: Tenant A no puede eliminar (soft-delete) un servicio de Tenant B", async () => {
      const res = await request(app)
        .delete(`/api/servicios/${servicioBId}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);

      const sinTocar = await prisma.servicioSuscripcion.findUnique({ where: { id: servicioBId } });
      expect(sinTocar?.eliminado).toBe(false);
    });

    it("Servicios: crear referenciando un Contrato de otro tenant falla (404) y no crea el servicio", async () => {
      const antes = await prisma.servicioSuscripcion.count({ where: { tenantId: tenantAId } });
      const res = await request(app)
        .post("/api/servicios")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          empresaId: "001",
          area: "Administración",
          nombreServicio: `Servicio cruzado ${sufijo}`,
          proveedorId: proveedorAId,
          contratoId: contratoBId,
          periodicidad: "Mensual",
          costo: 20000,
          fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(res.status).toBe(404);
      const despues = await prisma.servicioSuscripcion.count({ where: { tenantId: tenantAId } });
      expect(despues).toBe(antes);
    });

    it("Servicios: crear un servicio con tenantId falsificado en el payload queda en el tenant del JWT", async () => {
      const res = await request(app)
        .post("/api/servicios")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          empresaId: "001",
          area: "Administración",
          nombreServicio: `Servicio falsificado ${sufijo}`,
          proveedorId: proveedorAId,
          periodicidad: "Mensual",
          costo: 20000,
          fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          tenantId: tenantBId,
        });
      expect(res.status).toBe(201);

      const enDb = await prisma.servicioSuscripcion.findUnique({ where: { id: res.body.id } });
      expect(enDb?.tenantId).toBe(tenantAId);
    });

    it("Servicios: un servicio propio SÍ puede referenciar un contrato propio (relación intra-tenant intacta)", async () => {
      const contratoA = await prisma.contrato.create({
        data: {
          tenantId: tenantAId,
          empresaId: "001",
          proveedor: "Proveedor de A",
          responsable: "Responsable A",
          area: "Administración",
          valorContratado: 500000,
          fechaInicio: new Date(),
          fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });

      const res = await request(app)
        .post("/api/servicios")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          empresaId: "001",
          area: "Administración",
          nombreServicio: `Servicio vinculado ${sufijo}`,
          proveedorId: proveedorAId,
          contratoId: contratoA.id,
          periodicidad: "Mensual",
          costo: 20000,
          fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(res.status).toBe(201);
      expect(res.body.contratoRel?.id).toBe(contratoA.id);
    });

    it("Servicios: Tenant B sigue viendo y operando correctamente sobre sus propios recursos", async () => {
      const res = await request(app)
        .get(`/api/servicios/${servicioBId}`)
        .set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(servicioBId);
    });

    // ---- Paginación (Bloque 6) ----

    it("Contratos: paginación con ?page devuelve envelope aislado por tenant; sin page, array plano", async () => {
      const prefijo = `CONT-PAG-${sufijo}`;
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post("/api/contratos")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({
            empresaId: "001",
            proveedorId: proveedorAId,
            responsable: `${prefijo}-${i}`,
            area: "Administración",
            valorContratado: 100000,
            fechaInicio: new Date().toISOString(),
            fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          });
        expect(res.status).toBe(201);
      }

      const pagina1 = await request(app)
        .get("/api/contratos")
        .query({ page: 1, pageSize: 2, search: prefijo })
        .set("Authorization", `Bearer ${tokenA}`);
      expect(pagina1.status).toBe(200);
      expect(pagina1.body.items).toHaveLength(2);
      expect(pagina1.body.total).toBe(3);
      expect(pagina1.body.totalPages).toBe(2);
      expect(pagina1.body.items.every((c: ConIdDto) => c.id !== contratoBId)).toBe(true);

      const sinPage = await request(app)
        .get("/api/contratos")
        .query({ search: prefijo })
        .set("Authorization", `Bearer ${tokenA}`);
      expect(Array.isArray(sinPage.body)).toBe(true);
      expect(sinPage.body).toHaveLength(3);
    });

    it("Servicios: paginación con ?page devuelve envelope aislado por tenant; sin page, array plano", async () => {
      const prefijo = `SERV-PAG-${sufijo}`;
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post("/api/servicios")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({
            empresaId: "001",
            area: "Administración",
            nombreServicio: `${prefijo}-${i}`,
            proveedorId: proveedorAId,
            periodicidad: "Mensual",
            costo: 10000,
            fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });
        expect(res.status).toBe(201);
      }

      const pagina1 = await request(app)
        .get("/api/servicios")
        .query({ page: 1, pageSize: 2, search: prefijo })
        .set("Authorization", `Bearer ${tokenA}`);
      expect(pagina1.status).toBe(200);
      expect(pagina1.body.items).toHaveLength(2);
      expect(pagina1.body.total).toBe(3);
      expect(pagina1.body.totalPages).toBe(2);
      expect(pagina1.body.items.every((s: ConIdDto) => s.id !== servicioBId)).toBe(true);

      const sinPage = await request(app)
        .get("/api/servicios")
        .query({ search: prefijo })
        .set("Authorization", `Bearer ${tokenA}`);
      expect(Array.isArray(sinPage.body)).toBe(true);
      expect(sinPage.body).toHaveLength(3);
    });
  },
);
