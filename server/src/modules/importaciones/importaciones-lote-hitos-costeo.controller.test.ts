import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import { Prisma } from "@prisma/client";

/**
 * Hitos reales del lote, documentos del lote, recepción y liquidación con
 * prorrateo — sin BD (prisma simulado). Cubre: aislamiento por tenant de la
 * sesión, atomicidad (todo en UNA transacción), concurrencia (cambio de estado
 * condicional → 409), validación de montos y de datos de peso/volumen, y que no
 * se deje un archivo huérfano o se borre uno cuya fila sigue existiendo.
 * Las pruebas con BD real viven en los *.integration.test.ts.
 */
const m = vi.hoisted(() => ({
  loteFindFirst: vi.fn(),
  loteFindUnique: vi.fn(),
  loteUpdateMany: vi.fn(),
  hitoUpsert: vi.fn(),
  hitoFindMany: vi.fn(),
  hitoFindFirst: vi.fn(),
  hitoDeleteMany: vi.fn(),
  costeoCreateMany: vi.fn(),
  historialCreate: vi.fn(),
  docCreate: vi.fn(),
  docFindFirst: vi.fn(),
  docDeleteMany: vi.fn(),
  ordenFindUnique: vi.fn(),
  transaccion: vi.fn(),
  mover: vi.fn(),
}));

