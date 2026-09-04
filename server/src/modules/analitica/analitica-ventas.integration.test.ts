import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Analítica Comercial — /api/analitica/ventas* (P0 Comercial, 2026-09-03).
 * Sin siesaCiaId configurado en el tenant de prueba (no hay túnel VPN a
 * Siesa en CI), valida lo que SÍ se puede probar sin conexión real:
 * - nunca 500 (siempre 200 con disponible:false y motivo);
 * - enforcement del permiso `analitica.ver` en los 4 endpoints, incluido el
 *   nuevo GET /ventas/clientes;
 * - aislamiento multi-tenant: un tenant sin siesaCiaId nunca ve datos de
 *   otro, y el resumen-gerencial ya no expone el bloque muerto
 *   `ventas: {disponible:false}` (se retiró en este mismo P0).
 * Las agregaciones SQL en sí (margen, kilos, Pareto) están cubiertas por
 * tests puros sin I/O: ver ../../lib/ventas-siesa.test.ts
 * (calcularParetoClientes) y ./siesa-ventas-where.test.ts
 * (construirWhereHistorico, filtros vendedor/cliente/producto).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Analítica Comercial — /analitica/ventas* (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantId: string;
  let tokenAdmin: string;
  let tokenSinPermiso: string;

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
    const tenant = await prisma.tenant.create({
      data: {
        nombre: `Analitica Ventas Tenant ${sufijo}`,
        subdomain: `test-analitica-v-${sufijo}`,
      },
    });
    tenantId = tenant.id;

    await prisma.user.create({
      data: {
        tenantId,
        email: `analitica-admin-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId,
        email: `analitica-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        isSuperadmin: false,
        activo: true,
      },
    });

    tokenAdmin = await login(`analitica-admin-${sufijo}@test.ricosoft.local`);
    tokenSinPermiso = await login(`analitica-sinpermiso-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    await prisma.auditoria.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const ENDPOINTS = [
    "/api/analitica/ventas",
    "/api/analitica/ventas/vendedores",
    "/api/analitica/ventas/historico",
    "/api/analitica/ventas/clientes",
  ];

  for (const endpoint of ENDPOINTS) {
    it(`GET ${endpoint} responde 200 con disponible:false cuando el tenant no tiene siesaCiaId (nunca 500)`, async () => {
      const res = await request(app).get(endpoint).set("Authorization", `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(false);
      expect(typeof res.body.motivo).toBe("string");
    });

    it(`GET ${endpoint} responde 403 sin el permiso analitica.ver`, async () => {
      const res = await request(app)
        .get(endpoint)
        .set("Authorization", `Bearer ${tokenSinPermiso}`);
      expect(res.status).toBe(403);
    });

    it(`GET ${endpoint} responde 401 sin token de autenticación`, async () => {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
    });
  }

  it("GET /ventas/clientes acepta el filtro `limite` sin romperse (validación de query, no de datos)", async () => {
    const res = await request(app)
      .get("/api/analitica/ventas/clientes")
      .query({ limite: 10 })
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false); // sin siesaCiaId, igual que el resto
    expect(res.body.clientes).toEqual([]);
  });

  it("GET /ventas/historico acepta los filtros de drill-down (vendedorRowId/clienteRowId/itemRowId) sin romperse", async () => {
    const res = await request(app)
      .get("/api/analitica/ventas/historico")
      .query({ vendedorRowId: 1, clienteRowId: 2, itemRowId: 3 })
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
    expect(res.body.items).toEqual([]);
  });

  it("resumen-gerencial ya NO expone el bloque muerto ventas:{disponible:false} (retirado en este P0)", async () => {
    const res = await request(app)
      .get("/api/analitica/resumen-gerencial")
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.ventas).toBeUndefined();
    // Lo que sí debe seguir presente: financiero/cartera, sin tocar.
    expect(res.body).toHaveProperty("financieroSiesa");
    expect(res.body).toHaveProperty("cartera");
    expect(res.body).toHaveProperty("cuentasPorPagar");
  });

  it("un tenant sin siesaCiaId nunca ve datos de ventas de otro tenant (aislamiento, no solo ausencia de datos)", async () => {
    // No hay un segundo tenant CON siesaCiaId disponible en CI (requiere
    // túnel VPN real hacia Siesa) — lo que sí se puede probar aquí sin red
    // es que el ciaId nunca sale del query/body del cliente: no existe
    // ningún parámetro `ciaId`/`siesaCiaId` aceptado por estos endpoints
    // (ver parseRangoVentasQuery/analitica.controller.ts — se resuelve
    // SIEMPRE de Tenant.siesaCiaId en BD), así que intentar inyectarlo no
    // tiene ningún efecto.
    const res = await request(app)
      .get("/api/analitica/ventas")
      .query({ siesaCiaId: 999, ciaId: 999 })
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false); // el tenant real sigue sin siesaCiaId, el query se ignora
  });
});
