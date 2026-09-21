import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Servicios/Suscripciones — H-05 (prioridad 4). Cubre CRUD, aislamiento
 * multi-tenant, permisos, soft-delete, cambio de estado, paginación
 * opt-in y validación de campos.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Servicios/Suscripciones — API, multi-tenant real", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdminA: string;
  let tokenSinPermisoA: string;
  let tokenAdminB: string;
  let servicioBId: string;
  let proveedorAId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.token as string;
  };

  const servicioBase = (overrides: Record<string, unknown> = {}) => ({
    empresaId: "RICOL",
    area: "TI",
    nombreServicio: `Servicio ${sufijo}`,
    proveedor: "Proveedor Texto Libre",
    periodicidad: "Mensual",
    costo: 100000,
    moneda: "COP",
    fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    ...overrides,
  });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Servicios Tenant A ${sufijo}`, subdomain: `test-serv-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Servicios Tenant B ${sufijo}`, subdomain: `test-serv-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `serv-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `serv-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `serv-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    const proveedorA = await prisma.proveedor.create({
      data: { tenantId: tenantAId, nit: `NIT-SERV-${sufijo}`, nombre: "Proveedor A", activo: true },
    });
    proveedorAId = proveedorA.id;

    tokenAdminA = await login(`serv-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`serv-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`serv-admin-b-${sufijo}@test.ricosoft.local`);

    const servicioB = await prisma.servicioSuscripcion.create({
      data: {
        tenantId: tenantBId,
        empresaId: "FLEXIPACK",
        area: "TI",
        nombreServicio: `Servicio B ${sufijo}`,
        proveedor: "Proveedor B",
        periodicidad: "Mensual",
        costo: 50000,
        moneda: "COP",
        fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        responsableArea: "Líder de Área",
      },
    });
    servicioBId = servicioB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.servicioSuscripcion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("crea un servicio (resolviendo el nombre del proveedor por id) y registra Auditoria", async () => {
    const res = await request(app)
      .post("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase({ proveedorId: proveedorAId, proveedor: undefined }));
    expect(res.status).toBe(201);
    expect(res.body.proveedor).toBe("Proveedor A");
    expect(res.body.costo).toBe(100000);
    expect(res.body.estado).toBe("Activo");

    const auditoria = await prisma.auditoria.findFirst({
      where: { tenantId: tenantAId, entidadId: res.body.id, accion: "SERVICIO_CREADO" },
    });
    expect(auditoria).not.toBeNull();
  });

  it("rechaza un proveedorId inexistente/inactivo (404) y campos obligatorios faltantes (400)", async () => {
    const proveedorInvalido = await request(app)
      .post("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase({ proveedorId: randomUUID() }));
    expect(proveedorInvalido.status).toBe(404);

    const sinNombre = await request(app)
      .post("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase({ nombreServicio: "" }));
    expect(sinNombre.status).toBe(400);

    const costoNegativo = await request(app)
      .post("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase({ costo: -5 }));
    expect(costoNegativo.status).toBe(400);

    const diaFueraDeRango = await request(app)
      .post("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase({ diaVencimiento: 32 }));
    expect(diaFueraDeRango.status).toBe(400);
  });

  it("un proveedorId de OTRO tenant es rechazado como inexistente (404, IDOR)", async () => {
    const proveedorB = await prisma.proveedor.create({
      data: {
        tenantId: tenantBId,
        nit: `NIT-SERV-B-${sufijo}`,
        nombre: "Proveedor B",
        activo: true,
      },
    });
    const res = await request(app)
      .post("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase({ proveedorId: proveedorB.id }));
    expect(res.status).toBe(404);
  });

  it("permisos: servicios.crear/ver/editar/eliminar son exigidos (403 sin ellos)", async () => {
    const crear = await request(app)
      .post("/api/servicios")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`)
      .send(servicioBase());
    expect(crear.status).toBe(403);

    const listar = await request(app)
      .get("/api/servicios")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`);
    expect(listar.status).toBe(403);
  });

  it("aislamiento: Tenant A no ve, no puede editar, ni eliminar el servicio de Tenant B (404)", async () => {
    const listado = await request(app)
      .get("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(listado.status).toBe(200);
    expect(listado.body.some((s: { id: string }) => s.id === servicioBId)).toBe(false);

    const detalle = await request(app)
      .get(`/api/servicios/${servicioBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(detalle.status).toBe(404);

    const editar = await request(app)
      .put(`/api/servicios/${servicioBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase());
    expect(editar.status).toBe(404);

    const estado = await request(app)
      .patch(`/api/servicios/${servicioBId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(estado.status).toBe(404);

    const eliminar = await request(app)
      .delete(`/api/servicios/${servicioBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(eliminar.status).toBe(404);

    const sigueIgual = await prisma.servicioSuscripcion.findUnique({ where: { id: servicioBId } });
    expect(sigueIgual?.eliminado).toBe(false);
    expect(sigueIgual?.estado).toBe("Activo");
  });

  it("Tenant B sigue viendo y operando correctamente sobre su propio servicio", async () => {
    const res = await request(app)
      .get(`/api/servicios/${servicioBId}`)
      .set("Authorization", `Bearer ${tokenAdminB}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(servicioBId);
  });

  it("edita un servicio existente y registra Auditoria con datosAnteriores/datosNuevos", async () => {
    const creado = await request(app)
      .post("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase({ nombreServicio: `Editable ${sufijo}` }));
    expect(creado.status).toBe(201);

    const editado = await request(app)
      .put(`/api/servicios/${creado.body.id}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase({ nombreServicio: `Editado ${sufijo}`, costo: 250000 }));
    expect(editado.status).toBe(200);
    expect(editado.body.nombreServicio).toBe(`Editado ${sufijo}`);
    expect(editado.body.costo).toBe(250000);

    const auditoria = await prisma.auditoria.findFirst({
      where: { tenantId: tenantAId, entidadId: creado.body.id, accion: "SERVICIO_EDITADO" },
    });
    expect(auditoria).not.toBeNull();
    expect(JSON.parse(auditoria!.datosNuevos!).costo).toBe(250000);
  });

  it("cambia el estado Activo <-> Inactivo (toggle) y registra Auditoria", async () => {
    const creado = await request(app)
      .post("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase({ nombreServicio: `Toggle ${sufijo}` }));
    expect(creado.body.estado).toBe("Activo");

    const desactivado = await request(app)
      .patch(`/api/servicios/${creado.body.id}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(desactivado.status).toBe(200);
    expect(desactivado.body.estado).toBe("Inactivo");

    const reactivado = await request(app)
      .patch(`/api/servicios/${creado.body.id}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(reactivado.status).toBe(200);
    expect(reactivado.body.estado).toBe("Activo");

    const auditorias = await prisma.auditoria.count({
      where: {
        tenantId: tenantAId,
        entidadId: creado.body.id,
        accion: "SERVICIO_ESTADO_CAMBIADO",
      },
    });
    expect(auditorias).toBe(2);
  });

  it("elimina (soft-delete) un servicio: deja de listarse y de poder obtenerse, pero el registro persiste con eliminado=true", async () => {
    const creado = await request(app)
      .post("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send(servicioBase({ nombreServicio: `Borrable ${sufijo}` }));

    const eliminado = await request(app)
      .delete(`/api/servicios/${creado.body.id}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(eliminado.status).toBe(204);

    const detalle = await request(app)
      .get(`/api/servicios/${creado.body.id}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(detalle.status).toBe(404);

    const listado = await request(app)
      .get("/api/servicios")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(listado.body.some((s: { id: string }) => s.id === creado.body.id)).toBe(false);

    const enBaseDeDatos = await prisma.servicioSuscripcion.findUnique({
      where: { id: creado.body.id },
    });
    expect(enBaseDeDatos).not.toBeNull();
    expect(enBaseDeDatos?.eliminado).toBe(true);

    const auditoria = await prisma.auditoria.findFirst({
      where: { tenantId: tenantAId, entidadId: creado.body.id, accion: "SERVICIO_ELIMINADO" },
    });
    expect(auditoria).not.toBeNull();
  });

  it("segunda página no repite resultados de la primera (paginación opt-in con ?page)", async () => {
    // Al menos 3 servicios activos de A ya existen en este punto (creados en
    // tests previos de este archivo) — suficiente para pedir pageSize=1 y
    // comparar dos páginas sin depender de un conteo exacto.
    const pagina1 = await request(app)
      .get("/api/servicios?page=1&pageSize=1")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(pagina1.status).toBe(200);
    expect(pagina1.body.items).toHaveLength(1);
    expect(pagina1.body.page).toBe(1);
    expect(pagina1.body.total).toBeGreaterThanOrEqual(3);

    const pagina2 = await request(app)
      .get("/api/servicios?page=2&pageSize=1")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(pagina2.status).toBe(200);
    expect(pagina2.body.items).toHaveLength(1);
    expect(pagina2.body.items[0].id).not.toBe(pagina1.body.items[0].id);
  });
});