vi.mock("../../config/prisma", () => {
  const tx = {
    loteImportacion: { updateMany: m.loteUpdateMany },
    loteImportacionHito: {
      upsert: m.hitoUpsert,
      deleteMany: m.hitoDeleteMany,
    },
    loteImportacionDocumento: { deleteMany: m.docDeleteMany },
    costeoImportacionDetalle: { createMany: m.costeoCreateMany },
    importacionHistorial: { create: m.historialCreate },
  };
  return {
    prisma: {
      loteImportacion: {
        findFirst: m.loteFindFirst,
        findUnique: m.loteFindUnique,
      },
      loteImportacionHito: { findMany: m.hitoFindMany, findFirst: m.hitoFindFirst },
      loteImportacionDocumento: { create: m.docCreate, findFirst: m.docFindFirst },
      importacionHistorial: { create: m.historialCreate },
      ordenCompraIntl: { findUnique: m.ordenFindUnique },
      $transaction: async (arg: unknown) => {
        m.transaccion();
        return typeof arg === "function"
          ? (arg as (t: typeof tx) => unknown)(tx)
          : Promise.all(arg as unknown[]);
      },
    },
  };
});
vi.mock("../../middleware/upload.middleware", () => ({
  UPLOADS_DIR_EXPEDIENTES: "/uploads/expedientes",
  UPLOADS_DIR_VISTOS_BUENOS: "/uploads/vistos",
  UPLOADS_DIR_ORDENES_COMPRA_INTL: "/uploads/ordenes",
  UPLOADS_DIR_LOTES_IMPORTACION: "/uploads/lotes",
  moverArchivoDefinitivo: m.mover,
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

const {
  recibirPreCompraPlanta,
  liquidarCosteoImportacion,
  registrarHitoLote,
  eliminarHitoLote,
  subirDocumentoLote,
  obtenerDocumentoLote,
  eliminarDocumentoLote,
} = await import("./importaciones.controller");

function respuesta() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    archivoEnviado: undefined as string | undefined,
    status(c: number) {
      res.statusCode = c;
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
function peticion(
  params: Record<string, string>,
  body: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  return {
    user: { tenantId: "ten-1", id: "u1", nombre: "Ana" },
    params,
    body,
    ...extra,
  } as never;
}

const mensaje = (res: { body: unknown }) => (res.body as { message: string }).message;

const ITEM_A = {
  id: "item-a",
  descripcion: "Resina A",
  cantidad: 100,
  valorUnitarioFob: 7.5, // FOB USD 750
  pesoKg: 100,
  volumenM3: 2,
};
const ITEM_B = {
  id: "item-b",
  descripcion: "Resina B",
  cantidad: 100,
  valorUnitarioFob: 2.5, // FOB USD 250
  pesoKg: 300,
  volumenM3: 6,
};

const ORDEN = {
  eliminado: false,
  estado: "Confirmada",
  trmPactada: 4000,
  numeroOrden: "IMP-2026-001",
  responsableId: null,
  items: [ITEM_A, ITEM_B],
};
const LOTE = {
  id: "lote-1",
  tenantId: "ten-1",
  ordenCompraId: "ord-1",
  blAwb: "BL-1",
  estado: "En puerto",
  fechaLlegadaReal: null,
  ordenCompra: ORDEN,
  expediente: { estado: "Levantado", vistosBuenos: [] },
};

const MONTOS = {
  trmLiquidacion: 4200,
  valorCifTotalUsd: 1000,
  arancelTotalCop: 100000,
  ivaTotalCop: 190000,
  fletesNacionalesCop: 1000,
  agenciamientoCop: 400,
  otrosCostosCop: 0,
};

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  m.ordenFindUnique.mockResolvedValue({ numeroOrden: "IMP-2026-001", responsableId: null });
  m.loteUpdateMany.mockResolvedValue({ count: 1 });
  m.costeoCreateMany.mockResolvedValue({ count: 2 });
  m.historialCreate.mockResolvedValue({});
  m.hitoUpsert.mockResolvedValue({});
  m.hitoFindMany.mockResolvedValue([]);
  m.loteFindUnique.mockResolvedValue({ ...LOTE, costeos: [], hitos: [] });
});

describe("liquidarCosteoImportacion — método de prorrateo de gastos", () => {
  it("por defecto prorratea por FOB (comportamiento histórico) y guarda el método en cada fila", async () => {
    m.loteFindFirst.mockResolvedValue(LOTE);
    const res = respuesta();
    await liquidarCosteoImportacion(peticion({ id: "lote-1" }, MONTOS), res as never);

    expect(res.statusCode).toBe(200);
    const filas = m.costeoCreateMany.mock.calls[0][0].data as Array<
      Record<string, number | string>
    >;
    const a = filas.find((f) => f.itemId === "item-a")!;
    const b = filas.find((f) => f.itemId === "item-b")!;
    expect(a.metodoProrrateoGastos).toBe("FOB");
    expect(a.fletesNacionalesCop).toBeCloseTo(750, 6); // 1000 × 75 %
    expect(b.fletesNacionalesCop).toBeCloseTo(250, 6);
    expect(a.agenciamientoCop).toBeCloseTo(300, 6);
    expect(a.arancelCop).toBeCloseTo(75000, 6);
    expect(a.ivaTotalCop).toBeCloseTo(142500, 6);
    expect(a.esProvisional).toBe(false);
  });

  it.each(["PESO", "VOLUMEN"])(
    "%s no está aprobado por el negocio (decisión contable pendiente): 400, sin transacción ni escritura",
    async (metodo) => {
      m.loteFindFirst.mockResolvedValue(LOTE);
      const res = respuesta();
      await liquidarCosteoImportacion(
        peticion({ id: "lote-1" }, { ...MONTOS, metodoProrrateoGastos: metodo }),
        res as never,
      );

      expect(res.statusCode).toBe(400);
      expect(mensaje(res)).toContain("no está aprobado");
      expect(m.transaccion).not.toHaveBeenCalled();
      expect(m.loteUpdateMany).not.toHaveBeenCalled();
      expect(m.costeoCreateMany).not.toHaveBeenCalled();
    },
  );

  it("FOB explícito reparte igual que el comportamiento histórico y guarda el método", async () => {
    m.loteFindFirst.mockResolvedValue(LOTE);
    const res = respuesta();
    await liquidarCosteoImportacion(
      peticion({ id: "lote-1" }, { ...MONTOS, metodoProrrateoGastos: "FOB" }),
      res as never,
    );
    expect(res.statusCode).toBe(200);
    const filas = m.costeoCreateMany.mock.calls[0][0].data as Array<
      Record<string, number | string>
    >;
    const a = filas.find((f) => f.itemId === "item-a")!;
    expect(a.metodoProrrateoGastos).toBe("FOB");
    expect(a.fletesNacionalesCop).toBeCloseTo(750, 6); // 75 % por FOB
  });

  it("un método desconocido se rechaza (400)", async () => {
    m.loteFindFirst.mockResolvedValue(LOTE);
    const res = respuesta();
    await liquidarCosteoImportacion(
      peticion({ id: "lote-1" }, { ...MONTOS, metodoProrrateoGastos: "VALOR" }),
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect(m.transaccion).not.toHaveBeenCalled();
  });
});

describe("liquidarCosteoImportacion — validación, concurrencia y aislamiento", () => {
  it("montos no numéricos o negativos devuelven 400 (antes: NaN y 500)", async () => {
    m.loteFindFirst.mockResolvedValue(LOTE);
    for (const malo of [
      { arancelTotalCop: "abc" },
      { fletesNacionalesCop: -5 },
      { trmLiquidacion: 0 },
      { ivaDescontableCop: 999999999 },
    ]) {
      const res = respuesta();
      await liquidarCosteoImportacion(
        peticion({ id: "lote-1" }, { ...MONTOS, ...malo }),
        res as never,
      );
      expect(res.statusCode).toBe(400);
    }
    expect(m.transaccion).not.toHaveBeenCalled();
    expect(m.costeoCreateMany).not.toHaveBeenCalled();
  });

  it("liquidación simultánea: si otro proceso ya cambió el estado, responde 409 y NO duplica el costeo", async () => {
    m.loteFindFirst.mockResolvedValue(LOTE);
    m.loteUpdateMany.mockResolvedValue({ count: 0 });
    const res = respuesta();
    await liquidarCosteoImportacion(peticion({ id: "lote-1" }, MONTOS), res as never);

    expect(res.statusCode).toBe(409);
    expect(m.costeoCreateMany).not.toHaveBeenCalled();
    expect(m.historialCreate).not.toHaveBeenCalled();
  });

  it("el cambio de estado, el costeo y el historial ocurren en UNA transacción, con guarda de estado y tenant", async () => {
    m.loteFindFirst.mockResolvedValue(LOTE);
    const res = respuesta();
    await liquidarCosteoImportacion(peticion({ id: "lote-1" }, MONTOS), res as never);

    expect(m.transaccion).toHaveBeenCalledTimes(1);
    const where = m.loteUpdateMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("ten-1");
    expect(where.estado.in).toEqual(["En puerto", "En inspección", "Liberado pre-compra"]);
    expect(m.historialCreate.mock.calls[0][0].data.detalle).toContain("FOB");
  });

  it("busca el lote por id Y tenant de la sesión; un lote de otro tenant responde 404", async () => {
    m.loteFindFirst.mockResolvedValue(null);
    const res = respuesta();
    await liquidarCosteoImportacion(peticion({ id: "lote-ajeno" }, MONTOS), res as never);

    expect(res.statusCode).toBe(404);
    expect(m.loteFindFirst.mock.calls[0][0].where).toEqual({ id: "lote-ajeno", tenantId: "ten-1" });
    expect(m.transaccion).not.toHaveBeenCalled();
  });

  it("una orden anulada no admite liquidación (400)", async () => {
    m.loteFindFirst.mockResolvedValue({ ...LOTE, ordenCompra: { ...ORDEN, estado: "Anulada" } });
    const res = respuesta();
    await liquidarCosteoImportacion(peticion({ id: "lote-1" }, MONTOS), res as never);
    expect(res.statusCode).toBe(400);
    expect(m.costeoCreateMany).not.toHaveBeenCalled();
  });
});

describe("recibirPreCompraPlanta", () => {
  const LOTE_EN_TRANSITO = { ...LOTE, estado: "En tránsito" };

  it("crea costeo provisional, sella el hito RECEPCION_PLANTA (origen Sistema) y el historial en UNA transacción", async () => {
    m.loteFindFirst.mockResolvedValue(LOTE_EN_TRANSITO);
    const res = respuesta();
    await recibirPreCompraPlanta(peticion({ id: "lote-1" }), res as never);

    expect(res.statusCode).toBe(200);
    expect(m.transaccion).toHaveBeenCalledTimes(1);
    const upsert = m.hitoUpsert.mock.calls[0][0];
    expect(upsert.create).toMatchObject({
      tenantId: "ten-1",
      loteId: "lote-1",
      tipo: "RECEPCION_PLANTA",
      origen: "Sistema",
    });
    const filas = m.costeoCreateMany.mock.calls[0][0].data as Array<{ esProvisional: boolean }>;
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.esProvisional)).toBe(true);
    expect(m.historialCreate.mock.calls[0][0].data.etapa).toBe("Recepción");
  });

  it("recepción simultánea: el segundo proceso recibe 409 y no duplica costeo ni hito", async () => {
    m.loteFindFirst.mockResolvedValue(LOTE_EN_TRANSITO);
    m.loteUpdateMany.mockResolvedValue({ count: 0 });
    const res = respuesta();
    await recibirPreCompraPlanta(peticion({ id: "lote-1" }), res as never);

    expect(res.statusCode).toBe(409);
    expect(m.costeoCreateMany).not.toHaveBeenCalled();
    expect(m.hitoUpsert).not.toHaveBeenCalled();
  });

  it("no recibe un lote ya recibido/nacionalizado ni uno de una orden anulada; busca por tenant de la sesión", async () => {
    m.loteFindFirst.mockResolvedValue({ ...LOTE, estado: "Liberado pre-compra" });
    let res = respuesta();
    await recibirPreCompraPlanta(peticion({ id: "lote-1" }), res as never);
    expect(res.statusCode).toBe(400);

    m.loteFindFirst.mockResolvedValue({
      ...LOTE_EN_TRANSITO,
      ordenCompra: { ...ORDEN, eliminado: true },
    });
    res = respuesta();
    await recibirPreCompraPlanta(peticion({ id: "lote-1" }), res as never);
    expect(res.statusCode).toBe(400);

    expect(m.loteFindFirst.mock.calls[0][0].where.tenantId).toBe("ten-1");
    expect(m.costeoCreateMany).not.toHaveBeenCalled();
  });
});

describe("registrarHitoLote / eliminarHitoLote", () => {
  const LOTE_HITOS = {
    id: "lote-1",
    ordenCompraId: "ord-1",
    blAwb: "BL-1",
    fechaLlegadaReal: null,
    ordenCompra: { eliminado: false, estado: "Confirmada" },
    hitos: [] as Array<{ tipo: string; fecha: Date }>,
    expediente: null,
  };
  const dia = (s: string) => `${s}T00:00:00.000Z`;

  it("registra un hito manual: upsert + historial en UNA transacción, origen Manual, tenant de la sesión", async () => {
    m.loteFindFirst.mockResolvedValue(LOTE_HITOS);
    const res = respuesta();
    await registrarHitoLote(
      peticion(
        { id: "lote-1", tipo: "LLEGADA_PUERTO" },
        { fecha: dia("2026-10-10"), nota: " Cartagena " },
      ),
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(m.transaccion).toHaveBeenCalledTimes(1);
    expect(m.loteFindFirst.mock.calls[0][0].where).toEqual({ id: "lote-1", tenantId: "ten-1" });
    const upsert = m.hitoUpsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ loteId_tipo: { loteId: "lote-1", tipo: "LLEGADA_PUERTO" } });
    expect(upsert.create).toMatchObject({
      tenantId: "ten-1",
      origen: "Manual",
      nota: "Cartagena",
      registradoPorId: "u1",
    });
    const h = m.historialCreate.mock.calls[0][0].data;
    expect(h.accion).toBe("Hito registrado: Llegada a puerto (real)");
    expect(h.etapa).toBe("Tránsito");
    expect(h.origen).toBe("Manual");
  });

  it("corregir un hito deja la fecha anterior en el historial", async () => {
    m.loteFindFirst.mockResolvedValue({
      ...LOTE_HITOS,
      hitos: [{ tipo: "LLEGADA_PUERTO", fecha: new Date(dia("2026-10-08")) }],
    });
    const res = respuesta();
    await registrarHitoLote(
      peticion({ id: "lote-1", tipo: "LLEGADA_PUERTO" }, { fecha: dia("2026-10-10") }),
      res as never,
    );
    const h = m.historialCreate.mock.calls[0][0].data;
    expect(h.accion).toBe("Hito corregido: Llegada a puerto (real)");
    expect(h.detalle).toContain("antes: 2026-10-08");
  });

  it("la recepción en planta no se puede forjar por el endpoint manual (400, sin escribir)", async () => {
    const res = respuesta();
    await registrarHitoLote(
      peticion({ id: "lote-1", tipo: "RECEPCION_PLANTA" }, { fecha: dia("2026-10-10") }),
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect(m.loteFindFirst).not.toHaveBeenCalled();
    expect(m.hitoUpsert).not.toHaveBeenCalled();
  });

  it("rechaza fecha inválida, futura, anterior al embarque y posterior a la recepción en planta", async () => {
    const intentar = async (
      lote: Record<string, unknown>,
      tipo: string,
      fecha: string,
    ): Promise<number> => {
      m.loteFindFirst.mockResolvedValue(lote);
      const res = respuesta();
      await registrarHitoLote(peticion({ id: "lote-1", tipo }, { fecha }), res as never);
      return res.statusCode;
    };

    expect(await intentar(LOTE_HITOS, "LLEGADA_PUERTO", "no-es-fecha")).toBe(400);
    expect(await intentar(LOTE_HITOS, "LLEGADA_PUERTO", "2099-01-01T00:00:00Z")).toBe(400);
    expect(
      await intentar(
        { ...LOTE_HITOS, hitos: [{ tipo: "EMBARQUE_REAL", fecha: new Date(dia("2026-09-10")) }] },
        "LLEGADA_PUERTO",
        dia("2026-09-01"),
      ),
    ).toBe(400);
    // Lote recibido antes de existir la tabla de hitos: la recepción vive en fechaLlegadaReal.
    expect(
      await intentar(
        { ...LOTE_HITOS, fechaLlegadaReal: new Date(dia("2026-10-01")) },
        "LLEGADA_PUERTO",
        dia("2026-10-05"),
      ),
    ).toBe(400);
    expect(m.hitoUpsert).not.toHaveBeenCalled();
  });

  it("lote de otro tenant → 404; orden anulada → 400", async () => {
    m.loteFindFirst.mockResolvedValue(null);
    let res = respuesta();
    await registrarHitoLote(
      peticion({ id: "lote-ajeno", tipo: "EMBARQUE_REAL" }, { fecha: dia("2026-10-01") }),
      res as never,
    );
    expect(res.statusCode).toBe(404);

    m.loteFindFirst.mockResolvedValue({
      ...LOTE_HITOS,
      ordenCompra: { eliminado: true, estado: "Anulada" },
    });
    res = respuesta();
    await registrarHitoLote(
      peticion({ id: "lote-1", tipo: "EMBARQUE_REAL" }, { fecha: dia("2026-10-01") }),
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect(m.hitoUpsert).not.toHaveBeenCalled();
  });

  it("dos registros simultáneos del mismo hito: el que pierde la carrera (P2002) recibe 409", async () => {
    m.loteFindFirst.mockResolvedValue(LOTE_HITOS);
    m.hitoUpsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );
    const res = respuesta();
    await registrarHitoLote(
      peticion({ id: "lote-1", tipo: "EMBARQUE_REAL" }, { fecha: dia("2026-10-01") }),
      res as never,
    );
    expect(res.statusCode).toBe(409);
  });

  it("eliminar: solo hitos manuales, por tenant, con historial en la misma transacción", async () => {
    let res = respuesta();
    await eliminarHitoLote(peticion({ id: "lote-1", tipo: "RECEPCION_PLANTA" }), res as never);
    expect(res.statusCode).toBe(400);

    m.loteFindFirst.mockResolvedValue({ ...LOTE_HITOS });
    m.hitoFindFirst.mockResolvedValue({ id: "h1", fecha: new Date(dia("2026-10-10")) });
    m.hitoDeleteMany.mockResolvedValue({ count: 1 });
    res = respuesta();
    await eliminarHitoLote(peticion({ id: "lote-1", tipo: "LLEGADA_PUERTO" }), res as never);
    expect(res.statusCode).toBe(204);
    expect(m.hitoFindFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: "ten-1",
      tipo: "LLEGADA_PUERTO",
    });
    expect(m.hitoDeleteMany.mock.calls[0][0].where).toEqual({ id: "h1", tenantId: "ten-1" });
    expect(m.historialCreate.mock.calls[0][0].data.accion).toBe(
      "Hito eliminado: Llegada a puerto (real)",
    );

    // Ya no existe (otro proceso lo eliminó antes): 404, sin historial duplicado.
    m.historialCreate.mockClear();
    m.hitoDeleteMany.mockResolvedValue({ count: 0 });
    res = respuesta();
    await eliminarHitoLote(peticion({ id: "lote-1", tipo: "LLEGADA_PUERTO" }), res as never);
    expect(res.statusCode).toBe(404);
    expect(m.historialCreate).not.toHaveBeenCalled();
  });
});

