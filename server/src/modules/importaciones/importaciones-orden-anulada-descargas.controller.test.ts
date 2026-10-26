import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";

/**
 * Etapa 1 (seguridad e integridad): ninguna ruta mutante de lote admite una
 * orden anulada/eliminada, y toda descarga de documento deja un evento en el
 * historial de la orden (actor, documento, acción) ANTES de entregar el archivo.
 * Sin BD (prisma simulado): el aislamiento por tenant se comprueba en el
 * `where` de cada consulta.
 */
const m = vi.hoisted(() => ({
  loteFindFirst: vi.fn(),
  contenedorFindFirst: vi.fn(),
  vistoFindFirst: vi.fn(),
  expedienteFindUnique: vi.fn(),
  ordenDocFindFirst: vi.fn(),
  loteDocFindFirst: vi.fn(),
  historialCreate: vi.fn(),
  transaccion: vi.fn(),
  escrituras: vi.fn(),
}));

vi.mock("../../config/prisma", () => {
  const escribe = () => m.escrituras;
  return {
    prisma: {
      loteImportacion: { findFirst: m.loteFindFirst, update: escribe(), findUnique: escribe() },
      contenedorLote: { findFirst: m.contenedorFindFirst, create: escribe(), delete: escribe() },
      vistoBuenoAduanero: {
        findFirst: m.vistoFindFirst,
        create: escribe(),
        update: escribe(),
      },
      expedienteAduanero: {
        findUnique: m.expedienteFindUnique,
        upsert: escribe(),
        update: escribe(),
      },
      ordenCompraIntlDocumento: { findFirst: m.ordenDocFindFirst },
      loteImportacionDocumento: { findFirst: m.loteDocFindFirst },
      importacionHistorial: { create: m.historialCreate },
      $transaction: async (arg: unknown) => {
        m.transaccion();
        return Promise.all(arg as unknown[]);
      },
    },
  };
});
vi.mock("../../middleware/upload.middleware", () => ({
  UPLOADS_DIR_EXPEDIENTES: "/uploads/expedientes",
  UPLOADS_DIR_VISTOS_BUENOS: "/uploads/vistos",
  UPLOADS_DIR_ORDENES_COMPRA_INTL: "/uploads/ordenes",
  UPLOADS_DIR_LOTES_IMPORTACION: "/uploads/lotes",
  moverArchivoDefinitivo: vi.fn(() => "definitivo.pdf"),
}));
vi.mock("../../lib/tenant-prisma", () => ({ getTenantPrisma: vi.fn() }));
vi.mock("../../lib/motor-destinatarios", () => ({ resolverDestinatarios: vi.fn(async () => []) }));
vi.mock("../../lib/notificaciones", () => ({ crearNotificacion: vi.fn() }));
vi.mock("../../lib/inbox", () => ({ crearItemDeTrabajo: vi.fn() }));
vi.mock("../../integrations/trm/trm.service", () => ({ obtenerTrmOficial: vi.fn() }));
vi.mock("../integraciones-siesa/siesa-inventario.service", () => ({ buscarItemsSiesa: vi.fn() }));
vi.mock("../catalogos/catalogos.controller", () => ({
  obtenerClavesActivasCatalogo: vi.fn(async () => new Set<string>()),
}));
vi.mock("./embarques-tracking.job", () => ({
  sincronizarUnLote: m.escrituras,
  TrackingSimuladoNoPermitidoError: class extends Error {},
}));

const c = await import("./importaciones.controller");

function respuesta() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    archivoEnviado: undefined as string | undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
    send() {
      return res;
    },
    setHeader(k: string, v: string) {
      res.headers[k] = v;
    },
    sendFile(p: string) {
      res.archivoEnviado = p;
      return res;
    },
  };
  return res;
}
const peticion = (
  params: Record<string, string>,
  body: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) => ({ user: { tenantId: "ten-1", id: "u1", nombre: "Ana" }, params, body, ...extra }) as never;

const ORDEN_ANULADA = { eliminado: false, estado: "Anulada" };
const ORDEN_ELIMINADA = { eliminado: true, estado: "Confirmada" };
const ORDEN_OK = { eliminado: false, estado: "Confirmada" };
const LOTE_BASE = { id: "lote-1", tenantId: "ten-1", ordenCompraId: "ord-1", blAwb: "BL-1" };

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  m.historialCreate.mockResolvedValue({});
});

