import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { PERMISOS_SISTEMA } from "../../lib/permissions";

/**
 * GET /facturas/siesa con BASE DE DATOS REAL de RicoSoft (tenant/usuario/
 * permisos) y Siesa MOCKEADO (../../config/siesa::getSiesaPool) — mismo
 * patrón que cotizaciones-siesa.integration.test.ts. Nunca toca una Siesa
 * real: las "facturas" aquí son filas fabricadas en memoria.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

const CIA_A = 900980;
const CIA_B = 900981;

interface FacturaFake {
  rowId: number;
  cia: number;
  terceroRowId: number;
  terceroNombre: string;
  terceroNit: string;
  prefijo: string;
  numero: number;
  fecha: Date;
  vlrNeto: number;
  vlrCxp: number;
}
let siguienteRowId = 900_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
const FACTURAS: FacturaFake[] = [
  {
    rowId: siguienteRowId++,
    cia: CIA_A,
    terceroRowId: 25998,
    terceroNombre: "LINEAS LOGISTICAS DE COLOMBIA S.A.S.",
    terceroNit: "901167319",
    prefijo: "LLCD",
    numero: 13284,
    fecha: new Date("2026-09-28"),
    vlrNeto: 8000000,
    vlrCxp: 7920000,
  },
  {
    rowId: siguienteRowId++,
    cia: CIA_A,
    terceroRowId: 29642,
    terceroNombre: "ARROYO RAMIREZ GUSTAVO ALONSO",
    terceroNit: "16721534",
    prefijo: "",
    numero: 20260929,
    fecha: new Date("2026-09-29"),
    vlrNeto: 1643250,
    vlrCxp: 1602169,
  },
  // Cía distinta — nunca debe aparecer en una consulta filtrada por CIA_A.
  {
    rowId: siguienteRowId++,
    cia: CIA_B,
    terceroRowId: 1,
    terceroNombre: "Proveedor de otra compañía",
    terceroNit: "999999999",
    prefijo: "X",
    numero: 1,
    fecha: new Date("2026-09-20"),
    vlrNeto: 1000,
    vlrCxp: 1000,
  },
];

function crearRequestFake() {
  const inputs: Record<string, unknown> = {};
  const req = {
    input(nombre: string, valor: unknown) {
      inputs[nombre] = valor;
      return req;
    },
    async query(sql: string) {
      const delTenant = FACTURAS.filter((f) => f.cia === inputs.ciaId);
      const filtradasPorSearch =
        typeof inputs.search === "string"
          ? delTenant.filter((f) => {
              const patron = (inputs.search as string).replace(/%/g, "");
              return f.terceroNombre.includes(patron) || f.terceroNit.includes(patron);
            })
          : delTenant;

      if (/COUNT\(\*\)/.test(sql)) {
        return { recordset: [{ n: filtradasPorSearch.length }] };
      }

      const pagina = filtradasPorSearch
        .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
        .slice(inputs.skip as number, (inputs.skip as number) + (inputs.take as number));

      return {
        recordset: pagina.map((f) => ({
          facturaRowId: f.rowId,
          ciaId: f.cia,
          terceroRowId: f.terceroRowId,
          terceroNombre: f.terceroNombre,
          terceroNit: f.terceroNit,
          prefijo: f.prefijo,
          numero: f.numero,
          fechaDocumentoProveedor: f.fecha,
          fechaEmision: f.fecha,
          valorNeto: f.vlrNeto,
          valorCxpRegistrado: f.vlrCxp,
          valorImpuesto: 0,
          valorDescuento: 0,
          valorRetencion: 0,
          monedaCausacion: "COP",
        })),
      };
    },
  };
  return req;
}

vi.mock("../../config/siesa", () => ({
  getSiesaPool: vi.fn(async () => ({ request: () => crearRequestFake() })),
}));

describe.skipIf(!RUN)(
  "GET /facturas/siesa — facturas de proveedores desde Siesa (solo lectura)",
  () => {
    let app: ReturnType<typeof import("../../app").createApp>;
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantAId: string;
    let tenantBId: string;
    let tenantSinSiesaId: string;
    let tokenA: string;
    let tokenSinPermisoA: string;

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
      const { createApp } = await import("../../app");
      const { prisma } = await import("../../config/prisma");
      app = createApp();

      const passwordHash = await bcrypt.hash(PASSWORD, 10);
      // Cada id se registra en cuanto el tenant existe: si una creación posterior
      // falla, el afterAll igualmente limpia los que ya se crearon (antes quedaban
      // huérfanos porque los ids se asignaban recién tras crear los tres).
      const tenantA = await prisma.tenant.create({
        data: {
          nombre: `Fact Siesa A ${sufijo}`,
          subdomain: `test-fact-siesa-a-${sufijo}`,
          siesaCiaId: CIA_A,
        },
      });
      tenantAId = tenantA.id;
      const tenantB = await prisma.tenant.create({
        data: {
          nombre: `Fact Siesa B ${sufijo}`,
          subdomain: `test-fact-siesa-b-${sufijo}`,
          siesaCiaId: CIA_B,
        },
      });
      tenantBId = tenantB.id;
      const tenantSinSiesa = await prisma.tenant.create({
        data: { nombre: `Fact Siesa Sin Cia ${sufijo}`, subdomain: `test-fact-siesa-sc-${sufijo}` },
      });
      tenantSinSiesaId = tenantSinSiesa.id;

      const rolVer = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: `Ve Facturas ${sufijo}`,
          permisos: JSON.stringify([PERMISOS_SISTEMA.FACTURAS_VER]),
        },
      });
      const rolSinPermiso = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: `Sin Permiso ${sufijo}`,
          permisos: JSON.stringify([]),
        },
      });

      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `fact-siesa-a-${sufijo}@test.com`,
          nombre: "Usuario A",
          passwordHash,
          activo: true,
          rolId: rolVer.id,
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `fact-siesa-sp-${sufijo}@test.com`,
          nombre: "Usuario Sin Permiso",
          passwordHash,
          activo: true,
          rolId: rolSinPermiso.id,
        },
      });

      tokenA = await login(`fact-siesa-a-${sufijo}@test.com`);
      tokenSinPermisoA = await login(`fact-siesa-sp-${sufijo}@test.com`);
    });

    afterAll(async () => {
      const { prisma } = await import("../../config/prisma");
      // Solo los tenants que este archivo creó (ids definidos).
      const tenantIds = [tenantAId, tenantBId, tenantSinSiesaId].filter(
        (id): id is string => typeof id === "string",
      );
      if (tenantIds.length === 0) return;
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    });

    it("lista las facturas de la compañía Siesa del tenant autenticado, nunca las de otra", async () => {
      const res = await request(app)
        .get("/api/facturas/siesa")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(true);
      expect(res.body.total).toBe(2);
      expect(res.body.items).toHaveLength(2);
      // Ordenado por fecha desc: la más reciente primero.
      expect(res.body.items[0].terceroNit).toBe("16721534");
      expect(res.body.items[0].prefijo).toBeNull(); // "" se normaliza a null
      expect(res.body.items.every((i: { ciaId: number }) => i.ciaId === CIA_A)).toBe(true);
    });

    it("filtra por search (NIT/razón social)", async () => {
      const res = await request(app)
        .get("/api/facturas/siesa?search=LINEAS")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].terceroNit).toBe("901167319");
    });

    it("pagina server-side (page/pageSize), sin cargar todo en memoria", async () => {
      const res = await request(app)
        .get("/api/facturas/siesa?page=1&pageSize=1")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(1);
    });

    it("un tenant sin siesaCiaId recibe disponible:false, nunca un error", async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);
      const { prisma } = await import("../../config/prisma");
      const rol = await prisma.rol.create({
        data: {
          tenantId: tenantSinSiesaId,
          nombre: `Ve Facturas SC ${sufijo}`,
          permisos: JSON.stringify([PERMISOS_SISTEMA.FACTURAS_VER]),
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantSinSiesaId,
          email: `fact-siesa-sc-${sufijo}@test.com`,
          nombre: "Usuario Sin Cia",
          passwordHash,
          activo: true,
          rolId: rol.id,
        },
      });
      const token = await login(`fact-siesa-sc-${sufijo}@test.com`);

      const res = await request(app)
        .get("/api/facturas/siesa")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(false);
      expect(res.body.motivo).toMatch(/siesaCiaId/);
      expect(res.body.items).toEqual([]);
    });

    it("sin el permiso facturas.ver responde 403", async () => {
      const res = await request(app)
        .get("/api/facturas/siesa")
        .set("Authorization", `Bearer ${tokenSinPermisoA}`);
      expect(res.status).toBe(403);
    });

    it("sin JWT responde 401", async () => {
      const res = await request(app).get("/api/facturas/siesa");
      expect(res.status).toBe(401);
    });

    it("ciaId no se puede forzar desde la query: se ignora cualquier valor enviado", async () => {
      const res = await request(app)
        .get(`/api/facturas/siesa?ciaId=${CIA_B}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      // Sigue viendo solo lo de su propia cía (CIA_A), nunca lo de CIA_B.
      expect(res.body.items.every((i: { ciaId: number }) => i.ciaId === CIA_A)).toBe(true);
    });
  },
);
