import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración contra SQL Server real para el Bloque 4
 * (Administración/RRHH): administración de usuarios (usuarios.controller.ts)
 * y membresías multiempresa (membresias.controller.ts). Ninguno de los dos
 * usa req.tenantPrisma a propósito (User/Membresia están fuera del catálogo
 * tenant-scoped por su semántica cross-tenant legítima) — esta suite prueba
 * que el aislamiento manual por tenantId ya implementado es real.
 *
 * El flujo de login multiempresa / cambio de tenant / permisos por tenant ya
 * está cubierto exhaustivamente por auth.integration.test.ts; no se repite
 * aquí. Esta suite se concentra en lo que no tenía cobertura: la
 * administración (CRUD) de usuarios de otro tenant, y la escalación de
 * privilegios vía membresías.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)(
  "Usuarios + Membresías — administración multi-tenant (SQL Server real)",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantAId: string;
    let tenantBId: string;
    let tokenA: string; // superadmin de A
    let tokenB: string; // superadmin de B
    let tokenSinPermiso: string; // usuario normal de A, sin permisos administrativos
    let usuarioObjetivoBId: string; // usuario normal, nativo de B
    let departamentoBId: string;
    let rolBId: string;
    // Fase 5.4.1 hardening — escalación de privilegios (ver informe de auditoría)
    let departamentoSistemasAId: string;
    let departamentoNormalAId: string;
    let rolLimitadoId: string; // usuarios.crear + usuarios.cambiar_rol + usuarios.cambiar_departamento
    let rolPrivilegiadoId: string; // lo mismo + usuarios.eliminar (excede al actor limitado)
    let tokenActorLimitado: string;
    let usuarioObjetivoAId: string; // usuario normal, nativo de A, para las pruebas de escalación

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
        data: { nombre: `UM TenantPrisma A ${sufijo}`, subdomain: `test-um-tp-a-${sufijo}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { nombre: `UM TenantPrisma B ${sufijo}`, subdomain: `test-um-tp-b-${sufijo}` },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `um-tp-admin-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin A",
          isSuperadmin: true,
          activo: true,
        },
      });
      const rolSinPermiso = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: `Sin Permisos UM ${sufijo}`,
          permisos: JSON.stringify([]),
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `um-tp-sinpermiso-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Sin Permiso",
          rolId: rolSinPermiso.id,
          isSuperadmin: false,
          activo: true,
        },
      });

      const adminB = await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `um-tp-admin-b-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin B",
          isSuperadmin: true,
          activo: true,
        },
      });
      const departamentoB = await prisma.departamento.create({
        data: { tenantId: tenantBId, nombre: `Depto B ${sufijo}` },
      });
      departamentoBId = departamentoB.id;
      const rolB = await prisma.rol.create({
        data: { tenantId: tenantBId, nombre: `Rol B ${sufijo}`, permisos: JSON.stringify([]) },
      });
      rolBId = rolB.id;
      const usuarioObjetivoB = await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `um-tp-objetivo-b-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Objetivo B",
          isSuperadmin: false,
          activo: true,
        },
      });
      usuarioObjetivoBId = usuarioObjetivoB.id;
      void adminB;

      // --- Fixtures de hardening (Fase 5.4.1) ---
      const departamentoSistemasA = await prisma.departamento.create({
        data: { tenantId: tenantAId, nombre: `Sistemas A ${sufijo}`, esSistemas: true },
      });
      departamentoSistemasAId = departamentoSistemasA.id;
      const departamentoNormalA = await prisma.departamento.create({
        data: { tenantId: tenantAId, nombre: `Normal A ${sufijo}`, esSistemas: false },
      });
      departamentoNormalAId = departamentoNormalA.id;

      const rolLimitado = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: `Limitado ${sufijo}`,
          permisos: JSON.stringify([
            "usuarios.crear",
            "usuarios.cambiar_rol",
            "usuarios.cambiar_departamento",
          ]),
        },
      });
      rolLimitadoId = rolLimitado.id;
      const rolPrivilegiado = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: `Privilegiado ${sufijo}`,
          permisos: JSON.stringify(["usuarios.crear", "usuarios.eliminar"]),
        },
      });
      rolPrivilegiadoId = rolPrivilegiado.id;

      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `um-tp-actor-limitado-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Actor Limitado",
          rolId: rolLimitado.id,
          isSuperadmin: false,
          activo: true,
        },
      });
      const usuarioObjetivoA = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `um-tp-objetivo-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Objetivo A",
          isSuperadmin: false,
          activo: true,
        },
      });
      usuarioObjetivoAId = usuarioObjetivoA.id;

      tokenA = await login(`um-tp-admin-a-${sufijo}@test.ricosoft.local`);
      tokenB = await login(`um-tp-admin-b-${sufijo}@test.ricosoft.local`);
      tokenSinPermiso = await login(`um-tp-sinpermiso-${sufijo}@test.ricosoft.local`);
      tokenActorLimitado = await login(`um-tp-actor-limitado-${sufijo}@test.ricosoft.local`);
    });

    afterAll(async () => {
      const tenantIds = [tenantAId, tenantBId];
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.membresia.deleteMany({ where: { OR: [{ userId: usuarioObjetivoBId }] } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.departamento.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    // ---- Administración de usuarios: aislamiento cross-tenant ----

    it("Tenant A no puede cambiar el estado de un usuario nativo de Tenant B (404); la fila no cambia", async () => {
      const res = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoBId}/estado`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ activo: false });
      expect(res.status).toBe(404);

      const sinTocar = await prisma.user.findUnique({ where: { id: usuarioObjetivoBId } });
      expect(sinTocar?.activo).toBe(true);
    });

    it("Tenant A no puede asignar un rol a un usuario nativo de Tenant B (404)", async () => {
      const res = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoBId}/rol`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ rolId: null });
      expect(res.status).toBe(404);
    });

    it("Tenant A no puede cambiar el correo de un usuario nativo de Tenant B (404); el correo no cambia", async () => {
      const res = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoBId}/email`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ email: `hackeado-${sufijo}@test.ricosoft.local` });
      expect(res.status).toBe(404);

      const sinTocar = await prisma.user.findUnique({ where: { id: usuarioObjetivoBId } });
      expect(sinTocar?.email).toBe(`um-tp-objetivo-b-${sufijo}@test.ricosoft.local`);
    });

    it("Tenant A no puede restablecer la contraseña de un usuario nativo de Tenant B (404); el hash no cambia", async () => {
      const antes = await prisma.user.findUnique({ where: { id: usuarioObjetivoBId } });
      const res = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoBId}/password`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ passwordNueva: "OtraClaveSegura123" });
      expect(res.status).toBe(404);

      const despues = await prisma.user.findUnique({ where: { id: usuarioObjetivoBId } });
      expect(despues?.passwordHash).toBe(antes?.passwordHash);
      expect(despues?.tokenVersion).toBe(antes?.tokenVersion);
    });

    it("Tenant A no puede asignar un departamento a un usuario nativo de Tenant B (404)", async () => {
      const res = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoBId}/departamento`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ departamentoId: departamentoBId });
      expect(res.status).toBe(404);
    });

    it("Tenant A no puede eliminar un usuario nativo de Tenant B (404); sigue existiendo", async () => {
      const res = await request(app)
        .delete(`/api/usuarios/${usuarioObjetivoBId}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(404);

      const sigueExistiendo = await prisma.user.findUnique({ where: { id: usuarioObjetivoBId } });
      expect(sigueExistiendo).not.toBeNull();
    });

    it("Tenant A no ve a un usuario de Tenant B en su propio listado", async () => {
      const res = await request(app).get("/api/usuarios").set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.data.some((u: { id: string }) => u.id === usuarioObjetivoBId)).toBe(false);
    });

    // ---- Administración de usuarios: operaciones propias funcionan ----

    it("Tenant B SÍ puede administrar a su propio usuario (estado, rol, departamento)", async () => {
      const estado = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoBId}/estado`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ activo: false });
      expect(estado.status).toBe(200);
      expect(estado.body.activo).toBe(false);

      // Reactivar para no interferir con las pruebas siguientes.
      await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoBId}/estado`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ activo: true });

      const rol = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoBId}/rol`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ rolId: rolBId });
      expect(rol.status).toBe(200);
      expect(rol.body.rolId).toBe(rolBId);

      const depto = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoBId}/departamento`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ departamentoId: departamentoBId });
      expect(depto.status).toBe(200);
      expect(depto.body.departamentoId).toBe(departamentoBId);
    });

    // ---- Permisos: separado de tenant isolation ----

    it("un usuario sin permiso administrativo recibe 403 al intentar listar usuarios", async () => {
      const res = await request(app)
        .get("/api/usuarios")
        .set("Authorization", `Bearer ${tokenSinPermiso}`);
      expect(res.status).toBe(403);
    });

    it("un usuario sin permiso administrativo recibe 403 al intentar desactivar un usuario (el permiso se evalúa antes que el id)", async () => {
      const res = await request(app)
        .patch(`/api/usuarios/${randomUUID()}/estado`)
        .set("Authorization", `Bearer ${tokenSinPermiso}`)
        .send({ activo: false });
      // 403 por falta de permiso, no 404 — requirePermission corre en el
      // middleware de la ruta, antes de que el controller siquiera busque el id.
      expect(res.status).toBe(403);
    });

    // ---- Membresías: escalación de privilegios cross-tenant bloqueada ----

    it("un superadmin de Tenant A no puede otorgar una membresía a un usuario nativo de Tenant B (403), no se crea", async () => {
      const res = await request(app)
        .post(`/api/membresias/usuarios/${usuarioObjetivoBId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ tenantId: tenantAId });
      expect(res.status).toBe(403);

      const membresias = await prisma.membresia.findMany({ where: { userId: usuarioObjetivoBId } });
      expect(membresias).toHaveLength(0);
    });

    it("un superadmin de Tenant B SÍ puede otorgar a su propio usuario acceso a otra empresa", async () => {
      const res = await request(app)
        .post(`/api/membresias/usuarios/${usuarioObjetivoBId}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ tenantId: tenantAId });
      expect(res.status).toBe(201);

      const membresia = await prisma.membresia.findUnique({
        where: { userId_tenantId: { userId: usuarioObjetivoBId, tenantId: tenantAId } },
      });
      expect(membresia).not.toBeNull();
      expect(membresia?.activo).toBe(true);
    });

    it("un superadmin de Tenant A no puede modificar la membresía de un usuario nativo de Tenant B (403); no cambia", async () => {
      const membresia = await prisma.membresia.findUniqueOrThrow({
        where: { userId_tenantId: { userId: usuarioObjetivoBId, tenantId: tenantAId } },
      });

      const res = await request(app)
        .patch(`/api/membresias/${membresia.id}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ isSuperadmin: true });
      expect(res.status).toBe(403);

      const sinTocar = await prisma.membresia.findUnique({ where: { id: membresia.id } });
      expect(sinTocar?.isSuperadmin).toBe(false);
    });

    it("un superadmin de Tenant A no puede eliminar la membresía de un usuario nativo de Tenant B (403); sigue existiendo", async () => {
      const membresia = await prisma.membresia.findUniqueOrThrow({
        where: { userId_tenantId: { userId: usuarioObjetivoBId, tenantId: tenantAId } },
      });

      const res = await request(app)
        .delete(`/api/membresias/${membresia.id}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(403);

      const sigueExistiendo = await prisma.membresia.findUnique({ where: { id: membresia.id } });
      expect(sigueExistiendo).not.toBeNull();
    });

    it("un superadmin de Tenant B SÍ puede revocar la membresía que él mismo otorgó", async () => {
      const membresia = await prisma.membresia.findUniqueOrThrow({
        where: { userId_tenantId: { userId: usuarioObjetivoBId, tenantId: tenantAId } },
      });

      const res = await request(app)
        .delete(`/api/membresias/${membresia.id}`)
        .set("Authorization", `Bearer ${tokenB}`);
      expect(res.status).toBe(200);

      const yaNoExiste = await prisma.membresia.findUnique({ where: { id: membresia.id } });
      expect(yaNoExiste).toBeNull();
    });

    it("membresias.routes exige requireSuperadmin: un usuario sin isSuperadmin recibe 403 aunque tenga permisos.ver", async () => {
      const res = await request(app)
        .get("/api/membresias/tenants")
        .set("Authorization", `Bearer ${tokenSinPermiso}`);
      expect(res.status).toBe(403);
    });

    // ---- Fase 5.4.1 — hardening de escalación de privilegios ----

    it("un superadmin no puede otorgarse una membresía a sí mismo (409), no se crea", async () => {
      const adminA = await prisma.user.findFirstOrThrow({
        where: { email: `um-tp-admin-a-${sufijo}@test.ricosoft.local` },
      });
      const res = await request(app)
        .post(`/api/membresias/usuarios/${adminA.id}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ tenantId: tenantBId });
      expect(res.status).toBe(409);

      const membresias = await prisma.membresia.findMany({ where: { userId: adminA.id } });
      expect(membresias).toHaveLength(0);
    });

    it("un superadmin no puede administrar su propia membresía existente para auto-otorgarse isSuperadmin (409)", async () => {
      // crearMembresia ya bloquea el auto-otorgamiento (prueba anterior), así
      // que la única forma de que exista una membresía propia hoy es un dato
      // heredado de antes de este fix (o creado fuera de la API) — se
      // fabrica ese escenario directo en BD para probar el guard de
      // actualizarMembresia de forma aislada.
      const adminA = await prisma.user.findFirstOrThrow({
        where: { email: `um-tp-admin-a-${sufijo}@test.ricosoft.local` },
      });
      const membresiaPropia = await prisma.membresia.create({
        data: { userId: adminA.id, tenantId: tenantBId, isSuperadmin: false, activo: true },
      });

      const escalada = await request(app)
        .patch(`/api/membresias/${membresiaPropia.id}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ isSuperadmin: true });
      expect(escalada.status).toBe(409);

      const sinTocar = await prisma.membresia.findUnique({ where: { id: membresiaPropia.id } });
      expect(sinTocar?.isSuperadmin).toBe(false);

      await prisma.membresia.delete({ where: { id: membresiaPropia.id } });
    });

    it("asignarDepartamentoUsuario: un actor NO superadmin no puede asignar un departamento marcado como Sistemas (403), no cambia", async () => {
      const res = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoAId}/departamento`)
        .set("Authorization", `Bearer ${tokenActorLimitado}`)
        .send({ departamentoId: departamentoSistemasAId });
      expect(res.status).toBe(403);

      const sinTocar = await prisma.user.findUnique({ where: { id: usuarioObjetivoAId } });
      expect(sinTocar?.departamentoId).not.toBe(departamentoSistemasAId);
    });

    it("asignarDepartamentoUsuario: un superadmin SÍ puede asignar un departamento marcado como Sistemas", async () => {
      const res = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoAId}/departamento`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ departamentoId: departamentoSistemasAId });
      expect(res.status).toBe(200);
      expect(res.body.departamentoId).toBe(departamentoSistemasAId);

      // Revertir para no interferir con otras pruebas.
      await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoAId}/departamento`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ departamentoId: departamentoNormalAId });
    });

    it("asignarDepartamentoUsuario: un actor NO superadmin SÍ puede asignar un departamento normal", async () => {
      const res = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoAId}/departamento`)
        .set("Authorization", `Bearer ${tokenActorLimitado}`)
        .send({ departamentoId: departamentoNormalAId });
      expect(res.status).toBe(200);
    });

    it("crearUsuario: un actor no puede asignar al crear un rol que otorgue un permiso que él mismo no tiene (403), no se crea el usuario", async () => {
      // esDominioCorporativoValido exige un dominio de la lista permitida
      // (crearUsuario, a diferencia de los fixtures de arriba, sí pasa por
      // esa validación real) — no puede usarse test.ricosoft.local aquí.
      const emailNuevo = `um-tp-escalado-${sufijo}@ricol.com.co`;
      const res = await request(app)
        .post("/api/usuarios")
        .set("Authorization", `Bearer ${tokenActorLimitado}`)
        .send({
          nombre: "Intento Escalado",
          email: emailNuevo,
          password: "ClaveSegura123",
          rolId: rolPrivilegiadoId,
        });
      expect(res.status).toBe(403);

      const noCreado = await prisma.user.findUnique({ where: { email: emailNuevo } });
      expect(noCreado).toBeNull();
    });

    it("crearUsuario: un actor SÍ puede asignar un rol que es subconjunto de sus propios permisos", async () => {
      const emailNuevo = `um-tp-rol-valido-${sufijo}@ricol.com.co`;
      const res = await request(app)
        .post("/api/usuarios")
        .set("Authorization", `Bearer ${tokenActorLimitado}`)
        .send({
          nombre: "Rol Válido",
          email: emailNuevo,
          password: "ClaveSegura123",
          rolId: rolLimitadoId,
        });
      expect(res.status).toBe(201);
      await prisma.user.delete({ where: { id: res.body.id } });
    });

    it("asignarRolUsuario: un actor no puede reasignar un rol que otorgue un permiso que él mismo no tiene (403), no cambia", async () => {
      const res = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoAId}/rol`)
        .set("Authorization", `Bearer ${tokenActorLimitado}`)
        .send({ rolId: rolPrivilegiadoId });
      expect(res.status).toBe(403);

      const sinTocar = await prisma.user.findUnique({ where: { id: usuarioObjetivoAId } });
      expect(sinTocar?.rolId).not.toBe(rolPrivilegiadoId);
    });

    it("asignarRolUsuario: un superadmin SÍ puede asignar el rol privilegiado (no aplica el guard de escalación)", async () => {
      const res = await request(app)
        .patch(`/api/usuarios/${usuarioObjetivoAId}/rol`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ rolId: rolPrivilegiadoId });
      expect(res.status).toBe(200);
      expect(res.body.rolId).toBe(rolPrivilegiadoId);
    });
  },
);
