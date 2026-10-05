import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  loteFindUnique: vi.fn(),
  loteUpdate: vi.fn(),
  contenedorFindMany: vi.fn(),
  historialCreate: vi.fn(),
  aplicar: vi.fn(),
  crearItem: vi.fn(),
  crearNotificacion: vi.fn(),
  destinatarios: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    loteImportacion: { findUnique: m.loteFindUnique, update: m.loteUpdate },
    contenedorLote: { findMany: m.contenedorFindMany },
    importacionHistorial: { create: m.historialCreate },
  },
}));
vi.mock("../../lib/tenant-prisma", () => ({ getTenantPrisma: vi.fn() }));
vi.mock("../../lib/motor-destinatarios", () => ({ resolverDestinatarios: m.destinatarios }));
vi.mock("../../lib/notificaciones", () => ({ crearNotificacion: m.crearNotificacion }));
vi.mock("../../lib/inbox", () => ({ crearItemDeTrabajo: m.crearItem }));
vi.mock("./importaciones-novedades-automaticas", () => ({
  aplicarNovedadAutomatica: m.aplicar,
}));

const { sincronizarUnLote, _establecerProviderParaTests, ETIQUETA_SIMULADO } =
  await import("./embarques-tracking.job");

const LOTE = {
  id: "lote-12345678",
  tenantId: "ten-1",
  ordenCompraId: "ord-1",
  blAwb: "BL1",
  booking: null,
  naviera: null,
  buqueNombre: "Buque",
  buqueImo: "9999999",
  buqueMmsi: null,
  estadoTracking: "ACTIVO",
  fechaLlegadaEstimada: new Date("2026-10-01T00:00:00Z"),
  ultimaSincronizacionTracking: new Date(),
};

function proveedor(nombre: string) {
  return {
    nombre,
    buscarBuque: vi.fn(async () => ({
      nombre: "Buque",
      imo: "9999999",
      mmsi: null,
      latitud: 1,
      longitud: 1,
      velocidadNudos: 10,
      rumboGrados: 90,
      destino: null,
      etaEstimada: new Date("2026-10-08T00:00:00Z"), // +7 días frente al ETA informado
      ultimaActualizacion: new Date(),
    })),
    buscarContenedor: vi.fn(async () => null),
  };
}

describe("tracking: etiquetado SIMULADO y origen PorDeterminar", () => {
  beforeEach(() => {
    for (const f of Object.values(m)) f.mockReset();
    m.loteFindUnique.mockResolvedValue(LOTE);
    m.contenedorFindMany.mockResolvedValue([]);
    m.destinatarios.mockResolvedValue(new Set(["u1"]));
    process.env.TRACKING_MARITIMO_PERMITIR_SIMULADO = "true";
    process.env.TRACKING_MARITIMO_UMBRAL_VARIACION_ETA_DIAS = "1";
  });
  afterEach(() => {
    delete process.env.TRACKING_MARITIMO_PERMITIR_SIMULADO;
    delete process.env.TRACKING_MARITIMO_UMBRAL_VARIACION_ETA_DIAS;
    _establecerProviderParaTests(proveedor("mock") as never);
  });

  it("con el mock habilitado: novedad, historial y notificación llevan [SIMULADO]", async () => {
    _establecerProviderParaTests(proveedor("mock") as never);
    await sincronizarUnLote(LOTE.id);

    const novedadEta = m.aplicar.mock.calls
      .map((c) => c[0])
      .find((a) => a.reglaOrigen.endsWith(":eta-variacion"));
    expect(novedadEta.condicionVigente).toBe(true);
    expect(novedadEta.datos.descripcion.startsWith(ETIQUETA_SIMULADO)).toBe(true);

    const historial = m.historialCreate.mock.calls[0][0].data;
    expect(historial.accion.startsWith(ETIQUETA_SIMULADO)).toBe(true);
    expect(historial.detalle.startsWith(ETIQUETA_SIMULADO)).toBe(true);

    const inbox = m.crearItem.mock.calls[0][1];
    expect(inbox.titulo.startsWith(ETIQUETA_SIMULADO)).toBe(true);
    expect(inbox.descripcion.startsWith(ETIQUETA_SIMULADO)).toBe(true);
    const notificacion = m.crearNotificacion.mock.calls[0][0];
    expect(notificacion.titulo.startsWith(ETIQUETA_SIMULADO)).toBe(true);
    expect(notificacion.mensaje.startsWith(ETIQUETA_SIMULADO)).toBe(true);
  });

  it("con un proveedor real no se etiqueta nada como simulado", async () => {
    _establecerProviderParaTests(proveedor("vesselfinder") as never);
    await sincronizarUnLote(LOTE.id);

    const textos = [
      ...m.aplicar.mock.calls.map((c) => c[0].datos.descripcion),
      m.historialCreate.mock.calls[0][0].data.accion,
      m.crearItem.mock.calls[0][1].titulo,
      m.crearNotificacion.mock.calls[0][0].titulo,
    ];
    for (const t of textos) expect(t).not.toContain(ETIQUETA_SIMULADO);
  });

  it("la alerta de tracking no atribuye causa ni responsable (ni Naviera) a la novedad", async () => {
    _establecerProviderParaTests(proveedor("vesselfinder") as never);
    await sincronizarUnLote(LOTE.id);
    expect(m.aplicar).toHaveBeenCalled();
    for (const [args] of m.aplicar.mock.calls) {
      expect(args.datos.responsable).toBeUndefined();
      expect(args.datos).not.toHaveProperty("origen");
    }
  });
});
