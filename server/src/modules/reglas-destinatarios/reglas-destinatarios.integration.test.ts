import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Reglas de Destinatarios (Fase 5.3) — CRUD, permisos, multi-tenant e IDOR.
 * La resolución en sí (resolverDestinatarios) ya se prueba a fondo en
 * lib/motor-destinatarios.test.ts; esto cubre la capa HTTP/administrativa.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Reglas de Destinatarios — API, multi-tenant real", () => {
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
  let perfilAId: string;
  let perfilBId: string;
  let usuarioAId: string;
  let usuarioBId: string;
  let reglaBId: string;

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
      data: { nombre: `Reglas Tenant A ${sufijo}`, subdomain: `test-reglas-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Reglas Tenant B ${sufijo}`, subdomain: `test-reglas-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const departamentoA = await prisma.departamento.create({
      data: { tenantId: tenantAId, nombre: `Contabilidad ${sufijo}` },
    });
    departamentoAId = departamentoA.id;
    const departamentoB = await prisma.departamento.create({
      data: { tenantId: tenantBId, nombre: `Contabilidad ${sufijo}` },
    });
    departamentoBId = departamentoB.id;

    const perfilA = await prisma.perfilFuncional.create({
      data: { tenantId: tenantAId, departamentoId: departamentoAId, nombre: "Tesorería" },
    });
    perfilAId = perfilA.id;
    const perfilB = await prisma.perfilFuncional.create({
      data: { tenantId: tenantBId, departamentoId: departamentoBId, nombre: "Tesorería" },
    });
    perfilBId = perfilB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `regla-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `regla-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    const usuarioA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `regla-usuario-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Usuario A",
        activo: true,
      },
    });
    usuarioAId = usuarioA.id;
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `regla-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });
    const usuarioB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `regla-usuario-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Usuario B",
        activo: true,
      },
    });
    usuarioBId = usuarioB.id;

    tokenAdminA = await login(`regla-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`regla-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`regla-admin-b-${sufijo}@test.ricosoft.local`);

    const reglaB = await prisma.reglaDestinatarios.create({
      data: {
        tenantId: tenantBId,
        evento: `TEST_EVENTO_B_${sufijo}`,
        destinatarios: { create: [{ tipo: "PERFIL", perfilId: perfilBId }] },
      },
    });
    reglaBId = reglaB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.reglaDestinatario.deleteMany({
      where: { regla: { tenantId: { in: tenantIds } } },
    });
    await prisma.reglaDestinatarios.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.perfilFuncional.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.departamento.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("Tenant A crea una regla con varios destinatarios y la lista; no ve la de Tenant B", async () => {
    const creada = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        evento: `TEST_EVENTO_DESTINATARIOS_${sufijo}`,
        destinatarios: [{ tipo: "PERFIL", perfilId: perfilAId }, { tipo: "RESPONSABLE_REGISTRO" }],
      });
    expect(creada.status).toBe(201);
    expect(creada.body.destinatarios).toHaveLength(2);
    expect(
      creada.body.destinatarios.find((d: { tipo: string }) => d.tipo === "PERFIL").perfilNombre,
    ).toBe("Tesorería");

    const listado = await request(app)
      .get("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(listado.status).toBe(200);
    expect(listado.body.some((r: { id: string }) => r.id === reglaBId)).toBe(false);
    expect(listado.body.some((r: { id: string }) => r.id === creada.body.id)).toBe(true);
  });

  it("Un usuario sin permiso reglas_destinatarios.crear recibe 403", async () => {
    const res = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`)
      .send({ evento: "X", destinatarios: [{ tipo: "RESPONSABLE_REGISTRO" }] });
    expect(res.status).toBe(403);
  });

  it("Un usuario sin permiso reglas_destinatarios.ver recibe 403 al listar", async () => {
    const res = await request(app)
      .get("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`);
    expect(res.status).toBe(403);
  });

  it("Rechaza crear una regla sin evento o sin destinatarios", async () => {
    const sinEvento = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ destinatarios: [{ tipo: "RESPONSABLE_REGISTRO" }] });
    expect(sinEvento.status).toBe(400);

    const sinDestinatarios = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ evento: "X", destinatarios: [] });
    expect(sinDestinatarios.status).toBe(400);
  });

  it("Rechaza un destinatario con forma inválida (PERFIL sin perfilId)", async () => {
    const res = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ evento: "X", destinatarios: [{ tipo: "PERFIL" }] });
    expect(res.status).toBe(400);
  });

  it("Rechaza destinatarios duplicados en la misma regla", async () => {
    const res = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({
        evento: "X",
        destinatarios: [
          { tipo: "PERFIL", perfilId: perfilAId },
          { tipo: "PERFIL", perfilId: perfilAId },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("IDOR: rechaza un PERFIL, USUARIO o AREA de otro tenant al crear", async () => {
    const conPerfilDeB = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ evento: "X", destinatarios: [{ tipo: "PERFIL", perfilId: perfilBId }] });
    expect(conPerfilDeB.status).toBe(400);

    const conUsuarioDeB = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ evento: "X", destinatarios: [{ tipo: "USUARIO", usuarioId: usuarioBId }] });
    expect(conUsuarioDeB.status).toBe(400);

    const conAreaDeB = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ evento: "X", destinatarios: [{ tipo: "AREA", departamentoId: departamentoBId }] });
    expect(conAreaDeB.status).toBe(400);
  });

  it("Agrega y quita un destinatario; no permite dejar la regla sin ninguno", async () => {
    const creada = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ evento: "X", destinatarios: [{ tipo: "USUARIO", usuarioId: usuarioAId }] });
    expect(creada.status).toBe(201);
    const reglaId = creada.body.id;

    const agregado = await request(app)
      .post(`/api/reglas-destinatarios/${reglaId}/destinatarios`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ tipo: "PERMISO", permisoClave: "solicitudes.aprobar" });
    expect(agregado.status).toBe(201);
    expect(agregado.body.destinatarios).toHaveLength(2);

    const primerDestinatarioId = agregado.body.destinatarios[0].id;
    const segundoDestinatarioId = agregado.body.destinatarios[1].id;

    const quitado = await request(app)
      .delete(`/api/reglas-destinatarios/${reglaId}/destinatarios/${primerDestinatarioId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(quitado.status).toBe(204);

    // Ya solo queda uno: no se puede quitar el último.
    const rechazado = await request(app)
      .delete(`/api/reglas-destinatarios/${reglaId}/destinatarios/${segundoDestinatarioId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(rechazado.status).toBe(409);
  });

  it("Activar/desactivar una regla genera Auditoria", async () => {
    const creada = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ evento: "X", destinatarios: [{ tipo: "RESPONSABLE_REGISTRO" }] });
    expect(creada.status).toBe(201);
    expect(creada.body.activa).toBe(true);

    const editada = await request(app)
      .patch(`/api/reglas-destinatarios/${creada.body.id}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ activa: false });
    expect(editada.status).toBe(200);
    expect(editada.body.activa).toBe(false);

    const auditoria = await prisma.auditoria.findFirst({
      where: {
        tenantId: tenantAId,
        entidadId: creada.body.id,
        accion: "REGLA_DESTINATARIOS_EDITADA",
      },
    });
    expect(auditoria).not.toBeNull();
  });

  it("Tenant A no puede leer, editar ni eliminar la regla de Tenant B (404)", async () => {
    const get = await request(app)
      .get(`/api/reglas-destinatarios/${reglaBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(get.status).toBe(404);

    const patch = await request(app)
      .patch(`/api/reglas-destinatarios/${reglaBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ activa: false });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/api/reglas-destinatarios/${reglaBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(del.status).toBe(404);

    const sinTocar = await prisma.reglaDestinatarios.findUnique({ where: { id: reglaBId } });
    expect(sinTocar?.activa).toBe(true);
  });

  it("Tenant B sigue viendo y operando correctamente sobre su propia regla", async () => {
    const res = await request(app)
      .get("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminB}`);
    expect(res.status).toBe(200);
    expect(res.body.some((r: { id: string }) => r.id === reglaBId)).toBe(true);
  });

  it("Elimina una regla completa (borra en cascada sus destinatarios)", async () => {
    const creada = await request(app)
      .post("/api/reglas-destinatarios")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ evento: "X", destinatarios: [{ tipo: "RESPONSABLE_REGISTRO" }] });
    expect(creada.status).toBe(201);

    const eliminada = await request(app)
      .delete(`/api/reglas-destinatarios/${creada.body.id}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(eliminada.status).toBe(204);

    const destinatariosRestantes = await prisma.reglaDestinatario.count({
      where: { reglaId: creada.body.id },
    });
    expect(destinatariosRestantes).toBe(0);
  });
});
