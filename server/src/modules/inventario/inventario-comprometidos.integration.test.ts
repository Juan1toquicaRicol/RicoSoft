import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";
import { getSiesaPool } from "../../config/siesa";

/**
 * GET /inventario/productos/:itemRowId/comprometidos — detalle de pedidos
 * de venta que originan el "Comprometido (estimado)" del KPI de Inventario.
 * BD real (RicoSoft + Siesa), gateada por RUN_DB_INTEGRATION_TESTS=true,
 * mismo contrato del resto de la suite.
 *
 * CIA_REAL = 1 (Ricol, ya verificada en la auditoría cerrada del módulo:
 * 8.175 ítems, existe comprometido real en t400_cm_existencia). CIA_FAKE
 * es una compañía inexistente en Siesa, usada solo para el escenario de
 * aislamiento entre tenants (debe responder disponible:true con array
 * vacío, nunca datos de la CIA_REAL).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const CIA_REAL = 1;
const CIA_FAKE = 9099;

describe.skipIf(!RUN)(
  "Inventario — GET /inventario/productos/:itemRowId/comprometidos (BD real)",
  () => {
    const app = createApp();
    const sufijo = randomUUID().slice(0, 8);
    const PASSWORD = "TestPassword123";

    let tenantRealId: string;
    let tenantFakeId: string;
    let tokenReal: string;
    let tokenRealSinPermiso: string;
    let tokenFake: string;
    let itemRowIdConComprometido: number;

    const login = async (email: string) => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      return res.body.token as string;
    };

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);

      // Tenant.siesaCiaId es único (constraint real) — cia 1 ya pertenece
      // al tenant real de Ricol, así que se reutiliza ese tenant (solo se
      // agregan/borran usuarios y roles de prueba, nunca el tenant ni sus
      // datos existentes).
      const tenantReal = await prisma.tenant.findFirst({ where: { siesaCiaId: CIA_REAL } });
      if (!tenantReal) {
        throw new Error(
          `No existe ningún tenant con siesaCiaId=${CIA_REAL} en esta base — no se puede correr la prueba de datos reales.`,
        );
      }
      tenantRealId = tenantReal.id;
      const tenantFake = await prisma.tenant.create({
        data: {
          nombre: `Inv Comprometidos Fake ${sufijo}`,
          subdomain: `test-invcomp-fake-${sufijo}`,
          siesaCiaId: CIA_FAKE,
        },
      });
      tenantFakeId = tenantFake.id;

      await prisma.user.create({
        data: {
          tenantId: tenantRealId,
          email: `invcomp-admin-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin Real",
          isSuperadmin: true,
          activo: true,
        },
      });
      const rolSinPermiso = await prisma.rol.create({
        data: {
          tenantId: tenantRealId,
          nombre: `Sin Permiso Inv Comp ${sufijo}`,
          permisos: JSON.stringify([]),
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantRealId,
          email: `invcomp-sinpermiso-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Sin Permiso",
          rolId: rolSinPermiso.id,
          isSuperadmin: false,
          activo: true,
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantFakeId,
          email: `invcomp-admin-fake-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin Fake",
          isSuperadmin: true,
          activo: true,
        },
      });

      tokenReal = await login(`invcomp-admin-${sufijo}@test.ricosoft.local`);
      tokenRealSinPermiso = await login(`invcomp-sinpermiso-${sufijo}@test.ricosoft.local`);
      tokenFake = await login(`invcomp-admin-fake-${sufijo}@test.ricosoft.local`);

      // Encuentra en vivo un ítem real con comprometido>0 en cia 1 (lectura
      // pública, sin necesidad de fijar un rowid de antemano — puede
      // cambiar con el tiempo).
      const pool = await getSiesaPool();
      const { recordset } = await pool.request().input("ciaId", CIA_REAL).query<{
        itemRowId: number;
      }>(`
        SELECT TOP 1 f400_rowid_item_ext AS itemRowId
        FROM t400_cm_existencia
        WHERE f400_id_cia = @ciaId AND f400_cant_comprometida_1 > 0
        GROUP BY f400_rowid_item_ext
        HAVING SUM(f400_cant_comprometida_1) > 0
      `);
      itemRowIdConComprometido = recordset[0]?.itemRowId ?? 0;
    });

    afterAll(async () => {
      // Solo se borran los usuarios/roles de prueba creados aquí y el
      // tenant "fake" — el tenant real (cia 1) es un tenant productivo
      // preexistente reutilizado en beforeAll, nunca se borra.
      const usuariosPrueba = await prisma.user.findMany({
        where: { email: { contains: `${sufijo}@test.ricosoft.local` } },
        select: { id: true },
      });
      const usuarioIds = usuariosPrueba.map((u) => u.id);
      await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuarioIds } } });
      await prisma.user.deleteMany({ where: { id: { in: usuarioIds } } });
      await prisma.rol.deleteMany({ where: { tenantId: tenantRealId, nombre: { contains: sufijo } } });
      await prisma.tenant.deleteMany({ where: { id: tenantFakeId } });
    });

    it("responde 400 si itemRowId no es un entero positivo", async () => {
      const res = await request(app)
        .get("/api/inventario/productos/abc/comprometidos")
        .set("Authorization", `Bearer ${tokenReal}`);
      expect(res.status).toBe(400);
    });

    it("responde 400 con un itemRowId que intenta inyección SQL en vez de concatenarlo", async () => {
      const res = await request(app)
        .get("/api/inventario/productos/1%3B DROP TABLE t400_cm_existencia--/comprometidos")
        .set("Authorization", `Bearer ${tokenReal}`);
      expect(res.status).toBe(400);
    });

    it("responde 403 sin el permiso analitica.ver", async () => {
      const res = await request(app)
        .get(`/api/inventario/productos/${itemRowIdConComprometido || 1}/comprometidos`)
        .set("Authorization", `Bearer ${tokenRealSinPermiso}`);
      expect(res.status).toBe(403);
    });

    it("ignora un ciaId enviado por query/body y siempre usa el del tenant autenticado", async () => {
      expect(itemRowIdConComprometido).toBeGreaterThan(0);
      const resConCiaFalso = await request(app)
        .get(
          `/api/inventario/productos/${itemRowIdConComprometido}/comprometidos?ciaId=${CIA_FAKE}`,
        )
        .set("Authorization", `Bearer ${tokenReal}`)
        .send({ ciaId: CIA_FAKE });
      const resSinCia = await request(app)
        .get(`/api/inventario/productos/${itemRowIdConComprometido}/comprometidos`)
        .set("Authorization", `Bearer ${tokenReal}`);

      expect(resConCiaFalso.status).toBe(200);
      expect(resSinCia.status).toBe(200);
      expect(resConCiaFalso.body.totalCantidadComprometida).toBe(
        resSinCia.body.totalCantidadComprometida,
      );
    });

    it("devuelve el detalle de pedidos de un ítem real con comprometido>0 en cia 1", async () => {
      expect(itemRowIdConComprometido).toBeGreaterThan(0);
      const res = await request(app)
        .get(`/api/inventario/productos/${itemRowIdConComprometido}/comprometidos`)
        .set("Authorization", `Bearer ${tokenReal}`);

      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(true);
      expect(Array.isArray(res.body.pedidos)).toBe(true);
      expect(typeof res.body.totalCantidadComprometida).toBe("number");
      // Todo pedido devuelto debe ser del ítem solicitado (filtro correcto).
      for (const pedido of res.body.pedidos) {
        expect(pedido.itemRowId).toBe(itemRowIdConComprometido);
        expect(pedido.cantidadComprometida).toBeGreaterThan(0);
      }
    });

    it("aislamiento: el tenant con cia falsa nunca ve el detalle real de la cia 1", async () => {
      expect(itemRowIdConComprometido).toBeGreaterThan(0);
      const res = await request(app)
        .get(`/api/inventario/productos/${itemRowIdConComprometido}/comprometidos`)
        .set("Authorization", `Bearer ${tokenFake}`);

      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(true);
      // La compañía falsa no existe en Siesa → sin filas, nunca los pedidos reales de cia 1.
      expect(res.body.pedidos).toEqual([]);
      expect(res.body.totalCantidadComprometida).toBe(0);
    });

    it("responde disponible:false si el tenant no tiene siesaCiaId configurado", async () => {
      const tenantSinCia = await prisma.tenant.create({
        data: { nombre: `Sin Cia ${sufijo}`, subdomain: `test-invcomp-sincia-${sufijo}` },
      });
      const passwordHash = await bcrypt.hash(PASSWORD, 10);
      await prisma.user.create({
        data: {
          tenantId: tenantSinCia.id,
          email: `invcomp-sincia-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Sin Cia",
          isSuperadmin: true,
          activo: true,
        },
      });
      const token = await login(`invcomp-sincia-${sufijo}@test.ricosoft.local`);

      const res = await request(app)
        .get(`/api/inventario/productos/${itemRowIdConComprometido || 1}/comprometidos`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(false);

      const usuariosTenantSinCia = await prisma.user.findMany({
        where: { tenantId: tenantSinCia.id },
        select: { id: true },
      });
      await prisma.auditoria.deleteMany({
        where: { usuarioId: { in: usuariosTenantSinCia.map((u) => u.id) } },
      });
      await prisma.user.deleteMany({ where: { tenantId: tenantSinCia.id } });
      await prisma.tenant.delete({ where: { id: tenantSinCia.id } });
    });
  },
);
