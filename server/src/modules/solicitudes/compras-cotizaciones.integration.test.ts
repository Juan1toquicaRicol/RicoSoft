import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración con BASE DE DATOS REAL (sin mocks) para el flujo
 * Compras -> 3 cotizaciones -> cuadro comparativo -> SC Aprobada -> Factura
 * vinculada (aprobada automáticamente, atómico con SC -> Facturada).
 *
 * Mismo patrón que importaciones.integration.test.ts: requiere DATABASE_URL
 * (SQL Server real, schema migrado) y JWT_SECRET como variables de entorno
 * del proceso. Gateada por RUN_DB_INTEGRATION_TESTS=true; excluida de
 * `npm test` (ver vitest.config.mts). Crea y destruye sus propios
 * tenants/usuarios/datos con sufijo aleatorio.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)(
  "Compras — 3 cotizaciones, aprobación y factura vinculada (multi-tenant real)",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantAId: string;
    let tenantBId: string;
    let tokenAAdmin: string;
    let tokenASinPermiso: string;
    let tokenBAdmin: string;
    let tokenAAprobador: string;
    let solicitanteAId: string;

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);

      const tenantA = await prisma.tenant.create({
        data: { nombre: `Test Tenant A ${sufijo}`, subdomain: `test-cot-a-${sufijo}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { nombre: `Test Tenant B ${sufijo}`, subdomain: `test-cot-b-${sufijo}` },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      const solicitanteA = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `solicitante-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Solicitante Tenant A",
          isSuperadmin: true,
          activo: true,
        },
      });
      solicitanteAId = solicitanteA.id;
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `sinpermiso-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Sin Permiso Tenant A",
          isSuperadmin: false,
          activo: true,
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `admin-b-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin Tenant B",
          isSuperadmin: true,
          activo: true,
        },
      });
      // Aprobador distinto del solicitante: desde el fix de A-03
      // (auditoría 2026-09-02), el backend impide que quien creó la
      // solicitud sea quien la apruebe/rechace, así que las pruebas de
      // aprobación necesitan un segundo usuario de Tenant A para actuar
      // como aprobador legítimo.
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `aprobador-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Aprobador Tenant A",
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

      tokenAAdmin = await login(`solicitante-a-${sufijo}@test.ricosoft.local`);
      tokenASinPermiso = await login(`sinpermiso-a-${sufijo}@test.ricosoft.local`);
      tokenBAdmin = await login(`admin-b-${sufijo}@test.ricosoft.local`);
      tokenAAprobador = await login(`aprobador-a-${sufijo}@test.ricosoft.local`);
    });

    afterAll(async () => {
      const solicitudes = await prisma.solicitudCompra.findMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
        select: { id: true },
      });
      const solicitudIds = solicitudes.map((s) => s.id);
      await prisma.cotizacionProveedor.deleteMany({
        where: { solicitudCompraId: { in: solicitudIds } },
      });
      await prisma.facturaHistorial.deleteMany({
        where: { factura: { tenantId: { in: [tenantAId, tenantBId] } } },
      });
      await prisma.factura.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
      await prisma.solicitudCompra.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
      await prisma.notificacion.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
      await prisma.$disconnect();
    });

    const crearSolicitud = async (item: string) => {
      const res = await request(app)
        .post("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .send({
          empresaId: "RC",
          area: "Sistemas",
          solicitanteId: solicitanteAId,
          item,
          descripcion: "Prueba de integración",
          cantidad: 1,
          valorEstimado: 1_000_000,
          prioridad: "Media",
        });
      if (res.status !== 201) {
        throw new Error(
          `No se pudo crear la solicitud fixture: ${res.status} ${JSON.stringify(res.body)}`,
        );
      }
      return res.body.id as string;
    };

    const agregarCotizacion = (solicitudId: string, token: string, i: number) =>
      request(app)
        .post(`/api/solicitudes-compra/${solicitudId}/cotizaciones`)
        .set("Authorization", `Bearer ${token}`)
        .field("proveedorNombre", `Proveedor ${i}`)
        .field("proveedorNit", `900${i}00${i}00${i}`)
        .field("valorTotalCOP", String(1_000_000 + i))
        .field("tiempoEntregaDias", String(5 + i))
        .attach("archivo", Buffer.from("%PDF-1.4 contenido de prueba"), {
          filename: `cotizacion-${i}.pdf`,
          contentType: "application/pdf",
        });

    it("no permite aprobar una solicitud sin cotizaciones", async () => {
      const id = await crearSolicitud(`Item sin cotizar ${sufijo}`);
      const res = await request(app)
        .patch(`/api/solicitudes-compra/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAAprobador}`)
        .send({ estado: "Aprobada" });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/3 cotizaciones/);
    });

    it("la primera cotización mueve la solicitud de Pendiente a En Cotización", async () => {
      const id = await crearSolicitud(`Item primera cotizacion ${sufijo}`);
      const antes = await request(app)
        .get("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${tokenAAdmin}`);
      expect(antes.body.find((s: any) => s.id === id)?.estado).toBe("Pendiente");

      const subida = await agregarCotizacion(id, tokenAAdmin, 1);
      expect(subida.status).toBe(201);

      const despues = await request(app)
        .get("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${tokenAAdmin}`);
      expect(despues.body.find((s: any) => s.id === id)?.estado).toBe("En Cotización");
    });

    it("bloquea agregar una 4ta cotización y bloquea el acceso cruzado entre tenants", async () => {
      const id = await crearSolicitud(`Item cuarta cotizacion ${sufijo}`);
      for (let i = 1; i <= 3; i++) {
        const res = await agregarCotizacion(id, tokenAAdmin, i);
        expect(res.status).toBe(201);
      }
      const cuarta = await agregarCotizacion(id, tokenAAdmin, 4);
      expect(cuarta.status).toBe(409);

      const listaCruzada = await request(app)
        .get(`/api/solicitudes-compra/${id}/cotizaciones`)
        .set("Authorization", `Bearer ${tokenBAdmin}`);
      expect(listaCruzada.status).toBe(404);

      const altaCruzada = await agregarCotizacion(id, tokenBAdmin, 5);
      expect(altaCruzada.status).toBe(404);
    });

    it("exige exactamente 3 cotizaciones y una ganadora antes de aprobar, y factura vinculada aprueba todo atómicamente", async () => {
      const id = await crearSolicitud(`Item flujo completo ${sufijo}`);
      const ids: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const res = await agregarCotizacion(id, tokenAAdmin, i);
        ids.push(res.body.id);
      }

      // Sin permiso no puede elegir la ganadora.
      const seleccionSinPermiso = await request(app)
        .post(`/api/solicitudes-compra/${id}/cotizaciones/${ids[0]}/seleccionar`)
        .set("Authorization", `Bearer ${tokenASinPermiso}`);
      expect(seleccionSinPermiso.status).toBe(403);

      // Sin ganadora todavía no se puede aprobar.
      const sinGanadora = await request(app)
        .patch(`/api/solicitudes-compra/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAAprobador}`)
        .send({ estado: "Aprobada" });
      expect(sinGanadora.status).toBe(409);
      expect(sinGanadora.body.message).toMatch(/ganadora/);

      const seleccion = await request(app)
        .post(`/api/solicitudes-compra/${id}/cotizaciones/${ids[1]}/seleccionar`)
        .set("Authorization", `Bearer ${tokenAAdmin}`);
      expect(seleccion.status).toBe(200);
      expect(seleccion.body.find((c: any) => c.id === ids[1]).esGanadora).toBe(true);

      const aprobar = await request(app)
        .patch(`/api/solicitudes-compra/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAAprobador}`)
        .send({ estado: "Aprobada" });
      expect(aprobar.status).toBe(200);
      expect(aprobar.body.estado).toBe("Aprobada");

      // Una factura sin SC vinculada sigue naciendo "Pendiente" (sin romper el flujo existente).
      const facturaIndependiente = await request(app)
        .post("/api/facturas")
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .send({
          empresaId: "RC",
          numero: `FI-${sufijo}`,
          proveedor: "Proveedor Independiente",
          nit: "900000000",
          area: "Sistemas",
          responsable: "Responsable de prueba",
          vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          subtotal: 100,
          iva: 19,
        });
      expect(facturaIndependiente.status).toBe(201);
      expect(facturaIndependiente.body.estado).toBe("Pendiente");

      // La factura vinculada a la SC ya Aprobada queda Aprobada automáticamente
      // y la SC pasa a Facturada, de forma atómica.
      const facturaVinculada = await request(app)
        .post("/api/facturas")
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .send({
          empresaId: "RC",
          numero: `FV-${sufijo}`,
          proveedor: "Proveedor Ganador",
          nit: "900111222",
          solicitudCompraId: id,
          area: "Sistemas",
          responsable: "Responsable de prueba",
          vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          subtotal: 1_000_000,
          iva: 190_000,
        });
      expect(facturaVinculada.status).toBe(201);
      expect(facturaVinculada.body.estado).toBe("Aprobada");

      const solicitudFinal = await prisma.solicitudCompra.findUnique({ where: { id } });
      expect(solicitudFinal?.estado).toBe("Facturada");

      // No se puede vincular una segunda factura a una SC ya Facturada.
      const segundaFactura = await request(app)
        .post("/api/facturas")
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .send({
          empresaId: "RC",
          numero: `FV2-${sufijo}`,
          proveedor: "Proveedor Ganador",
          nit: "900111222",
          solicitudCompraId: id,
          area: "Sistemas",
          responsable: "Responsable de prueba",
          vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          subtotal: 1,
          iva: 0,
        });
      expect(segundaFactura.status).toBe(409);
    });
  },
);
