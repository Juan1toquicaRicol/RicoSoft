import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  correoFindMany: vi.fn(),
  correoUpdate: vi.fn(),
  correoUpdateMany: vi.fn(),
  bloquearOrden: vi.fn(),
  extraccionDeleteMany: vi.fn(),
  extraccionCreateMany: vi.fn(),
  adjuntoUpdateMany: vi.fn(),
  adjuntoUpdate: vi.fn(),
  excepcionUpdateMany: vi.fn(),
  excepcionCreate: vi.fn(),
  excepcionCount: vi.fn(),
  proveedorFindFirst: vi.fn(),
  ordenFindFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
  identificarProveedor: vi.fn(),
  identificarOrden: vi.fn(),
  sugerirProveedores: vi.fn(),
  evaluarRequisitos: vi.fn(),
  requisitosFaltantes: vi.fn(),
  extraer: vi.fn(),
  buscarItemsSiesa: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    importacionCorreo: { findMany: m.correoFindMany, update: m.correoUpdate,
      updateMany: m.correoUpdateMany },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      $queryRaw: m.bloquearOrden,
      ordenCompraIntl: { count: async () => 1 },
      importacionCorreo: { update: m.correoUpdate, updateMany: m.correoUpdateMany },
      importacionExcepcion: { create: m.excepcionCreate, count: m.excepcionCount, updateMany: m.excepcionUpdateMany },
      importacionExtraccion: { deleteMany: m.extraccionDeleteMany },
      importacionCorreoAdjunto: { updateMany: m.adjuntoUpdateMany },
    }),
    importacionExtraccion: {
      deleteMany: m.extraccionDeleteMany,
      createMany: m.extraccionCreateMany,
    },
    importacionCorreoAdjunto: { updateMany: m.adjuntoUpdateMany, update: m.adjuntoUpdate },
    importacionExcepcion: {
      updateMany: m.excepcionUpdateMany,
      create: m.excepcionCreate,
      count: m.excepcionCount,
    },
    proveedor: { findFirst: m.proveedorFindFirst },
    ordenCompraIntl: { findFirst: m.ordenFindFirst },
    tenant: { findUnique: m.tenantFindUnique },
  },
}));
vi.mock("fs", () => {
  const fake = { readFileSync: vi.fn(() => Buffer.from("pdf")) };
  return { default: fake, ...fake };
});
vi.mock("../../lib/tenant-prisma", () => ({ getTenantPrisma: vi.fn() }));
vi.mock("../../lib/motor-destinatarios", () => ({ resolverDestinatarios: vi.fn(async () => []) }));
vi.mock("../../lib/notificaciones", () => ({ crearNotificacion: vi.fn() }));
vi.mock("../../lib/inbox", () => ({ crearItemDeTrabajo: vi.fn() }));
// Las consultas se reemplazan; la detección de conflictos (función pura) es la real.
vi.mock("./importaciones-bandeja-matching.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./importaciones-bandeja-matching.service")>()),
  identificarProveedor: m.identificarProveedor,
  identificarOrden: m.identificarOrden,
  sugerirProveedores: m.sugerirProveedores,
}));
vi.mock("../integraciones-siesa/siesa-inventario.service", () => ({
  buscarItemsSiesa: m.buscarItemsSiesa,
}));
vi.mock("./importaciones-bandeja-requisitos.service", () => ({
  evaluarRequisitosDeOrden: m.evaluarRequisitos,
  requisitosFaltantes: m.requisitosFaltantes,
}));

const { ejecutarCicloProcesamientoCorreos, _establecerExtractionProviderParaTests } =
  await import("./importaciones-bandeja-procesamiento.job");

const PROVEEDOR = { id: "prov-1", tenantId: "ten-1", nombre: "Boreal", nit: "900" };
const ORDEN = { id: "ord-1", numeroOrden: "OCI-1", estado: "Confirmada" };

function correo(extra: Record<string, unknown> = {}) {
  return {
    id: "c1",
    remitente: "Boreal <sales@boreal.test>",
    asunto: "IMPORTACION",
    tenantId: null,
    proveedorId: null,
    ordenCompraId: null,
    adjuntos: [
      { id: "a1", nombreOriginal: "cot.pdf", mimeType: "application/pdf", ruta: "c1/x.pdf" },
    ],
    ...extra,
  };
}

