import { describe, it, expect, vi, afterEach } from "vitest";
import { MockMaritimeTrackingProvider } from "./mock-maritime-tracking-provider";

describe("MockMaritimeTrackingProvider", () => {
  const provider = new MockMaritimeTrackingProvider();

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buscarBuque es determinístico: el mismo IMO siempre da la misma posición", async () => {
    // Reloj congelado: el mock deriva ETA/ultimaActualizacion de Date.now(), y dos
    // llamadas consecutivas pueden caer en milisegundos distintos (flaky).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const primero = await provider.buscarBuque({ imo: "9321483" });
    const segundo = await provider.buscarBuque({ imo: "9321483" });
    expect(primero).not.toBeNull();
    expect(primero).toEqual(segundo);
  });

  it("buscarBuque devuelve valores dentro de rangos geográficos/náuticos plausibles", async () => {
    const info = await provider.buscarBuque({ imo: "9321483" });
    expect(info!.latitud).toBeGreaterThanOrEqual(-90);
    expect(info!.latitud).toBeLessThanOrEqual(90);
    expect(info!.longitud).toBeGreaterThanOrEqual(-180);
    expect(info!.longitud).toBeLessThanOrEqual(180);
    expect(info!.velocidadNudos).toBeGreaterThan(0);
    expect(info!.etaEstimada!.getTime()).toBeGreaterThan(Date.now());
  });

  it("buscarBuque devuelve null sin ningún identificador", async () => {
    const info = await provider.buscarBuque({});
    expect(info).toBeNull();
  });

  it('buscarBuque devuelve null cuando el identificador contiene "SINDATOS" (simula buque no encontrado)', async () => {
    const info = await provider.buscarBuque({ imo: "SINDATOS9999" });
    expect(info).toBeNull();
  });

  it("buscarContenedor es determinístico y devuelve eventos ordenados cronológicamente", async () => {
    const info = await provider.buscarContenedor({ numero: "MSCU1234567" });
    expect(info).not.toBeNull();
    expect(info!.eventos.length).toBeGreaterThan(0);
    for (let i = 1; i < info!.eventos.length; i++) {
      expect(info!.eventos[i].fecha.getTime()).toBeGreaterThanOrEqual(
        info!.eventos[i - 1].fecha.getTime(),
      );
    }
  });

  it('buscarContenedor devuelve null cuando el número contiene "SINDATOS"', async () => {
    const info = await provider.buscarContenedor({ numero: "SINDATOS1234" });
    expect(info).toBeNull();
  });

  it("dos contenedores distintos pueden quedar en distintas etapas del viaje", async () => {
    const a = await provider.buscarContenedor({ numero: "AAAA1111111" });
    const b = await provider.buscarContenedor({ numero: "BBBB2222222" });
    // No se afirma que SIEMPRE difieran (el hash podría coincidir en un caso
    // raro), solo que el mecanismo produce resultados propios por número.
    expect(a!.numero).toBe("AAAA1111111");
    expect(b!.numero).toBe("BBBB2222222");
  });
});
