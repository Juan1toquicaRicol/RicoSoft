import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

/**
 * Suite de integración con BASE DE DATOS REAL para
 * POST /comercial/cotizaciones/:id/asignar-erp (vinculación manual con el
 * CDV real de Siesa). Mismo patrón que pedidos-asignar-erp.integration.test.ts
 * (app real + supertest + BD real, RUN_DB_INTEGRATION_TESTS): la única pieza
 * mockeada es la conexión a Siesa (../../config/siesa::getSiesaPool). El
 * índice único filtrado Cotizacion_tenantId_erpRowId_filtered_uq y la
 * atomicidad update+auditoría se ejercitan contra la BD de verdad — no se
 * pueden verificar de forma creíble con un mock de Prisma.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

const CIA_ID = 900960;
const CLIENTE_ROW_ID = 3001;

// El índice único filtrado es REAL y persistente entre corridas: cada test
// pide un CDV nuevo (rowid aleatorio por corrida) para no chocar con vínculos
// que otros tests o corridas anteriores dejaron.
const BASE_ROWID = 60_000_000 + Math.floor(Math.random() * 5_000_000) * 10;
let siguienteCdvRowId = BASE_ROWID;

interface CdvFake {
  f430_rowid: number;
  f430_id_cia: number;
  f430_consec_docto: number;
}
const TABLA_CDV: CdvFake[] = [];

function nuevoCdv(ciaId = CIA_ID): CdvFake {
  const rowid = siguienteCdvRowId++;
  const cdv: CdvFake = { f430_rowid: rowid, f430_id_cia: ciaId, f430_consec_docto: rowid };
  TABLA_CDV.push(cdv);
  return cdv;
}

function crearRequestFake() {
  const inputs: Record<string, unknown> = {};
  const req = {
    input(nombre: string, valor: unknown) {
      inputs[nombre] = valor;
      return req;
    },
    async query(sql: string) {
      // Las líneas (t431) no interesan a la vinculación: recordset vacío.
      if (/FROM\s+t431_cm_pv_movto/i.test(sql)) return { recordset: [] };
      const filas = TABLA_CDV.filter(
        (f) => f.f430_id_cia === inputs.ciaId && f.f430_rowid === inputs.rowId,
      );
      return {
        recordset: filas.map((f) => ({
          cotizacionIdExterno: f.f430_rowid,
          cotizacionNumero: f.f430_consec_docto,
          clienteRowId: CLIENTE_ROW_ID,
          clienteNombre: "Cliente Demo Siesa",
          clienteNit: "900123456-1",
          fecha: new Date("2026-09-01"),
          condicionPagoDescripcion: null,
          vendedorNombre: null,
        })),
      };
    },
  };
  return req;
}

const poolFake = { request: vi.fn(() => crearRequestFake()) };
const getSiesaPoolMock = vi.fn(async () => poolFake);

vi.mock("../../config/siesa", () => ({
  getSiesaPool: (...args: unknown[]) => getSiesaPoolMock(...args),
}));

import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

// Interruptor para el test de rollback (auditoría que falla). prisma.$use se
// registra UNA sola vez a nivel de módulo (no admite des-registro) y, a
// diferencia de vi.spyOn(prisma.auditoria, "create"), SÍ alcanza al cliente
// `tx` de prisma.$transaction — ver el mismo razonamiento en
// pedidos-asignar-erp.integration.test.ts (test 22).
let forzarFalloAuditoria = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$use(
  async (
    params: { model?: string; action: string },
    next: (params: unknown) => Promise<unknown>,
  ) => {
    if (forzarFalloAuditoria && params.model === "Auditoria" && params.action === "create") {
      throw new Error("boom inesperado");
    }
    return next(params);
  },
);

describe.skipIf(!RUN)(
  "POST /comercial/cotizaciones/:id/asignar-erp — vinculación con CDV real de Siesa",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantId: string;
    let otroTenantId: string;
    let tenantSinSiesaId: string;
    let token: string;
    let otroToken: string;
    let tokenSinSiesa: string;
    let numeroBase = 700000;

    const login = async (email: string): Promise<string> => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      if (res.status !== 200 || !res.body.token) {
        throw new Error(`Login falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
      }
      return res.body.token as string;
    };

    const crearCotizacion = async (
      tid: string,
      overrides: { erpRowId?: number | null } = {},
    ) => {
      numeroBase += 1;
      return prisma.cotizacion.create({
        data: {
          tenantId: tid,
          numero: numeroBase,
          clienteRowId: CLIENTE_ROW_ID,
          clienteNombre: "Cliente Prueba Asignar-ERP Cotización",
          creadoPorNombre: "Suite de pruebas",
          erpRowId: overrides.erpRowId ?? null,
        },
      });
    };

    const asignarErp = (id: string, erpRowId: number, tok = token) =>
      request(app)
        .post(`/api/comercial/cotizaciones/${id}/asignar-erp`)
        .set("Authorization", `Bearer ${tok}`)
        .send({ erpRowId });

    const auditoriasDe = (tid: string, cotizacionId: string) =>
      prisma.auditoria.findMany({
        where: {
          tenantId: tid,
          entidadTipo: "Cotizacion",
          entidadId: cotizacionId,
          accion: "COTIZACION_DOCUMENTO_ERP_ASIGNADO",
        },
      });

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);
      const mk = (etiqueta: string, siesaCiaId?: number) =>
        prisma.tenant.create({
          data: {
            nombre: `Test CotAsignarErp ${etiqueta} ${sufijo}`,
            subdomain: `test-cotasignarerp-${etiqueta}-${sufijo}`,
            ...(siesaCiaId ? { siesaCiaId } : {}),
          },
        });
      const tenant = await mk("a", CIA_ID);
      const otroTenant = await mk("b", CIA_ID + 1);
      const tenantSinSiesa = await mk("nosiesa");
      tenantId = tenant.id;
      otroTenantId = otroTenant.id;
      tenantSinSiesaId = tenantSinSiesa.id;

      for (const [tid, etiqueta] of [
        [tenantId, "a"],
        [otroTenantId, "b"],
        [tenantSinSiesaId, "nosiesa"],
      ] as const) {
        await prisma.user.create({
          data: {
            tenantId: tid,
            email: `admin-cotasignarerp-${etiqueta}-${sufijo}@test.ricosoft.local`,
            passwordHash,
            nombre: `Admin ${etiqueta}`,
            isSuperadmin: true,
            activo: true,
          },
        });
      }

      token = await login(`admin-cotasignarerp-a-${sufijo}@test.ricosoft.local`);
      otroToken = await login(`admin-cotasignarerp-b-${sufijo}@test.ricosoft.local`);
      tokenSinSiesa = await login(`admin-cotasignarerp-nosiesa-${sufijo}@test.ricosoft.local`);
    });

    afterAll(async () => {
      const tenantIds = [tenantId, otroTenantId, tenantSinSiesaId];
      await prisma.cotizacionItem.deleteMany({
        where: { cotizacion: { tenantId: { in: tenantIds } } },
      });
      await prisma.cotizacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    it("vinculación exitosa: 200, persiste tipo/rowid/número y deja auditoría", async () => {
      const cot = await crearCotizacion(tenantId);
      const cdv = nuevoCdv();

      const res = await asignarErp(cot.id, cdv.f430_rowid);

      expect(res.status).toBe(200);
      expect(res.body.erpTipoDocumento).toBe("CDV");
      expect(res.body.erpRowId).toBe(cdv.f430_rowid);
      expect(res.body.erpNumero).toBe(`PDV-${cdv.f430_consec_docto}`);

      const enBd = await prisma.cotizacion.findUnique({ where: { id: cot.id } });
      expect(enBd?.erpRowId).toBe(cdv.f430_rowid);
      expect(enBd?.erpTipoDocumento).toBe("CDV");

      const eventos = await auditoriasDe(tenantId, cot.id);
      expect(eventos).toHaveLength(1);
      expect(eventos[0].detalle).not.toMatch(/password|DATABASE_URL|SIESA_DB_/i);
    });

    it("re-vinculación idempotente: mismo erpRowId -> 200, sin consultar Siesa ni duplicar auditoría", async () => {
      const cot = await crearCotizacion(tenantId);
      const cdv = nuevoCdv();
      expect((await asignarErp(cot.id, cdv.f430_rowid)).status).toBe(200);

      getSiesaPoolMock.mockClear();
      const segunda = await asignarErp(cot.id, cdv.f430_rowid);

      expect(segunda.status).toBe(200);
      expect(segunda.body.erpRowId).toBe(cdv.f430_rowid);
      expect(getSiesaPoolMock).not.toHaveBeenCalled();
      expect(await auditoriasDe(tenantId, cot.id)).toHaveLength(1);
    });

    it("intento de sobreescritura: erpRowId DISTINTO al ya vinculado -> 409 y conserva el original", async () => {
      const cot = await crearCotizacion(tenantId);
      const original = nuevoCdv();
      expect((await asignarErp(cot.id, original.f430_rowid)).status).toBe(200);

      const otro = nuevoCdv();
      const res = await asignarErp(cot.id, otro.f430_rowid);

      expect(res.status).toBe(409);
      const enBd = await prisma.cotizacion.findUnique({ where: { id: cot.id } });
      expect(enBd?.erpRowId).toBe(original.f430_rowid);
      expect(await auditoriasDe(tenantId, cot.id)).toHaveLength(1);
    });

    it("el CDV ya vinculado a OTRA cotización del mismo tenant -> 409, sin persistir", async () => {
      const cotA = await crearCotizacion(tenantId);
      const cotB = await crearCotizacion(tenantId);
      const cdv = nuevoCdv();
      expect((await asignarErp(cotA.id, cdv.f430_rowid)).status).toBe(200);

      const res = await asignarErp(cotB.id, cdv.f430_rowid);

      expect(res.status).toBe(409);
      const bEnBd = await prisma.cotizacion.findUnique({ where: { id: cotB.id } });
      expect(bEnBd?.erpRowId).toBeNull();
      expect(await auditoriasDe(tenantId, cotB.id)).toHaveLength(0);
    });

    it("carrera: dos cotizaciones del mismo tenant al mismo CDV en paralelo -> exactamente un 200 y un 409 (índice único de BD)", async () => {
      const cotA = await crearCotizacion(tenantId);
      const cotB = await crearCotizacion(tenantId);
      const cdv = nuevoCdv();

      const [ra, rb] = await Promise.all([
        asignarErp(cotA.id, cdv.f430_rowid),
        asignarErp(cotB.id, cdv.f430_rowid),
      ]);

      expect([ra.status, rb.status].sort()).toEqual([200, 409]);
      const vinculadas = await prisma.cotizacion.count({
        where: { tenantId, erpRowId: cdv.f430_rowid },
      });
      expect(vinculadas).toBe(1);
      // Sin auditoría huérfana de la petición perdedora.
      const auditorias =
        (await auditoriasDe(tenantId, cotA.id)).length +
        (await auditoriasDe(tenantId, cotB.id)).length;
      expect(auditorias).toBe(1);
    });

    it("carrera: dos CDV distintos sobre la MISMA cotización en paralelo -> un 200 y un 409, un solo vínculo", async () => {
      const cot = await crearCotizacion(tenantId);
      const cdv1 = nuevoCdv();
      const cdv2 = nuevoCdv();

      const [r1, r2] = await Promise.all([
        asignarErp(cot.id, cdv1.f430_rowid),
        asignarErp(cot.id, cdv2.f430_rowid),
      ]);

      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      const enBd = await prisma.cotizacion.findUnique({ where: { id: cot.id } });
      const ganador = r1.status === 200 ? cdv1 : cdv2;
      expect(enBd?.erpRowId).toBe(ganador.f430_rowid);
      expect(await auditoriasDe(tenantId, cot.id)).toHaveLength(1);
    });

    it("cotizaciones sin vincular (erpRowId NULL) coexisten: el índice es filtrado, no un @@unique plano", async () => {
      const a = await crearCotizacion(tenantId);
      const b = await crearCotizacion(tenantId);
      expect(a.erpRowId).toBeNull();
      expect(b.erpRowId).toBeNull();
    });

    it("aislamiento multi-tenant: cotización de otro tenant -> 404 (no 403/409), sin persistir ni auditar", async () => {
      const cot = await crearCotizacion(tenantId);
      const cdv = nuevoCdv(CIA_ID + 1);

      const res = await asignarErp(cot.id, cdv.f430_rowid, otroToken);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Cotización no encontrada.");
      const enBd = await prisma.cotizacion.findUnique({ where: { id: cot.id } });
      expect(enBd?.erpRowId).toBeNull();
      expect(await auditoriasDe(tenantId, cot.id)).toHaveLength(0);
      expect(await auditoriasDe(otroTenantId, cot.id)).toHaveLength(0);
    });

    it("sin fuga entre tenants: un erpRowId vinculado en el tenant A no genera 409 en el tenant B (unicidad por tenant)", async () => {
      const cotA = await crearCotizacion(tenantId);
      const cotB = await crearCotizacion(otroTenantId);
      // Mismo f430_rowid en dos compañías Siesa distintas (una por tenant).
      const cdvA = nuevoCdv(CIA_ID);
      TABLA_CDV.push({ ...cdvA, f430_id_cia: CIA_ID + 1 });
      expect((await asignarErp(cotA.id, cdvA.f430_rowid)).status).toBe(200);

      const res = await asignarErp(cotB.id, cdvA.f430_rowid, otroToken);

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(cotA.id);
    });

    it("cotización inexistente -> 404", async () => {
      const res = await asignarErp(randomUUID(), nuevoCdv().f430_rowid);
      expect(res.status).toBe(404);
    });

    it("rollback transaccional: si la auditoría falla -> 500 y el vínculo NO queda persistido", async () => {
      const cot = await crearCotizacion(tenantId);
      const cdv = nuevoCdv();

      forzarFalloAuditoria = true;
      try {
        const res = await asignarErp(cot.id, cdv.f430_rowid);
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/boom inesperado|stack|at Object/);

        const enBd = await prisma.cotizacion.findUnique({ where: { id: cot.id } });
        expect(enBd?.erpRowId).toBeNull();
        expect(enBd?.erpTipoDocumento).toBeNull();
        expect(enBd?.erpNumero).toBeNull();
      } finally {
        forzarFalloAuditoria = false;
      }

      // Tras el fallo, el mismo CDV sigue libre y el reintento funciona.
      const reintento = await asignarErp(cot.id, cdv.f430_rowid);
      expect(reintento.status).toBe(200);
    });

    it("CDV inexistente en Siesa -> 400, sin persistir", async () => {
      const cot = await crearCotizacion(tenantId);
      const res = await asignarErp(cot.id, 999999999);
      expect(res.status).toBe(400);
      const enBd = await prisma.cotizacion.findUnique({ where: { id: cot.id } });
      expect(enBd?.erpRowId).toBeNull();
    });

    it("error de conexión con Siesa -> 502, sin persistir ni filtrar detalles internos", async () => {
      const cot = await crearCotizacion(tenantId);
      getSiesaPoolMock.mockRejectedValueOnce(new Error("simulated ECONNREFUSED"));

      const res = await asignarErp(cot.id, nuevoCdv().f430_rowid);

      expect(res.status).toBe(502);
      expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|stack|SIESA_DB_/i);
      const enBd = await prisma.cotizacion.findUnique({ where: { id: cot.id } });
      expect(enBd?.erpRowId).toBeNull();
    });

    it("tenant sin siesaCiaId -> 400, sin intentar conectar a Siesa", async () => {
      const cot = await crearCotizacion(tenantSinSiesaId);
      getSiesaPoolMock.mockClear();

      const res = await asignarErp(cot.id, nuevoCdv().f430_rowid, tokenSinSiesa);

      expect(res.status).toBe(400);
      expect(getSiesaPoolMock).not.toHaveBeenCalled();
    });

    it("body con erpRowId inválido -> 400", async () => {
      const cot = await crearCotizacion(tenantId);
      const res = await asignarErp(cot.id, -1);
      expect(res.status).toBe(400);
    });
  },
);
