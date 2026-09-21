import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Gestión de liquidación (Centro de Planeación → decisión "liquidar") —
 * H-05 (prioridad 6, última del bloque). Cubre creación, la máquina de
 * estados (PENDIENTE→EN_REVISION→APROBADA→EJECUTADA, con RECHAZADA
 * alcanzable hasta antes de EJECUTADA), permisos y aislamiento multi-tenant
 * — este módulo usa req.tenantPrisma (GestionLiquidacion está en
 * MODELOS_TENANT_SCOPED, ver lib/tenant-prisma.ts), así que también sirve
 * como regresión de que ese enforcement automático funciona de verdad
 * contra la base real, no solo en el código del wrapper.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Gestión de liquidación — API, multi-tenant real", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdminA: string;
  let tokenSinPermisoA: string;
  let tokenAdminB: string;
  let gestionBId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.token as string;
  };

  const payloadBase = (overrides: Record<string, unknown> = {}) => ({
    itemRowId: 12345,
    descripcion: `Item de prueba ${sufijo}`,
    referencia: "REF-001",
    cantidadExistente: 500,
    valorTotal: 2_500_000,
    score: 85,
    categoria: "ALTA",
    motivo: "Inventario de baja rotación con más de 180 días sin movimiento.",
    ...overrides,
  });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `GestLiq Tenant A ${sufijo}`, subdomain: `test-gl-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `GestLiq Tenant B ${sufijo}`, subdomain: `test-gl-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `gl-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `gl-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    const adminB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `gl-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`gl-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`gl-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`gl-admin-b-${sufijo}@test.ricosoft.local`);

    const gestionB = await prisma.gestionLiquidacion.create({
      data: {
        tenantId: tenantBId,
        itemRowId: 999,
        cantidadExistente: 10,
        valorTotal: 100000,
        score: 50,
        categoria: "MEDIA",
        motivo: "Motivo B",
        responsableId: adminB.id,
        responsable: "Admin B",
      },
    });
    gestionBId = gestionB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.gestionLiquidacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("crea una gestión de liquidación con estado inicial PENDIENTE y registra Auditoria", async () => {
    const res = await request(app)
      .post("/api/gestion-liquidacion")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(payloadBase());
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("PENDIENTE");
    expect(res.body.categoria).toBe("ALTA");
    expect(Number(res.body.valorTotal)).toBe(2_500_000);
    expect(res.body.responsable).toBe("Admin A");

    const auditoria = await prisma.auditoria.findFirst({
      where: { tenantId: tenantAId, entidadId: res.body.id, accion: "GESTION_LIQUIDACION_CREADA" },
    });
    expect(auditoria).not.toBeNull();
  });

  it("valida forma: itemRowId/cantidadExistente/valorTotal/score/categoria/motivo son obligatorios", async () => {
    const sinMotivo = await request(app)
      .post("/api/gestion-liquidacion")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(payloadBase({ motivo: "" }));
    expect(sinMotivo.status).toBe(400);

    const categoriaInvalida = await request(app)
      .post("/api/gestion-liquidacion")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(payloadBase({ categoria: "URGENTE" }));
    expect(categoriaInvalida.status).toBe(400);

    const scoreFueraDeRango = await request(app)
      .post("/api/gestion-liquidacion")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(payloadBase({ score: 150 }));
    expect(scoreFueraDeRango.status).toBe(400);

    const valorNegativo = await request(app)
      .post("/api/gestion-liquidacion")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(payloadBase({ valorTotal: -1 }));
    expect(valorNegativo.status).toBe(400);
  });

  it("permisos: gestion_liquidacion.ver / .gestionar son exigidos (403 sin ellos)", async () => {
    const listar = await request(app)
      .get("/api/gestion-liquidacion")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`);
    expect(listar.status).toBe(403);

    const crear = await request(app)
      .post("/api/gestion-liquidacion")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`)
      .send(payloadBase());
    expect(crear.status).toBe(403);
  });

  it("aislamiento: Tenant A no ve ni puede cambiar el estado de la gestión de Tenant B (404, vía tenantPrisma)", async () => {
    const listado = await request(app)
      .get("/api/gestion-liquidacion")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(listado.status).toBe(200);
    expect(listado.body.some((g: { id: string }) => g.id === gestionBId)).toBe(false);

    const cambiarEstado = await request(app)
      .patch(`/api/gestion-liquidacion/${gestionBId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ estado: "EN_REVISION" });
    expect(cambiarEstado.status).toBe(404);

    const sigueIgual = await prisma.gestionLiquidacion.findUnique({ where: { id: gestionBId } });
    expect(sigueIgual?.estado).toBe("PENDIENTE");
  });

  it("Tenant B sigue viendo y operando correctamente sobre su propia gestión", async () => {
    const res = await request(app)
      .patch(`/api/gestion-liquidacion/${gestionBId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminB}`)
      .send({ estado: "EN_REVISION" });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("EN_REVISION");
  });

  describe("Máquina de estados", () => {
    it("recorre el camino feliz completo PENDIENTE→EN_REVISION→APROBADA→EJECUTADA, y EJECUTADA es terminal", async () => {
      const creada = await request(app)
        .post("/api/gestion-liquidacion")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send(payloadBase({ itemRowId: 20001 }));
      expect(creada.status).toBe(201);
      const id = creada.body.id;

      const aEnRevision = await request(app)
        .patch(`/api/gestion-liquidacion/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "EN_REVISION" });
      expect(aEnRevision.status).toBe(200);

      const aAprobada = await request(app)
        .patch(`/api/gestion-liquidacion/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "APROBADA" });
      expect(aAprobada.status).toBe(200);

      const aEjecutada = await request(app)
        .patch(`/api/gestion-liquidacion/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "EJECUTADA" });
      expect(aEjecutada.status).toBe(200);
      expect(aEjecutada.body.estado).toBe("EJECUTADA");

      // Terminal: ninguna transición más es válida.
      const intentoPosterior = await request(app)
        .patch(`/api/gestion-liquidacion/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "RECHAZADA" });
      expect(intentoPosterior.status).toBe(400);

      const auditorias = await prisma.auditoria.findMany({
        where: { tenantId: tenantAId, entidadId: id },
        orderBy: { createdAt: "asc" },
      });
      const acciones = auditorias.map((a) => a.accion);
      expect(acciones).toContain("GESTION_LIQUIDACION_CREADA");
      expect(acciones).toContain("GESTION_LIQUIDACION_EN_REVISION");
      expect(acciones).toContain("GESTION_LIQUIDACION_APROBADA");
      expect(acciones).toContain("GESTION_LIQUIDACION_EJECUTADA");
    });

    it("RECHAZADA es alcanzable desde PENDIENTE, EN_REVISION o APROBADA, y es terminal", async () => {
      const creada = await request(app)
        .post("/api/gestion-liquidacion")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send(payloadBase({ itemRowId: 20002 }));
      const id = creada.body.id;

      const rechazada = await request(app)
        .patch(`/api/gestion-liquidacion/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "RECHAZADA" });
      expect(rechazada.status).toBe(200);
      expect(rechazada.body.estado).toBe("RECHAZADA");

      const intentoPosterior = await request(app)
        .patch(`/api/gestion-liquidacion/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "EN_REVISION" });
      expect(intentoPosterior.status).toBe(400);
    });

    it("rechaza saltar directamente de PENDIENTE a APROBADA o EJECUTADA", async () => {
      const creada = await request(app)
        .post("/api/gestion-liquidacion")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send(payloadBase({ itemRowId: 20003 }));
      const id = creada.body.id;

      const aAprobadaDirecto = await request(app)
        .patch(`/api/gestion-liquidacion/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "APROBADA" });
      expect(aAprobadaDirecto.status).toBe(400);

      const aEjecutadaDirecto = await request(app)
        .patch(`/api/gestion-liquidacion/${id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "EJECUTADA" });
      expect(aEjecutadaDirecto.status).toBe(400);

      const sigueIgual = await prisma.gestionLiquidacion.findUnique({ where: { id } });
      expect(sigueIgual?.estado).toBe("PENDIENTE");
    });

    it("gestión inexistente al cambiar estado → 404; estado inválido en el body → 400", async () => {
      const noExiste = await request(app)
        .patch(`/api/gestion-liquidacion/${randomUUID()}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "EN_REVISION" });
      expect(noExiste.status).toBe(404);

      const creada = await request(app)
        .post("/api/gestion-liquidacion")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send(payloadBase({ itemRowId: 20004 }));
      const estadoInvalido = await request(app)
        .patch(`/api/gestion-liquidacion/${creada.body.id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "COMPLETAMENTE_INVENTADO" });
      expect(estadoInvalido.status).toBe(400);
    });
  });
});
