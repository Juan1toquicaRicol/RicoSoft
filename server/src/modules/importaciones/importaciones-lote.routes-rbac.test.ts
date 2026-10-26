import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * RBAC de las rutas nuevas del lote (hitos, documentos, liquidación, recepción)
 * con el router REAL y el requirePermission REAL, sin BD: solo se sustituye la
 * autenticación para fijar los permisos de la sesión. Un usuario sin el permiso
 * del catálogo recibe 403 SIN tocar la base de datos; con el permiso, la
 * petición llega al controlador (que aquí responde 404 porque el lote simulado
 * no existe).
 */
const m = vi.hoisted(() => ({
  permisos: [] as string[],
  isSuperadmin: false,
  loteFindFirst: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    loteImportacion: { findFirst: m.loteFindFirst },
    loteImportacionDocumento: { findFirst: m.loteFindFirst },
  },
}));
vi.mock("../../lib/tenant-prisma", () => ({ getTenantPrisma: vi.fn(() => ({})) }));
vi.mock("../../lib/motor-destinatarios", () => ({ resolverDestinatarios: vi.fn(async () => []) }));
vi.mock("../../lib/notificaciones", () => ({ crearNotificacion: vi.fn() }));
vi.mock("../../lib/inbox", () => ({ crearItemDeTrabajo: vi.fn() }));
vi.mock("../../integrations/trm/trm.service", () => ({ obtenerTrmOficial: vi.fn() }));
vi.mock("../integraciones-siesa/siesa-inventario.service", () => ({ buscarItemsSiesa: vi.fn() }));
vi.mock("../catalogos/catalogos.controller", () => ({
  obtenerClavesActivasCatalogo: vi.fn(async () => new Set<string>()),
}));
vi.mock("../../middleware/auth.middleware", async () => {
  const real = await vi.importActual<typeof import("../../middleware/auth.middleware")>(
    "../../middleware/auth.middleware",
  );
  return {
    ...real,
    authenticateJWT: (req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = {
        id: "u1",
        tenantId: "ten-A",
        nombre: "Usuario A",
        isSuperadmin: m.isSuperadmin,
        permisos: m.permisos,
      };
      next();
    },
  };
});

const { default: router } = await import("./importaciones.routes");
const { permisosRequeridos } = await import("../../lib/catalogo-permisos");
const { PERMISOS_SISTEMA } = await import("../../lib/permissions");

const app = express();
app.use(express.json());
app.use("/api/importaciones", router);

const LOTE_ID = "11111111-1111-4111-8111-111111111111";
const DOC_ID = "22222222-2222-4222-8222-222222222222";

const conPermiso = (permiso: string) => permisosRequeridos(permiso);

beforeEach(() => {
  m.permisos = [];
  m.isSuperadmin = false;
  m.loteFindFirst.mockReset();
  m.loteFindFirst.mockResolvedValue(null);
});

const RUTAS_GESTIONAR_TRANSITO: Array<[string, string, Record<string, unknown> | undefined]> = [
  ["put", `/api/importaciones/lotes/${LOTE_ID}/hitos/LLEGADA_PUERTO`, { fecha: "2026-10-01" }],
  ["delete", `/api/importaciones/lotes/${LOTE_ID}/hitos/LLEGADA_PUERTO`, undefined],
  ["delete", `/api/importaciones/lotes/${LOTE_ID}/documentos/${DOC_ID}`, undefined],
];

