import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * GET /inventario/productos/:itemRowId/comprometidos — detalle de pedidos
 * de venta que originan el "Comprometido (estimado)" del KPI de Inventario.
 * RicoSoft usa SQL Server real en la suite; SIESA se dobla para validar
 * aislamiento y permisos sin depender de VPN, credenciales ni datos vivos.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const CIA_TEST = 900_000_000 + Math.floor(Math.random() * 100_000_000) * 2;
const CIA_FAKE = CIA_TEST + 1;
const ITEM_ROW_ID = 778899;
const llamadasCia: unknown[] = [];

const getSiesaPoolMock = vi.fn(async () => ({
  request: () => {
    const inputs: Record<string, unknown> = {};
    const req = {
      input(nombre: string, valor: unknown) {
        inputs[nombre] = valor;
        return req;
      },
      async query() {
        llamadasCia.push(inputs.ciaId);
        if (
          inputs.ciaId !== CIA_TEST ||
          (inputs.itemRowId !== undefined && inputs.itemRowId !== ITEM_ROW_ID)
        )
          return { recordset: [] };
        return {
          recordset: [
            {
              pvDoctoRowId: 456789,
              numeroDocumento: 12345,
              tipoDocto: 1,
              clienteRowId: 23456,
              clienteNombre: "Cliente de prueba",
              itemRowId: ITEM_ROW_ID,
              referencia: "ITEM-TEST",
              descripcion: "Ítem de prueba",
              cantidadPedida: 10,
              cantidadComprometida: 7,
              cantidadRemisionada: 0,
              cantidadFacturada: 0,
              fechaPedido: new Date("2026-01-15T00:00:00.000Z"),
              fechaEntrega: null,
              vendedorRowId: null,
              vendedorNombre: null,
              indEstadoLinea: 1,
              indEstadoDocto: 1,
              indUltEstadoAprobado: true,
              indBackorderDocto: false,
              indBackorderLinea: false,
              indRetenidoMargen: false,
              indRetenidoCupo: false,
              indRetenidoMora: false,
              indRetenidoBloqueo: false,
              indRetenidoAnticipo: false,
              indRemisionado: false,
              indFacturado: false,
            },
          ],
        };
      },
    };
    return req;
  },
}));

vi.mock("../../config/siesa", () => ({
  getSiesaPool: (...args: unknown[]) => getSiesaPoolMock(...args),
}));

describe.skipIf(!RUN)(
  "Inventario — GET /inventario/productos/:itemRowId/comprometidos (BD real)",
  () => {
    const app = createApp();
    const sufijo = randomUUID().slice(0, 8);
    const PASSWORD = "TestPassword123";

    let tenantTestId: string;
    let tenantFakeId: string;
    let tokenReal: string;
    let tokenRealSinPermiso: string;
    let tokenFake: string;
    let itemRowIdConComprometido: number;
    const tenantIdsCreados: string[] = [];

    const login = async (email: string) => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      return res.body.token as string;
    };

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);

      const tenantTest = await prisma.tenant.create({
        data: {
          nombre: `Inv Comprometidos Test ${sufijo}`,
          subdomain: `test-invcomp-real-${sufijo}`,
          siesaCiaId: CIA_TEST,
        },
      });
      tenantTestId = tenantTest.id;
      tenantIdsCreados.push(tenantTestId);
      const tenantFake = await prisma.tenant.create({
        data: {
          nombre: `Inv Comprometidos Fake ${sufijo}`,
          subdomain: `test-invcomp-fake-${sufijo}`,
          siesaCiaId: CIA_FAKE,
        },
      });
      tenantFakeId = tenantFake.id;
      tenantIdsCreados.push(tenantFakeId);

      await prisma.user.create({
        data: {
          tenantId: tenantTestId,
          email: `invcomp-admin-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin de prueba",
          isSuperadmin: true,
          activo: true,
        },
      });
      const rolSinPermiso = await prisma.rol.create({
        data: {
          tenantId: tenantTestId,
          nombre: `Sin Permiso Inv Comp ${sufijo}`,
          permisos: JSON.stringify([]),
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantTestId,
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

      itemRowIdConComprometido = ITEM_ROW_ID;
    });

    afterAll(async () => {
      // Solo se borran los tenants y datos que esta suite creó.
      const usuariosPrueba = await prisma.user.findMany({
        where: { email: { contains: `${sufijo}@test.ricosoft.local` } },
        select: { id: true },
      });
      const usuarioIds = usuariosPrueba.map((u) => u.id);
      const tenantIds = [...tenantIdsCreados];
      if (tenantIds.length > 0) {
        await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      }
      await prisma.user.deleteMany({ where: { id: { in: usuarioIds } } });
      // Un `where` con valor `undefined` NO filtra en Prisma: si beforeAll falló
      // antes de asignar estos ids, un deleteMany({ id: undefined }) apuntaría a
      // TODOS los tenants. Solo se borra lo que este archivo creó, si existe.
      if (tenantIds.length > 0) {
        await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
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
      expect(llamadasCia.slice(-2)).toEqual([CIA_TEST, CIA_TEST]);
    });

    it("devuelve el detalle de pedidos del ítem de la compañía autenticada", async () => {
      expect(itemRowIdConComprometido).toBeGreaterThan(0);
      const res = await request(app)
        .get(`/api/inventario/productos/${itemRowIdConComprometido}/comprometidos`)
        .set("Authorization", `Bearer ${tokenReal}`);

      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(true);
      expect(Array.isArray(res.body.pedidos)).toBe(true);
      expect(res.body.totalCantidadComprometida).toBe(7);
      // Todo pedido devuelto debe ser del ítem solicitado (filtro correcto).
      for (const pedido of res.body.pedidos) {
        expect(pedido.itemRowId).toBe(itemRowIdConComprometido);
        expect(pedido.cantidadComprometida).toBeGreaterThan(0);
      }
    });

    it("aislamiento: un tenant no ve datos asignados a otra compañía", async () => {
      expect(itemRowIdConComprometido).toBeGreaterThan(0);
      const res = await request(app)
        .get(`/api/inventario/productos/${itemRowIdConComprometido}/comprometidos`)
        .set("Authorization", `Bearer ${tokenFake}`);

      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(true);
      // El doble solo devuelve filas para CIA_TEST, nunca para la otra compañía.
      expect(res.body.pedidos).toEqual([]);
      expect(res.body.totalCantidadComprometida).toBe(0);
      expect(llamadasCia.at(-1)).toBe(CIA_FAKE);
    });

    it("responde disponible:false si el tenant no tiene siesaCiaId configurado", async () => {
      const tenantSinCia = await prisma.tenant.create({
        data: { nombre: `Sin Cia ${sufijo}`, subdomain: `test-invcomp-sincia-${sufijo}` },
      });
      tenantIdsCreados.push(tenantSinCia.id);
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
    });
  },
);
