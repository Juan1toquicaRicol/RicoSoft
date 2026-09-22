import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";
import { UPLOADS_DIR_PUBLICACIONES } from "../../middleware/upload.middleware";

/**
 * Adjuntos de Publicacion (fotos/videos/documentos): subida con permiso,
 * alcance GENERAL solo superadmin, aislamiento de tenant (IDOR) al servir el
 * archivo, vigencia (una publicación desactivada no filtra sus archivos a
 * quien no la administra), borrado en disco, y el rango de fechas del
 * calendario del Home.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n");

describe.skipIf(!RUN)("Publicaciones — archivos adjuntos y calendario — BD real", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdmin: string;
  let tokenLector: string;
  let tokenTenantB: string;
  let tokenAdminB: string;
  let tokenSuperadmin: string;
  let publicacionId: string;
  let generalId: string;
  let inactivaId: string;
  let eventoPasadoId: string;
  const tituloMarca = `TEST_PUBARCH_${sufijo}`;

  const login = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    return res.body.token as string;
  };
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    tenantAId = (
      await prisma.tenant.create({
        data: { nombre: `PubArch A ${sufijo}`, subdomain: `test-pubarch-a-${sufijo}` },
      })
    ).id;
    tenantBId = (
      await prisma.tenant.create({
        data: { nombre: `PubArch B ${sufijo}`, subdomain: `test-pubarch-b-${sufijo}` },
      })
    ).id;
    const rol = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Gestiona publicaciones ${sufijo}`,
        permisos: JSON.stringify(["publicaciones.gestionar"]),
      },
    });

    const crearUsuario = (email: string, tenantId: string, extra: object = {}) =>
      prisma.user.create({
        data: {
          tenantId,
          email: `${email}-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: email,
          isSuperadmin: false,
          activo: true,
          ...extra,
        },
      });
    const admin = await crearUsuario("pubarch-admin", tenantAId, { rolId: rol.id });
    await crearUsuario("pubarch-lector", tenantAId);
    await crearUsuario("pubarch-tenantb", tenantBId);
    const rolB = await prisma.rol.create({
      data: {
        tenantId: tenantBId,
        nombre: `Gestiona publicaciones B ${sufijo}`,
        permisos: JSON.stringify(["publicaciones.gestionar"]),
      },
    });
    await crearUsuario("pubarch-adminb", tenantBId, { rolId: rolB.id });
    await crearUsuario("pubarch-super", tenantAId, { isSuperadmin: true });

    const crearPublicacion = async (data: object) =>
      (
        await prisma.publicacion.create({
          data: {
            categoria: "NOVEDAD",
            tipo: "Comunicado",
            contenido: "Contenido",
            autorId: admin.id,
            ...data,
          } as never,
        })
      ).id;
    publicacionId = await crearPublicacion({
      titulo: `${tituloMarca} Tenant A`,
      tenantId: tenantAId,
    });
    generalId = await crearPublicacion({ titulo: `${tituloMarca} General`, tenantId: null });
    inactivaId = await crearPublicacion({
      titulo: `${tituloMarca} Inactiva`,
      tenantId: tenantAId,
      activo: false,
    });
    eventoPasadoId = await crearPublicacion({
      titulo: `${tituloMarca} Evento`,
      categoria: "EVENTO",
      tenantId: tenantAId,
      fechaEvento: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    tokenAdmin = await login(`pubarch-admin-${sufijo}@test.ricosoft.local`);
    tokenLector = await login(`pubarch-lector-${sufijo}@test.ricosoft.local`);
    tokenTenantB = await login(`pubarch-tenantb-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`pubarch-adminb-${sufijo}@test.ricosoft.local`);
    tokenSuperadmin = await login(`pubarch-super-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    const publicaciones = await prisma.publicacion.findMany({
      where: {
        OR: [
          { tenantId: tenantAId },
          { tenantId: tenantBId },
          { titulo: { startsWith: tituloMarca } },
        ],
      },
      select: { id: true },
    });
    for (const p of publicaciones) {
      fs.rmSync(path.join(UPLOADS_DIR_PUBLICACIONES, p.id), { recursive: true, force: true });
    }
    // PublicacionArchivo cae por cascade al borrar la publicación.
    await prisma.publicacion.deleteMany({ where: { id: { in: publicaciones.map((p) => p.id) } } });
    await prisma.auditoria.deleteMany({
      where: { OR: [{ tenantId: tenantAId }, { tenantId: tenantBId }] },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ tenantId: tenantAId }, { tenantId: tenantBId }] },
    });
    await prisma.rol.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  it("sin permiso de gestión no se puede subir (403)", async () => {
    const res = await request(app)
      .post(`/api/publicaciones/${publicacionId}/archivos`)
      .set(auth(tokenLector))
      .attach("archivos", PNG, { filename: "foto.png", contentType: "image/png" });
    expect(res.status).toBe(403);
  });

  it("sube una foto y un documento; quedan clasificados y con nombre UTF-8", async () => {
    const res = await request(app)
      .post(`/api/publicaciones/${publicacionId}/archivos`)
      .set(auth(tokenAdmin))
      .attach("archivos", PNG, { filename: "foto.png", contentType: "image/png" })
      .attach("archivos", PDF, { filename: "Acta año.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    const archivos = res.body.archivos as { tipo: string; nombre: string }[];
    expect(archivos).toHaveLength(2);
    expect(archivos.map((a) => a.tipo).sort()).toEqual(["DOCUMENTO", "IMAGEN"]);
    expect(archivos.map((a) => a.nombre)).toContain("Acta año.pdf");
  });

  it("un archivo cuyo contenido no coincide con su tipo se rechaza y no se guarda nada", async () => {
    const antes = await prisma.publicacionArchivo.count({ where: { publicacionId } });
    const res = await request(app)
      .post(`/api/publicaciones/${publicacionId}/archivos`)
      .set(auth(tokenAdmin))
      .attach("archivos", Buffer.from("MZ\x90\x00 no soy un pdf"), {
        filename: "virus.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(400);
    expect(await prisma.publicacionArchivo.count({ where: { publicacionId } })).toBe(antes);
  });

  it("el Home incluye los adjuntos de la publicación para un usuario sin permiso de gestión", async () => {
    const res = await request(app)
      .get("/api/publicaciones?categoria=NOVEDAD")
      .set(auth(tokenLector));
    expect(res.status).toBe(200);
    const pub = res.body.find((p: { id: string }) => p.id === publicacionId);
    expect(pub.archivos).toHaveLength(2);
  });

  it("sirve el archivo (mismos bytes) a un usuario del tenant y lo niega (404) a otro tenant", async () => {
    const { archivos } = (
      await request(app).get("/api/publicaciones?categoria=NOVEDAD").set(auth(tokenLector))
    ).body.find((p: { id: string }) => p.id === publicacionId);
    const imagen = archivos.find((a: { tipo: string }) => a.tipo === "IMAGEN");
    const ruta = `/api/publicaciones/${publicacionId}/archivos/${imagen.id}`;

    const propio = await request(app)
      .get(ruta)
      .set(auth(tokenLector))
      .buffer(true)
      .parse((r, cb) => {
        const trozos: Buffer[] = [];
        r.on("data", (t: Buffer) => trozos.push(t));
        r.on("end", () => cb(null, Buffer.concat(trozos)));
      });
    expect(propio.status).toBe(200);
    expect(propio.headers["content-type"]).toContain("image/png");
    expect(Buffer.compare(propio.body as Buffer, PNG)).toBe(0);

    const ajeno = await request(app).get(ruta).set(auth(tokenTenantB));
    expect(ajeno.status).toBe(404);
  });

  it("una publicación desactivada no entrega sus archivos a quien no la administra, sí al administrador", async () => {
    const subida = await request(app)
      .post(`/api/publicaciones/${inactivaId}/archivos`)
      .set(auth(tokenAdmin))
      .attach("archivos", PNG, { filename: "foto.png", contentType: "image/png" });
    expect(subida.status).toBe(201);
    const ruta = `/api/publicaciones/${inactivaId}/archivos/${subida.body.archivos[0].id}`;

    expect((await request(app).get(ruta).set(auth(tokenLector))).status).toBe(404);
    expect((await request(app).get(ruta).set(auth(tokenAdmin))).status).toBe(200);
  });

  it("solo un superadmin puede adjuntar a una publicación GENERAL", async () => {
    const admin = await request(app)
      .post(`/api/publicaciones/${generalId}/archivos`)
      .set(auth(tokenAdmin))
      .attach("archivos", PNG, { filename: "foto.png", contentType: "image/png" });
    expect(admin.status).toBe(403);
    expect(await prisma.publicacionArchivo.count({ where: { publicacionId: generalId } })).toBe(0);

    const superadmin = await request(app)
      .post(`/api/publicaciones/${generalId}/archivos`)
      .set(auth(tokenSuperadmin))
      .attach("archivos", PNG, { filename: "foto.png", contentType: "image/png" });
    expect(superadmin.status).toBe(201);
  });

  it("un administrador de otro tenant no puede subir ni borrar adjuntos de una publicación ajena (404)", async () => {
    const subir = await request(app)
      .post(`/api/publicaciones/${publicacionId}/archivos`)
      .set(auth(tokenAdminB))
      .attach("archivos", PNG, { filename: "foto.png", contentType: "image/png" });
    expect(subir.status).toBe(404);

    const archivo = await prisma.publicacionArchivo.findFirstOrThrow({ where: { publicacionId } });
    const borrar = await request(app)
      .delete(`/api/publicaciones/${publicacionId}/archivos/${archivo.id}`)
      .set(auth(tokenAdminB));
    expect(borrar.status).toBe(404);
    expect(
      await prisma.publicacionArchivo.findUnique({ where: { id: archivo.id } }),
    ).not.toBeNull();
  });

  it("respeta el máximo de 20 archivos por publicación", async () => {
    const subirDiez = () => {
      let req = request(app)
        .post(`/api/publicaciones/${eventoPasadoId}/archivos`)
        .set(auth(tokenAdmin));
      for (let i = 0; i < 10; i++) {
        req = req.attach("archivos", PNG, { filename: `f${i}.png`, contentType: "image/png" });
      }
      return req;
    };
    expect((await subirDiez()).status).toBe(201);
    expect((await subirDiez()).status).toBe(201);

    const extra = await request(app)
      .post(`/api/publicaciones/${eventoPasadoId}/archivos`)
      .set(auth(tokenAdmin))
      .attach("archivos", PNG, { filename: "sobra.png", contentType: "image/png" });
    expect(extra.status).toBe(400);
    expect(extra.body.message).toMatch(/hasta 20 archivos/);
  });

  it("calendario: con desde/hasta el EVENTO lista también los días ya pasados del rango", async () => {
    const ahora = Date.now();
    const desde = new Date(ahora - 3 * 24 * 60 * 60 * 1000).toISOString();
    const hasta = new Date(ahora + 3 * 24 * 60 * 60 * 1000).toISOString();

    const sinRango = await request(app)
      .get("/api/publicaciones?categoria=EVENTO")
      .set(auth(tokenLector));
    expect(sinRango.body.map((p: { id: string }) => p.id)).not.toContain(eventoPasadoId);

    const conRango = await request(app)
      .get(`/api/publicaciones?categoria=EVENTO&desde=${desde}&hasta=${hasta}`)
      .set(auth(tokenLector));
    expect(conRango.status).toBe(200);
    expect(conRango.body.map((p: { id: string }) => p.id)).toContain(eventoPasadoId);

    const invalido = await request(app)
      .get("/api/publicaciones?categoria=EVENTO&desde=no-es-fecha")
      .set(auth(tokenLector));
    expect(invalido.status).toBe(400);
  });

  it("eliminar un archivo lo borra de la BD y del disco; eliminar la publicación borra su carpeta", async () => {
    const archivo = await prisma.publicacionArchivo.findFirstOrThrow({ where: { publicacionId } });
    const rutaDisco = path.join(UPLOADS_DIR_PUBLICACIONES, archivo.ruta);
    expect(fs.existsSync(rutaDisco)).toBe(true);

    const del = await request(app)
      .delete(`/api/publicaciones/${publicacionId}/archivos/${archivo.id}`)
      .set(auth(tokenAdmin));
    expect(del.status).toBe(204);
    expect(await prisma.publicacionArchivo.findUnique({ where: { id: archivo.id } })).toBeNull();
    await new Promise((r) => setTimeout(r, 100)); // unlink es asíncrono
    expect(fs.existsSync(rutaDisco)).toBe(false);

    const delPub = await request(app)
      .delete(`/api/publicaciones/${publicacionId}`)
      .set(auth(tokenAdmin));
    expect(delPub.status).toBe(204);
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(path.join(UPLOADS_DIR_PUBLICACIONES, publicacionId))).toBe(false);
  });
});
