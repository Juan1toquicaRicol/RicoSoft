import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Fase G del Centro de Planeación — acciones "Crear plan de producción" y
 * "Gestionar liquidación" originadas desde una DecisionPlaneacion. Cubre lo
 * que pidió el spec: creación correcta con los datos que el motor ya
 * calculó (sin recalcular nada en el backend de este test), enforcement de
 * permisos, y aislamiento multi-tenant verificado contra el cliente Prisma
 * BASE (no tenantPrisma) para no validar el mecanismo con el mismo
 * mecanismo que se prueba.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Fase G — acciones del Centro de Decisiones (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdminA: string;
  let tokenSinPermisoA: string;
  let tokenAdminB: string;
  let planBId: string;
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

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Fase G Tenant A ${sufijo}`, subdomain: `test-faseg-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Fase G Tenant B ${sufijo}`, subdomain: `test-faseg-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `faseg-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    // Usuario normal, sin rol ni permisos directos: permisos efectivos = conjunto vacío.
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `faseg-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    const adminB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `faseg-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`faseg-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`faseg-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`faseg-admin-b-${sufijo}@test.ricosoft.local`);

    const planB = await prisma.planProduccion.create({
      data: {
        tenantId: tenantBId,
        itemRowId: 999,
        descripcion: `Producto de B ${sufijo}`,
        cantidadPlaneada: 100,
        fechaPlaneada: new Date(),
        responsableId: adminB.id,
        responsable: "Admin B",
      },
    });
    planBId = planB.id;

    const gestionB = await prisma.gestionLiquidacion.create({
      data: {
        tenantId: tenantBId,
        itemRowId: 888,
        descripcion: `Ítem liquidable de B ${sufijo}`,
        cantidadExistente: 50,
        valorTotal: 5_000_000,
        score: 90,
        categoria: "CRITICA",
        motivo: "Sin vender hace 300 días.",
        responsableId: adminB.id,
        responsable: "Admin B",
      },
    });
    gestionBId = gestionB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.gestionLiquidacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.planProduccion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  describe("PRODUCIR — Crear plan de producción desde una decisión", () => {
    it("crea un PlanProduccion con producto y cantidad exactos, tomados de la decisión (no recalculados)", async () => {
      const res = await request(app)
        .post("/api/plan-produccion")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({
          itemRowId: 4400,
          descripcion: "PET JADE CZ-302",
          referencia: "CZ-302",
          unidadMedida: "KG",
          cantidadPlaneada: 67466.67,
          fechaPlaneada: new Date().toISOString(),
          // Conserva la referencia a la recomendación que la originó, sin
          // ampliar el schema — reutiliza el campo `notas` ya existente.
          notas:
            "Generado desde el Centro de Decisiones: capacidad real 67.466,67 (sin materia limitante), confianza alta.",
        });

      expect(res.status).toBe(201);
      expect(res.body.itemRowId).toBe(4400);
      expect(Number(res.body.cantidadPlaneada)).toBeCloseTo(67466.67, 1);
      expect(res.body.estado).toBe("Planificada");
      expect(res.body.notas).toContain("Centro de Decisiones");

      const enDb = await prisma.planProduccion.findUnique({ where: { id: res.body.id } });
      expect(enDb?.tenantId).toBe(tenantAId);
    });

    it("un usuario sin permiso plan_produccion.gestionar no puede crear un plan", async () => {
      const res = await request(app)
        .post("/api/plan-produccion")
        .set("Authorization", `Bearer ${tokenSinPermisoA}`)
        .send({
          itemRowId: 1,
          cantidadPlaneada: 10,
          fechaPlaneada: new Date().toISOString(),
        });
      expect(res.status).toBe(403);
    });

    it("Tenant A no puede ver ni avanzar el estado de un PlanProduccion de Tenant B", async () => {
      const listado = await request(app)
        .get("/api/plan-produccion")
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(listado.status).toBe(200);
      expect(listado.body.some((p: { id: string }) => p.id === planBId)).toBe(false);

      const cambio = await request(app)
        .patch(`/api/plan-produccion/${planBId}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "Aprobada" });
      expect(cambio.status).toBe(404);

      const sinTocar = await prisma.planProduccion.findUnique({ where: { id: planBId } });
      expect(sinTocar?.estado).toBe("Planificada");
    });

    it("una solicitud con tenantId falsificado en el body queda igual en el tenant del JWT", async () => {
      const res = await request(app)
        .post("/api/plan-produccion")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({
          itemRowId: 7,
          cantidadPlaneada: 5,
          fechaPlaneada: new Date().toISOString(),
          tenantId: tenantBId,
        });
      expect(res.status).toBe(201);
      const enDb = await prisma.planProduccion.findUnique({ where: { id: res.body.id } });
      expect(enDb?.tenantId).toBe(tenantAId);
    });
  });

  describe("LIQUIDAR — Gestionar liquidación desde una decisión", () => {
    it("crea una GestionLiquidacion con score y categoría exactos, tomados de la decisión", async () => {
      const res = await request(app)
        .post("/api/gestion-liquidacion")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({
          itemRowId: 5,
          descripcion: "Producto obsoleto",
          cantidadExistente: 1250,
          valorTotal: 85_000_000,
          score: 91,
          categoria: "CRITICA",
          motivo: "Sin vender hace 240 días, sin demanda reciente — 85.0M de capital inmovilizado.",
        });

      expect(res.status).toBe(201);
      expect(res.body.score).toBe(91);
      expect(res.body.categoria).toBe("CRITICA");
      expect(res.body.estado).toBe("PENDIENTE");
      expect(Number(res.body.valorTotal)).toBe(85_000_000);

      const enDb = await prisma.gestionLiquidacion.findUnique({ where: { id: res.body.id } });
      expect(enDb?.tenantId).toBe(tenantAId);
    });

    it("un usuario sin permiso gestion_liquidacion.gestionar no puede crear una gestión", async () => {
      const res = await request(app)
        .post("/api/gestion-liquidacion")
        .set("Authorization", `Bearer ${tokenSinPermisoA}`)
        .send({
          itemRowId: 1,
          cantidadExistente: 10,
          valorTotal: 1000,
          score: 50,
          categoria: "MEDIA",
          motivo: "Motivo de prueba.",
        });
      expect(res.status).toBe(403);
    });

    it("respeta la máquina de estados: no se puede pasar de PENDIENTE a EJECUTADA sin aprobar antes", async () => {
      const creada = await request(app)
        .post("/api/gestion-liquidacion")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({
          itemRowId: 2,
          cantidadExistente: 5,
          valorTotal: 1000,
          score: 60,
          categoria: "ALTA",
          motivo: "Motivo de prueba.",
        });
      expect(creada.status).toBe(201);

      const salto = await request(app)
        .patch(`/api/gestion-liquidacion/${creada.body.id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "EJECUTADA" });
      expect(salto.status).toBe(400);

      const secuenciaValida = await request(app)
        .patch(`/api/gestion-liquidacion/${creada.body.id}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "EN_REVISION" });
      expect(secuenciaValida.status).toBe(200);
      expect(secuenciaValida.body.estado).toBe("EN_REVISION");
    });

    it("Tenant A no puede ver ni avanzar el estado de una GestionLiquidacion de Tenant B", async () => {
      const listado = await request(app)
        .get("/api/gestion-liquidacion")
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(listado.status).toBe(200);
      expect(listado.body.some((g: { id: string }) => g.id === gestionBId)).toBe(false);

      const cambio = await request(app)
        .patch(`/api/gestion-liquidacion/${gestionBId}/estado`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ estado: "EN_REVISION" });
      expect(cambio.status).toBe(404);

      const sinTocar = await prisma.gestionLiquidacion.findUnique({ where: { id: gestionBId } });
      expect(sinTocar?.estado).toBe("PENDIENTE");
    });

    it("Tenant B sigue viendo y operando correctamente sobre su propia gestión de liquidación", async () => {
      const res = await request(app)
        .get("/api/gestion-liquidacion")
        .set("Authorization", `Bearer ${tokenAdminB}`);
      expect(res.status).toBe(200);
      expect(res.body.some((g: { id: string }) => g.id === gestionBId)).toBe(true);
    });
  });
});
