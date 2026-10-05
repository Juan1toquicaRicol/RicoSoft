import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { loteFindMany, loteFindUnique } = vi.hoisted(() => ({
  loteFindMany: vi.fn(),
  loteFindUnique: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: { loteImportacion: { findMany: loteFindMany, findUnique: loteFindUnique } },
}));
vi.mock("../../lib/tenant-prisma", () => ({ getTenantPrisma: vi.fn() }));
vi.mock("../../lib/motor-destinatarios", () => ({ resolverDestinatarios: vi.fn() }));
vi.mock("../../lib/notificaciones", () => ({ crearNotificacion: vi.fn() }));
vi.mock("../../lib/inbox", () => ({ crearItemDeTrabajo: vi.fn() }));

const {
  ejecutarCicloSincronizacionEmbarques,
  sincronizarUnLote,
  trackingSimuladoBloqueado,
  TrackingSimuladoNoPermitidoError,
} = await import("./embarques-tracking.job");

describe("tracking marítimo: proveedor simulado (mock)", () => {
  beforeEach(() => {
    loteFindMany.mockReset();
    loteFindUnique.mockReset();
    process.env.TRACKING_MARITIMO_SYNC_ENABLED = "true";
    delete process.env.TRACKING_MARITIMO_PERMITIR_SIMULADO;
  });
  afterEach(() => {
    delete process.env.TRACKING_MARITIMO_SYNC_ENABLED;
    delete process.env.TRACKING_MARITIMO_PERMITIR_SIMULADO;
  });

  it("sin opt-in explícito queda bloqueado", () => {
    expect(trackingSimuladoBloqueado()).toBe(true);
  });

  it("la sincronización manual de un lote se rechaza y no toca la base", async () => {
    await expect(sincronizarUnLote("lote-1")).rejects.toBeInstanceOf(
      TrackingSimuladoNoPermitidoError,
    );
    expect(loteFindUnique).not.toHaveBeenCalled();
  });

  it("el ciclo periódico se omite aunque esté habilitado", async () => {
    await ejecutarCicloSincronizacionEmbarques();
    expect(loteFindMany).not.toHaveBeenCalled();
  });

  it("con TRACKING_MARITIMO_PERMITIR_SIMULADO=true ya no está bloqueado", async () => {
    process.env.TRACKING_MARITIMO_PERMITIR_SIMULADO = "true";
    expect(trackingSimuladoBloqueado()).toBe(false);
    loteFindUnique.mockResolvedValue(null);
    await expect(sincronizarUnLote("lote-1")).resolves.toBeUndefined();
    expect(loteFindUnique).toHaveBeenCalled();
  });
});
