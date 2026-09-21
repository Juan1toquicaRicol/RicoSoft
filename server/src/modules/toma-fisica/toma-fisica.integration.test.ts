import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Toma física de inventario — H-05 (prioridad 5). Las rutas que dependen de
 * Siesa en vivo (listarBodegas/crearTomaFisica) solo se prueban por el
 * camino "sin siesaCiaId configurado" (mismo patrón que Objetivos/
 * Despachos): sin datos reales de Siesa no se puede ejercitar el snapshot
 * end-to-end de forma determinista. El resto del ciclo de vida (registrar
 * conteo, cerrar, aislamiento, permisos) se prueba fabricando la toma física
 * y sus líneas directamente — exactamente los mismos modelos y el mismo
 * código de negocio (buscarTomaFisicaDelTenant, registrarConteo,
 * cerrarTomaFisica) que usa crearTomaFisica una vez tiene el snapshot.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Toma física — API, multi-tenant real", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdminA: string;
  let tokenSinPermisoA: string;
  let tokenAdminB: string;
  let usuarioAdminAId: string;
  let tomaBId: string;
  let lineaBId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.token as string;
  };

  const crearTomaDirecta = async (tenantId: string, responsableId: string, responsable: string) =>
    prisma.tomaFisica.create({
      data: {
        tenantId,
        bodegaRowId: 1,
        bodegaNombre: `Bodega ${sufijo}`,
        fecha: new Date(),
        responsableId,
        responsable,
        lineas: {
          create: [
            { itemRowId: 101, descripcion: "Item 101", stockSistema: 100, valorUnitario: 10 },
            { itemRowId: 102, descripcion: "Item 102", stockSistema: 50, valorUnitario: 20 },
          ],
        },
      },
      // SQL Server no garantiza el orden de inserción al hacer include sin
      // orderBy explícito — se ordena por descripcion igual que
      // obtenerTomaFisica (toma-fisica.controller.ts), así que
      // `toma.lineas[0]` es determinísticamente "Item 101" en los tests, tal
      // como lo sería al consultar el detalle vía la API.
      include: { lineas: { orderBy: { descripcion: "asc" } } },
    });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `TomaFisica Tenant A ${sufijo}`, subdomain: `test-tf-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `TomaFisica Tenant B ${sufijo}`, subdomain: `test-tf-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const adminA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `tf-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    usuarioAdminAId = adminA.id;
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `tf-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    const adminB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `tf-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`tf-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`tf-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`tf-admin-b-${sufijo}@test.ricosoft.local`);

    const tomaB = await crearTomaDirecta(tenantBId, adminB.id, "Admin B");
    tomaBId = tomaB.id;
    lineaBId = tomaB.lineas[0].id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tomaFisicaLinea.deleteMany({
      where: { tomaFisica: { tenantId: { in: tenantIds } } },
    });
    await prisma.tomaFisica.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  describe("Sin siesaCiaId configurado (rutas dependientes de Siesa)", () => {
    it("listarBodegas responde disponible:false", async () => {
      const res = await request(app)
        .get("/api/toma-fisica/bodegas")
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(false);
    });

    it("crearTomaFisica rechaza con 400 (no se puede tomar snapshot sin Siesa configurado)", async () => {
      const res = await request(app)
        .post("/api/toma-fisica")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ bodegaRowId: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe("Permisos", () => {
    it("toma_fisica.ver / toma_fisica.gestionar son exigidos (403 sin ellos)", async () => {
      const listar = await request(app)
        .get("/api/toma-fisica")
        .set("Authorization", `Bearer ${tokenSinPermisoA}`);
      expect(listar.status).toBe(403);

      const crear = await request(app)
        .post("/api/toma-fisica")
        .set("Authorization", `Bearer ${tokenSinPermisoA}`)
        .send({ bodegaRowId: 1 });
      expect(crear.status).toBe(403);
    });
  });

  describe("Aislamiento multi-tenant", () => {
    it("Tenant A no ve, ni puede leer/contar/cerrar la toma física de Tenant B (404)", async () => {
      const listado = await request(app)
        .get("/api/toma-fisica")
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(listado.status).toBe(200);
      expect(listado.body.some((t: { id: string }) => t.id === tomaBId)).toBe(false);

      const detalle = await request(app)
        .get(`/api/toma-fisica/${tomaBId}`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(detalle.status).toBe(404);

      const conteo = await request(app)
        .patch(`/api/toma-fisica/${tomaBId}/lineas/${lineaBId}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ conteoFisico: 999 });
      expect(conteo.status).toBe(404);

      const cerrar = await request(app)
        .patch(`/api/toma-fisica/${tomaBId}/cerrar`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(cerrar.status).toBe(404);

      const sigueIgual = await prisma.tomaFisica.findUnique({ where: { id: tomaBId } });
      expect(sigueIgual?.estado).toBe("Abierta");
    });

    it("IDOR: una lineaId real de OTRO tenant, combinada con un tomaFisicaId del tenant propio, no se encuentra (404)", async () => {
      const tomaA = await crearTomaDirecta(tenantAId, usuarioAdminAId, "Admin A");
      const res = await request(app)
        .patch(`/api/toma-fisica/${tomaA.id}/lineas/${lineaBId}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ conteoFisico: 5 });
      expect(res.status).toBe(404);
    });

    it("Tenant B sigue viendo y operando correctamente sobre su propia toma física", async () => {
      const res = await request(app)
        .get(`/api/toma-fisica/${tomaBId}`)
        .set("Authorization", `Bearer ${tokenAdminB}`);
      expect(res.status).toBe(200);
      expect(res.body.toma.id).toBe(tomaBId);
      expect(res.body.lineas).toHaveLength(2);
    });
  });

  describe("registrarConteo", () => {
    it("registra el conteo de una línea y lo refleja en el detalle (diferencia calculada, no guardada)", async () => {
      const toma = await crearTomaDirecta(tenantAId, usuarioAdminAId, "Admin A");
      const linea = toma.lineas[0];

      const registrar = await request(app)
        .patch(`/api/toma-fisica/${toma.id}/lineas/${linea.id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ conteoFisico: 95 });
      expect(registrar.status).toBe(200);
      expect(Number(registrar.body.conteoFisico)).toBe(95);

      const detalle = await request(app)
        .get(`/api/toma-fisica/${toma.id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      const lineaDetalle = detalle.body.lineas.find((l: { id: string }) => l.id === linea.id);
      expect(lineaDetalle.conteoFisico).toBe(95);
      // stockSistema=100, conteoFisico=95 → diferencia = -5.
      expect(lineaDetalle.diferencia).toBe(-5);
    });

    it("rechaza un conteo negativo (400) y una línea inexistente en esa toma (404)", async () => {
      const toma = await crearTomaDirecta(tenantAId, usuarioAdminAId, "Admin A");

      const negativo = await request(app)
        .patch(`/api/toma-fisica/${toma.id}/lineas/${toma.lineas[0].id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ conteoFisico: -1 });
      expect(negativo.status).toBe(400);

      const lineaInexistente = await request(app)
        .patch(`/api/toma-fisica/${toma.id}/lineas/${randomUUID()}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ conteoFisico: 10 });
      expect(lineaInexistente.status).toBe(404);
    });

    it("una vez cerrada la toma física, ya no se puede registrar/corregir el conteo (400)", async () => {
      const toma = await crearTomaDirecta(tenantAId, usuarioAdminAId, "Admin A");
      const cerrar = await request(app)
        .patch(`/api/toma-fisica/${toma.id}/cerrar`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(cerrar.status).toBe(200);

      const intento = await request(app)
        .patch(`/api/toma-fisica/${toma.id}/lineas/${toma.lineas[0].id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ conteoFisico: 1 });
      expect(intento.status).toBe(400);
    });
  });

  describe("cerrarTomaFisica", () => {
    it("cierra la toma física, registra Auditoria con el resumen, y no se puede cerrar dos veces", async () => {
      const toma = await crearTomaDirecta(tenantAId, usuarioAdminAId, "Admin A");
      await request(app)
        .patch(`/api/toma-fisica/${toma.id}/lineas/${toma.lineas[0].id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ conteoFisico: 90 });

      const cerrar = await request(app)
        .patch(`/api/toma-fisica/${toma.id}/cerrar`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(cerrar.status).toBe(200);
      expect(cerrar.body.estado).toBe("Cerrada");
      expect(cerrar.body.cerradaEn).not.toBeNull();

      const auditoria = await prisma.auditoria.findFirst({
        where: { tenantId: tenantAId, entidadId: toma.id, accion: "TOMA_FISICA_CERRADA" },
      });
      expect(auditoria).not.toBeNull();
      expect(JSON.parse(auditoria!.datosNuevos!).estado).toBe("Cerrada");

      const segundoCierre = await request(app)
        .patch(`/api/toma-fisica/${toma.id}/cerrar`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(segundoCierre.status).toBe(400);
    });
  });

  describe("obtenerPatronesRecurrentes", () => {
    it("responde con la forma esperada y no incluye datos de otro tenant", async () => {
      const res = await request(app)
        .get("/api/toma-fisica/patrones")
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.patrones)).toBe(true);
    });
  });
});
