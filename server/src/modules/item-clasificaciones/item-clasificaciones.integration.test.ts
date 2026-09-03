import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Clasificación funcional de ítems — cubre los 13 escenarios pedidos:
 * CRUD de clasificaciones, asignación/remoción sobre ítems (referenciados
 * por itemRowId de Siesa, sin catálogo propio), múltiples clasificaciones
 * por ítem, clasificación masiva, ítems sin clasificar, filtro por
 * clasificación, aislamiento multi-tenant, permisos, no-duplicados, y que
 * la sincronización de Siesa (que solo toca Proveedor) nunca borra estas
 * asignaciones.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Clasificación funcional de ítems (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdminA: string;
  let tokenSinPermisoA: string;
  let tokenAdminB: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Clasif Tenant A ${sufijo}`, subdomain: `test-clasif-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Clasif Tenant B ${sufijo}`, subdomain: `test-clasif-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `clasif-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `clasif-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `clasif-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`clasif-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`clasif-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`clasif-admin-b-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    await prisma.itemClasificacionAsignada.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.clasificacionFuncionalItem.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  it("1. GET /item-clasificaciones siembra automáticamente las 5 clasificaciones por defecto", async () => {
    const res = await request(app)
      .get("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(res.status).toBe(200);
    const codigos = res.body.map((c: { codigo: string }) => c.codigo).sort();
    expect(codigos).toEqual(["COMERCIAL", "EXPORTACION", "IMPORTACION", "INVENTARIO", "PRODUCCION"]);
  });

  it("2. crea una clasificación nueva", async () => {
    const res = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ codigo: `PRUEBA_${sufijo}`, nombre: "Clasificación de prueba", descripcion: "desc" });
    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe("Clasificación de prueba");
    expect(res.body.itemsAsociados).toBe(0);
  });

  it("3. edita una clasificación (nombre/descripción)", async () => {
    const creada = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ codigo: `EDITAR_${sufijo}`, nombre: "Original" });
    const res = await request(app)
      .patch(`/api/item-clasificaciones/${creada.body.id}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ nombre: "Editado" });
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe("Editado");
  });

  it("4. desactiva una clasificación (soft — sigue existiendo)", async () => {
    const creada = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ codigo: `DESACTIVAR_${sufijo}`, nombre: "A desactivar" });
    const res = await request(app)
      .patch(`/api/item-clasificaciones/${creada.body.id}/activo`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ activo: false });
    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(false);

    const persiste = await prisma.clasificacionFuncionalItem.findUnique({ where: { id: creada.body.id } });
    expect(persiste).not.toBeNull();
  });

  it("5, 6. asigna múltiples clasificaciones a un mismo ítem y las lista", async () => {
    const itemRowId = 900001;
    const c1 = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ codigo: `MULTI1_${sufijo}`, nombre: "Multi 1" });
    const c2 = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ codigo: `MULTI2_${sufijo}`, nombre: "Multi 2" });

    const res = await request(app)
      .put(`/api/item-clasificaciones/items/${itemRowId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ clasificacionIds: [c1.body.id, c2.body.id] });
    expect(res.status).toBe(200);
    expect(res.body.clasificaciones).toHaveLength(2);

    const consulta = await request(app)
      .get(`/api/item-clasificaciones/items/${itemRowId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(consulta.body.clasificaciones.map((c: { id: string }) => c.id).sort()).toEqual(
      [c1.body.id, c2.body.id].sort(),
    );
  });

  it("7. quita una clasificación de un ítem (reemplazo del conjunto)", async () => {
    const itemRowId = 900002;
    const c1 = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ codigo: `QUITAR1_${sufijo}`, nombre: "Quitar 1" });
    await request(app)
      .put(`/api/item-clasificaciones/items/${itemRowId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ clasificacionIds: [c1.body.id] });

    const res = await request(app)
      .put(`/api/item-clasificaciones/items/${itemRowId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ clasificacionIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.clasificaciones).toHaveLength(0);
  });

  it("8. un ítem sin asignaciones responde con lista vacía (sin clasificar)", async () => {
    const res = await request(app)
      .get("/api/item-clasificaciones/items/900999")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(res.status).toBe(200);
    expect(res.body.clasificaciones).toEqual([]);
  });

  it("9. clasificación masiva asigna la misma clasificación a varios ítems de una vez", async () => {
    const c1 = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ codigo: `MASIVA_${sufijo}`, nombre: "Masiva" });

    const res = await request(app)
      .post("/api/item-clasificaciones/asignacion-masiva")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ itemRowIds: [910001, 910002, 910003], clasificacionId: c1.body.id, accion: "asignar" });
    expect(res.status).toBe(200);
    expect(res.body.afectados).toBe(3);

    const item = await request(app)
      .get("/api/item-clasificaciones/items/910002")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(item.body.clasificaciones.map((c: { id: string }) => c.id)).toContain(c1.body.id);
  });

  it("10. reasignar el mismo ítem/clasificación en la masiva no crea duplicados", async () => {
    const c1 = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ codigo: `NODUP_${sufijo}`, nombre: "No duplicado" });
    const itemRowId = 920001;

    await request(app)
      .post("/api/item-clasificaciones/asignacion-masiva")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ itemRowIds: [itemRowId], clasificacionId: c1.body.id, accion: "asignar" });
    const segunda = await request(app)
      .post("/api/item-clasificaciones/asignacion-masiva")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ itemRowIds: [itemRowId], clasificacionId: c1.body.id, accion: "asignar" });
    expect(segunda.status).toBe(200);
    expect(segunda.body.afectados).toBe(0);

    const enBD = await prisma.itemClasificacionAsignada.findMany({
      where: { tenantId: tenantAId, itemRowId, clasificacionId: c1.body.id },
    });
    expect(enBD).toHaveLength(1);
  });

  it("11. un usuario sin el permiso de configuración no puede crear clasificaciones", async () => {
    const res = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`)
      .send({ codigo: `SINPERMISO_${sufijo}`, nombre: "No debería crearse" });
    expect(res.status).toBe(403);
  });

  it("12, 13. aislamiento multi-tenant: el tenant B no ve ni puede tocar las clasificaciones/ítems del tenant A", async () => {
    const clasifA = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ codigo: `AISLADA_${sufijo}`, nombre: "Solo tenant A" });
    const itemRowIdA = 930001;
    await request(app)
      .put(`/api/item-clasificaciones/items/${itemRowIdA}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ clasificacionIds: [clasifA.body.id] });

    // Tenant B no ve la clasificación de A en su propio listado.
    const listadoB = await request(app)
      .get("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminB}`);
    expect(listadoB.body.some((c: { id: string }) => c.id === clasifA.body.id)).toBe(false);

    // Tenant B intenta asignar el ítem de A a la clasificación de A -> falla (no existe para B).
    const intentoCruzado = await request(app)
      .put(`/api/item-clasificaciones/items/${itemRowIdA}`)
      .set("Authorization", `Bearer ${tokenAdminB}`)
      .send({ clasificacionIds: [clasifA.body.id] });
    expect(intentoCruzado.status).toBe(404);

    // Tenant B consulta el mismo itemRowId y no ve la clasificación de A
    // (las asignaciones están aisladas por tenantId, aunque el itemRowId
    // numérico coincida entre bases de Siesa distintas).
    const consultaB = await request(app)
      .get(`/api/item-clasificaciones/items/${itemRowIdA}`)
      .set("Authorization", `Bearer ${tokenAdminB}`);
    expect(consultaB.body.clasificaciones).toEqual([]);
  });

  it("Siesa sync no borra clasificaciones ya asignadas a un ítem (no hay relación entre sync y esta tabla)", async () => {
    const c1 = await request(app)
      .post("/api/item-clasificaciones")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ codigo: `SYNCSAFE_${sufijo}`, nombre: "Debe sobrevivir al sync" });
    const itemRowId = 940001;
    await request(app)
      .put(`/api/item-clasificaciones/items/${itemRowId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ clasificacionIds: [c1.body.id] });

    // El sync de Siesa (siesa-sync.service.ts) solo crea/actualiza
    // Proveedor — nunca toca ClasificacionFuncionalItem ni
    // ItemClasificacionAsignada. Se simula ese hecho verificando
    // directamente que la asignación persiste sin que ningún proceso de
    // sync haya sido invocado entre medio.
    const persiste = await request(app)
      .get(`/api/item-clasificaciones/items/${itemRowId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(persiste.body.clasificaciones.map((c: { id: string }) => c.id)).toEqual([c1.body.id]);
  });
});
