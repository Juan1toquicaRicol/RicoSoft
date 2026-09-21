import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Membresías (acceso de un usuario a empresas adicionales a la suya) —
 * H-05, prioridad 2. Cubre: aislamiento entre tenants, autoprotección contra
 * escalación de privilegios, membresías activas/inactivas y su efecto real
 * en el login/cambio de empresa, y el flujo completo de superadmin en una
 * empresa miembro sin filtrarse a la empresa hogar.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Membresías — API, multi-tenant real", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tenantInactivoId: string;
  let tokenAdminA: string;
  let tokenAdminB: string;
  let usuarioNormalAId: string;
  let usuarioNormalA2Id: string;
  let rolBId: string;
  let departamentoBId: string;

  // Varios usuarios de este archivo ganan una membresía adicional durante
  // los tests, así que un login posterior con más de un tenant accesible
  // responde requiresTenantSelection=true en vez de un token directo — hay
  // que completar el paso 2 real (POST /api/auth/select-tenant) eligiendo
  // explícitamente el tenant hogar, igual que haría el frontend.
  const login = async (email: string, tenantIdHogar: string = tenantAId): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    if (res.body.token) {
      return res.body.token as string;
    }
    if (res.body.requiresTenantSelection) {
      const seleccion = await request(app)
        .post("/api/auth/select-tenant")
        .send({ selectionToken: res.body.selectionToken, tenantId: tenantIdHogar });
      if (seleccion.status !== 200 || !seleccion.body.token) {
        throw new Error(
          `select-tenant falló para ${email}: ${seleccion.status} ${JSON.stringify(seleccion.body)}`,
        );
      }
      return seleccion.body.token as string;
    }
    throw new Error(
      `Login de prueba sin token ni selección para ${email}: ${JSON.stringify(res.body)}`,
    );
  };

  const switchTenant = async (token: string, tenantId: string) =>
    request(app)
      .post("/api/auth/switch-tenant")
      .set("Authorization", `Bearer ${token}`)
      .send({ tenantId });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Membresias Tenant A ${sufijo}`, subdomain: `test-mem-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Membresias Tenant B ${sufijo}`, subdomain: `test-mem-b-${sufijo}` },
    });
    const tenantInactivo = await prisma.tenant.create({
      data: {
        nombre: `Membresias Tenant Inactivo ${sufijo}`,
        subdomain: `test-mem-inactivo-${sufijo}`,
        activo: false,
      },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;
    tenantInactivoId = tenantInactivo.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `mem-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    // Segundo superadmin nativo de A: crearMembresia exige que el OTORGANTE
    // tenga como tenant activo el mismo tenant HOGAR del usuario destino —
    // así que Admin A no puede recibir una membresía de Admin B (nativo de
    // B), solo de otro superadmin nativo de A. Existe solo para el test de
    // autoprotección más abajo (Admin A necesita una membresía real para
    // poder intentar administrarse/eliminarse a sí mismo).
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `mem-admin-a2-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A2",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `mem-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });
    const usuarioNormalA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `mem-normal-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Usuario Normal A",
        isSuperadmin: false,
        activo: true,
      },
    });
    usuarioNormalAId = usuarioNormalA.id;
    const usuarioNormalA2 = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `mem-normal-a2-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Usuario Normal A2",
        isSuperadmin: false,
        activo: true,
      },
    });
    usuarioNormalA2Id = usuarioNormalA2.id;

    const rolB = await prisma.rol.create({
      data: { tenantId: tenantBId, nombre: `Rol B ${sufijo}`, permisos: "[]", activo: true },
    });
    rolBId = rolB.id;
    const departamentoB = await prisma.departamento.create({
      data: { tenantId: tenantBId, nombre: `Depto B ${sufijo}` },
    });
    departamentoBId = departamentoB.id;

    tokenAdminA = await login(`mem-admin-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`mem-admin-b-${sufijo}@test.ricosoft.local`, tenantBId);
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId, tenantInactivoId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.membresia.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.departamento.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  describe("Autorización de la ruta (solo superadmin)", () => {
    it("un usuario no-superadmin recibe 403 en cualquier endpoint de membresías", async () => {
      const tokenNormal = await login(`mem-normal-a-${sufijo}@test.ricosoft.local`);
      const res = await request(app)
        .get("/api/membresias/tenants")
        .set("Authorization", `Bearer ${tokenNormal}`);
      expect(res.status).toBe(403);
    });

    it("sin token, 401", async () => {
      const res = await request(app).get("/api/membresias/tenants");
      expect(res.status).toBe(401);
    });
  });

  describe("crearMembresia", () => {
    it("otorga acceso a una empresa adicional con rol, y registra Auditoria", async () => {
      const res = await request(app)
        .post(`/api/membresias/usuarios/${usuarioNormalAId}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ tenantId: tenantBId, rolId: rolBId, departamentoId: departamentoBId });
      expect(res.status).toBe(201);
      expect(res.body.tenant.id).toBe(tenantBId);
      expect(res.body.rolRel.id).toBe(rolBId);
      expect(res.body.activo).toBe(true);
      expect(res.body.isSuperadmin).toBe(false);

      const auditoria = await prisma.auditoria.findFirst({
        where: { tenantId: tenantBId, accion: "MEMBRESIA_OTORGADA", entidadId: res.body.id },
      });
      expect(auditoria).not.toBeNull();
      expect(auditoria!.usuarioAfectado).toBe(`mem-normal-a-${sufijo}@test.ricosoft.local`);
    });

    it("upsert: otorgar de nuevo al mismo usuario/tenant ACTUALIZA la membresía existente, no crea una segunda", async () => {
      const antes = await prisma.membresia.count({
        where: { userId: usuarioNormalAId, tenantId: tenantBId },
      });
      expect(antes).toBe(1);

      const res = await request(app)
        .post(`/api/membresias/usuarios/${usuarioNormalAId}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ tenantId: tenantBId, rolId: null, departamentoId: null });
      expect(res.status).toBe(201);
      expect(res.body.rolRel).toBeNull();

      const despues = await prisma.membresia.count({
        where: { userId: usuarioNormalAId, tenantId: tenantBId },
      });
      expect(despues).toBe(1);
    });

    it("bloquea otorgarse una membresía a sí mismo (409) — incluso siendo superadmin", async () => {
      const res = await request(app)
        .post(
          `/api/membresias/usuarios/${(await prisma.user.findUnique({ where: { email: `mem-admin-a-${sufijo}@test.ricosoft.local` } }))!.id}`,
        )
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ tenantId: tenantBId });
      expect(res.status).toBe(409);
    });

    it("un superadmin de OTRO tenant no puede otorgar acceso a un usuario que no es nativo de su empresa (403)", async () => {
      const res = await request(app)
        .post(`/api/membresias/usuarios/${usuarioNormalAId}`)
        .set("Authorization", `Bearer ${tokenAdminB}`)
        .send({ tenantId: tenantBId, rolId: rolBId });
      expect(res.status).toBe(403);
    });

    it("rechaza otorgar acceso a la propia empresa hogar del usuario (409)", async () => {
      const res = await request(app)
        .post(`/api/membresias/usuarios/${usuarioNormalAId}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ tenantId: tenantAId });
      expect(res.status).toBe(409);
    });

    it("rechaza un tenant inexistente (404) y un tenant desactivado (409)", async () => {
      const inexistente = await request(app)
        .post(`/api/membresias/usuarios/${usuarioNormalA2Id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ tenantId: randomUUID() });
      expect(inexistente.status).toBe(404);

      const desactivado = await request(app)
        .post(`/api/membresias/usuarios/${usuarioNormalA2Id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ tenantId: tenantInactivoId });
      expect(desactivado.status).toBe(409);
    });

    it("rechaza un rol/departamento que no pertenece a la empresa destino (404, IDOR)", async () => {
      const rolAjeno = await prisma.rol.create({
        data: { tenantId: tenantAId, nombre: `Rol Solo A ${sufijo}`, permisos: "[]", activo: true },
      });
      const res = await request(app)
        .post(`/api/membresias/usuarios/${usuarioNormalA2Id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ tenantId: tenantBId, rolId: rolAjeno.id });
      expect(res.status).toBe(404);

      const deptoAjeno = await prisma.departamento.create({
        data: { tenantId: tenantAId, nombre: `Depto Solo A ${sufijo}` },
      });
      const res2 = await request(app)
        .post(`/api/membresias/usuarios/${usuarioNormalA2Id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ tenantId: tenantBId, departamentoId: deptoAjeno.id });
      expect(res2.status).toBe(404);
    });

    it("usuario inexistente como destino → 404", async () => {
      const res = await request(app)
        .post(`/api/membresias/usuarios/${randomUUID()}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ tenantId: tenantBId });
      expect(res.status).toBe(404);
    });
  });

  describe("Membresías activas/inactivas y su efecto real en el login", () => {
    it("una membresía inactiva bloquea el cambio de empresa (403); reactivarla lo permite de nuevo", async () => {
      const tokenNormalA = await login(`mem-normal-a-${sufijo}@test.ricosoft.local`);

      // De la membresía otorgada arriba (usuarioNormalA -> tenantB), activa
      // por defecto: el cambio de empresa funciona.
      const cambioOk = await switchTenant(tokenNormalA, tenantBId);
      expect(cambioOk.status).toBe(200);
      expect(cambioOk.body.user.tenantId).toBe(tenantBId);

      const membresia = await prisma.membresia.findUnique({
        where: { userId_tenantId: { userId: usuarioNormalAId, tenantId: tenantBId } },
      });
      expect(membresia).not.toBeNull();

      const desactivar = await request(app)
        .patch(`/api/membresias/${membresia!.id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ activo: false });
      expect(desactivar.status).toBe(200);
      expect(desactivar.body.activo).toBe(false);

      // Con la membresía inactiva, ya no puede cambiarse a esa empresa.
      const cambioBloqueado = await switchTenant(tokenNormalA, tenantBId);
      expect(cambioBloqueado.status).toBe(403);

      const reactivar = await request(app)
        .patch(`/api/membresias/${membresia!.id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ activo: true });
      expect(reactivar.status).toBe(200);
      expect(reactivar.body.activo).toBe(true);

      const cambioDeNuevoOk = await switchTenant(tokenNormalA, tenantBId);
      expect(cambioDeNuevoOk.status).toBe(200);
    });
  });

  describe("Superadmin por membresía: escalación de privilegios y aislamiento entre tenants", () => {
    it("isSuperadmin=true en la membresía da privilegios de superadmin SOLO en esa empresa, nunca en la hogar", async () => {
      const otorgar = await request(app)
        .post(`/api/membresias/usuarios/${usuarioNormalA2Id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ tenantId: tenantBId, isSuperadmin: true });
      expect(otorgar.status).toBe(201);
      expect(otorgar.body.isSuperadmin).toBe(true);

      const tokenNormalA2 = await login(`mem-normal-a2-${sufijo}@test.ricosoft.local`);

      // En su empresa hogar (A) sigue sin ser superadmin: un endpoint
      // exclusivo de superadmin le da 403.
      const enHogarSinAcceso = await request(app)
        .get("/api/membresias/tenants")
        .set("Authorization", `Bearer ${tokenNormalA2}`);
      expect(enHogarSinAcceso.status).toBe(403);

      // Al cambiar a B, el JWT refleja isSuperadmin=true y SÍ puede usar un
      // endpoint exclusivo de superadmin (aquí, en B).
      const cambio = await switchTenant(tokenNormalA2, tenantBId);
      expect(cambio.status).toBe(200);
      expect(cambio.body.user.isSuperadmin).toBe(true);
      expect(cambio.body.user.tenantId).toBe(tenantBId);

      const tokenEnB = cambio.body.token as string;
      const enBConAcceso = await request(app)
        .get("/api/membresias/tenants")
        .set("Authorization", `Bearer ${tokenEnB}`);
      expect(enBConAcceso.status).toBe(200);

      // Al volver a su empresa hogar (A), el privilegio de B NO se filtra:
      // sigue sin ser superadmin en A.
      const tokenDeVueltaEnA = await login(`mem-normal-a2-${sufijo}@test.ricosoft.local`);
      const enHogarSigueSinAcceso = await request(app)
        .get("/api/membresias/tenants")
        .set("Authorization", `Bearer ${tokenDeVueltaEnA}`);
      expect(enHogarSigueSinAcceso.status).toBe(403);
    });
  });

  describe("actualizarMembresia / eliminarMembresia — aislamiento y autoprotección", () => {
    it("bloquea administrar la propia membresía (409), incluso para cambiar su propio isSuperadmin", async () => {
      // Admin A2 (segundo superadmin nativo de A) le da a Admin A membresía
      // en B, para que Admin A tenga una membresía real sobre la que
      // intentar administrarse/eliminarse a sí mismo.
      const adminA = await prisma.user.findUnique({
        where: { email: `mem-admin-a-${sufijo}@test.ricosoft.local` },
      });
      const tokenAdminA2 = await login(`mem-admin-a2-${sufijo}@test.ricosoft.local`);
      const otorgar = await request(app)
        .post(`/api/membresias/usuarios/${adminA!.id}`)
        .set("Authorization", `Bearer ${tokenAdminA2}`)
        .send({ tenantId: tenantBId });
      expect(otorgar.status).toBe(201);

      const propia = await request(app)
        .patch(`/api/membresias/${otorgar.body.id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ isSuperadmin: true });
      expect(propia.status).toBe(409);

      const eliminarPropia = await request(app)
        .delete(`/api/membresias/${otorgar.body.id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      // Quitarse a uno mismo el acceso no es una escalación de privilegios
      // (es lo contrario: renunciar a un acceso), así que no está bloqueado
      // por el mismo guardado que crear/actualizar — se permite.
      expect(eliminarPropia.status).toBe(200);

      const quedó = await prisma.membresia.findUnique({ where: { id: otorgar.body.id } });
      expect(quedó).toBeNull();
    });

    it("un superadmin de otro tenant no puede administrar ni eliminar la membresía de un usuario ajeno (403)", async () => {
      const membresia = await prisma.membresia.findUnique({
        where: { userId_tenantId: { userId: usuarioNormalAId, tenantId: tenantBId } },
      });
      expect(membresia).not.toBeNull();

      const patch = await request(app)
        .patch(`/api/membresias/${membresia!.id}`)
        .set("Authorization", `Bearer ${tokenAdminB}`)
        .send({ activo: false });
      expect(patch.status).toBe(403);

      const del = await request(app)
        .delete(`/api/membresias/${membresia!.id}`)
        .set("Authorization", `Bearer ${tokenAdminB}`);
      expect(del.status).toBe(403);

      // No se tocó nada.
      const sigueIgual = await prisma.membresia.findUnique({ where: { id: membresia!.id } });
      expect(sigueIgual?.activo).toBe(true);
    });

    it("membresía inexistente → 404 al actualizar o eliminar", async () => {
      const patch = await request(app)
        .patch(`/api/membresias/${randomUUID()}`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ activo: false });
      expect(patch.status).toBe(404);

      const del = await request(app)
        .delete(`/api/membresias/${randomUUID()}`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(del.status).toBe(404);
    });

    it("eliminar una membresía registra Auditoria y quita el acceso realmente (switch-tenant deja de funcionar)", async () => {
      const tokenNormalA2 = await login(`mem-normal-a2-${sufijo}@test.ricosoft.local`);
      const membresia = await prisma.membresia.findUnique({
        where: { userId_tenantId: { userId: usuarioNormalA2Id, tenantId: tenantBId } },
      });
      expect(membresia).not.toBeNull();

      const eliminar = await request(app)
        .delete(`/api/membresias/${membresia!.id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(eliminar.status).toBe(200);

      const auditoria = await prisma.auditoria.findFirst({
        where: { tenantId: tenantBId, accion: "MEMBRESIA_ELIMINADA", entidadId: membresia!.id },
      });
      expect(auditoria).not.toBeNull();

      const cambio = await switchTenant(tokenNormalA2, tenantBId);
      expect(cambio.status).toBe(403);
    });
  });

  describe("IDOR / aislamiento en listarMembresiasUsuario", () => {
    it("no puede ver las membresías de un usuario que no es nativo de su propia empresa (403)", async () => {
      const adminB = await prisma.user.findUnique({
        where: { email: `mem-admin-b-${sufijo}@test.ricosoft.local` },
      });
      const res = await request(app)
        .get(`/api/membresias/usuarios/${adminB!.id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(403);
    });

    it("usuario inexistente → 404", async () => {
      const res = await request(app)
        .get(`/api/membresias/usuarios/${randomUUID()}`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(404);
    });

    it("devuelve tenantHogar y la lista de membresías del usuario", async () => {
      const res = await request(app)
        .get(`/api/membresias/usuarios/${usuarioNormalAId}`)
        .set("Authorization", `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(200);
      expect(res.body.tenantHogar.id).toBe(tenantAId);
      expect(Array.isArray(res.body.membresias)).toBe(true);
      expect(
        res.body.membresias.some((m: { tenant: { id: string } }) => m.tenant.id === tenantBId),
      ).toBe(true);
    });
  });
});
