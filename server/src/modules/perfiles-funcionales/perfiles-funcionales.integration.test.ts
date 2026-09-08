import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Perfiles Funcionales (Fase 5.2) — multi-tenant real, permisos y reglas de
 * negocio. No dependen de Siesa (a diferencia de Objetivos), así que estos
 * tests SÍ pueden ejercitar el flujo completo (crear perfil, asignar/quitar
 * usuarios, reconciliar contadores) contra la base de datos real.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Perfiles Funcionales — multi-tenant real", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdminA: string;
  let tokenSinPermisoA: string;
  let tokenAdminB: string;
  let departamentoAId: string;
  let departamentoBId: string;
  let usuarioAId: string;
  let perfilBId: string;

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
      data: { nombre: `Perfiles Tenant A ${sufijo}`, subdomain: `test-perf-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Perfiles Tenant B ${sufijo}`, subdomain: `test-perf-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const departamentoA = await prisma.departamento.create({
      data: { tenantId: tenantAId, nombre: `Contabilidad ${sufijo}` },
    });
    departamentoAId = departamentoA.id;
    const departamentoB = await prisma.departamento.create({
      data: { tenantId: tenantBId, nombre: `Gerencia ${sufijo}` },
    });
    departamentoBId = departamentoB.id;

    const adminA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `perf-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `perf-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    const usuarioA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        departamentoId: departamentoAId,
        email: `perf-usuario-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Usuario Tesorería A",
        isSuperadmin: false,
        activo: true,
      },
    });
    usuarioAId = usuarioA.id;
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `perf-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`perf-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`perf-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`perf-admin-b-${sufijo}@test.ricosoft.local`);

    const perfilB = await prisma.perfilFuncional.create({
      data: { tenantId: tenantBId, departamentoId: departamentoBId, nombre: "Jefe de Gerencia" },
    });
    perfilBId = perfilB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.usuarioPerfilFuncional.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.perfilFuncional.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.departamento.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("Tenant A crea un perfil funcional en su área y lo lista; no ve el de Tenant B", async () => {
    const creado = await request(app)
      .post("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ departamentoId: departamentoAId, nombre: "Tesorería", esJefeDeArea: false });
    expect(creado.status).toBe(201);
    expect(creado.body.nombre).toBe("Tesorería");
    expect(creado.body.usuariosCount).toBe(0);

    const listado = await request(app)
      .get("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(listado.status).toBe(200);
    expect(listado.body.some((p: { id: string }) => p.id === perfilBId)).toBe(false);
    expect(listado.body.some((p: { id: string }) => p.id === creado.body.id)).toBe(true);
  });

  it("Un usuario sin permiso perfiles_funcionales.crear recibe 403", async () => {
    const res = await request(app)
      .post("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`)
      .send({ departamentoId: departamentoAId, nombre: "Otro perfil" });
    expect(res.status).toBe(403);
  });

  it("Un usuario sin permiso perfiles_funcionales.ver recibe 403 al listar", async () => {
    const res = await request(app)
      .get("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`);
    expect(res.status).toBe(403);
  });

  it("Rechaza crear un perfil sin nombre o sin área", async () => {
    const sinNombre = await request(app)
      .post("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ departamentoId: departamentoAId });
    expect(sinNombre.status).toBe(400);

    const sinArea = await request(app)
      .post("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ nombre: "Sin área" });
    expect(sinArea.status).toBe(400);
  });

  it("Rechaza crear un perfil en un área de otro tenant (404)", async () => {
    const res = await request(app)
      .post("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ departamentoId: departamentoBId, nombre: "Intruso" });
    expect(res.status).toBe(404);
  });

  it("Rechaza dos perfiles con el mismo nombre en la misma área (409)", async () => {
    const primero = await request(app)
      .post("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ departamentoId: departamentoAId, nombre: "Recepción de Facturas" });
    expect(primero.status).toBe(201);

    const duplicado = await request(app)
      .post("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ departamentoId: departamentoAId, nombre: "Recepción de Facturas" });
    expect(duplicado.status).toBe(409);
  });

  it("Asigna y quita un usuario de un perfil, y refleja el contador correctamente", async () => {
    const perfil = await request(app)
      .post("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ departamentoId: departamentoAId, nombre: "Nómina" });
    expect(perfil.status).toBe(201);
    const perfilId = perfil.body.id;

    const asignado = await request(app)
      .post(`/api/perfiles-funcionales/${perfilId}/usuarios`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ userId: usuarioAId });
    expect(asignado.status).toBe(201);
    expect(asignado.body.usuariosCount).toBe(1);
    expect(asignado.body.usuarios[0].id).toBe(usuarioAId);

    const duplicado = await request(app)
      .post(`/api/perfiles-funcionales/${perfilId}/usuarios`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ userId: usuarioAId });
    expect(duplicado.status).toBe(409);

    // No se puede eliminar un perfil con usuarios asignados.
    const eliminarConUsuarios = await request(app)
      .delete(`/api/perfiles-funcionales/${perfilId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(eliminarConUsuarios.status).toBe(409);

    const quitado = await request(app)
      .delete(`/api/perfiles-funcionales/${perfilId}/usuarios/${usuarioAId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(quitado.status).toBe(204);

    const listado = await request(app)
      .get("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    const perfilActualizado = listado.body.find((p: { id: string }) => p.id === perfilId);
    expect(perfilActualizado.usuariosCount).toBe(0);

    // Ahora sí se puede eliminar.
    const eliminado = await request(app)
      .delete(`/api/perfiles-funcionales/${perfilId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(eliminado.status).toBe(204);
  });

  it("No se puede asignar un usuario de otro tenant a un perfil (404)", async () => {
    const perfil = await request(app)
      .post("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ departamentoId: departamentoAId, nombre: "Aislamiento" });
    expect(perfil.status).toBe(201);

    const usuarioDeB = await prisma.user.findFirst({ where: { tenantId: tenantBId } });
    const res = await request(app)
      .post(`/api/perfiles-funcionales/${perfil.body.id}/usuarios`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ userId: usuarioDeB!.id });
    expect(res.status).toBe(404);
  });

  it("Editar esJefeDeArea y activo genera Auditoria y se refleja en el listado", async () => {
    const perfil = await request(app)
      .post("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ departamentoId: departamentoAId, nombre: "Jefe de Contabilidad" });
    expect(perfil.status).toBe(201);
    expect(perfil.body.esJefeDeArea).toBe(false);

    const editado = await request(app)
      .patch(`/api/perfiles-funcionales/${perfil.body.id}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ esJefeDeArea: true, activo: false });
    expect(editado.status).toBe(200);
    expect(editado.body.esJefeDeArea).toBe(true);
    expect(editado.body.activo).toBe(false);

    const auditoria = await prisma.auditoria.findFirst({
      where: { tenantId: tenantAId, entidadId: perfil.body.id, accion: "PERFIL_FUNCIONAL_EDITADO" },
    });
    expect(auditoria).not.toBeNull();
  });

  it("Tenant A no puede editar ni eliminar el perfil de Tenant B (404)", async () => {
    const patch = await request(app)
      .patch(`/api/perfiles-funcionales/${perfilBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ nombre: "hackeado" });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/api/perfiles-funcionales/${perfilBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(del.status).toBe(404);

    const sinTocar = await prisma.perfilFuncional.findUnique({ where: { id: perfilBId } });
    expect(sinTocar?.nombre).toBe("Jefe de Gerencia");
  });

  it("Tenant B sigue viendo y operando correctamente sobre su propio perfil", async () => {
    const res = await request(app)
      .get("/api/perfiles-funcionales")
      .set("Authorization", `Bearer ${tokenAdminB}`);
    expect(res.status).toBe(200);
    expect(res.body.some((p: { id: string }) => p.id === perfilBId)).toBe(true);
  });
});
