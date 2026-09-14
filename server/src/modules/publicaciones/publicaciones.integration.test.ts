import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * CRUD de Publicacion (contenido del Home): cubre listado por categoría
 * (GENERAL + propias del tenant), permiso requerido para escribir
 * (publicaciones.gestionar), restricción de escritura de GENERAL a
 * superadmin, aislamiento de tenant (IDOR), y que el filtrado por
 * vencimiento/fecha de evento funcione (no se filtra en frontend).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Publicaciones (Home) — BD real", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let tokenConPermiso: string;
  let tokenSinPermiso: string;
  let tokenTenantB: string;
  let tokenSuperadmin: string;
  let novedadGeneralId: string;
  let novedadTenantAId: string;
  let novedadVencidaId: string;
  let eventoPasadoId: string;
  let eventoFuturoId: string;
  const tituloMarca = `TEST_PUBLICACION_${sufijo}`;

  const login = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Publicaciones A ${sufijo}`, subdomain: `test-public-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Publicaciones B ${sufijo}`, subdomain: `test-public-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    const rolConPermiso = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Con permiso publicaciones ${sufijo}`,
        permisos: JSON.stringify(["publicaciones.gestionar"]),
      },
    });

    const conPermiso = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `publicaciones-conpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Con Permiso",
        rolId: rolConPermiso.id,
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `publicaciones-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `publicaciones-tenantb-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Tenant B",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `publicaciones-superadmin-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Superadmin",
        isSuperadmin: true,
        activo: true,
      },
    });

    const enUnDia = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000);

    novedadGeneralId = (
      await prisma.publicacion.create({
        data: {
          categoria: "NOVEDAD",
          tipo: "Comunicado",
          titulo: `${tituloMarca} General`,
          contenido: "Contenido general",
          tenantId: null,
          autorId: conPermiso.id,
        },
      })
    ).id;
    novedadTenantAId = (
      await prisma.publicacion.create({
        data: {
          categoria: "NOVEDAD",
          tipo: "Aviso",
          titulo: `${tituloMarca} Tenant A`,
          contenido: "Contenido tenant A",
          tenantId: tenantAId,
          autorId: conPermiso.id,
        },
      })
    ).id;
    novedadVencidaId = (
      await prisma.publicacion.create({
        data: {
          categoria: "NOVEDAD",
          tipo: "Aviso",
          titulo: `${tituloMarca} Vencida`,
          contenido: "No debería listarse: ya venció",
          tenantId: tenantAId,
          fechaVencimiento: haceUnDia,
          autorId: conPermiso.id,
        },
      })
    ).id;
    eventoPasadoId = (
      await prisma.publicacion.create({
        data: {
          categoria: "EVENTO",
          tipo: "Capacitación",
          titulo: `${tituloMarca} Evento Pasado`,
          contenido: "No debería listarse: ya pasó",
          tenantId: tenantAId,
          fechaEvento: haceUnDia,
          autorId: conPermiso.id,
        },
      })
    ).id;
    eventoFuturoId = (
      await prisma.publicacion.create({
        data: {
          categoria: "EVENTO",
          tipo: "Capacitación",
          titulo: `${tituloMarca} Evento Futuro`,
          contenido: "Sí debería listarse",
          tenantId: tenantAId,
          fechaEvento: enUnDia,
          autorId: conPermiso.id,
        },
      })
    ).id;

    tokenConPermiso = await login(`publicaciones-conpermiso-${sufijo}@test.ricosoft.local`);
    tokenSinPermiso = await login(`publicaciones-sinpermiso-${sufijo}@test.ricosoft.local`);
    tokenTenantB = await login(`publicaciones-tenantb-${sufijo}@test.ricosoft.local`);
    tokenSuperadmin = await login(`publicaciones-superadmin-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    // No solo por `titulo: startsWith`: el test de edición renombra
    // novedadTenantAId a "Editada correctamente", que ya no matchea el
    // prefijo — por tenantId cubre eso sin depender de que ningún test deje
    // el título intacto.
    await prisma.publicacion.deleteMany({
      where: {
        OR: [
          { tenantId: tenantAId },
          { tenantId: tenantBId },
          { titulo: { startsWith: tituloMarca } },
        ],
      },
    });
    await prisma.auditoria.deleteMany({
      where: { OR: [{ tenantId: tenantAId }, { tenantId: tenantBId }] },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ tenantId: tenantAId }, { tenantId: tenantBId }] },
    });
    await prisma.rol.deleteMany({ where: { tenantId: tenantAId } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  it("rechaza categoria inválida o ausente (400)", async () => {
    const res = await request(app)
      .get("/api/publicaciones")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(res.status).toBe(400);

    const res2 = await request(app)
      .get("/api/publicaciones?categoria=FINANZAS")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(res2.status).toBe(400);
  });

  it("lista NOVEDADES: GENERAL + propias del tenant, excluye vencidas", async () => {
    const res = await request(app)
      .get("/api/publicaciones?categoria=NOVEDAD")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(novedadGeneralId);
    expect(ids).toContain(novedadTenantAId);
    expect(ids).not.toContain(novedadVencidaId);
  });

  it("la publicación GENERAL es visible también para un usuario de OTRO tenant, pero no la propia del tenant A", async () => {
    const res = await request(app)
      .get("/api/publicaciones?categoria=NOVEDAD")
      .set("Authorization", `Bearer ${tokenTenantB}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(novedadGeneralId);
    expect(ids).not.toContain(novedadTenantAId);
  });

  it("cualquier usuario autenticado puede LEER aunque no tenga el permiso de gestión", async () => {
    const res = await request(app)
      .get("/api/publicaciones?categoria=NOVEDAD")
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(res.status).toBe(200);
  });

  it("categoría EVENTO solo lista eventos futuros (excluye el que ya pasó)", async () => {
    const res = await request(app)
      .get("/api/publicaciones?categoria=EVENTO")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(eventoFuturoId);
    expect(ids).not.toContain(eventoPasadoId);
  });

  it("categoría AVISO no mezcla resultados de NOVEDAD ni EVENTO", async () => {
    const res = await request(app)
      .get("/api/publicaciones?categoria=AVISO")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(novedadTenantAId);
    expect(ids).not.toContain(eventoFuturoId);
  });

  it("un usuario SIN el permiso no puede crear una publicación (403), no se crea", async () => {
    const res = await request(app)
      .post("/api/publicaciones")
      .set("Authorization", `Bearer ${tokenSinPermiso}`)
      .send({
        categoria: "NOVEDAD",
        tipo: "Comunicado",
        titulo: `${tituloMarca} No debería crearse`,
        contenido: "x",
      });
    expect(res.status).toBe(403);
    const noCreada = await prisma.publicacion.findFirst({
      where: { titulo: `${tituloMarca} No debería crearse` },
    });
    expect(noCreada).toBeNull();
  });

  it("un usuario CON el permiso puede crear una publicación TENANT propia", async () => {
    const res = await request(app)
      .post("/api/publicaciones")
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({
        categoria: "AVISO",
        tipo: "Seguridad",
        titulo: `${tituloMarca} Nueva`,
        contenido: "Contenido nuevo",
      });
    expect(res.status).toBe(201);
    expect(res.body.alcance).toBe("TENANT");
    expect(res.body.autorNombre).toBe("Con Permiso");
  });

  it("categoría EVENTO exige fechaEvento (400)", async () => {
    const res = await request(app)
      .post("/api/publicaciones")
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({
        categoria: "EVENTO",
        tipo: "Capacitación",
        titulo: `${tituloMarca} Evento sin fecha`,
        contenido: "x",
      });
    expect(res.status).toBe(400);
  });

  it("un usuario CON el permiso no puede crear una publicación de alcance GENERAL (403) sin ser superadmin", async () => {
    const res = await request(app)
      .post("/api/publicaciones")
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({
        categoria: "NOVEDAD",
        tipo: "Comunicado",
        titulo: `${tituloMarca} Intento general`,
        contenido: "x",
        alcance: "GENERAL",
      });
    expect(res.status).toBe(403);
  });

  it("un superadmin SÍ puede crear una publicación GENERAL", async () => {
    const res = await request(app)
      .post("/api/publicaciones")
      .set("Authorization", `Bearer ${tokenSuperadmin}`)
      .send({
        categoria: "NOVEDAD",
        tipo: "Comunicado",
        titulo: `${tituloMarca} General Superadmin`,
        contenido: "x",
        alcance: "GENERAL",
      });
    expect(res.status).toBe(201);
    expect(res.body.alcance).toBe("GENERAL");
  });

  it("un usuario CON permiso (no superadmin) no puede editar ni eliminar la publicación GENERAL (403)", async () => {
    const resPatch = await request(app)
      .patch(`/api/publicaciones/${novedadGeneralId}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({ titulo: "Hackeado" });
    expect(resPatch.status).toBe(403);

    const resDelete = await request(app)
      .delete(`/api/publicaciones/${novedadGeneralId}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(resDelete.status).toBe(403);

    const sigueIgual = await prisma.publicacion.findUnique({ where: { id: novedadGeneralId } });
    expect(sigueIgual?.titulo).not.toBe("Hackeado");
  });

  it("IDOR: un usuario del tenant B no puede editar ni eliminar una publicación exclusiva del tenant A (404)", async () => {
    const rolB = await prisma.rol.create({
      data: {
        tenantId: tenantBId,
        nombre: `Con permiso B ${sufijo}`,
        permisos: JSON.stringify(["publicaciones.gestionar"]),
      },
    });
    await prisma.user.update({
      where: { email: `publicaciones-tenantb-${sufijo}@test.ricosoft.local` },
      data: { rolId: rolB.id },
    });
    const tokenTenantBConPermiso = await login(
      `publicaciones-tenantb-${sufijo}@test.ricosoft.local`,
    );

    const resPatch = await request(app)
      .patch(`/api/publicaciones/${novedadTenantAId}`)
      .set("Authorization", `Bearer ${tokenTenantBConPermiso}`)
      .send({ titulo: "Hackeado" });
    expect(resPatch.status).toBe(404);

    const resDelete = await request(app)
      .delete(`/api/publicaciones/${novedadTenantAId}`)
      .set("Authorization", `Bearer ${tokenTenantBConPermiso}`);
    expect(resDelete.status).toBe(404);

    const sigueIgual = await prisma.publicacion.findUnique({ where: { id: novedadTenantAId } });
    expect(sigueIgual?.titulo).not.toBe("Hackeado");

    await prisma.rol.delete({ where: { id: rolB.id } });
  });

  it("un usuario CON el permiso puede editar y luego desactivar su propia publicación TENANT", async () => {
    const resEdit = await request(app)
      .patch(`/api/publicaciones/${novedadTenantAId}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({ titulo: "Editada correctamente" });
    expect(resEdit.status).toBe(200);
    expect(resEdit.body.titulo).toBe("Editada correctamente");

    const resDesactivar = await request(app)
      .patch(`/api/publicaciones/${novedadTenantAId}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({ activo: false });
    expect(resDesactivar.status).toBe(200);
    expect(resDesactivar.body.activo).toBe(false);

    const resListado = await request(app)
      .get("/api/publicaciones?categoria=NOVEDAD")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    const ids = resListado.body.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(novedadTenantAId);
  });

  it("un usuario CON el permiso puede eliminar su propia publicación TENANT", async () => {
    const creada = await prisma.publicacion.create({
      data: {
        categoria: "AVISO",
        tipo: "Sistemas",
        titulo: `${tituloMarca} A Borrar`,
        contenido: "x",
        tenantId: tenantAId,
        autorId: (
          await prisma.user.findFirstOrThrow({
            where: { email: `publicaciones-conpermiso-${sufijo}@test.ricosoft.local` },
            select: { id: true },
          })
        ).id,
      },
    });
    const res = await request(app)
      .delete(`/api/publicaciones/${creada.id}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(res.status).toBe(204);
    const borrada = await prisma.publicacion.findUnique({ where: { id: creada.id } });
    expect(borrada).toBeNull();
  });

  // ── Administración (Configuración > Publicaciones) ──────────────────────

  it("admin: un usuario SIN el permiso no puede listar vía /admin (403)", async () => {
    const res = await request(app)
      .get("/api/publicaciones/admin")
      .set("Authorization", `Bearer ${tokenSinPermiso}`);
    expect(res.status).toBe(403);
  });

  it("admin: un usuario CON el permiso lista todas sus publicaciones (incluye inactivas/vencidas, no solo lo vigente)", async () => {
    const res = await request(app)
      .get("/api/publicaciones/admin")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(novedadVencidaId);
    expect(ids).toContain(eventoPasadoId);
    expect(ids).toContain(novedadGeneralId);
  });

  it("admin: IDOR — un usuario del tenant B no ve en /admin las publicaciones TENANT exclusivas del tenant A", async () => {
    // tokenTenantB por sí solo no tiene publicaciones.gestionar (lo verifica
    // el test anterior) — self-contained: le da el permiso solo para esta
    // prueba, en vez de depender del orden de otro `it()` que también lo
    // asigna y lo retira.
    const rolBAdminListado = await prisma.rol.create({
      data: {
        tenantId: tenantBId,
        nombre: `Con permiso admin-listado B ${sufijo}`,
        permisos: JSON.stringify(["publicaciones.gestionar"]),
      },
    });
    await prisma.user.update({
      where: { email: `publicaciones-tenantb-${sufijo}@test.ricosoft.local` },
      data: { rolId: rolBAdminListado.id },
    });
    const tokenTenantBConPermiso = await login(
      `publicaciones-tenantb-${sufijo}@test.ricosoft.local`,
    );

    const res = await request(app)
      .get("/api/publicaciones/admin")
      .set("Authorization", `Bearer ${tokenTenantBConPermiso}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(novedadTenantAId);
    expect(ids).not.toContain(novedadVencidaId);
    expect(ids).not.toContain(eventoPasadoId);

    await prisma.user.update({
      where: { email: `publicaciones-tenantb-${sufijo}@test.ricosoft.local` },
      data: { rolId: null },
    });
    await prisma.rol.delete({ where: { id: rolBAdminListado.id } });
  });

  it("admin: filtra por categoria/estado/alcance/q correctamente", async () => {
    const porCategoria = await request(app)
      .get("/api/publicaciones/admin?categoria=EVENTO")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(porCategoria.body.every((p: { categoria: string }) => p.categoria === "EVENTO")).toBe(
      true,
    );

    const porEstado = await request(app)
      .get("/api/publicaciones/admin?estado=VENCIDA")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    const idsVencidas = porEstado.body.map((p: { id: string }) => p.id);
    expect(idsVencidas).toContain(novedadVencidaId);
    expect(idsVencidas).not.toContain(eventoFuturoId);

    const porAlcance = await request(app)
      .get("/api/publicaciones/admin?alcance=GENERAL")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(porAlcance.body.every((p: { alcance: string }) => p.alcance === "GENERAL")).toBe(true);

    const porBusqueda = await request(app)
      .get(`/api/publicaciones/admin?q=${encodeURIComponent("Evento Futuro")}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    const idsBusqueda = porBusqueda.body.map((p: { id: string }) => p.id);
    expect(idsBusqueda).toContain(eventoFuturoId);
    expect(idsBusqueda).not.toContain(novedadGeneralId);

    const estadoInvalido = await request(app)
      .get("/api/publicaciones/admin?estado=NO_EXISTE")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(estadoInvalido.status).toBe(400);
  });

  it("no se puede crear para otro tenant: un tenantId enviado en el body se ignora, siempre sale de la sesión", async () => {
    const res = await request(app)
      .post("/api/publicaciones")
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({
        categoria: "NOVEDAD",
        tipo: "Comunicado",
        titulo: `${tituloMarca} Intento tenantId ajeno`,
        contenido: "x",
        tenantId: tenantBId,
      });
    expect(res.status).toBe(201);

    const creada = await prisma.publicacion.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(creada.tenantId).toBe(tenantAId);
    expect(creada.tenantId).not.toBe(tenantBId);
  });

  it("programación: una publicación con fechaPublicacion futura queda PROGRAMADA y no aparece en el Home hasta esa fecha", async () => {
    const enUnaHora = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const resCrear = await request(app)
      .post("/api/publicaciones")
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({
        categoria: "AVISO",
        tipo: "Sistemas",
        titulo: `${tituloMarca} Programada`,
        contenido: "x",
        fechaPublicacion: enUnaHora,
      });
    expect(resCrear.status).toBe(201);
    expect(resCrear.body.estado).toBe("PROGRAMADA");
    const id = resCrear.body.id;

    const resHome = await request(app)
      .get("/api/publicaciones?categoria=AVISO")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(resHome.body.map((p: { id: string }) => p.id)).not.toContain(id);

    const resPublicar = await request(app)
      .patch(`/api/publicaciones/${id}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({ intent: "publicar" });
    expect(resPublicar.status).toBe(200);
    expect(resPublicar.body.estado).toBe("PUBLICADA");

    const resHomeDespues = await request(app)
      .get("/api/publicaciones?categoria=AVISO")
      .set("Authorization", `Bearer ${tokenConPermiso}`);
    expect(resHomeDespues.body.map((p: { id: string }) => p.id)).toContain(id);

    const auditoriaPublicar = await prisma.auditoria.findFirst({
      where: { accion: "PUBLICACION_PUBLICADA", tenantId: tenantAId },
      orderBy: { createdAt: "desc" },
    });
    expect(auditoriaPublicar?.usuarioId).toBe(
      (
        await prisma.user.findFirstOrThrow({
          where: { email: `publicaciones-conpermiso-${sufijo}@test.ricosoft.local` },
          select: { id: true },
        })
      ).id,
    );
  });

  it("auditoría: crear, editar, activar/desactivar y eliminar quedan registrados con el usuario autenticado", async () => {
    const conPermisoId = (
      await prisma.user.findFirstOrThrow({
        where: { email: `publicaciones-conpermiso-${sufijo}@test.ricosoft.local` },
        select: { id: true },
      })
    ).id;

    const resCrear = await request(app)
      .post("/api/publicaciones")
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({
        categoria: "NOVEDAD",
        tipo: "Comunicado",
        titulo: `${tituloMarca} Auditoria`,
        contenido: "x",
      });
    const id = resCrear.body.id;

    await request(app)
      .patch(`/api/publicaciones/${id}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({ activo: false, intent: "desactivar" });
    await request(app)
      .patch(`/api/publicaciones/${id}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`)
      .send({ activo: true, intent: "activar" });
    await request(app)
      .delete(`/api/publicaciones/${id}`)
      .set("Authorization", `Bearer ${tokenConPermiso}`);

    const acciones = await prisma.auditoria.findMany({
      where: { tenantId: tenantAId, detalle: { contains: `${tituloMarca} Auditoria` } },
      orderBy: { createdAt: "asc" },
    });
    const nombres = acciones.map((a) => a.accion);
    expect(nombres).toEqual([
      "PUBLICACION_CREADA",
      "PUBLICACION_DESACTIVADA",
      "PUBLICACION_ACTIVADA",
      "PUBLICACION_ELIMINADA",
    ]);
    expect(acciones.every((a) => a.usuarioId === conPermisoId)).toBe(true);
  });
});