describe("documentos del lote", () => {
  const archivo = {
    path: "/tmp/subida-1.pdf",
    originalname: "coa.pdf",
    mimetype: "application/pdf",
    size: 1234,
  };
  const LOTE_DOC = {
    id: "lote-1",
    ordenCompraId: "ord-1",
    blAwb: "BL-1",
    ordenCompra: { eliminado: false, estado: "Confirmada" },
  };

  it("sube un COA: mueve el archivo tras validar tenant/lote y crea fila + historial en UNA transacción", async () => {
    vi.spyOn(fs, "unlink").mockImplementation(((_p: unknown, cb?: () => void) => cb?.()) as never);
    m.loteFindFirst.mockResolvedValue(LOTE_DOC);
    m.mover.mockReturnValue("lote-1/archivo-definitivo.pdf");
    m.docCreate.mockResolvedValue({
      id: "doc-1",
      tipo: "Certificado de análisis (COA)",
      nombreOriginal: "coa.pdf",
      mime: "application/pdf",
      tamano: 1234,
      subidoPorNombre: "Ana",
      createdAt: new Date(),
    });
    const res = respuesta();
    await subirDocumentoLote(
      peticion({ id: "lote-1", tipo: "certificado-analisis" }, {}, { file: archivo }),
      res as never,
    );

    expect(res.statusCode).toBe(201);
    expect(m.loteFindFirst.mock.calls[0][0].where).toEqual({ id: "lote-1", tenantId: "ten-1" });
    expect(m.mover).toHaveBeenCalledWith("/uploads/lotes", archivo, "lote-1");
    expect(m.docCreate.mock.calls[0][0].data).toMatchObject({
      tenantId: "ten-1",
      loteId: "lote-1",
      tipo: "Certificado de análisis (COA)",
      ruta: "lote-1/archivo-definitivo.pdf",
    });
    expect(m.historialCreate.mock.calls[0][0].data.accion).toBe(
      "Documento de lote adjuntado (Certificado de análisis (COA))",
    );
    expect(m.transaccion).toHaveBeenCalledTimes(1);
  });

  it("tipo inválido o lote de otro tenant: 400/404 y se descarta el archivo temporal sin moverlo", async () => {
    const unlink = vi
      .spyOn(fs, "unlink")
      .mockImplementation(((_p: unknown, cb?: () => void) => cb?.()) as never);

    let res = respuesta();
    await subirDocumentoLote(
      peticion({ id: "lote-1", tipo: "factura-falsa" }, {}, { file: archivo }),
      res as never,
    );
    expect(res.statusCode).toBe(400);

    m.loteFindFirst.mockResolvedValue(null);
    res = respuesta();
    await subirDocumentoLote(
      peticion({ id: "lote-ajeno", tipo: "bl-awb" }, {}, { file: archivo }),
      res as never,
    );
    expect(res.statusCode).toBe(404);

    expect(unlink).toHaveBeenCalledTimes(2);
    expect(m.mover).not.toHaveBeenCalled();
    expect(m.docCreate).not.toHaveBeenCalled();
  });

  it("si la transacción falla, no deja el archivo movido huérfano", async () => {
    const unlink = vi
      .spyOn(fs, "unlink")
      .mockImplementation(((_p: unknown, cb?: () => void) => cb?.()) as never);
    m.loteFindFirst.mockResolvedValue(LOTE_DOC);
    m.mover.mockReturnValue("lote-1/archivo-definitivo.pdf");
    m.docCreate.mockResolvedValue({ id: "doc-1" });
    m.historialCreate.mockRejectedValue(new Error("falla de BD"));
    const res = respuesta();
    await subirDocumentoLote(
      peticion({ id: "lote-1", tipo: "bl-awb" }, {}, { file: archivo }),
      res as never,
    );

    expect(res.statusCode).toBe(500);
    expect(String(unlink.mock.calls[0][0])).toContain("archivo-definitivo.pdf");
  });

  it("descarga: la consulta lleva tenant de la sesión + lote de la URL; documento de otro tenant → 404", async () => {
    m.docFindFirst.mockResolvedValue(null);
    const res = respuesta();
    await obtenerDocumentoLote(peticion({ id: "lote-1", documentoId: "doc-ajeno" }), res as never);

    expect(res.statusCode).toBe(404);
    expect(m.docFindFirst.mock.calls[0][0].where).toEqual({
      id: "doc-ajeno",
      tenantId: "ten-1",
      loteId: "lote-1",
    });
    expect(res.archivoEnviado).toBeUndefined();
  });

  it("eliminar: el archivo se borra DESPUÉS de la transacción; si la transacción falla, el archivo se conserva", async () => {
    const unlink = vi
      .spyOn(fs, "unlink")
      .mockImplementation(((_p: unknown, cb?: () => void) => cb?.()) as never);
    m.docFindFirst.mockResolvedValue({
      id: "doc-1",
      tipo: "B/L o AWB",
      nombreOriginal: "bl.pdf",
      ruta: "lote-1/bl.pdf",
      lote: { ordenCompraId: "ord-1", blAwb: "BL-1" },
    });
    m.docDeleteMany.mockResolvedValue({ count: 1 });
    let res = respuesta();
    await eliminarDocumentoLote(peticion({ id: "lote-1", documentoId: "doc-1" }), res as never);
    expect(res.statusCode).toBe(200);
    expect(m.docFindFirst.mock.calls[0][0].where).toEqual({
      id: "doc-1",
      tenantId: "ten-1",
      loteId: "lote-1",
    });
    expect(m.docDeleteMany.mock.calls[0][0].where).toEqual({ id: "doc-1", tenantId: "ten-1" });
    expect(unlink).toHaveBeenCalledTimes(1);

    unlink.mockClear();
    m.historialCreate.mockRejectedValue(new Error("falla de BD"));
    res = respuesta();
    await eliminarDocumentoLote(peticion({ id: "lote-1", documentoId: "doc-1" }), res as never);
    expect(res.statusCode).toBe(500);
    expect(unlink).not.toHaveBeenCalled();
  });
});