describe("procesamiento de correos", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.IMPORTACIONES_PROCESSING_ENABLED = "true";
    for (const f of Object.values(m)) f.mockReset();
    m.extraer.mockResolvedValue({ motorUsado: "regex-v1", campos: [] });
    _establecerExtractionProviderParaTests({
      nombre: "test",
      puedeProcesar: () => true,
      extraer: m.extraer,
    } as never);
    m.tenantFindUnique.mockResolvedValue({ siesaCiaId: null });
    m.evaluarRequisitos.mockResolvedValue([]);
    m.requisitosFaltantes.mockReturnValue([]);
    m.excepcionCount.mockResolvedValue(0);
    m.correoUpdateMany.mockResolvedValue({ count: 1 });
    m.bloquearOrden.mockResolvedValue([{ id: "ord-1" }]);
    m.identificarOrden.mockResolvedValue({ tipo: "UNICO", valor: ORDEN });
    m.sugerirProveedores.mockResolvedValue([]);
  });
  afterEach(() => {
    delete process.env.IMPORTACIONES_PROCESSING_ENABLED;
    vi.restoreAllMocks();
  });

  it("pide revisar la orden cuando el documento aporta dos referencias distintas", async () => {
    m.correoFindMany.mockResolvedValue([correo()]);
    m.identificarProveedor.mockResolvedValue({ tipo: "UNICO", valor: PROVEEDOR });
    m.extraer.mockResolvedValue({
      campos: ["PO-26112401", "PO-26112402"].map((valor) => ({
        valor,
        campo: "numeroOrdenProveedor",
        confianza: 1,
        evidencia: valor,
      })),
    });
    await ejecutarCicloProcesamientoCorreos();
    expect(m.identificarOrden).not.toHaveBeenCalled();
    expect(m.excepcionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "ORDEN_NO_IDENTIFICADA",
        descripcion: expect.stringContaining("varias referencias"),
      }),
    });
  });

  it("con remitente exacto, contrasta el documento solo con proveedores de su empresa", async () => {
    m.correoFindMany.mockResolvedValue([correo()]);
    m.identificarProveedor.mockResolvedValue({ tipo: "UNICO", valor: PROVEEDOR });
    m.extraer.mockResolvedValue({
      motorUsado: "regex-v1",
      campos: [
        {
          campo: "nombreProveedor",
          valor: "Boreal Trading Company",
          confianza: 1,
          evidencia: "Proveedor: Boreal Trading Company",
        },
      ],
    });
    const señal = (tipo: string) => ({ tipo, campo: "campo", detalle: "detalle" });
    // Aunque la consulta devolviera un homónimo de otra empresa, no cuenta.
    m.sugerirProveedores.mockResolvedValue([
      { id: "prov-1", tenantId: "ten-1", nombre: "Boreal", señales: [señal("CORREO_EXACTO")] },
      {
        id: "prov-otra",
        tenantId: "ten-2",
        nombre: "Boreal Trading Company",
        señales: [señal("NOMBRE_EXACTO")],
      },
    ]);
    await ejecutarCicloProcesamientoCorreos();

    expect(m.identificarProveedor).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ soloCorreoExacto: true }),
    );
    expect(m.sugerirProveedores).toHaveBeenCalledWith("ten-1", expect.anything());
    expect(m.correoUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { tenantId: "ten-1", proveedorId: "prov-1" },
    });
    const tipos = m.excepcionCreate.mock.calls.map((c) => c[0].data.tipo);
    expect(tipos).not.toContain("PROVEEDOR_NO_IDENTIFICADO");
  });

  it("con remitente exacto y razón social de otro proveedor de su empresa, deja el correo sin empresa", async () => {
    m.correoFindMany.mockResolvedValue([correo()]);
    m.identificarProveedor.mockResolvedValue({ tipo: "UNICO", valor: PROVEEDOR });
    m.extraer.mockResolvedValue({
      motorUsado: "regex-v1",
      campos: [
        {
          campo: "nombreProveedor",
          valor: "Acero del Norte",
          confianza: 1,
          evidencia: "Proveedor: Acero del Norte",
        },
      ],
    });
    const señal = (tipo: string) => ({ tipo, campo: "campo", detalle: "detalle" });
    m.sugerirProveedores.mockResolvedValue([
      { id: "prov-1", tenantId: "ten-1", nombre: "Boreal", señales: [señal("CORREO_EXACTO")] },
      {
        id: "prov-acero",
        tenantId: "ten-1",
        nombre: "Acero del Norte",
        señales: [señal("NOMBRE_EXACTO")],
      },
    ]);
    await ejecutarCicloProcesamientoCorreos();

    expect(m.sugerirProveedores).toHaveBeenCalledWith("ten-1", expect.anything());
    expect(m.excepcionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: null, tipo: "PROVEEDOR_NO_IDENTIFICADO" }),
    });
    const datosActualizados = m.correoUpdate.mock.calls.map((c) => c[0].data);
    expect(datosActualizados.some((d) => "tenantId" in d)).toBe(false);
    expect(m.identificarOrden).not.toHaveBeenCalled();
  });

  it("sin remitente exacto, las sugerencias conservan el alcance del correo sin empresa", async () => {
    m.correoFindMany.mockResolvedValue([correo()]);
    m.identificarProveedor.mockResolvedValue({ tipo: "NINGUNO" });
    await ejecutarCicloProcesamientoCorreos();

    expect(m.sugerirProveedores).toHaveBeenCalledWith(null, expect.anything());
    expect(m.excepcionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: null, tipo: "PROVEEDOR_NO_IDENTIFICADO" }),
    });
    const datosActualizados = m.correoUpdate.mock.calls.map((c) => c[0].data);
    expect(datosActualizados.some((d) => "tenantId" in d)).toBe(false);
  });

  it("reprocesar reemplaza lo derivado: borra extracciones y descarta excepciones abiertas", async () => {
    m.correoFindMany.mockResolvedValue([correo()]);
    m.identificarProveedor.mockResolvedValue({ tipo: "UNICO", valor: PROVEEDOR });
    await ejecutarCicloProcesamientoCorreos();

    expect(m.extraccionDeleteMany).toHaveBeenCalledWith({ where: { adjunto: { correoId: "c1" } } });
    expect(m.excepcionUpdateMany).toHaveBeenCalledWith({
      where: { correoId: "c1", estado: "ABIERTA" },
      data: expect.objectContaining({ estado: "DESCARTADA" }),
    });
  });

  it("respeta el proveedor asignado por una persona: no vuelve a inferirlo", async () => {
    m.correoFindMany.mockResolvedValue([correo({ tenantId: "ten-1", proveedorId: "prov-1" })]);
    m.proveedorFindFirst.mockResolvedValue(PROVEEDOR);
    await ejecutarCicloProcesamientoCorreos();

    expect(m.proveedorFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "prov-1", tenantId: "ten-1" } }),
    );
    expect(m.identificarProveedor).not.toHaveBeenCalled();
    expect(m.identificarOrden).toHaveBeenCalledWith("ten-1", "prov-1", undefined);
  });

  it("respeta la orden fijada solo si es del mismo tenant y proveedor", async () => {
    m.correoFindMany.mockResolvedValue([
      correo({ tenantId: "ten-1", proveedorId: "prov-1", ordenCompraId: "ord-1" }),
    ]);
    m.proveedorFindFirst.mockResolvedValue(PROVEEDOR);
    m.ordenFindFirst.mockResolvedValue(ORDEN);
    await ejecutarCicloProcesamientoCorreos();

    expect(m.ordenFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord-1", tenantId: "ten-1", proveedorId: "prov-1", eliminado: false },
      }),
    );
    expect(m.identificarOrden).not.toHaveBeenCalled();
  });

  it("un PDF que falla en la extracción crea una excepción y el correo NO queda RESUELTO", async () => {
    m.correoFindMany.mockResolvedValue([correo()]);
    m.identificarProveedor.mockResolvedValue({ tipo: "UNICO", valor: PROVEEDOR });
    m.extraer.mockRejectedValue(new Error("PDF ilegible"));
    m.excepcionCount.mockResolvedValue(1);
    await ejecutarCicloProcesamientoCorreos();

    expect(m.adjuntoUpdate).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { estadoExtraccion: "ERROR" },
    });
    expect(m.excepcionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "ten-1", tipo: "OTRO" }),
    });
    const estados = [...m.correoUpdate.mock.calls, ...m.correoUpdateMany.mock.calls].map((c) => c[0].data.estadoProcesamiento);
    expect(estados).toContain("REQUIERE_REVISION");
    expect(estados).not.toContain("RESUELTO");
  });

  it("no vuelve a vincular una orden anulada después de identificarla", async () => {
    m.correoFindMany.mockResolvedValue([correo()]);
    m.identificarProveedor.mockResolvedValue({ tipo: "UNICO", valor: PROVEEDOR });
    m.bloquearOrden.mockResolvedValue([]);
    m.excepcionCount.mockResolvedValue(1);
    await ejecutarCicloProcesamientoCorreos();
    expect(m.correoUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ estadoProcesamiento: "EXTRAIDO" }),
      data: { ordenCompraId: null, estadoProcesamiento: "REQUIERE_REVISION" },
    });
    expect(m.excepcionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "ORDEN_NO_IDENTIFICADA" }),
    });
    expect(m.correoUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { estadoProcesamiento: "RESUELTO" } }),
    );
  });

  it("no busca productos en Siesa con el número de orden ni crea PRODUCTO_NO_IDENTIFICADO", async () => {
    m.tenantFindUnique.mockResolvedValue({ siesaCiaId: 1 });
    m.extraer.mockResolvedValue({
      motorUsado: "regex-v1",
      campos: [
        { campo: "numeroOrdenProveedor", valor: "PO-4587", confianza: 0.9, evidencia: "PO-4587" },
      ],
    });
    m.correoFindMany.mockResolvedValue([correo()]);
    m.identificarProveedor.mockResolvedValue({ tipo: "UNICO", valor: PROVEEDOR });
    await ejecutarCicloProcesamientoCorreos();

    expect(m.identificarOrden).toHaveBeenCalledWith("ten-1", "prov-1", "PO-4587");
    expect(m.buscarItemsSiesa).not.toHaveBeenCalled();
    const tipos = m.excepcionCreate.mock.calls.map((c) => c[0].data.tipo);
    expect(tipos).not.toContain("PRODUCTO_NO_IDENTIFICADO");
  });
});