describe("órdenes anuladas/eliminadas: ninguna ruta mutante del lote escribe", () => {
  const ARCHIVO = {
    path: "/tmp/x.pdf",
    originalname: "x.pdf",
    mimetype: "application/pdf",
    size: 10,
  };

  const casos: Array<[string, () => Promise<ReturnType<typeof respuesta>>]> = [
    [
      "actualizarEstadoLote",
      async () => {
        const res = respuesta();
        await c.actualizarEstadoLote(
          peticion({ id: "lote-1" }, { estado: "En puerto" }),
          res as never,
        );
        return res;
      },
    ],
    [
      "actualizarEmbarqueLote",
      async () => {
        const res = respuesta();
        await c.actualizarEmbarqueLote(peticion({ id: "lote-1" }, { blAwb: "X" }), res as never);
        return res;
      },
    ],
    [
      "crearContenedorLote",
      async () => {
        const res = respuesta();
        await c.crearContenedorLote(
          peticion({ id: "lote-1" }, { numero: "ABCD1234567" }),
          res as never,
        );
        return res;
      },
    ],
    [
      "sincronizarTrackingLote",
      async () => {
        const res = respuesta();
        await c.sincronizarTrackingLote(peticion({ id: "lote-1" }), res as never);
        return res;
      },
    ],
    [
      "actualizarExpedienteAduanero",
      async () => {
        const res = respuesta();
        await c.actualizarExpedienteAduanero(
          peticion({ id: "lote-1" }, { numeroDIM: "1" }),
          res as never,
        );
        return res;
      },
    ],
    [
      "subirDocumentoExpedienteAduanero",
      async () => {
        const res = respuesta();
        await c.subirDocumentoExpedienteAduanero(
          peticion({ id: "lote-1", tipo: "dim" }, {}, { file: ARCHIVO }),
          res as never,
        );
        return res;
      },
    ],
    [
      "eliminarDocumentoExpedienteAduanero",
      async () => {
        const res = respuesta();
        await c.eliminarDocumentoExpedienteAduanero(
          peticion({ id: "lote-1", tipo: "dim" }),
          res as never,
        );
        return res;
      },
    ],
    [
      "crearVistoBueno",
      async () => {
        const res = respuesta();
        await c.crearVistoBueno(peticion({ id: "lote-1" }, { entidad: "ICA" }), res as never);
        return res;
      },
    ],
    [
      "eliminarContenedorLote",
      async () => {
        const res = respuesta();
        await c.eliminarContenedorLote(
          peticion({ id: "lote-1", contenedorId: "c1" }),
          res as never,
        );
        return res;
      },
    ],
    [
      "actualizarVistoBueno",
      async () => {
        const res = respuesta();
        await c.actualizarVistoBueno(
          peticion({ id: "vb-1" }, { estado: "Aprobado" }),
          res as never,
        );
        return res;
      },
    ],
    [
      "subirDocumentoVistoBueno",
      async () => {
        const res = respuesta();
        await c.subirDocumentoVistoBueno(
          peticion({ id: "vb-1" }, {}, { file: ARCHIVO }),
          res as never,
        );
        return res;
      },
    ],
  ];

  function simular(orden: { eliminado: boolean; estado: string }) {
    m.loteFindFirst.mockResolvedValue({ ...LOTE_BASE, ordenCompra: orden });
    m.contenedorFindFirst.mockResolvedValue({
      id: "c1",
      lote: { ...LOTE_BASE, ordenCompra: orden },
    });
    m.vistoFindFirst.mockResolvedValue({
      id: "vb-1",
      entidad: "ICA",
      estado: "Pendiente",
      archivoRuta: null,
      expediente: { tenantId: "ten-1", lote: { ...LOTE_BASE, ordenCompra: orden } },
    });
  }

  it.each(casos)("%s: orden anulada → 400 sin escribir ni historial", async (_n, ejecutar) => {
    vi.spyOn(fs, "unlink").mockImplementation(((_p: unknown, cb?: () => void) => cb?.()) as never);
    simular(ORDEN_ANULADA);
    const res = await ejecutar();
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/anulada/);
    expect(m.escrituras).not.toHaveBeenCalled();
    expect(m.historialCreate).not.toHaveBeenCalled();
    expect(m.transaccion).not.toHaveBeenCalled();
  });

  it.each(casos)("%s: orden eliminada (soft delete) → 400 sin escribir", async (_n, ejecutar) => {
    vi.spyOn(fs, "unlink").mockImplementation(((_p: unknown, cb?: () => void) => cb?.()) as never);
    simular(ORDEN_ELIMINADA);
    const res = await ejecutar();
    expect(res.statusCode).toBe(400);
    expect(m.escrituras).not.toHaveBeenCalled();
    expect(m.historialCreate).not.toHaveBeenCalled();
  });

  it("subir documentos a una orden anulada descarta el archivo temporal", async () => {
    const unlink = vi
      .spyOn(fs, "unlink")
      .mockImplementation(((_p: unknown, cb?: () => void) => cb?.()) as never);
    simular(ORDEN_ANULADA);
    await casos.find(([n]) => n === "subirDocumentoExpedienteAduanero")![1]();
    await casos.find(([n]) => n === "subirDocumentoVistoBueno")![1]();
    expect(unlink).toHaveBeenCalledTimes(2);
    expect(unlink.mock.calls.every(([p]) => p === "/tmp/x.pdf")).toBe(true);
  });

  it("con la orden operativa la guarda no bloquea (llega a escribir)", async () => {
    simular(ORDEN_OK);
    m.escrituras.mockResolvedValue({ id: "lote-1", contenedores: [] });
    const res = respuesta();
    await c.actualizarEmbarqueLote(peticion({ id: "lote-1" }, { blAwb: "NUEVO" }), res as never);
    expect(res.statusCode).not.toBe(400);
    expect(m.escrituras).toHaveBeenCalled();
  });

  it("lote de otro tenant → 404 (la consulta lleva el tenant de la sesión)", async () => {
    m.loteFindFirst.mockResolvedValue(null);
    const res = respuesta();
    await c.crearVistoBueno(peticion({ id: "lote-ajeno" }, { entidad: "ICA" }), res as never);
    expect(res.statusCode).toBe(404);
    expect(m.loteFindFirst.mock.calls[0][0].where).toEqual({ id: "lote-ajeno", tenantId: "ten-1" });
  });
});