describe("rutas de hitos y documentos del lote — permisos", () => {
  it.each(RUTAS_GESTIONAR_TRANSITO)(
    "%s %s: 403 sin permisos y 403 con solo importaciones.ver (sin tocar la BD)",
    async (metodo, ruta, cuerpo) => {
      const sinNada = await (request(app) as never as Record<string, (r: string) => request.Test>)
        [metodo](ruta)
        .send(cuerpo);
      expect(sinNada.status).toBe(403);

      m.permisos = conPermiso(PERMISOS_SISTEMA.IMPORTACIONES_VER);
      const soloVer = await (request(app) as never as Record<string, (r: string) => request.Test>)
        [metodo](ruta)
        .send(cuerpo);
      expect(soloVer.status).toBe(403);
      expect(m.loteFindFirst).not.toHaveBeenCalled();
    },
  );

  it.each(RUTAS_GESTIONAR_TRANSITO)(
    "%s %s: con importaciones.gestionar_transito llega al controlador (lote simulado inexistente → 404)",
    async (metodo, ruta, cuerpo) => {
      m.permisos = conPermiso(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO);
      const res = await (request(app) as never as Record<string, (r: string) => request.Test>)
        [metodo](ruta)
        .send(cuerpo);
      expect(res.status).toBe(404);
      expect(m.loteFindFirst).toHaveBeenCalledTimes(1);
      expect(m.loteFindFirst.mock.calls[0][0].where.tenantId).toBe("ten-A");
    },
  );

  it("subir documento del lote: 403 sin gestionar_transito (antes de procesar el archivo) y 400 con id no UUID", async () => {
    let res = await request(app).post(`/api/importaciones/lotes/${LOTE_ID}/documentos/bl-awb`);
    expect(res.status).toBe(403);

    m.permisos = conPermiso(PERMISOS_SISTEMA.IMPORTACIONES_VER);
    res = await request(app).post(`/api/importaciones/lotes/${LOTE_ID}/documentos/bl-awb`);
    expect(res.status).toBe(403);

    m.permisos = conPermiso(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO);
    res = await request(app).post("/api/importaciones/lotes/no-es-uuid/documentos/bl-awb");
    expect(res.status).toBe(400);
    expect(m.loteFindFirst).not.toHaveBeenCalled();
  });

  it("descargar documento del lote: exige importaciones.ver y consulta con el tenant de la sesión", async () => {
    let res = await request(app).get(`/api/importaciones/lotes/${LOTE_ID}/documentos/${DOC_ID}`);
    expect(res.status).toBe(403);

    m.permisos = conPermiso(PERMISOS_SISTEMA.IMPORTACIONES_VER);
    res = await request(app).get(`/api/importaciones/lotes/${LOTE_ID}/documentos/${DOC_ID}`);
    expect(res.status).toBe(404);
    expect(m.loteFindFirst.mock.calls[0][0].where).toEqual({
      id: DOC_ID,
      tenantId: "ten-A",
      loteId: LOTE_ID,
    });
  });

  it("registrar hito exige una fecha en el cuerpo (400 de validación antes de tocar la BD)", async () => {
    m.permisos = conPermiso(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO);
    const res = await request(app)
      .put(`/api/importaciones/lotes/${LOTE_ID}/hitos/LLEGADA_PUERTO`)
      .send({});
    expect(res.status).toBe(400);
    expect(m.loteFindFirst).not.toHaveBeenCalled();
  });
});

describe("liquidación y recepción — permisos y validación de forma", () => {
  it("liquidar-costeo exige importaciones.liquidar; recibir-pre-compra exige importaciones.recibir", async () => {
    m.permisos = conPermiso(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO);
    let res = await request(app)
      .post(`/api/importaciones/lotes/${LOTE_ID}/liquidar-costeo`)
      .send({ trmLiquidacion: 4000, valorCifTotalUsd: 1, arancelTotalCop: 0, ivaTotalCop: 0 });
    expect(res.status).toBe(403);

    res = await request(app).patch(`/api/importaciones/lotes/${LOTE_ID}/recibir-pre-compra`);
    expect(res.status).toBe(403);
    expect(m.loteFindFirst).not.toHaveBeenCalled();

    m.permisos = conPermiso(PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR);
    res = await request(app)
      .post(`/api/importaciones/lotes/${LOTE_ID}/liquidar-costeo`)
      .send({ trmLiquidacion: 4000, valorCifTotalUsd: 1, arancelTotalCop: 0, ivaTotalCop: 0 });
    expect(res.status).toBe(404);

    m.permisos = conPermiso(PERMISOS_SISTEMA.IMPORTACIONES_RECIBIR);
    res = await request(app).patch(`/api/importaciones/lotes/${LOTE_ID}/recibir-pre-compra`);
    expect(res.status).toBe(404);
  });

  it("el método de prorrateo inválido se rechaza en la validación de esquema (400) sin tocar la BD", async () => {
    m.permisos = conPermiso(PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR);
    const res = await request(app)
      .post(`/api/importaciones/lotes/${LOTE_ID}/liquidar-costeo`)
      .send({
        trmLiquidacion: 4000,
        valorCifTotalUsd: 1000,
        arancelTotalCop: 0,
        ivaTotalCop: 0,
        metodoProrrateoGastos: "VALOR",
      });
    expect(res.status).toBe(400);
    expect(m.loteFindFirst).not.toHaveBeenCalled();
  });
});
