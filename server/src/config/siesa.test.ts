import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * M-05 (hardening 2026-09-02): antes del fix, dos llamadas concurrentes a
 * getSiesaPool() mientras la primera conexión seguía en curso creaban CADA
 * UNA su propio ConnectionPool (la condición `pool?.connected` es falsa
 * para ambas hasta que la primera termina de conectar). Este test no
 * requiere VPN ni Siesa real: mockea `mssql.ConnectionPool` y verifica
 * directamente cuántas veces se invoca `new ConnectionPool(...).connect()`
 * ante llamadas concurrentes — la propiedad que importa, sin depender de
 * infraestructura externa.
 */

const conectarMock = vi.fn();
let construccionesPool = 0;

vi.mock("mssql", () => {
  class ConnectionPoolFake {
    connected = false;
    constructor(_config: unknown) {
      construccionesPool++;
    }
    connect() {
      return conectarMock().then((resultado: unknown) => {
        this.connected = true;
        return resultado ?? this;
      });
    }
    close() {
      this.connected = false;
      return Promise.resolve();
    }
  }
  return { default: { ConnectionPool: ConnectionPoolFake } };
});

const ENV_SIESA = {
  SIESA_DB_HOST: "host-fake",
  SIESA_DB_PORT: "1433",
  SIESA_DB_NAME: "db-fake",
  SIESA_DB_USER: "user-fake",
  SIESA_DB_PASSWORD: "password-fake",
};

describe("getSiesaPool — memoización de la promesa de conexión en vuelo (M-05)", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    construccionesPool = 0;
    conectarMock.mockReset();
    Object.assign(process.env, ENV_SIESA);
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it("llamadas concurrentes durante la inicialización comparten la misma promesa: solo se crea UN pool", async () => {
    let resolverConexion!: (v: unknown) => void;
    conectarMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolverConexion = resolve;
      }),
    );

    const { getSiesaPool } = await import("./siesa");

    // Tres llamadas "simultáneas" mientras la conexión todavía no resolvió.
    const p1 = getSiesaPool();
    const p2 = getSiesaPool();
    const p3 = getSiesaPool();

    resolverConexion(undefined);
    const [pool1, pool2, pool3] = await Promise.all([p1, p2, p3]);

    expect(construccionesPool).toBe(1);
    expect(conectarMock).toHaveBeenCalledTimes(1);
    expect(pool1).toBe(pool2);
    expect(pool2).toBe(pool3);
  });

  it("tras una conexión fallida, la siguiente llamada reintenta desde cero (no queda atascada en la promesa rechazada)", async () => {
    conectarMock.mockRejectedValueOnce(new Error("timeout de red simulado"));
    conectarMock.mockResolvedValueOnce(undefined);

    const { getSiesaPool } = await import("./siesa");

    await expect(getSiesaPool()).rejects.toThrow("timeout de red simulado");
    // Segunda llamada, después del fallo: no debe seguir esperando la misma
    // promesa rota — debe reintentar y conseguir una conexión nueva.
    await expect(getSiesaPool()).resolves.toBeDefined();
    expect(construccionesPool).toBe(2);
  });

  it("con el pool ya conectado, llamadas siguientes lo reutilizan sin reconectar", async () => {
    conectarMock.mockResolvedValue(undefined);
    const { getSiesaPool } = await import("./siesa");

    await getSiesaPool();
    await getSiesaPool();
    await getSiesaPool();

    expect(construccionesPool).toBe(1);
    expect(conectarMock).toHaveBeenCalledTimes(1);
  });
});