describe("descargas de documentos: auditoría en el historial", () => {
  beforeEach(() => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
  });

  const descargas: Array<[string, () => Promise<ReturnType<typeof respuesta>>, string]> = [
    [
      "documento del lote",
      async () => {
        m.loteDocFindFirst.mockResolvedValue({
          id: "doc-1",
          tipo: "COA",
          ruta: "lote-1/archivo.pdf",
          mime: "application/pdf",
          nombreOriginal: "coa.pdf",
          lote: { ordenCompraId: "ord-1" },
        });
        const res = respuesta();
        await c.obtenerDocumentoLote(
          peticion({ id: "lote-1", documentoId: "doc-1" }),
          res as never,
        );
        return res;
      },
      "doc-1",
    ],
    [
      "documento inicial de la orden",
      async () => {
        m.ordenDocFindFirst.mockResolvedValue({
          id: "doc-2",
          tipo: "Proforma Invoice",
          ordenCompraId: "ord-1",
          ruta: "ord-1/p.pdf",
          mime: "application/pdf",
          nombreOriginal: "p.pdf",
        });
        const res = respuesta();
        await c.obtenerDocumentoOrdenCompraIntl(
          peticion({ id: "ord-1", documentoId: "doc-2" }),
          res as never,
        );
        return res;
      },
      "doc-2",
    ],
    [
      "documento del expediente",
      async () => {
        m.loteFindFirst.mockResolvedValue({ ...LOTE_BASE, ordenCompra: ORDEN_OK });
        m.expedienteFindUnique.mockResolvedValue({
          id: "exp-1",
          dimRuta: "lote-1/dim.pdf",
          dimNombre: "dim.pdf",
          dimMime: "application/pdf",
        });
        const res = respuesta();
        await c.obtenerDocumentoExpedienteAduanero(
          peticion({ id: "lote-1", tipo: "dim" }),
          res as never,
        );
        return res;
      },
      "exp-1",
    ],
    [
      "documento de visto bueno",
      async () => {
        m.vistoFindFirst.mockResolvedValue({
          id: "vb-1",
          entidad: "ICA",
          archivoRuta: "vb-1/v.pdf",
          archivoMime: "application/pdf",
          archivoNombre: "v.pdf",
          expediente: { lote: { ordenCompraId: "ord-1" } },
        });
        const res = respuesta();
        await c.obtenerDocumentoVistoBueno(peticion({ id: "vb-1" }), res as never);
        return res;
      },
      "vb-1",
    ],
  ];

  it.each(descargas)(
    "%s: registra actor, acción y documento, sin ruta ni contenido",
    async (_n, ejecutar, docId) => {
      const res = await ejecutar();
      expect(res.statusCode).toBe(200);
      expect(res.archivoEnviado).toBeDefined();
      expect(m.historialCreate).toHaveBeenCalledTimes(1);
      const data = m.historialCreate.mock.calls[0][0].data;
      expect(data).toMatchObject({
        ordenCompraId: "ord-1",
        actor: "Ana",
        accion: "Documento descargado",
      });
      expect(data.detalle).toContain(docId);
      expect(JSON.stringify(data)).not.toMatch(/\.pdf|uploads|archivoRuta/);
    },
  );

  it.each(descargas)(
    "%s: si el registro falla NO se entrega el archivo (falla cerrada)",
    async (_n, ejecutar) => {
      m.historialCreate.mockRejectedValue(new Error("BD caída"));
      const res = await ejecutar();
      expect(res.statusCode).toBe(500);
      expect(res.archivoEnviado).toBeUndefined();
    },
  );

  it("una descarga denegada (documento de otro tenant → 404) no deja evento", async () => {
    m.loteDocFindFirst.mockResolvedValue(null);
    const res = respuesta();
    await c.obtenerDocumentoLote(peticion({ id: "lote-1", documentoId: "x" }), res as never);
    expect(res.statusCode).toBe(404);
    expect(m.historialCreate).not.toHaveBeenCalled();
  });

  it("un archivo ausente en disco (404) no deja evento de descarga", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    m.loteDocFindFirst.mockResolvedValue({
      id: "doc-1",
      tipo: "COA",
      ruta: "r.pdf",
      lote: { ordenCompraId: "ord-1" },
    });
    const res = respuesta();
    await c.obtenerDocumentoLote(peticion({ id: "lote-1", documentoId: "doc-1" }), res as never);
    expect(res.statusCode).toBe(404);
    expect(m.historialCreate).not.toHaveBeenCalled();
  });
});
